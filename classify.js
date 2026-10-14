// Classificatore locale dei segnalibri: dice in quale pagina/board dovrebbe finire un link.
// Nessuna rete e nessuna dipendenza dal browser: usa solo dominio, parole del titolo/indirizzo e regole apprese.

export const CATEGORIES = ['Lavoro', 'Finanza', 'Casa', 'Viaggi', 'Svago', 'Risorse'];
export const THRESHOLD = 0.5;
export const INBOX = 'Da smistare';

/* ——— Domini noti: «Pagina/Board» → elenco di host ——— */
const DOMAINS = {
  'Lavoro/Sviluppo': 'github.com gitlab.com bitbucket.org stackoverflow.com stackexchange.com npmjs.com pypi.org developer.mozilla.org docs.python.org nodejs.org vercel.com netlify.com heroku.com cloudflare.com digitalocean.com aws.amazon.com console.cloud.google.com portal.azure.com docker.com hub.docker.com kubernetes.io codepen.io jsfiddle.net replit.com codesandbox.io regex101.com jetbrains.com visualstudio.com postman.com sentry.io datadoghq.com grafana.com',
  'Lavoro/Produttività': 'notion.so trello.com asana.com atlassian.net jira.com monday.com clickup.com airtable.com slack.com zoom.us teams.microsoft.com miro.com figma.com canva.com calendly.com todoist.com evernote.com linear.app basecamp.com docs.google.com drive.google.com sheets.google.com calendar.google.com',
  'Lavoro/Posta e ufficio': 'mail.google.com outlook.live.com outlook.office.com office.com onedrive.live.com sharepoint.com dropbox.com box.com wetransfer.com',
  'Lavoro/Carriera': 'linkedin.com indeed.com glassdoor.com monster.com infojobs.it jobrapido.com upwork.com fiverr.com freelancer.com malt.it',
  'Finanza/Borsa': 'borsaitaliana.it investing.com finance.yahoo.com tradingview.com marketwatch.com bloomberg.com morningstar.it morningstar.com justetf.com etf.com seekingalpha.com finviz.com stockanalysis.com macrotrends.net trading212.com degiro.it interactivebrokers.com directa.it fineco.it scalable.capital ilsole24ore.com milanofinanza.it soldionline.it money.it',
  'Finanza/Banche e pagamenti': 'paypal.com satispay.com revolut.com n26.com wise.com intesasanpaolo.com unicredit.it bancamediolanum.it mps.it bper.it ing.it hype.it nexi.it stripe.com poste.it postepay.it',
  'Finanza/Tasse e previdenza': 'agenziaentrate.gov.it inps.it mef.gov.it fiscooggi.it informazionefiscale.it commercialista.it',
  'Finanza/Cripto': 'coinbase.com binance.com kraken.com coingecko.com coinmarketcap.com etherscan.io blockchain.com ledger.com',
  'Casa/Cucina': 'giallozafferano.it cookist.it cucchiaio.it fattoincasa.it tasty.co allrecipes.com seriouseats.com bbcgoodfood.com cooking.nytimes.com misya.info lacucinaitaliana.it ricette.giallozafferano.it',
  'Casa/Immobili': 'immobiliare.it idealista.it casa.it zillow.com rightmove.co.uk realtor.com trovocasa.it tecnocasa.it',
  'Casa/Fai da te': 'leroymerlin.it ikea.com bricoman.it obi.it brico.io manomano.it wayfair.com houzz.com pinterest.com',
  'Casa/Acquisti': 'amazon.it amazon.com amazon.de ebay.it ebay.com etsy.com zalando.it aliexpress.com wish.com mediaworld.it unieuro.it euronics.it esselunga.it coop.it conad.it',
  'Casa/Salute': 'doctolib.it humanitas.it fascicolosanitario.gov.it my-personaltrainer.it fitprime.com mypersonaltrainer.it',
  'Viaggi/Prenotazioni': 'booking.com airbnb.com airbnb.it expedia.com expedia.it hotels.com trivago.it trivago.com agoda.com hostelworld.com vrbo.com kayak.it kayak.com skyscanner.it skyscanner.com momondo.it ryanair.com easyjet.com wizzair.com lufthansa.com alitalia.com ita-airways.com trenitalia.com italotreno.it flixbus.it omio.it rome2rio.com',
  'Viaggi/Guide': 'tripadvisor.it tripadvisor.com lonelyplanet.com lonelyplanet.it viaggi.corriere.it turistipercaso.it siviaggia.it atlasobscura.com wikivoyage.org nomadlist.com',
  'Viaggi/Mappe': 'maps.google.com openstreetmap.org waze.com citymapper.com komoot.com alltrails.com mapy.cz',
  'Svago/Video': 'youtube.com youtu.be netflix.com primevideo.com disneyplus.com raiplay.it mediasetinfinity.mediaset.it dazn.com twitch.tv vimeo.com dailymotion.com rai.it hbomax.com max.com crunchyroll.com',
  'Svago/Musica e podcast': 'spotify.com open.spotify.com music.apple.com soundcloud.com bandcamp.com deezer.com last.fm genius.com music.youtube.com podcasts.apple.com audible.it',
  'Svago/Social': 'facebook.com instagram.com twitter.com x.com reddit.com tiktok.com threads.net mastodon.social snapchat.com pinterest.it tumblr.com discord.com telegram.org web.whatsapp.com',
  'Svago/Giochi': 'steampowered.com store.steampowered.com epicgames.com gog.com itch.io ign.com eurogamer.it multiplayer.it everyeye.it playstation.com xbox.com nintendo.com chess.com lichess.org',
  'Svago/Cinema e libri': 'imdb.com rottentomatoes.com mymovies.it comingsoon.it letterboxd.com goodreads.com anobii.com ibs.it mondadoristore.it lafeltrinelli.it',
  'Svago/Sport': 'gazzetta.it sport.sky.it espn.com eurosport.it transfermarkt.it fantacalcio.it strava.com sofascore.com flashscore.it',
  'Risorse/Notizie': 'repubblica.it corriere.it lastampa.it ilpost.it ansa.it fanpage.it internazionale.it ilfattoquotidiano.it ilgiornale.it open.online bbc.com bbc.co.uk cnn.com nytimes.com theguardian.com reuters.com washingtonpost.com ft.com economist.com wsj.com',
  'Risorse/Enciclopedie': 'wikipedia.org it.wikipedia.org en.wikipedia.org wikimedia.org britannica.com treccani.it archive.org wolframalpha.com',
  'Risorse/Corsi': 'coursera.org udemy.com edx.org khanacademy.org udacity.com skillshare.com duolingo.com domestika.org codecademy.com freecodecamp.org w3schools.com pluralsight.com masterclass.com ted.com',
  'Risorse/Blog e articoli': 'medium.com substack.com dev.to hashnode.com wordpress.com blogspot.com paulgraham.com news.ycombinator.com lobste.rs smashingmagazine.com css-tricks.com',
  'Risorse/Strumenti': 'translate.google.com deepl.com chatgpt.com chat.openai.com claude.ai gemini.google.com perplexity.ai google.com duckduckgo.com bing.com wetransfer.it tinypng.com remove.bg unsplash.com pexels.com pixabay.com flaticon.com fonts.google.com'
};

