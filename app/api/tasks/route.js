import { NextResponse } from 'next/server';
import { admin, authorized, ownerId, normalizeCol, colName, dueFor, labelIds, parseSpoken } from '@/lib/api';

// POST /api/tasks  — crea un task (Siri, Comandi Rapidi, automazioni).
// Header: Authorization: Bearer <TASKS_API_TOKEN>
// Corpo: { "title": "...", "col": "settimana", "labels": ["lavoro"], "est": 30, "important": false, "note": "", "due": "2026-12-01" }
// Oppure una frase dettata: { "text": "completare il deck per oggi con label lavoro" }
export async function POST(request) {
  if (!authorized(request)) return NextResponse.json({ error: 'non autorizzato' }, { status: 401 });

  let body;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'corpo JSON non valido' }, { status: 400 });
  }

  const spoken = body.text ? parseSpoken(body.text) : {};
  const title = String(body.title || spoken.title || '').trim().slice(0, 200);
  if (!title) return NextResponse.json({ error: 'title o text obbligatorio' }, { status: 400 });

  const sb = admin();
  const col = spoken.col || normalizeCol(body.col ?? body.colonna);
  try {
    const labels = await labelIds(sb, body.labels ?? body.label ?? spoken.label);
    const { data, error } = await sb
      .from('tasks')
      .insert({
        user_id: ownerId(),
        title,
        col,
        labels,
        est: Math.max(0, parseInt(body.est, 10) || 0),
        important: !!body.important || !!spoken.important,
        note: String(body.note || '').slice(0, 2000),
        due: /^\d{4}-\d{2}-\d{2}$/.test(body.due || '') ? body.due : dueFor(col),
        source: String(body.source || (body.text ? 'siri' : 'api')).slice(0, 40),
      })
      .select('id')
      .single();
    if (error) throw error;
    const message = `Aggiunto in ${colName(col)}: ${title}` + (labels.length ? '' : ' (senza label)');
    return NextResponse.json({ id: data.id, col, title, labels: labels.length, message }, { status: 201 });
  } catch (e) {
    console.error(e);
    return NextResponse.json({ error: 'salvataggio non riuscito' }, { status: 500 });
  }
}
