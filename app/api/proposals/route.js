import { NextResponse } from 'next/server';
import { admin, authorized, ownerId, labelIds } from '@/lib/api';

const deny = () => NextResponse.json({ error: 'non autorizzato' }, { status: 401 });

// GET /api/proposals — elenco dei sourceKey già visti, per evitare doppioni.
export async function GET(request) {
  if (!authorized(request)) return deny();
  const { data, error } = await admin().from('proposals').select('source_key').eq('user_id', ownerId());
  if (error) return NextResponse.json({ error: 'lettura non riuscita' }, { status: 500 });
  return NextResponse.json({ sourceKeys: data.map((r) => r.source_key).filter(Boolean) });
}

// POST /api/proposals — l'agente email aggiunge proposte da confermare.
// Corpo: { "proposals": [{ title, labels:["lavoro"], source, from, subject, reason, confidence, sourceKey, link }] }
export async function POST(request) {
  if (!authorized(request)) return deny();

  let body;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'corpo JSON non valido' }, { status: 400 });
  }
  const list = Array.isArray(body.proposals) ? body.proposals.slice(0, 50) : [];
  if (!list.length) return NextResponse.json({ added: 0 });

  const sb = admin();
  try {
    const rows = [];
    for (const p of list) {
      const title = String(p.title || '').trim().slice(0, 200);
      const sourceKey = String(p.sourceKey || '').trim().slice(0, 500);
      if (!title || !sourceKey) continue;
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
    const { data, error } = await sb
      .from('proposals')
      .upsert(rows, { onConflict: 'user_id,source_key', ignoreDuplicates: true })
      .select('id');
    if (error) throw error;
    return NextResponse.json({ added: data.length }, { status: 201 });
  } catch (e) {
    console.error(e);
    return NextResponse.json({ error: 'salvataggio non riuscito' }, { status: 500 });
  }
}
