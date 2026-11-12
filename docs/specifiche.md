# Fatto — specifiche e roadmap

## Bacheca
- Bacheca unica per lavoro e vita privata, separati dalle label.
- Colonne: Prima o poi, Questo mese, Questa settimana, Oggi, Fatto.
- Ogni task ha: titolo, colonna, label, stima del tempo, importante, ricorrenza, note, scadenza.
- Fatto mostra gli ultimi 7 giorni; lo storico resta per le analytics.
- Su telefono si vede una colonna alla volta, con linguette per cambiare.

## Scadenze e scaduti
- La scadenza viene dalla colonna: Oggi = oggi, Questa settimana = domenica, Questo mese = ultimo giorno del mese, Prima o poi = nessuna. Si può cambiare a mano nel task.
- Un task non completato con scadenza passata è "scaduto": compare in cima alla colonna Oggi, in rosso, con "Scaduto ieri" o "Scaduto da N giorni" e il pulsante "Sposta a oggi". Lo spostamento è solo visivo: il dato non viene riscritto.
- I task delle altre colonne mostrano "Scade oggi" o "Scade domani".

## Ricorrenti
Al completamento di un task ricorrente nasce una copia nella colonna corrispondente: ogni giorno → Oggi, ogni settimana → Questa settimana, ogni mese → Questo mese.

## Analytics
Vista settimanale (lunedì–domenica): task completati, tempo stimato completato, importanti completati, completati per giorno, tempo per label, carico aperto per colonna, scaduti, report testuale da copiare.

## Proposte dall'agente email
- Un agente legge le caselle email e propone task di follow-up; le proposte compaiono in una sezione sopra le colonne.
- Ogni proposta si accetta scegliendo la colonna (diventa un task con nota e link all'email) oppure si scarta.
- Niente doppioni: ogni proposta ha un `source_key` unico per utente; le proposte accettate e scartate restano nel database proprio per non essere riproposte.
- Criteri dell'agente. Propone: richieste dirette a Marco, solleciti con scadenza, impegni presi da Marco nelle mail inviate, richieste di Marco rimaste senza risposta, deleghe da verificare, inviti che richiedono risposta. Scarta: accettazioni di riunione, report automatici, newsletter, mail commerciali a freddo, thread in cui Marco è solo in copia, alert già chiusi, email con contenuti riservati.

## Siri
Un Comando Rapido su iPhone ("Nuovo task") detta una frase e la invia a `POST /api/tasks` nel campo `text`. L'app ricava titolo, colonna, label e l'eventuale "importante". Esempio: "completare il deck per oggi con label lavoro". Senza indicazione di tempo il task va in Questa settimana; senza label resta senza label.

## Modello dati
- `tasks`: `title, col (later|month|week|today|done), labels uuid[], est (minuti), important, recurring (none|daily|weekly|monthly), note, due, source, prev_col, created_at, done_at`
- `labels`: `name, color (0–7)`
- `proposals`: `title, labels uuid[], source, sender, subject, reason, confidence (alta|media|bassa), status (new|accepted|dismissed), link, source_key, created_at, decided_at`

## Roadmap
1. Migrazione dei dati dal prototipo.
2. Agente email: farlo scrivere su `/api/proposals`.
3. Promemoria e riepilogo giornaliero di scaduti e in scadenza (cron, email o notifiche).
4. Flag "New": marcare i task aggiunti dopo la pianificazione del lunedì mattina.
5. Gamification: punti in base al rispetto del piano giornaliero, settimanale, mensile.
6. Storico "Fatto" oltre le 1000 righe.
