import { NextResponse } from 'next/server';
import { admin, cronAuthorized, ownerId } from '@/lib/api';
import { buildDigest, sendEmail } from '@/lib/digest';

export const dynamic = 'force-dynamic';

// GET /api/digest — riepilogo di fine giornata per email. Lo chiama il cron di Vercel (vedi vercel.json).
// Header: Authorization: Bearer <CRON_SECRET>  (oppure il token delle API, per provarlo a mano)
// Con ?dry=1 non invia nulla e mostra l'anteprima del messaggio.
const COLS = 'title,col,due,important,starts_on,done_at,est,recurring';

export async function GET(request) {
  if (!cronAuthorized(request)) return NextResponse.json({ error: 'non autorizzato' }, { status: 401 });
  const dry = new URL(request.url).searchParams.get('dry') === '1';

  const apiKey = process.env.RESEND_API_KEY || '';
  const to = process.env.DIGEST_TO || '';
  const from = process.env.DIGEST_FROM || 'Fatto <onboarding@resend.dev>';
  const missing = [!apiKey && 'RESEND_API_KEY', !to && 'DIGEST_TO'].filter(Boolean);
  if (!dry && missing.length) return NextResponse.json({ error: `configurazione mancante: ${missing.join(', ')}` }, { status: 500 });

  try {
    const sb = admin();
    const since = new Date(Date.now() - 36 * 3600 * 1000).toISOString(); // basta lo storico recente: solo i completati di oggi contano
    const [open, done] = await Promise.all([
      sb.from('tasks').select(COLS).eq('user_id', ownerId()).neq('col', 'done'),
      sb.from('tasks').select(COLS).eq('user_id', ownerId()).eq('col', 'done').gte('done_at', since),
    ]);
    if (open.error) throw open.error;
    if (done.error) throw done.error;

    const digest = buildDigest([...open.data, ...done.data]);
    if (dry) return NextResponse.json({ dry: true, subject: digest.subject, counts: digest.counts, text: digest.text });

    const id = await sendEmail({ apiKey, from, to, subject: digest.subject, html: digest.html, text: digest.text });
    return NextResponse.json({ sent: true, id, counts: digest.counts });
  } catch (e) {
    console.error('digest:', e && e.message ? e.message : e);
    return NextResponse.json({ error: 'invio non riuscito' }, { status: 502 });
  }
}
