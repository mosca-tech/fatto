# Fatto — istruzioni per Claude

Fatto è la bacheca personale dei task di Marco (lavoro e vita privata). Un solo utente. Interfaccia e testi in italiano. Marco non è uno sviluppatore di mestiere su questo stack: spiega le modifiche in modo breve e pratico, e dì sempre cosa hai verificato e cosa no.

## Stack
- Next.js 15, App Router, JavaScript (niente TypeScript), React 19.
- Supabase: Postgres, login Google, Realtime. Client in `lib/supabase/`.
- Deploy su Vercel a ogni push sul ramo `main`. Ogni altro ramo o pull request genera un'anteprima.

## Comandi
- `npm install`
- `npm run dev` (richiede `.env.local`, vedi `.env.example`)
- `npm run build` — da eseguire sempre prima di proporre una modifica. Senza variabili vere si può compilare con valori finti:
  `NEXT_PUBLIC_SUPABASE_URL=https://example.supabase.co NEXT_PUBLIC_SUPABASE_ANON_KEY=x SUPABASE_SERVICE_ROLE_KEY=x npm run build`

Non ci sono test automatici. Le funzioni pure in `lib/api.js` (per esempio `parseSpoken`) si provano con uno script Node usa e getta.

## Mappa del codice
- `app/board-app.js` — tutta la logica della bacheca, in JavaScript puro che lavora sul DOM: colonne, filtri, scaduti, ricorrenze, analytics, proposte. È nata da un prototipo; **ora questo file è l'originale**, si modifica direttamente.
- `app/board-markup.js` — l'HTML statico della pagina, come stringa.
- `app/globals.css` — stile; i colori sono variabili in `:root`, con versione chiara e scura.
- `app/Board.js` — componente client che monta markup e logica e passa il client Supabase.
- `app/page.js` — pagina protetta; `middleware.js` rimanda a `/login` chi non ha sessione.
- `app/login/`, `app/auth/` — accesso con Google, limitato a `ALLOWED_EMAILS`.
- `app/api/tasks/route.js` — `POST`: crea un task (Siri, automazioni). Accetta campi separati oppure `text`, una frase dettata.
- `app/api/proposals/route.js` — `GET`/`POST`: proposte dell'agente email.
- `lib/api.js` — autorizzazione delle API, scadenze, lettura delle frasi dettate.
- `supabase/schema.sql` — tabelle, permessi, regole di accesso. Rieseguibile.
- `docs/specifiche.md` — regole di funzionamento e roadmap.

## Regole
- **Segreti:** mai chiavi, token o file `.env` nel repository, nei log o nelle risposte. Vivono solo su Vercel e Supabase.
- **Database:** ogni modifica allo schema va scritta in `supabase/schema.sql` in forma rieseguibile (`if not exists`, `drop policy if exists`). Le tabelle nuove richiedono `grant` espliciti a `authenticated` e `service_role` e una regola RLS `user_id = auth.uid()`: Supabase non le espone in automatico. Lo schema lo esegue Marco a mano nell'SQL Editor: diglielo ogni volta che cambia.
- **Nomi dei campi:** nel database `snake_case` (`prev_col`, `done_at`, `created_at`), nella logica della bacheca `camelCase` (`prevCol`, `doneAt`, `createdAt`). La conversione sta in `taskRow`, `taskObj`, `patchRow` dentro `board-app.js`: un campo nuovo va aggiunto in tutti e tre.
- **Variabili d'ambiente:** quelle `NEXT_PUBLIC_*` sono lette in fase di build; su Vercel vanno create con tipo Config, le altre con tipo Secret. Se ne aggiungi una, aggiorna `.env.example` e avvisa che serve impostarla su Vercel.
- **API:** tutte le rotte in `app/api/` controllano `authorized(request)` e scrivono solo per `OWNER_USER_ID`. Usano la chiave segreta di Supabase, quindi filtrano sempre per utente.
- **Stile del codice della bacheca:** `board-app.js` è volutamente semplice (funzioni, `var`, stringhe HTML passate da `esc()`). Mantieni lo stesso stile e passa sempre da `esc()` qualsiasi testo che arriva dai dati. Una riscrittura in componenti React si fa solo se Marco la chiede.
- **Modifiche:** piccole e separate; lavora su un ramo e apri una pull request, così Marco prova l'anteprima di Vercel prima di unire.

## Verifica
Da questo ambiente si può verificare la build e le funzioni pure. Login Google, database reale, Realtime e Siri si provano solo sull'app pubblicata: indicalo chiaramente nel riepilogo e dì a Marco cosa controllare.
