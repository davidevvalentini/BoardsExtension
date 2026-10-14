# Importazione guidata (v1.9) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Sostituire l'import attuale con una procedura guidata (struttura → anteprima → smistamento) che usa un classificatore locale e impara dalle scelte.

**Architecture:** Moduli ES senza dipendenze da `chrome.*` per la logica (`classify.js`, `importer.js`, `learned.js` solo storage), testabili con `node --test`; l'interfaccia vive in `wizard.js` e si aggancia a `newtab.js` al posto di `importGroups`/`askImportMode`. Nulla viene scritto nello stato finché non si preme «Importa»; la scrittura riusa `commit()` + `withUndo()`.

**Tech Stack:** JS ES modules senza build, Chrome MV3, test: `node --test` (Node 22) per la logica pura, Playwright + Chromium con l'estensione caricata per l'interfaccia (harness già in `/tmp/claude-0/-home-claude-boardsextension/61757292-1499-5155-8876-4fdefc1ab8e6/scratchpad/bk/f1.py`: `boot(p)`, `go(pg)`).

**Spec:** `docs/superpowers/specs/2026-10-14-import-wizard-design.md` (fase v1.9 soltanto: niente lettura pagine, cronologia, semantica).

## Global Constraints

- Testi dell'interfaccia in italiano, tono già in uso (es. «Importa», «Annulla»).
- Nessun dato esce dal computer; nessun nuovo permesso nel manifest.
- Soglia di sicurezza predefinita: `0.5`. Board più lunga di `25` link → divisa in «Nome (1)», «Nome (2)»…
- Modelli di struttura: Lavoro, Finanza, Casa, Viaggi, Svago, Risorse. Pagina di ripiego: «Da smistare» (board «Da smistare»).
- Limiti dei campi dello stato: pagina 40 caratteri, board 60, titolo link 200 (come in `store.js`).
- Regole apprese in chiave `chrome.storage.local` `importRules`, fuori da `boards` e dai backup.
- Ctrl+Z deve annullare l'intera importazione (un solo passo); Esc o Annulla in qualunque passo non scrive nulla.
- Versione `manifest.json` → `1.9.0`; README aggiornato (funzioni, struttura file).
- Spec: i link sciolti (senza cartella) in modalità «cartelle» sono classificati e, sotto soglia, vanno in «Da smistare» (non in «Varie»): aggiornare la spec in questo senso nel Task 5.

## Review Focus

1. File HTML con zero cartelle (tutti link sciolti) o con una sola cartella enorme (>200 link): la procedura non deve bloccarsi, deve produrre board da ≤25 link.
2. URL non http(s) (`javascript:`, `chrome://`, `file:`), URL con barra finale/`utm_*` che duplicano un altro link: scartati o uniti, mai importati come link rotti.
3. Titoli vuoti, lunghissimi o con HTML/emoji: il titolo ricade sull'host, tagliato a 200 caratteri, mostrato come testo (mai interpretato come HTML nell'anteprima).
4. Nomi di cartella vuoti, uguali tra loro in punti diversi, o più lunghi dei limiti: nomi unici e troncati senza perdere link.
5. Importare quando esiste già una pagina con lo stesso nome, o quando tutto è già presente: nessun duplicato, messaggio «Era già tutto importato», nessuna pagina vuota.

---

## File Structure

- Create `classify.js`: punteggio a più segnali, tabella domini→categoria, dizionario parole, regole apprese. Pura.
- Create `importer.js`: da alberi/HTML a elenco piatto; costruzione del piano (`buildPlan`); divisione delle board lunghe. Pura salvo il parser HTML (usa `DOMParser`, passato come parametro per i test).
- Create `learned.js`: `loadRules`, `saveRules`, `learn`, `clearRules` (storage).
- Create `wizard.js` + `wizard.css`: dialogo a passi, anteprima ad albero, Smistamento.
- Modify `newtab.js`: usare importer/wizard, applicare il piano (`applyPlan`), rimuovere `makeCollector`, `parseBookmarkHtml`, `importGroups`, `askImportMode`, `mergeImported`.
- Modify `newtab.html`: collegare `wizard.css`.
- Modify `settings.js`: pulsante «Dimentica le regole apprese» nella scheda Dati.
- Create `tests/classify.test.mjs`, `tests/importer.test.mjs`.

