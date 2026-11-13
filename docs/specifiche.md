# Fatto — specifiche e roadmap

## Bacheca
- Bacheca unica per lavoro e vita privata, separati dalle label.
- Colonne: Prima o poi, Questo mese, Questa settimana, Oggi, Fatto.
- Ogni task ha: titolo, colonna, label, stima del tempo, importante, ricorrenza, note, scadenza.
- Fatto mostra gli ultimi 7 giorni; lo storico resta per le analytics.
- Su telefono si vede una colonna alla volta, con linguette per cambiare.

## Scadenze e scaduti
- **Scadenza standard:** se non ne scegli una, la scadenza viene dalla colonna: Oggi = oggi, Questa settimana = domenica, Questo mese = ultimo giorno del mese, Prima o poi = nessuna. Cambiando colonna cambia anche la scadenza standard.
- **Scadenza scelta da te:** una data diversa da quella standard della colonna (in Prima o poi, qualsiasi data). La si imposta nella scheda del task, dalla frase di Siri o dal pulsante dell'API.
- **La colonna dice quando pensi di farlo, la scadenza può solo anticiparlo.** Con una scadenza scelta da te il task avanza da solo: Prima o poi fino a fine mese, poi Questo mese, nella settimana della scadenza Questa settimana, il giorno della scadenza Oggi. Con scadenza 10 dicembre: Prima o poi fino al 30 novembre, Questo mese dal 1° al 6 dicembre, Questa settimana dal 7 al 9, Oggi il 10. Non torna mai indietro. Le scadenze standard non fanno avanzare il task.
- **Spostamenti manuali.** Anticipare è libero e la scadenza resta (un task che scade il 10 dicembre si può mettere in Oggi). Rimandare oltre la scadenza no: se la colonna scelta arriva troppo tardi, l'app chiede una nuova scadenza, valida per quella colonna, oppure di togliere la scadenza; con Annulla il task resta dov'è. Lo stesso controllo vale nella scheda del task: non si salva finché colonna e data non sono compatibili. Con una scadenza standard, la scadenza segue la colonna come prima.
- **Scaduti:** un task non completato con scadenza passata è "scaduto": compare in cima alla colonna Oggi, in rosso, con "Scaduto ieri" o "Scaduto da N giorni" e il pulsante "Sposta a oggi". Lo spostamento è solo visivo finché non lo si conferma: trascinato in Oggi o con il pulsante, la scadenza diventa oggi. Per metterlo in un'altra colonna serve una nuova scadenza.
- **Etichette:** i task nelle altre colonne mostrano "Scade oggi", "Scade domani" o, per le scadenze scelte da te, "Scade il 10 dic".

## Ricorrenti
Frequenze: ogni giorno, settimana, mese, anno. Al completamento di un task ricorrente nasce subito la prossima occorrenza, ma **non compare subito nella sua colonna**: resta "in attesa" fino all'inizio del suo periodo.
- **Quando riappare:** ogni giorno → il giorno dopo, in Oggi; ogni settimana → il lunedì successivo, in Questa settimana; ogni mese → il primo del mese dopo, in Questo mese; ogni anno → il primo del mese di scadenza, in Questo mese.
- **Nuova scadenza:** parte dalla scadenza del task completato, non dal giorno in cui lo si chiude, e va avanti finché cade dopo il periodo in corso (un task chiuso in ritardo non riappare già scaduto). Un giorno di fine mese resta di fine mese.
- **In attesa:** si vede in Prima o poi, in grigio e tratteggiato, con "Riappare il 1 dic" (o "domani"). Si può aprire, modificare o eliminare, e così si ferma la ricorrenza. Non entra nei conteggi delle colonne né nel carico aperto delle analytics. Alla data prevista si sposta da solo nella colonna giusta. Trascinarlo in una colonna, o cambiarne la colonna nella scheda, lo attiva subito.
- **Icona:** i task ricorrenti hanno una piccola ↻ accanto al titolo.

## Analytics
Vista settimanale (lunedì–domenica): task completati, tempo stimato completato, importanti completati, completati per giorno, tempo per label, carico aperto per colonna, scaduti, report testuale da copiare.

## Proposte dall'agente email
- Un agente legge le caselle email e propone task di follow-up; le proposte compaiono in una sezione sopra le colonne.
- La sezione ha un pulsante Nascondi/Mostra: da nascosta resta visibile solo il titolo con il numero di proposte. La scelta viene ricordata su quel dispositivo (nel browser).
- Ogni proposta si accetta scegliendo la colonna (diventa un task con nota e link all'email) oppure si scarta.
- Niente doppioni: ogni proposta ha un `source_key` unico per utente; le proposte accettate e scartate restano nel database proprio per non essere riproposte.
- Criteri dell'agente. Propone: richieste dirette a Marco, solleciti con scadenza, impegni presi da Marco nelle mail inviate, richieste di Marco rimaste senza risposta, deleghe da verificare, inviti che richiedono risposta. Scarta: accettazioni di riunione, report automatici, newsletter, mail commerciali a freddo, thread in cui Marco è solo in copia, alert già chiusi, email con contenuti riservati.

## Siri
Un Comando Rapido su iPhone ("Nuovo task") detta una frase e la invia a `POST /api/tasks` nel campo `text`. L'app ricava titolo, colonna, label e l'eventuale "importante". Esempio: "completare il deck per oggi con label lavoro". Senza indicazione di tempo il task va in Questa settimana; senza label resta senza label.
- **Tempo:** oggi, questa settimana, fine mese, prima o poi; inoltre domani, dopodomani, un giorno della settimana ("entro venerdì", "prossimo lunedì") e "la prossima settimana". Con una data la colonna viene scelta dalla data (oggi → Oggi, entro domenica → Questa settimana, entro fine mese → Questo mese, oltre → Prima o poi) e la scadenza è quella detta. Un giorno della settimana uguale a oggi vale oggi, salvo "prossimo".
- **Label:** si dice "con label lavoro" (una parola); maiuscole e accenti non contano. Se non esiste, il task viene creato lo stesso senza label e la risposta lo dice.
- **Risposta:** il campo `message` è la frase che Siri legge, per esempio "Ho aggiunto Chiamare Rossi in Questa settimana come task importante, scade domani" (la parte "come task importante" solo se lo è).

## Modello dati
- `tasks`: `title, col (later|month|week|today|done), labels uuid[], est (minuti), important, recurring (none|daily|weekly|monthly|yearly), note, due, source, prev_col, created_at, done_at, starts_on` (`starts_on`: data da cui un'occorrenza ricorrente diventa attiva; prima di quella data è "in attesa")
- `labels`: `name, color (0–7)`
- `proposals`: `title, labels uuid[], source, sender, subject, reason, confidence (alta|media|bassa), status (new|accepted|dismissed), link, source_key, created_at, decided_at`

## Roadmap
1. Migrazione dei dati dal prototipo.
2. Agente email: farlo scrivere su `/api/proposals`.
3. Promemoria e riepilogo giornaliero di scaduti e in scadenza (cron, email o notifiche).
4. Flag "New": marcare i task aggiunti dopo la pianificazione del lunedì mattina.
5. Gamification: punti in base al rispetto del piano giornaliero, settimanale, mensile.
6. Storico "Fatto" oltre le 1000 righe.