export const DOMAIN_TABLE = {};
for (const [dest, hosts] of Object.entries(DOMAINS)) {
  const [page, board] = dest.split('/');
  for (const host of hosts.split(/\s+/).filter(Boolean)) DOMAIN_TABLE[host] = [page, board];
}

/* ——— Parole: radici (da 6 lettere in su basta l'inizio della parola; sotto serve la parola intera) ——— */
const KEYWORDS = {
  Lavoro: [
    ['Sviluppo', 'javascript typescript python github api framework programming programmazione sviluppatore developer algoritm database sql docker kubernetes devops'],
    ['Produttività', 'riunione meeting progetto agenda task scadenz planner workflow'],
    ['Carriera', 'curriculum lavoro offerte stipendio colloquio recruiting']
  ],
  Finanza: [
    ['Banca', 'banca bancario conto corrente carta credito bonifico iban prestito mutuo mutui'],
    ['Investimenti', 'etf azioni obbligazioni borsa investire investimenti investimento dividendi portafoglio trading fondo fondi pensione pac'],
    ['Tasse', 'tasse fiscale fisco imposta imposte irpef iva dichiarazione commercialista isee 730'],
    ['Cripto', 'bitcoin crypto cripto ethereum blockchain']
  ],
  Casa: [
    ['Cucina', 'ricetta ricette cucina cucinare ingredienti dolci pasta pizza lievito impasto torta'],
    ['Fai da te', 'arredamento bricolage giardino giardinaggio mobili ristrutturazione idraulico elettricista'],
    ['Immobili', 'affitto affitti immobile immobili appartamento vendita condominio'],
    ['Salute e benessere', 'salute dieta allenamento palestra fitness yoga medico farmaco benessere']
  ],
  Viaggi: [
    ['Prenotazioni', 'hotel volo voli prenotazione prenota vacanza vacanze viaggio viaggi crociera b&b'],
    ['Guide', 'itinerario destinazione weekend turismo guida spiaggia escursione'],
    ['Mappe', 'mappa mappe percorso trekking sentiero']
  ],
  Svago: [
    ['Video', 'film serie trailer streaming episodio puntata stagione'],
    ['Musica', 'musica canzone album concerto playlist testo playlist'],
    ['Giochi', 'gioco giochi videogioco videogiochi gaming scacchi'],
    ['Sport', 'calcio serie classifica campionato formula tennis basket']
  ],
  Risorse: [
    ['Corsi', 'corso corsi tutorial imparare lezione lezioni guida'],
    ['Notizie', 'notizie cronaca politica economia news editoriale'],
    ['Strumenti', 'convertitore generatore calcolatore template']
  ]
};

