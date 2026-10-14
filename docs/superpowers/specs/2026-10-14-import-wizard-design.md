# Importazione guidata dei segnalibri — design

Data: 2026-10-14 · Stato: da approvare

## Obiettivo
Chi importa centinaia di segnalibri deve ottenere una struttura ordinata (pagine → board) con poco lavoro manuale, restando locale e con il controllo finale. Oggi l'import crea una pagina per cartella principale: con alberi disordinati il risultato è caotico.

## Scelte già fatte con Davide
- Classificatore locale a più segnali (sempre attivo).
- Lettura delle pagine (titolo/descrizione) come potenziamento opzionale, con il permesso sui siti già usato per i link rotti.
- Somiglianza semantica locale (modello di embedding nel browser) come potenziamento opzionale.
- Cronologia (permesso opzionale `history`) per distinguere link usati e mai aperti: opzionale, spenta di default.
- IA esterna: NON in questa fase.
- Modalità Smistamento a schede con tasti rapidi e apprendimento delle regole.
- Tutto annullabile (Ctrl+Z), anteprima prima di scrivere.

## Flusso (procedura in 4 passi)
1. **Origine**: file HTML o segnalibri di Chrome (come oggi). Si analizzano i link (dedup per `urlKey`).
2. **Struttura di partenza** (scelta):
   - *Segui le mie cartelle*: cartella di 1° livello → pagina, 2° livello → board, livelli più profondi uniti nella board padre, link sciolti → «Varie».
   - *Modello*: pagine predefinite (Lavoro, Finanza, Casa, Viaggi, Svago, Risorse…), modificabili.
   - *Tutto in «Da smistare»*.
3. **Assegnazione automatica + anteprima ad albero**: ogni link riceve una destinazione con punteggio di sicurezza. Sotto soglia → «Da smistare». Nell'anteprima si rinominano pagine/board, si spostano gruppi, si deselezionano link; board troppo lunghe (>25) vengono divise; doppioni segnalati/eliminati.
4. **Smistamento (facoltativo)**: schermata a schede, un link alla volta con destinazione suggerita; Invio accetta, ←/→ cambia suggerimento, S salta, E elimina. Ogni scelta aggiunge una regola appresa (dominio → board).

## Componenti (file nuovi, uno scopo ciascuno)
- `importer.js`: analisi dei file/alberi → elenco normalizzato `{url,title,path[],added}`.
- `classify.js`: punteggio a più segnali. Segnali: percorso cartella d'origine, dominio (tabella domini→categoria integrata, ~300 voci), parole del titolo/URL (dizionario IT/EN per categoria), regole apprese. Restituisce `{dest, score, why}`. Pura e testabile.
- `enrich.js` (opzionale): legge titolo/descrizione/og:type delle pagine con `fetch` a lotti (6 in parallelo, budget di tempo, salta rete locale con `skippable`), cache in chiave a parte `importMeta`.
- `semantic.js` (opzionale, fase 2): embedding locale (transformers.js + modello piccolo tipo MiniLM, ~25 MB scaricato una volta, WASM; richiede `wasm-unsafe-eval` nella CSP e host permission per scaricare il modello). Raggruppa per similarità e propone nomi di board. Funziona offline dopo il download.
- `history.js` (opzionale): con permesso opzionale `history` legge il numero di visite per URL; link con 0 visite in 12 mesi → proposta pagina «Archivio»; i più visitati → fissati/«Preferiti».
- `wizard.js`/`wizard.css`: dialogo a passi, anteprima ad albero, modalità Smistamento.
- `learned.js`: regole apprese in chiave `importRules` (non nei backup condivisi, ma esportabili).

## Dati e privacy
- Nessun dato esce dal computer, salvo le richieste ai siti dei tuoi link se attivi la lettura pagine (stesso permesso del controllo link rotti).
- Cronologia: letta solo durante la procedura, mai salvata; permesso chiesto solo se attivi l'opzione, rimovibile.
- Il modello semantico è scaricato da una sola origine fissa, con avviso prima del download.

## Gestione errori
- Offline o permesso negato: le opzioni facoltative si saltano e resta il classificatore locale.
- File non valido: messaggio come oggi.
- Interruzione: nulla viene scritto finché non premi «Importa»; dopo, un solo passo di annullamento.

## Test (Chromium reale, come finora)
- `classify.js`: set di segnalibri campione con attese per categoria; soglia di sicurezza; board >25 divise.
- Procedura end-to-end con file HTML di ~400 link: struttura attesa, anteprima, annulla.
- Lettura pagine con rete simulata (route); cronologia con permessi simulati.
- Smistamento: tasti, apprendimento regola, persistenza dopo reload.

## Fasi di consegna
- **v1.9**: importer + classificatore locale + anteprima + Smistamento + apprendimento.
- **v1.10**: lettura pagine + cronologia (opzionali).
- **v1.11**: somiglianza semantica locale (la più costosa: dimensione modello e CSP; si valuta il costo reale prima).

## Fuori portata
IA esterna, accesso a account, modifica dei segnalibri di Chrome.

## Domande aperte
1. Il modello semantico (~25 MB) è accettabile, o preferisci rimandarlo/escluderlo?
2. Le categorie predefinite dei modelli: ti vanno bene Lavoro, Finanza, Casa, Viaggi, Svago, Risorse, o ne vuoi altre?