### Task 1: Classificatore locale

**Files:**
- Create: `classify.js`
- Test: `tests/classify.test.mjs`

**Interfaces:**
- Produces:
  - `export const CATEGORIES: string[]` = `['Lavoro','Finanza','Casa','Viaggi','Svago','Risorse']`
  - `export const THRESHOLD = 0.5`
  - `export function classify(item: {url:string,title:string,path?:string[]}, rules?: Rule[]): {page:string, board:string, score:number, why:string}`
  - `Rule = { host: string, page: string, board: string }`
  - Se nessun segnale: `{page:'Da smistare', board:'Da smistare', score:0, why:'nessun indizio'}`.

- [ ] **Step 1: Scrivere i test** in `tests/classify.test.mjs` (node:test, `assert/strict`):
  - `github.com/foo/bar` → page `Lavoro`, score ≥ 0.7, why contiene `dominio`.
  - `https://www.booking.com/hotel/it/x` e `https://skyscanner.it/` → `Viaggi`.
  - `https://youtube.com/watch?v=1` → `Svago`; `https://bancaesempio.it/` con titolo «Conto corrente e mutuo» → `Finanza` (solo parole, score ≥ 0.5).
  - Titolo «Ricetta tiramisù facile» su dominio sconosciuto → `Casa`, board `Cucina`.
  - Regola appresa batte il dominio: `rules=[{host:'github.com',page:'Svago',board:'Giochi'}]` → `Svago/Giochi`, score ≥ 0.95, why `appreso`.
  - Host con `www.` e sottodomini equivalgono (`m.youtube.com` = `youtube.com`).
  - URL senza indizi (`https://zxqv.example/a`, titolo «Home») → `Da smistare`, score 0.
  - Il board restituito è sempre un sotto-argomento non vuoto (≤ 60 caratteri), e `classify` non lancia con `title` vuoto o `url` non valido.
  - Tabella domini: tutti i valori puntano a categorie in `CATEGORIES` (asserzione che itera `DOMAIN_TABLE`, esportata).

- [ ] **Step 2: Eseguire** `node --test tests/classify.test.mjs` → atteso: FAIL (modulo mancante).

- [ ] **Step 3: Implementare `classify.js`.**
  - `export const DOMAIN_TABLE: Record<string, [page, board]>` con circa 300 domini reali (github.com→Lavoro/Sviluppo, stackoverflow.com, notion.so, atlassian.net, slack.com…; Finanza: borsaitaliana.it, justetf.com, yahoo finance…; Casa: giallozafferano.it, leroymerlin.it, immobiliare.it…; Viaggi: booking.com, airbnb.*, skyscanner.*, tripadvisor.*…; Svago: youtube.com, netflix.com, reddit.com, twitch.tv, spotify.com…; Risorse: wikipedia.org, medium.com, coursera.org…). Chiave = host senza `www.`/`m.`.
  - `KEYWORDS: Record<page, {board: string, words: string[]}[]>` IT/EN (es. Finanza: mutuo, etf, borsa, investimenti; Casa: ricetta, arredamento, bricolage…).
  - Punteggio: regola appresa 0.95 (host uguale o suffisso); dominio 0.7; ogni parola trovata in titolo/URL +0.35, massimo 0.6 solo-parole; dominio + parola concordante → 0.85; vince la categoria col punteggio più alto. Normalizzare host con `new URL`, `try/catch`.

- [ ] **Step 4: Eseguire** `node --test tests/classify.test.mjs` → atteso: tutti PASS.

- [ ] **Step 5: Commit** `git add classify.js tests/classify.test.mjs && git commit -m "Classificatore locale dei segnalibri"` (con le righe Co-Authored-By/Claude-Session del sistema).

### Task 2: Importer e piano di importazione

**Files:**
- Create: `importer.js`, `learned.js`
- Test: `tests/importer.test.mjs`

