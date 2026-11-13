# Fatto

Bacheca personale dei task (lavoro e vita privata): colonne temporali, label e filtri, stime, ricorrenze, scaduti in evidenza, analytics settimanale, proposte dall'agente email.

Stack: Next.js (Vercel) · Supabase (database, login Google, tempo reale) · GitHub.

## Struttura

| Percorso | Contenuto |
|---|---|
| `app/board-app.js` | Logica della bacheca (portata dal prototipo) |
| `app/board-markup.js`, `app/globals.css` | Struttura e stile della pagina |
| `app/login`, `app/auth` | Accesso con Google |
| `app/api/tasks` | Creazione task da Siri / automazioni |
| `app/api/proposals` | Proposte dell'agente email |
| `app/api/digest`, `lib/digest.js`, `vercel.json` | Riepilogo di fine giornata per email (cron di Vercel + Resend) |
| `lib/` | Collegamento a Supabase e funzioni comuni delle API |
| `supabase/schema.sql` | Tabelle e regole di accesso |
| `CLAUDE.md`, `docs/specifiche.md` | Istruzioni per Claude e regole di funzionamento |

## Configurazione (una volta sola)

Usa account personali, non aziendali.

### 1. Supabase
1. Crea un progetto su supabase.com (regione europea).
2. SQL Editor: incolla ed esegui `supabase/schema.sql`.
3. Project Settings > API: copia URL, chiave pubblica e chiave segreta.

### 2. Login Google
1. Google Cloud Console: crea un progetto, configura la schermata di consenso OAuth e crea un "ID client OAuth" di tipo applicazione web.
2. Come URI di reindirizzamento autorizzato inserisci quello mostrato da Supabase in Authentication > Sign In / Providers > Google (termina con `/auth/v1/callback`).
3. In Supabase, nella stessa pagina, abilita Google e incolla ID client e segreto.

### 3. GitHub e Vercel
1. Crea un repository privato su GitHub e carica questo progetto.
2. Su vercel.com: "Add New Project", importa il repository.
3. In Environment Variables inserisci le variabili di `.env.example`.
4. Dopo il primo deploy, in Supabase > Authentication > URL Configuration imposta come Site URL l'indirizzo Vercel e aggiungi `https://<tuo-indirizzo>/auth/callback` tra i Redirect URLs.

### 4. Primo accesso e API
1. Apri l'app e accedi con Google: vengono create le label di partenza.
2. Supabase > Authentication > Users: copia il tuo User ID in `OWNER_USER_ID` su Vercel.
3. Genera `TASKS_API_TOKEN` (stringa casuale lunga) e fai un nuovo deploy.

### 5. Riepilogo di fine giornata (email)
1. Crea un account su resend.com e una chiave API con permesso "Sending access".
2. Su Vercel > Settings > Environment Variables aggiungi, tutte di tipo Secret: `RESEND_API_KEY` (la chiave), `DIGEST_TO` (dove vuoi riceverlo: senza un dominio verificato su Resend deve essere l'email con cui hai creato l'account Resend) e `CRON_SECRET` (una stringa lunga a piacere, almeno 24 caratteri). `DIGEST_FROM` è facoltativa.
3. Fai un nuovo deploy. Per provarlo subito: Vercel > Settings > Cron Jobs > Run, oppure `curl -H "Authorization: Bearer $CRON_SECRET" "https://<tuo-indirizzo>/api/digest?dry=1"` per vedere l'anteprima senza inviare.

## Sviluppo in locale

```bash
cp .env.example .env.local   # e compila i valori
npm install
npm run dev
```

## API

Tutte richiedono l'header `Authorization: Bearer <TASKS_API_TOKEN>`.

Creare un task (Siri, Comandi Rapidi):

```bash
curl -X POST https://<tuo-indirizzo>/api/tasks \
  -H "Authorization: Bearer $TASKS_API_TOKEN" -H "Content-Type: application/json" \
  -d '{"title":"Chiamare il fornitore","col":"settimana","labels":["lavoro"]}'
```

In alternativa si può mandare una frase intera, come la detta Siri: `{"text":"completare il deck per oggi con label lavoro"}`. L'app ne ricava titolo, colonna, label e l'eventuale "importante".

`col` accetta `oggi`, `settimana`, `mese`, `prima o poi` (predefinito: settimana). La scadenza viene dalla colonna, salvo `due` esplicito (`AAAA-MM-GG`).

Nelle frasi dettate sono capiti anche `domani`, `dopodomani`, i giorni della settimana (`entro venerdì`) e `la prossima settimana`: la scadenza è quella detta e la colonna viene scelta di conseguenza. La risposta contiene `message`, la frase che Siri legge, e `unknownLabels` se una label detta non esiste.

Agente email: `GET /api/proposals` restituisce i `sourceKey` già visti; `POST /api/proposals` con `{"proposals":[...]}` aggiunge proposte, ignorando i doppioni.

## Da fare

- Migrazione dei dati dal prototipo.
- Promemoria durante la giornata (cron + email o notifiche).
- Storico "Fatto" oltre le 1000 righe (oggi la bacheca carica tutti i task in una sola lettura).
