// Calendario in abbonamento (formato iCalendar, .ics): solo i task con "Mostra nel calendario" e una scadenza.
// Funzioni pure: si provano con uno script Node.

// Testo per iCalendar: \ ; , vanno protetti e gli a capo diventano \n.
export function icsText(s) {
  return String(s == null ? '' : s).replace(/\\/g, '\\\\').replace(/;/g, '\\;').replace(/,/g, '\\,').replace(/\r?\n/g, '\\n');
}

// Le righe più lunghe di 75 byte vanno spezzate; la continuazione inizia con uno spazio. Non spezza mai un carattere a metà.
export function foldLine(line) {
  const out = [];
  let cur = '';
  let bytes = 0;
  for (const ch of line) {
    const n = Buffer.byteLength(ch);
    if (bytes + n > (out.length ? 74 : 75)) { out.push(cur); cur = ''; bytes = 0; }
    cur += ch;
    bytes += n;
  }
  out.push(cur);
  return out.join('\r\n ');
}

function compact(day) {
  return day.replace(/-/g, '');
}

function nextDay(day) {
  const d = new Date(`${day}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + 1);
  return d.toISOString().slice(0, 10);
}

function stamp(now) {
  return now.toISOString().replace(/[-:]/g, '').replace(/\.\d{3}/, '');
}

// tasks: righe del database (id, title, due, note, important, col, in_calendar). appUrl: indirizzo dell'app, per il link.
export function buildCalendar(tasks, { appUrl = '', now = new Date() } = {}) {
  const lines = [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//Fatto//Calendario//IT',
    'CALSCALE:GREGORIAN',
    'METHOD:PUBLISH',
    'X-WR-CALNAME:Fatto',
    'X-WR-TIMEZONE:Europe/Rome',
    'REFRESH-INTERVAL;VALUE=DURATION:PT1H',
    'X-PUBLISHED-TTL:PT1H',
  ];
  const valid = tasks
    .filter((t) => t.in_calendar && t.col !== 'done' && /^\d{4}-\d{2}-\d{2}$/.test(t.due || ''))
    .sort((a, b) => a.due.localeCompare(b.due) || String(a.title).localeCompare(String(b.title)));
  for (const t of valid) {
    const desc = [t.note, appUrl && `Apri in Fatto: ${appUrl}`].filter(Boolean).join('\n\n');
    lines.push(
      'BEGIN:VEVENT',
      `UID:${t.id}@fatto`,
      `DTSTAMP:${stamp(now)}`,
      `DTSTART;VALUE=DATE:${compact(t.due)}`,
      `DTEND;VALUE=DATE:${compact(nextDay(t.due))}`,
      `SUMMARY:${icsText((t.important ? '★ ' : '') + (t.title || '(senza titolo)'))}`,
      ...(desc ? [`DESCRIPTION:${icsText(desc)}`] : []),
      ...(appUrl ? [`URL:${appUrl}`] : []),
      'TRANSP:TRANSPARENT',
      'END:VEVENT'
    );
  }
  lines.push('END:VCALENDAR');
  return lines.map(foldLine).join('\r\n') + '\r\n';
}
