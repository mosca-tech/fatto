import { addDays, weekEnd, monthEnd, weekday, dueLabel } from './api.js';

// Riepilogo di fine giornata: cosa è stato completato, cosa resta da fare oggi, cosa è scaduto o sta per scadere.
// Funzioni pure (niente rete né database), così si provano con uno script Node.

const esc = (s) => String(s == null ? '' : s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

// Giorno (AAAA-MM-GG) a Roma di un istante.
export function romeDay(date) {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Rome', year: 'numeric', month: '2-digit', day: '2-digit' }).format(date);
}

// Stessa regola della bacheca (app/board-app.js): la scadenza scelta dall'utente può solo anticipare la colonna.
// Le scadenze standard (domenica, ultimo giorno del mese) non fanno avanzare il task.
const RANK = { today: 0, week: 1, month: 2, later: 3 };
function colFromDue(d, today) {
  return d <= today ? 'today' : d <= weekEnd(today) ? 'week' : d <= monthEnd(today) ? 'month' : 'later';
}
function explicitDue(t, today) {
  const d = t.due;
  if (!d || t.col === 'done') return false;
  if (t.col === 'later') return true;
  if (t.col === 'month') return d !== monthEnd(d);
  if (t.col === 'week') return weekday(d) !== 0;
  return d > today;
}
function planCol(t, today) {
  if (t.col === 'done' || !explicitDue(t, today)) return t.col;
  const c = colFromDue(t.due, today);
  return RANK[c] < RANK[t.col] ? c : t.col;
}

function daysBetween(from, to) {
  const [fy, fm, fd] = from.split('-').map(Number);
  const [ty, tm, td] = to.split('-').map(Number);
  return Math.round((Date.UTC(ty, tm - 1, td) - Date.UTC(fy, fm - 1, fd)) / 864e5);
}

const byImportance = (a, b) => (b.important ? 1 : 0) - (a.important ? 1 : 0) || String(a.title).localeCompare(String(b.title), 'it');

export function buildDigest(tasks, now = new Date(), horizonDays = 3) {
  const today = romeDay(now);
  const open = tasks.filter((t) => t.col !== 'done' && !(t.starts_on && t.starts_on > today)); // le ricorrenze "in attesa" non contano
  const completed = tasks.filter((t) => t.col === 'done' && t.done_at && romeDay(new Date(t.done_at)) === today).sort(byImportance);
  const overdue = open.filter((t) => t.due && t.due < today).sort((a, b) => a.due.localeCompare(b.due) || byImportance(a, b));
  const todo = open.filter((t) => !(t.due && t.due < today) && planCol(t, today) === 'today').sort(byImportance);
  const limit = addDays(today, horizonDays);
  const soon = open
    .filter((t) => explicitDue(t, today) && t.due > today && t.due <= limit && planCol(t, today) !== 'today') // solo le date scelte da te, non quelle standard della colonna
    .sort((a, b) => a.due.localeCompare(b.due) || byImportance(a, b));

  const dayLabel = new Intl.DateTimeFormat('it-IT', { timeZone: 'Europe/Rome', weekday: 'long', day: 'numeric', month: 'long' }).format(now);
  const lateText = (t) => { const n = daysBetween(t.due, today); return n === 1 ? 'scaduto ieri' : `scaduto da ${n} giorni`; };
  const soonText = (t) => `scade ${dueLabel(t.due, today)}`;

  const parts = [`${completed.length} ${completed.length === 1 ? 'completato' : 'completati'}`, `${todo.length} da fare`];
  if (overdue.length) parts.push(`${overdue.length} ${overdue.length === 1 ? 'scaduto' : 'scaduti'}`);
  if (soon.length) parts.push(`${soon.length} in scadenza`);
  const subject = `Fatto · ${dayLabel}: ${parts.join(', ')}`;

  // ---- testo semplice ----
  const line = (t, extra) => `- ${t.important ? '★ ' : ''}${t.title}${extra ? ` (${extra})` : ''}`;
  const block = (title, items, empty) => [title, ...(items.length ? items : [empty]), ''].join('\n');
  const text = [
    `Riepilogo di fine giornata · ${dayLabel}`,
    '',
    block(`COMPLETATI OGGI (${completed.length})`, completed.map((t) => line(t)), 'Nessun task completato oggi.'),
    block(`ANCORA DA FARE OGGI (${todo.length})`, todo.map((t) => line(t)), 'Niente rimasto in programma per oggi.'),
    block(
      `SCADUTI E IN SCADENZA (${overdue.length + soon.length})`,
      [...overdue.map((t) => line(t, lateText(t))), ...soon.map((t) => line(t, soonText(t)))],
      `Niente di scaduto o in scadenza nei prossimi ${horizonDays} giorni.`
    ),
  ].join('\n').trim() + '\n';

  // ---- HTML ----
  const li = (t, extra, color) =>
    `<li style="margin:0 0 6px">${t.important ? '<span style="color:#B45309">★</span> ' : ''}${esc(t.title)}` +
    (extra ? ` <span style="color:${color || '#5C6B67'};font-size:13px">· ${esc(extra)}</span>` : '') + '</li>';
  const section = (icon, title, count, items, empty) =>
    `<h2 style="margin:26px 0 8px;font-size:15px">${icon} ${esc(title)} <span style="color:#5C6B67;font-weight:400">· ${count}</span></h2>` +
    (items.length
      ? `<ul style="margin:0;padding-left:20px;line-height:1.5;font-size:15px">${items.join('')}</ul>`
      : `<p style="margin:0;color:#5C6B67;font-size:14px">${esc(empty)}</p>`);
  const html =
    '<!doctype html><html lang="it"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>' +
    '<body style="margin:0;padding:24px 12px;background:#EEF2F1;font-family:-apple-system,\'Segoe UI\',Helvetica,Arial,sans-serif;color:#15211E">' +
    '<div style="max-width:560px;margin:0 auto;background:#ffffff;border-radius:12px;padding:24px 24px 18px">' +
    '<p style="margin:0 0 2px;font-size:13px;color:#5C6B67">Riepilogo di fine giornata</p>' +
    `<h1 style="margin:0;font-size:21px">${esc(dayLabel)}</h1>` +
    section('✓', 'Completati oggi', completed.length, completed.map((t) => li(t)), 'Nessun task completato oggi.') +
    section('○', 'Ancora da fare oggi', todo.length, todo.map((t) => li(t)), 'Niente rimasto in programma per oggi.') +
    section(
      '!',
      'Scaduti e in scadenza',
      overdue.length + soon.length,
      [...overdue.map((t) => li(t, lateText(t), '#B42318')), ...soon.map((t) => li(t, soonText(t), '#B45309'))],
      `Niente di scaduto o in scadenza nei prossimi ${horizonDays} giorni.`
    ) +
    '<p style="margin:26px 0 0;font-size:12px;color:#5C6B67">Fatto · mandato in automatico ogni sera</p>' +
    '</div></body></html>';

  return { subject, html, text, counts: { completed: completed.length, todo: todo.length, overdue: overdue.length, soon: soon.length } };
}

// Invio con Resend (https://resend.com/docs/api-reference/emails/send-email). La chiave non finisce mai nei messaggi di errore.
export async function sendEmail({ apiKey, from, to, subject, html, text }, fetchFn = fetch) {
  const res = await fetchFn('https://api.resend.com/emails', {
    method: 'POST',
    headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ from, to: [to], subject, html, text }),
  });
  const body = await res.json().catch(() => ({}));
  if (!res.ok) {
    const err = new Error(`Resend ${res.status}: ${body.message || body.name || 'errore'}`);
    err.status = res.status;
    throw err;
  }
  return body.id || null;
}