**Interfaces:**
- Consumes: `classify`, `THRESHOLD`, `CATEGORIES` da `classify.js`; `urlKey`, `safeUrl`, `hostOf` da `store.js` (store.js non usa chrome a livello di modulo: verificare importandolo in node; se non importabile, copiare le tre funzioni in `importer.js` con commento e test).
- Produces:
  - `type Item = { url:string, title:string, path:string[] }` (`path` = cartelle sotto barra dei preferiti/altri preferiti; vuoto = sciolto)
  - `type Plan = { pages: { name:string, boards: { name:string, links: {url:string,title:string,why?:string,score?:number}[] }[] }[], dropped: number }`
  - `export function treeToItems(tree: chrome.bookmarks.BookmarkTreeNode[]): Item[]`
  - `export function htmlToItems(text: string, parse?: (t:string)=>Document): Item[] | null` (default `DOMParser`; `null` se non è un export di segnalibri)
  - `export function buildPlan(items: Item[], opts: { structure: 'folders'|'template'|'inbox', rules?: Rule[], threshold?: number, maxBoard?: number }): Plan`
  - `export function splitLong(board: {name,links}, max?: number): board[]`
  - `learned.js`: `loadRules(): Promise<Rule[]>`, `saveRules(r: Rule[]): Promise<void>`, `learn(rules: Rule[], link: {url:string}, dest:{page:string,board:string}): Rule[]` (sostituisce una regola con lo stesso host), `clearRules(): Promise<void>`.

- [ ] **Step 1: Scrivere i test** in `tests/importer.test.mjs` (per l'HTML, JSDOM non c'è: i test del parser girano nel Task 5 end-to-end; qui si testano `treeToItems` con alberi finti, `buildPlan`, `splitLong`, `learn`):
  - `treeToItems` su albero con barra preferiti › «Lavoro» › «Progetti» › 2 link → `path ['Lavoro','Progetti']`; link diretti nella barra → `path []`; nodi non http(s) ignorati.
  - `buildPlan(structure:'folders')`: cartella 1° livello → pagina, 2° → board, 3° livello unito nel board padre (nome `Progetti › Archivio` NON usato: i link vanno nel board di 2° livello); link sciolti: classificati; sotto soglia → pagina/board «Da smistare».
  - `buildPlan(structure:'template')`: tutte e sei le pagine presenti solo se contengono link (nessuna pagina vuota); ignorano le cartelle d'origine ma le usano come parola extra.
  - `buildPlan(structure:'inbox')`: unica pagina «Da smistare».
  - Doppioni (stesso `urlKey`, con `utm_source`, barra finale) → un solo link, `dropped` conta gli scarti; URL `javascript:`/`chrome://` scartati.
  - Una cartella con 60 link → 3 board «X (1)», «X (2)», «X (3)» da ≤25; con 25 esatti → non divisa.
  - Nomi vuoti → «Senza nome»; nomi oltre limite troncati (pagina 40, board 60) e nomi di pagina duplicati dopo troncamento fusi.
  - `learn`: due volte lo stesso host → una sola regola, l'ultima destinazione.

- [ ] **Step 2: Eseguire** `node --test tests/importer.test.mjs` → atteso: FAIL.

- [ ] **Step 3: Implementare `importer.js` e `learned.js`.** `buildPlan` per `folders`: raggruppa per `path[0]`/`path[1]`; per i link sciolti o in `inbox` usa `classify`; `score < threshold` → «Da smistare»; applica `splitLong` e i limiti di lunghezza alla fine; i link portano `why`/`score` per l'anteprima. `htmlToItems`: portare la logica di `parseBookmarkHtml` di `newtab.js` (contenitori `personal_toolbar_folder`/`unfiled_bookmarks_folder` non diventano pagine) producendo `Item[]`.

- [ ] **Step 4: Eseguire** `node --test tests/` → atteso: tutti PASS (Task 1 + 2).

- [ ] **Step 5: Commit** `git add importer.js learned.js tests/importer.test.mjs && git commit -m "Importer e costruzione del piano di importazione"`.

### Task 3: Procedura guidata — struttura e anteprima

**Files:**
- Create: `wizard.js`, `wizard.css`
- Modify: `newtab.html` (aggiungere `<link rel="stylesheet" href="wizard.css">`)

