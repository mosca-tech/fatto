import { createClient } from '@supabase/supabase-js';
import { timingSafeEqual } from 'node:crypto';

// Client con chiave segreta: salta le regole di accesso, quindi si usa solo lato server
// e sempre filtrando per l'utente proprietario.
export function admin() {
  return createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

export function ownerId() {
  return process.env.OWNER_USER_ID || '';
}

export function authorized(request) {
  const token = process.env.TASKS_API_TOKEN || '';
  const header = request.headers.get('authorization') || '';
  const got = header.startsWith('Bearer ') ? header.slice(7) : '';
  if (token.length < 24 || !got || !ownerId()) return false;
  const a = Buffer.from(got);
  const b = Buffer.from(token);
  return a.length === b.length && timingSafeEqual(a, b);
}

const COLS = {
  later: 'later', 'prima o poi': 'later',
  month: 'month', mese: 'month', 'questo mese': 'month',
  week: 'week', settimana: 'week', 'questa settimana': 'week',
  today: 'today', oggi: 'today',
};

export function normalizeCol(value) {
  const key = String(value || '').toLowerCase().replace(/[.,;:!?]/g, '').replace(/\s+/g, ' ').trim();
  return COLS[key] || 'week';
}

const COL_NAMES = { later: 'Prima o poi', month: 'Questo mese', week: 'Questa settimana', today: 'Oggi' };
export function colName(col) {
  return COL_NAMES[col] || col;
}

// ---------- date (fuso di Roma) ----------
export function romeToday() {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Europe/Rome', year: 'numeric', month: '2-digit', day: '2-digit',
  }).format(new Date());
}
function addDays(ymd, n) {
  const [y, m, d] = ymd.split('-').map(Number);
  return new Date(Date.UTC(y, m - 1, d + n)).toISOString().slice(0, 10);
}
function weekday(ymd) {
  const [y, m, d] = ymd.split('-').map(Number);
  return new Date(Date.UTC(y, m - 1, d)).getUTCDay(); // 0 = domenica
}
function weekEnd(ymd) {
  return addDays(ymd, (7 - weekday(ymd)) % 7); // la domenica della settimana
}
function monthEnd(ymd) {
  const [y, m] = ymd.split('-').map(Number);
  return new Date(Date.UTC(y, m, 0)).toISOString().slice(0, 10);
}

// Scadenza implicita della colonna.
export function dueFor(col, today = romeToday()) {
  if (col === 'today') return today;
  if (col === 'week') return weekEnd(today);
  if (col === 'month') return monthEnd(today);
  return null;
}

// Colonna adatta a una scadenza: oggi, entro domenica, entro fine mese, altrimenti Prima o poi.
function colForDue(due, today) {
  if (due <= today) return 'today';
  if (due <= weekEnd(today)) return 'week';
  if (due <= monthEnd(today)) return 'month';
  return 'later';
}

const DAY_NAMES = ['domenica', 'lunedì', 'martedì', 'mercoledì', 'giovedì', 'venerdì', 'sabato'];
const MONTH_NAMES = ['gennaio', 'febbraio', 'marzo', 'aprile', 'maggio', 'giugno', 'luglio', 'agosto', 'settembre', 'ottobre', 'novembre', 'dicembre'];

// "oggi", "domani", "venerdì 14 novembre": per la risposta che Siri legge.
export function dueLabel(due, today = romeToday()) {
  if (due === today) return 'oggi';
  if (due === addDays(today, 1)) return 'domani';
  const [, m, d] = due.split('-').map(Number);
  return `${DAY_NAMES[weekday(due)]} ${d} ${MONTH_NAMES[m - 1]}`;
}

// Interpreta una frase dettata, per esempio:
// "completare il deck per oggi con label lavoro" -> titolo, colonna e label.
// Sono capiti anche: domani, dopodomani, un giorno della settimana ("entro venerdì"),
// "la prossima settimana". In questi casi la colonna viene scelta dalla data.
const SPOKEN_COLS = [
  [/\s(?:per\s+|da fare\s+)?prima o poi(?=\s)/giu, 'later'],
  [/\s(?:(?:per|entro|da fare)\s+)?oggi(?=\s)/giu, 'today'],
  [/\s(?:(?:per|entro|in|durante|da fare)\s+)?(?:questa|la|in)\s+settimana(?=\s)/giu, 'week'],
  [/\s(?:(?:per|entro|in|da fare)\s+)?(?:(?:la\s+)?fine(?:\s+del)?\s+mese|(?:questo|il)\s+mese)(?=\s)/giu, 'month'],
];

