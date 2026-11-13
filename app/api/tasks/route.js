import { NextResponse } from 'next/server';
import { admin, authorized, ownerId, normalizeCol, colName, dueFor, dueLabel, resolveLabels, parseSpoken } from '@/lib/api';

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
    const { ids: labels, unknown } = await resolveLabels(sb, body.labels ?? body.label ?? spoken.label);
    const explicitDue = /^\d{4}-\d{2}-\d{2}$/.test(body.due || '') ? body.due : spoken.due || null;
    const due = explicitDue || dueFor(col);
    const important = !!body.important || !!spoken.important;
    const { data, error } = await sb
      .from('tasks')
      .insert({
        user_id: ownerId(),
        title,
        col,
        labels,
        est: Math.max(0, parseInt(body.est, 10) || 0),
        important,
        note: String(body.note || '').slice(0, 2000),
        due,
        source: String(body.source || (body.text ? 'siri' : 'api')).slice(0, 40),
      })
      .select('id')
      .single();
    if (error) throw error;
    // La frase che Siri legge ad alta voce: dice dove è finito il task e se qualcosa non è stato capito.
    const message =
      `Ho aggiunto ${title} in ${colName(col)}` +
      (important ? ' come task importante' : '') +
      (explicitDue ? `, scade ${dueLabel(explicitDue)}` : '') +
      (unknown.length ? ` (label ${unknown.join(', ')} non trovata)` : labels.length ? '' : ' (senza label)');
    return NextResponse.json({ id: data.id, col, due, title, important, labels: labels.length, unknownLabels: unknown, message }, { status: 201 });
  } catch (e) {
    console.error(e);
    return NextResponse.json({ error: 'salvataggio non riuscito' }, { status: 500 });
  }
}
