# Boards — nuova scheda segnalibri

Estensione Chrome (Manifest V3) che sostituisce la nuova scheda con i tuoi segnalibri organizzati in **board**.
Pensata per uso personale: **tutto resta in locale** (`chrome.storage.local` e IndexedDB), nessun cloud, nessun account.

![Schermata principale: workspace, pagine, board e sfondo fotografico](docs/home.jpg)

<p align="center">
  <img src="docs/settings-theme.jpg" alt="Impostazioni: temi e colore di accento" width="49%">
  <img src="docs/settings-background.jpg" alt="Impostazioni: sfondi fotografici in 4K" width="49%">
</p>

## Come è organizzato

```
Workspace  (es. 🌤️ Personale, 💼 Lavoro)
 └─ Pagina  (le schede in alto: Main, Chess, Trek…)
     └─ Board  (le colonne)
         └─ Link
```

## Funzioni

- **Workspace, pagine, board e link**, con trascinamento (link tra board e pagine, board tra pagine).
- **Link**: evidenzia con un colore, fissa in alto, duplica, sposta, promemoria con notifica ("Ricordamelo").
- **Board**: comprimi, blocca, ordina A–Z, "Apri tutte le pagine".
- **Impostazioni** (finestra centrale): temi e colore di accento personalizzabili, colori delle board, orologio e saluto, icone, larghezza colonne.
- **Sfondi**: tinta unita, sfumature, foto 4K da Wikimedia Commons (fisse o a rotazione), oppure una tua foto.
- **Importazione**: dai segnalibri di Chrome o da un file HTML (Chrome, Edge, Firefox, Safari); una pagina per cartella principale, sottocartelle come board.
- **Popup** `Ctrl+B` (`⌘B` su Mac) per salvare la scheda aperta.
- **Dati**: backup/ripristino JSON, copie automatiche giornaliere (ultime 5), modalità privacy.

## Installazione (modalità sviluppatore)

1. Clona il repository o scarica lo ZIP.
2. Apri `chrome://extensions` e attiva **Modalità sviluppatore**.
3. **Carica estensione non pacchettizzata** e scegli la cartella del repository.

Il campo `key` nel `manifest.json` è la chiave **pubblica** che fissa l'ID dell'estensione
(`mcefhihpfnhjjkkfolcmgjdmicpocpaf`): spostando la cartella i dati restano.

## Permessi

| Permesso | Perché |
| --- | --- |
| `storage`, `unlimitedStorage` | dati e copie automatiche in locale |
| `activeTab` | il popup legge titolo e indirizzo della scheda da salvare |
| `favicon` | icone dei siti dalla cache di Chrome |
| `alarms`, `notifications` | promemoria dei link |
| `bookmarks` (opzionale) | richiesto solo quando importi i segnalibri di Chrome |

Le foto di sfondo sono caricate da `commons.wikimedia.org` solo se scegli uno sfondo "Foto".

## Struttura

| File | Ruolo |
| --- | --- |
| `newtab.html/js/css` | pagina principale: board, trascinamento, import, sfondi |
| `settings.js/css` | finestra delle impostazioni |
| `workspaces.js` | finestra dei workspace |
| `store.js` | modello dati, sanificazione, archivio, copie automatiche |
| `catalog.js` | temi, colori, sfumature e catalogo delle foto |
| `theme.js`, `ui.js`, `base.css` | tema, componenti (menu, finestre, avvisi), stili base |
| `popup.*` | popup di salvataggio rapido |
| `background.js` | service worker dei promemoria |

## Crediti foto

Le foto sono su Wikimedia Commons; autore e licenza compaiono in basso a destra quando una foto è attiva
e nel catalogo (`catalog.js`): Jamen Percy, Benh Lieu Song, Ian Norman, Eduardo M S Neves,
NASA/ESA/Hubble Heritage Team, Krzysztof Golik, Frank Schulenburg, TA Gonsalves, Dietmar Rabich, King of Hearts,
Diego Delso, Dmytro Balkhovitin, George Chernilevsky (licenze CC BY-SA 2.0/3.0/4.0 o pubblico dominio).

I caratteri Bricolage Grotesque e Figtree sono sotto licenza SIL Open Font License.
