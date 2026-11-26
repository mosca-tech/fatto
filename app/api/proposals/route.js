import { NextResponse } from 'next/server';
import { admin, authorized, ownerId, labelIds, titleKey, romeToday, addDays } from '@/lib/api';

const deny = () => NextResponse.json({ error: 'non autorizzato' }, { status: 401 });

// Quanti giorni indietro guardare per i task completati e le proposte già decise.
const DONE_DAYS = 30;
const PROPOSAL_DAYS = 90;

// GET /api/proposals — tutto ciò che serve all'agente per non proporre doppioni:
// - sourceKeys: le email già proposte (come prima);
// - tasks: i task aperti (comprese le ricorrenze in attesa) e quelli completati negli ultimi 30 giorni;
// - proposals: le proposte in attesa e quelle decise negli ultimi 90 giorni, con oggetto e mittente.
export async function GET(request) {
  if (!authorized(request)) return deny();
  const sb = admin();
  const uid = ownerId();
  const doneSince = addDays(romeToday(), -DONE_DAYS);
  const propSince = addDays(romeToday(), -PROPOSAL_DAYS);

  const [keys, tasks, props, labels] = await Promise.all([
    sb.from('proposals').select('source_key').eq('user_id', uid),
    sb.from('tasks').select('title,col,due,note,labels,starts_on,done_at,created_at')
      .eq('user_id', uid).or(`col.neq.done,done_at.gte.${doneSince}`)
      .order('created_at', { ascending: false }).limit(1000),
    sb.from('proposals').select('title,status,sender,subject,source,source_key,created_at,decided_at')
      .eq('user_id', uid).or(`status.eq.new,created_at.gte.${propSince}`)
      .order('created_at', { ascending: false }).limit(1000),
    sb.from('labels').select('id,name').eq('user_id', uid),
  ]);
  const error = keys.error || tasks.error || props.error || labels.error;
  if (error) {
    console.error(error);
    return NextResponse.json({ error: 'lettura non riuscita' }, { status: 500 });
  }

  const labelName = new Map(labels.data.map((l) => [l.id, l.name]));
  return NextResponse.json({
    sourceKeys: keys.data.map((r) => r.source_key).filter(Boolean),
    tasks: tasks.data.map((t) => ({
      title: t.title,
      status: t.col === 'done' ? 'completato' : t.starts_on && t.starts_on > romeToday() ? 'in attesa' : 'aperto',
      col: t.col,
      due: t.due || null,
      labels: (t.labels || []).map((id) => labelName.get(id)).filter(Boolean),
      note: String(t.note || '').slice(0, 600),
      createdAt: t.created_at,
      doneAt: t.done_at,
    })),
    proposals: props.data.map((p) => ({
      title: p.title,
      status: { new: 'in attesa', accepted: 'accettata', dismissed: 'scartata' }[p.status] || p.status,
      from: p.sender,
      subject: p.subject,
      source: p.source,
      sourceKey: p.source_key,
      createdAt: p.created_at,
      decidedAt: p.decided_at,
    })),
  });
}

// POST /api/proposals — l'agente email aggiunge proposte da confermare.
// Corpo: { "proposals": [{ title, labels:["lavoro"], source, from, subject, reason, confidence, sourceKey, link }] }
// Rete di sicurezza contro i doppioni: oltre al sourceKey già visto, viene scartata una proposta con lo stesso
// titolo (a meno di maiuscole, accenti e punteggiatura) di un task aperto, di una proposta in attesa
// o di un'altra proposta dello stesso invio. Il confronto "intelligente" (stesso argomento, parole diverse) lo fa l'agente.
export async function POST(request) {
  if (!authorized(request)) return deny();

  let body;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'corpo JSON non valido' }, { status: 400 });
  }
  const list = Array.isArray(body.proposals) ? body.proposals.slice(0, 50) : [];
  if (!list.length) return NextResponse.json({ added: 0, skipped: [] });

  const sb = admin();
  try {
    const [openTasks, pending] = await Promise.all([
      sb.from('tasks').select('title').eq('user_id', ownerId()).neq('col', 'done').limit(2000),
      sb.from('proposals').select('title').eq('user_id', ownerId()).eq('status', 'new').limit(2000),
    ]);
    if (openTasks.error) throw openTasks.error;
    if (pending.error) throw pending.error;
    const taken = new Set([...openTasks.data, ...pending.data].map((r) => titleKey(r.title)));

    const rows = [];
    const skipped = [];
    for (const p of list) {
      const title = String(p.title || '').trim().slice(0, 200);
      const sourceKey = String(p.sourceKey || '').trim().slice(0, 500);
      if (!title || !sourceKey) continue;
      const key = titleKey(title);
      if (taken.has(key)) {
        skipped.push(title);
        continue;
      }
      taken.add(key);
      rows.push({
        user_id: ownerId(),
        title,
        labels: await labelIds(sb, p.labels),
        source: String(p.source || 'email').slice(0, 40),
        sender: String(p.from || '').slice(0, 200),
        subject: String(p.subject || '').slice(0, 300),
        reason: String(p.reason || '').slice(0, 500),
        confidence: ['alta', 'media', 'bassa'].includes(p.confidence) ? p.confidence : 'media',
        link: /^https:\/\//.test(p.link || '') ? String(p.link).slice(0, 2000) : null,
        source_key: sourceKey,
      });
    }
    if (!rows.length) return NextResponse.json({ added: 0, skipped }, { status: 200 });
    const { data, error } = await sb
      .from('proposals')
      .upsert(rows, { onConflict: 'user_id,source_key', ignoreDuplicates: true })
      .select('id');
    if (error) throw error;
    return NextResponse.json({ added: data.length, skipped }, { status: 201 });
  } catch (e) {
    console.error(e);
    return NextResponse.json({ error: 'salvataggio non riuscito' }, { status: 500 });
  }
}