const WEEKDAY_INDEX = { domenica: 0, lunedi: 1, martedi: 2, mercoledi: 3, giovedi: 4, venerdi: 5, sabato: 6 };
const SPOKEN_DATES = [
  [/\s(?:(?:per|entro|da fare)\s+)?dopodomani(?=\s)/giu, (today) => addDays(today, 2)],
  [/\s(?:(?:per|entro|da fare)\s+)?domani(?=\s)/giu, (today) => addDays(today, 1)],
  [/\s(?:(?:per|entro|in|da fare)\s+)?(?:la\s+)?(?:prossima\s+settimana|settimana\s+prossima)(?=\s)/giu, (today) => addDays(weekEnd(today), 7)],
  [/\s(?:(?:per|entro|da fare)\s+)?(?:il\s+)?(?:prossimo\s+)?(domenica|luned[iì]|marted[iì]|mercoled[iì]|gioved[iì]|venerd[iì]|sabato)(?=\s)/giu, (today, m) => {
    const name = m[1].toLowerCase().replace('ì', 'i');
    let diff = (WEEKDAY_INDEX[name] - weekday(today) + 7) % 7;
    if (diff === 0 && /prossimo/i.test(m[0])) diff = 7;
    return addDays(today, diff);
  }],
];

// Tra le indicazioni trovate vale l'ultima della frase.
function lastMatch(s, list, today) {
  let best = null;
  for (const [re, value] of list) {
    re.lastIndex = 0;
    let m;
    while ((m = re.exec(s))) {
      if (!best || m.index > best.index) {
        best = { index: m.index, length: m[0].length, value: typeof value === 'function' ? value(today, m) : value };
      }
    }
  }
  return best;
}
function cut(s, hit) {
  return s.slice(0, hit.index) + ' ' + s.slice(hit.index + hit.length);
}

export function parseSpoken(text, today = romeToday()) {
  let s = ' ' + String(text || '').replace(/\s+/g, ' ').trim().replace(/[.!?]+$/u, '') + ' ';
  let label = null;
  let col = null;
  let due = null;
  let important = false;

  s = s.replace(
    /\s(?:(?:con|e|nella|nell[’']|in)\s+)?(?:la\s+|l[’'])?(?:label|labels|lable|lebel|leibol|etichetta|categoria)\s+([\p{L}\d]+)[.,;]?(?=\s)/iu,
    (m, name) => { label = name; return ' '; }
  );
  s = s.replace(/[\s,]+(?:(?:ed?\s+)?è\s+|come\s+)?(?:molto\s+)?(?:importante|urgente)\s*$/iu, () => { important = true; return ' '; });

  const date = lastMatch(s, SPOKEN_DATES, today);
  if (date) {
    due = date.value;
    col = colForDue(due, today);
    s = cut(s, date);
  } else {
    const hit = lastMatch(s, SPOKEN_COLS, today);
    if (hit) {
      col = hit.value;
      s = cut(s, hit);
    }
  }

  let title = s.replace(/\s+/g, ' ').replace(/[\s,;:]+$/u, '').replace(/\s(?:con|e|per)$/iu, '').trim();
  if (title) title = title[0].toUpperCase() + title.slice(1);
  return { title, col, label, important, due };
}

// Converte nomi di label ("lavoro") negli id dell'utente. Ignora maiuscole, accenti e punteggiatura.
// `unknown` elenca i nomi richiesti che non corrispondono a nessuna label.
function normName(n) {
  return String(n).normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/[.,;:!?]/g, '').trim();
}
export async function resolveLabels(sb, names) {
  const asked = (Array.isArray(names) ? names : [names])
    .filter(Boolean)
    .map((n) => ({ raw: String(n).replace(/[.,;:!?]/g, '').trim(), key: normName(n) }))
    .filter((n) => n.key);
  if (!asked.length) return { ids: [], unknown: [] };
  const { data, error } = await sb.from('labels').select('id,name').eq('user_id', ownerId());
  if (error) throw error;
  const known = new Map(data.map((l) => [normName(l.name), l.id]));
  return {
    ids: asked.filter((n) => known.has(n.key)).map((n) => known.get(n.key)),
    unknown: asked.filter((n) => !known.has(n.key)).map((n) => n.raw),
  };
}
export async function labelIds(sb, names) {
  return (await resolveLabels(sb, names)).ids;
}
