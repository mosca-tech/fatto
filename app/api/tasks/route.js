import { NextResponse } from 'next/server';
import { admin, authorized, ownerId, normalizeCol, dueFor, labelIds } from '@/lib/api';

// POST /api/tasks  — crea un task (Siri, Comandi Rapidi, automazioni).
// Header: Authorization: Bearer <TASKS_API_TOKEN>
// Corpo: { "title": "...", "col": "settimana", "labels": ["lavoro"], "est": 30, "important": false, "note": "", "due": "2026-12-01" }
export async function POST(request) {
  if (!authorized(request)) return NextResponse.json({ error: 'non autorizzato' }, { status: 401 });

  let body;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'corpo JSON non valido' }, { status: 400 });
  }

  const title = String(body.title || '').trim().slice(0, 200);
  if (!title) return NextResponse.json({ error: 'title obbligatorio' }, { status: 400 });

  const sb = admin();
  const col = normalizeCol(body.col ?? body.colonna);
  try {
    const { data, error } = await sb
      .from('tasks')
      .insert({
        user_id: ownerId(),
        title,
        col,
        labels: await labelIds(sb, body.labels ?? body.label),
        est: Math.max(0, parseInt(body.est, 10) || 0),
        important: !!body.important,
        note: String(body.note || '').slice(0, 2000),
        due: /^\d{4}-\d{2}-\d{2}$/.test(body.due || '') ? body.due : dueFor(col),
        source: String(body.source || 'api').slice(0, 40),
      })
      .select('id')
      .single();
    if (error) throw error;
    return NextResponse.json({ id: data.id, col }, { status: 201 });
  } catch (e) {
    console.error(e);
    return NextResponse.json({ error: 'salvataggio non riuscito' }, { status: 500 });
  }
}