**Interfaces:**
- Consumes: `buildPlan`, `Plan`, `Item` (Task 2); `h`, `icon` da `ui.js`; `loadRules` (Task 2).
- Produces: `export async function runWizard(items: Item[], ctx: { workspaceName: string, hasOtherWs: boolean }): Promise<null | { plan: Plan, target: 'current'|'new', learnedRules: Rule[] }>` — `null` se annullato (Esc, Annulla, clic fuori). Il Task 4 aggiunge a `runWizard` il passo di smistamento.

- [ ] **Step 1: Scrivere il test e2e** `scratchpad/bk/wiz1.py` (Playwright, stesso harness): generare un file HTML Netscape da ~400 link (cartelle «Lavoro» con 60 link, «Varie» 30, 120 link sciolti con domini noti, 40 doppioni, 5 `javascript:`), caricarlo su `#bm-file` con `set_input_files`; attese: si apre un `dialog` con titolo «Importare N link?» (N = link validi unici), tre scelte di struttura con radio (`Segui le mie cartelle` predefinita, `Modello di pagine`, `Tutto in «Da smistare»`); passando a «Avanti» compare l'anteprima ad albero con almeno le pagine «Lavoro» e «Da smistare»; il numero di link in anteprima + scartati = link nel file; rinominare una pagina cambia il testo in anteprima; deselezionare una board riduce il totale mostrato su «Importa (n)»; Esc chiude senza modificare `chrome.storage.local.boards`.

