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

// Interpreta una frase dettata, per esempio:
// "completare il deck per oggi con label lavoro" -> titolo, colonna e label.
const SPOKEN_COLS = [
  [/\s(?:per\s+|da fare\s+)?prima o poi(?=\s)/giu, 'later'],
  [/\s(?:(?:per|entro|da fare)\s+)?oggi(?=\s)/giu, 'today'],
  [/\s(?:(?:per|entro|in|durante|da fare)\s+)?(?:questa|la|in)\s+settimana(?=\s)/giu, 'week'],
  [/\s(?:(?:per|entro|in|da fare)\s+)?(?:(?:la\s+)?fine(?:\s+del)?\s+mese|(?:questo|il)\s+mese)(?=\s)/giu, 'month'],
];

export function parseSpoken(text) {
  let s = ' ' + String(text || '').replace(/\s+/g, ' ').trim().replace(/[.!?]+$/u, '') + ' ';
  let label = null;
  let col = null;
  let important = false;

  s = s.replace(
    /\s(?:(?:con|e|nella|nell[’']|in)\s+)?(?:la\s+|l[’'])?(?:label|labels|lable|lebel|leibol|etichetta|categoria)\s+([\p{L}\d]+)[.,;]?(?=\s)/iu,
    (m, name) => { label = name; return ' '; }
  );
  s = s.replace(/[\s,]+(?:(?:ed?\s+)?è\s+|come\s+)?(?:molto\s+)?(?:importante|urgente)\s*$/iu, () => { important = true; return ' '; });

  // Tra le indicazioni di tempo trovate vale l'ultima della frase.
  let best = null;
  for (const [re, value] of SPOKEN_COLS) {
    re.lastIndex = 0;
    let m;
    while ((m = re.exec(s))) {
      if (!best || m.index > best.index) best = { index: m.index, length: m[0].length, value };
    }
  }
  if (best) {
    col = best.value;
    s = s.slice(0, best.index) + ' ' + s.slice(best.index + best.length);
  }

  let title = s.replace(/\s+/g, ' ').replace(/[\s,;:]+$/u, '').replace(/\s(?:con|e|per)$/iu, '').trim();
  if (title) title = title[0].toUpperCase() + title.slice(1);
  return { title, col, label, important };
}

// Scadenza implicita della colonna, calcolata sul fuso di Roma.
export function dueFor(col) {
  const today = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Europe/Rome', year: 'numeric', month: '2-digit', day: '2-digit',
  }).format(new Date());
  const [y, m, d] = today.split('-').map(Number);
  if (col === 'today') return today;
  if (col === 'week') {
    const dt = new Date(Date.UTC(y, m - 1, d));
    dt.setUTCDate(dt.getUTCDate() + ((7 - dt.getUTCDay()) % 7));
    return dt.toISOString().slice(0, 10);
  }
  if (col === 'month') return new Date(Date.UTC(y, m, 0)).toISOString().slice(0, 10);
  return null;
}

// Converte nomi di label ("lavoro") negli id dell'utente; i nomi sconosciuti vengono ignorati.
export async function labelIds(sb, names) {
  const wanted = (Array.isArray(names) ? names : [names])
    .filter(Boolean)
    .map((n) => String(n).toLowerCase().replace(/[.,;:!?]/g, '').trim())
    .filter(Boolean);
  if (!wanted.length) return [];
  const { data, error } = await sb.from('labels').select('id,name').eq('user_id', ownerId());
  if (error) throw error;
  return data.filter((l) => wanted.includes(l.name.toLowerCase())).map((l) => l.id);
}