const fold = (s) => String(s ?? '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');
const tokens = (s) => fold(s).match(/[a-z0-9&]+/g) || [];
const hit = (tok, word) => (word.length >= 6 ? tok.startsWith(word) : tok === word);

export function hostKey(url) {
  try { return new URL(url).hostname.toLowerCase().replace(/^(www|m|mobile)\./, ''); } catch { return ''; }
}

function domainDest(host) {
  if (!host) return null;
  for (let h = host; h.includes('.'); h = h.slice(h.indexOf('.') + 1)) {
    if (DOMAIN_TABLE[h]) return DOMAIN_TABLE[h];
  }
  return null;
}

// Per ogni categoria: quante parole diverse compaiono, e in quale board (quella con più parole).
function keywordScores(toks) {
  const found = {};
  for (const [page, groups] of Object.entries(KEYWORDS)) {
    for (const [board, words] of groups) {
      const matched = new Set();
      for (const w of words.split(/\s+/)) if (toks.some((t) => hit(t, w))) matched.add(w);
      if (matched.size) {
        const f = (found[page] ||= { n: 0, board, best: 0 });
        f.n += matched.size;
        if (matched.size > f.best) { f.best = matched.size; f.board = board; }
      }
    }
  }
  return found;
}

const clip = (s) => String(s).slice(0, 60);

export function classify(item, rules = []) {
  const url = String(item?.url ?? '');
  const host = hostKey(url);

  // 1) Regole apprese dalle tue scelte
  for (const r of rules) {
    if (host && r.host && (host === r.host || host.endsWith('.' + r.host))) {
      return { page: clip(r.page), board: clip(r.board), score: 0.95, why: 'appreso dalle tue scelte' };
    }
  }

  // 2) Dominio noto e parole
  const dom = domainDest(host);
  let path = '';
  try { path = decodeURIComponent(new URL(url).pathname); } catch { /* indirizzo non valido */ }
  const kw = keywordScores(tokens(`${item?.title ?? ''} ${path}`));
  const bestKw = Object.entries(kw).sort((a, b) => b[1].n - a[1].n)[0];

  if (dom) {
    const agree = kw[dom[0]];
    return { page: dom[0], board: dom[1], score: agree ? 0.85 : 0.7, why: agree ? 'dominio e parole' : 'dominio noto' };
  }
  if (bestKw) {
    const [page, f] = bestKw;
    return { page, board: clip(f.board), score: Math.min(0.7, f.n > 1 ? 0.7 : 0.5), why: 'parole del titolo' };
  }
  return { page: INBOX, board: INBOX, score: 0, why: 'nessun indizio' };
}