- [ ] **Step 2: Eseguire** `python3 wiz1.py` → atteso: FAIL (la procedura non esiste: l'import usa ancora il vecchio dialogo).

- [ ] **Step 3: Implementare `runWizard` (passi Struttura e Anteprima) in `wizard.js`:** dialogo modale `dialog.dlg.wiz`; passo 1 radio + scelta workspace («nel workspace attuale» / «nel nuovo workspace Importati») + contatori (link validi, doppioni scartati); passo 2 albero con: casella per pagina/board/link (collassati di default), campo di testo per rinominare pagina e board (limiti 40/60), `select` per spostare una board in un'altra pagina, etichetta di sicurezza sui link «Da smistare» con `why`; pulsante «Importa (n)» con n = link selezionati; testi sempre via `textContent` (mai `innerHTML`). `wizard.css`: stile coerente con `tools.css`/`newtab.css` esistenti (variabili tema già in uso).

- [ ] **Step 4: Eseguire** `python3 wiz1.py` → atteso: PASS. Il test non collega ancora la scrittura (Task 5): lo scrivere avviene al Task 5.

- [ ] **Step 5: Commit** `git add wizard.js wizard.css newtab.html && git commit -m "Procedura guidata: struttura e anteprima"`.

### Task 4: Modalità Smistamento e apprendimento

**Files:**
- Modify: `wizard.js`, `wizard.css`

**Interfaces:**
- Consumes: `learn`, `Rule` (Task 2); `CATEGORIES`, `classify` (Task 1); `runWizard` (Task 3).
- Produces: `runWizard` gestisce un terzo passo «Smistamento» (mostrato solo se la pagina «Da smistare» contiene link); l'esito `learnedRules` contiene le regole aggiornate; i link scelti sono spostati nel `plan`, quelli eliminati rimossi, quelli saltati restano in «Da smistare».

- [ ] **Step 1: Scrivere il test e2e** `scratchpad/bk/wiz2.py`: con il file del Task 3, scegliere «Avanti» fino al passo Smistamento: compare una scheda con titolo, host e destinazione suggerita; Invio accetta e passa al link successivo; ←/→ cambia destinazione tra i suggerimenti (sempre includendo le 6 categorie e le pagine del piano); `S` salta; `E` elimina; contatore «k di n»; accettare due link dello stesso host → `learnedRules` contiene una sola regola per quell'host; con 0 link da smistare il passo non compare; «Fine» chiude il passo mantenendo le scelte; Esc nello smistamento annulla tutta la procedura senza scrivere.

- [ ] **Step 2: Eseguire** `python3 wiz2.py` → atteso: FAIL.

- [ ] **Step 3: Implementare** il passo «Smistamento» in `wizard.js`: scheda singola, focus sul pulsante principale, tasti Invio/←/→/S/E (anche con pulsanti cliccabili e `aria-label` per accessibilità), suggerimento = `classify` con le regole correnti (aggiornate a ogni scelta); alla fine aggiornare `plan` e `learnedRules` con `learn`.

- [ ] **Step 4: Eseguire** `python3 wiz2.py` e `python3 wiz1.py` → atteso: PASS entrambi.

- [ ] **Step 5: Commit** `git add wizard.js wizard.css && git commit -m "Procedura guidata: Smistamento a schede e apprendimento"`.

### Task 5: Integrazione, scrittura, documentazione e consegna

**Files:**
- Modify: `newtab.js` (righe ~454–593: sostituire `makeCollector`, `importFromChrome`, `parseBookmarkHtml`, `importBookmarkFile`, `importGroups`, `askImportMode`, `mergeImported`), `settings.js` (scheda Dati), `manifest.json` (versione), `README.md`, `docs/superpowers/specs/2026-10-14-import-wizard-design.md`

**Interfaces:**
- Consumes: `treeToItems`, `htmlToItems` (Task 2), `runWizard` (Task 3/4), `loadRules`, `saveRules`, `clearRules` (Task 2).
- Produces: `async function applyPlan(plan: Plan, target: 'current'|'new'): Promise<void>` in `newtab.js` (stessa logica di deduplica/pagina-esistente di `mergeImported`, `commit()` poi `withUndo('Importati N link nuovi.')`, oppure `toast('Era già tutto importato.')`); azione impostazioni `forgetRules`.

- [ ] **Step 1: Scrivere il test e2e** `scratchpad/bk/wiz3.py`: flusso completo con `bk` di ~400 link: «Importa» scrive pagine/board attesi (nessuna board >25 link, nessuna pagina vuota, nessun doppione, titoli vuoti → host); Ctrl+Z annulla tutto in un colpo e lo stato torna identico a quello iniziale (`canon`); reimportare lo stesso file → toast «Era già tutto importato.» e nessuna modifica; importare con una pagina omonima esistente → board aggiunte, nessuna pagina duplicata; `importRules` salvate dopo l'import e usate nel secondo import (host appreso classificato senza passare da Smistamento); `Forget rules` svuota `importRules`; import da `chrome.bookmarks` (permesso simulato con `chrome.permissions.request=async()=>true` e `chrome.bookmarks.getTree` sostituito con albero finto) arriva alla stessa procedura; file non-HTML → toast «Il file non sembra un export di segnalibri (HTML).» senza aprire il dialogo; nessun errore di pagina in console.

- [ ] **Step 2: Eseguire** `python3 wiz3.py` → atteso: FAIL.

- [ ] **Step 3: Implementare l'integrazione:** in `newtab.js` importare da `importer.js`/`wizard.js`/`learned.js`, far confluire `importFromChrome` e `importBookmarkFile` in `runWizard(items, {...})`, salvare `learnedRules` con `saveRules`, scrivere con `applyPlan`; eliminare il codice sostituito; in `settings.js` (scheda Dati) aggiungere «Dimentica le regole apprese» (conferma con `askConfirm`, poi `clearRules` + toast); `manifest.json` → `1.9.0`; `README.md`: sezione «Importazione guidata» (struttura, smistamento, apprendimento) e struttura file aggiornata; aggiornare la spec per la scelta dei link sciolti («Da smistare» invece di «Varie»).

- [ ] **Step 4: Eseguire la verifica completa:** `node --test tests/` → tutti PASS; `python3 wiz1.py && python3 wiz2.py && python3 wiz3.py` → PASS; rieseguire le prove di regressione già esistenti `f1.py`…`f6.py` e `nm.py` (nello stesso scratchpad) → stessi risultati di prima, nessun `pageerror`.

- [ ] **Step 5: Commit, push, zip** `git add -A && git commit -m "Importazione guidata dei segnalibri (v1.9.0)" && git push origin HEAD`; poi ricostruire `/tmp/boards-extension.zip` (esclusi `.git`, `.gitignore`, `README.md`, `docs`, `tests`) e consegnarlo.
