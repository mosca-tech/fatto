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
  return COLS[String(value || '').trim().toLowerCase()] || 'week';
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
    .map((n) => String(n).trim().toLowerCase());
  if (!wanted.length) return [];
  const { data, error } = await sb.from('labels').select('id,name').eq('user_id', ownerId());
  if (error) throw error;
  return data.filter((l) => wanted.includes(l.name.toLowerCase())).map((l) => l.id);
}
