import { admin, calendarAuthorized, ownerId } from '@/lib/api';
import { buildCalendar } from '@/lib/calendar';

export const dynamic = 'force-dynamic';

// GET /api/calendar?token=<CALENDAR_TOKEN> — calendario da aggiungere in abbonamento (Google Calendar, iPhone).
// I calendari non possono mandare header, quindi il token sta nell'indirizzo: chi ha il link vede i titoli dei task
// segnati "Mostra nel calendario". Per revocarlo basta cambiare CALENDAR_TOKEN su Vercel.
export async function GET(request) {
  if (!calendarAuthorized(request)) return new Response('non autorizzato', { status: 401 });
  try {
    const { data, error } = await admin()
      .from('tasks')
      .select('id,title,due,note,important,col,in_calendar')
      .eq('user_id', ownerId())
      .eq('in_calendar', true)
      .neq('col', 'done')
      .not('due', 'is', null);
    if (error) throw error;
    const body = buildCalendar(data, { appUrl: new URL(request.url).origin });
    return new Response(body, {
      headers: {
        'Content-Type': 'text/calendar; charset=utf-8',
        'Content-Disposition': 'inline; filename="fatto.ics"',
        'Cache-Control': 'no-store',
      },
    });
  } catch (e) {
    console.error('calendar:', e && e.message ? e.message : e);
    return new Response('calendario non disponibile', { status: 502 });
  }
}
