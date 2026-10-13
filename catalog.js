// Temi, sfumature e foto disponibili nelle impostazioni.

// Ogni tema definisce solo 4 colori: tutto il resto (bordi, hover, testo secondario)
// viene derivato in CSS con color-mix.
export const THEMES = [
  { id: 'night',    name: 'Notte',    ground: '#0F1117', surface: '#171A23', text: '#E8EAF2', accent: '#7CC4FF', scheme: 'dark' },
  { id: 'graphite', name: 'Grafite',  ground: '#111113', surface: '#1B1B1F', text: '#ECECEE', accent: '#FFC857', scheme: 'dark' },
  { id: 'ocean',    name: 'Oceano',   ground: '#0A1620', surface: '#112430', text: '#E6F1F7', accent: '#5FD3C8', scheme: 'dark' },
  { id: 'forest',   name: 'Foresta',  ground: '#0D1511', surface: '#15221B', text: '#E7F0EA', accent: '#8FDC7A', scheme: 'dark' },
  { id: 'plum',     name: 'Prugna',   ground: '#150F1D', surface: '#1F1829', text: '#EEE8F6', accent: '#D6A3FF', scheme: 'dark' },
  { id: 'light',    name: 'Chiaro',   ground: '#F2F4F8', surface: '#FFFFFF', text: '#1A1D27', accent: '#2F6BFF', scheme: 'light' }
];

export const ACCENTS = ['#7CC4FF', '#5FD3C8', '#8FDC7A', '#FFC857', '#FF9B6B', '#FF93B4', '#D6A3FF', '#2F6BFF'];

export const DEFAULT_BOARD_COLORS = ['#7CC4FF', '#7BE0B5', '#FFC857', '#BBA6FF', '#FF93B4'];
export const BOARD_COLOR_NAMES = ['Cielo', 'Menta', 'Ambra', 'Lilla', 'Rosa'];

export const SOLIDS = ['#0F1117', '#111113', '#0A1620', '#0D1511', '#150F1D', '#1B1F2E', '#2A1B1B', '#F2F4F8'];

export const GRADIENTS = [
  { id: 'aurora', name: 'Aurora', css: 'radial-gradient(60% 70% at 15% 8%, #1fa28a66, transparent 62%), radial-gradient(55% 60% at 92% 18%, #4a63e666, transparent 62%), linear-gradient(160deg, #08131c, #0d2230 55%, #0a1a1a)' },
  { id: 'mezzanotte', name: 'Mezzanotte', css: 'radial-gradient(55% 55% at 50% 0%, #2b3a8a66, transparent 70%), linear-gradient(180deg, #070914, #0c1230)' },
  { id: 'crepuscolo', name: 'Crepuscolo', css: 'linear-gradient(180deg, #1a1033 0%, #4a2060 42%, #b8497a 78%, #f0a05f 100%)' },
  { id: 'brace', name: 'Brace', css: 'radial-gradient(80% 60% at 50% 112%, #ff7a3d99, transparent 66%), linear-gradient(180deg, #140a0a, #2a1210)' },
  { id: 'oceano', name: 'Oceano profondo', css: 'linear-gradient(160deg, #021b2b 0%, #0b4a68 58%, #1b8aa0 100%)' },
  { id: 'foresta', name: 'Foresta', css: 'radial-gradient(70% 60% at 18% 0%, #4fa36a55, transparent 62%), linear-gradient(170deg, #08140e, #12301f)' },
  { id: 'prugna', name: 'Prugna', css: 'radial-gradient(60% 60% at 82% 8%, #b05fd866, transparent 62%), linear-gradient(160deg, #120b1d, #2a1747)' },
  { id: 'grafite', name: 'Grafite', css: 'linear-gradient(160deg, #101114, #2a2c33)' },
  { id: 'sabbia', name: 'Sabbia', css: 'linear-gradient(160deg, #f1e9dc, #d7bf9f)' },
  { id: 'nebbia', name: 'Nebbia', css: 'linear-gradient(160deg, #e9eef6, #b4c3da)' }
];

const CC4 = { license: 'CC BY-SA 4.0', licenseUrl: 'https://creativecommons.org/licenses/by-sa/4.0/' };

// Foto da Wikimedia Commons (dimensioni originali di almeno 3.840 px di larghezza, controllate una per una).
// Il file viene richiesto a 3840 px (4K) oppure 1920 px, a seconda della qualità scelta.
export const IMAGES = [
  { id: 'aurora-tasmania', file: 'Aurora_Australis_Over_the_Tasman_Sea_from_SouthWest_National_Park.jpg', title: 'Aurora australe, Tasmania', author: 'Jamen Percy', tone: '#0b1d22', ...CC4 },
  { id: 'savault', file: 'Savault_Chapel_Under_Milky_Way_BLS.jpg', title: 'Cappella sotto la Via Lattea', author: 'Benh Lieu Song', tone: '#0a1226', ...CC4 },
  { id: 'heavens', file: 'Heavens_Above_Her.jpg', title: 'La Via Lattea', author: 'Ian Norman', tone: '#0b1020', license: 'CC BY-SA 2.0', licenseUrl: 'https://creativecommons.org/licenses/by-sa/2.0/' },
  { id: 'pedra-azul', file: 'Pedra_Azul_Milky_Way.jpg', title: 'Pedra Azul e la Via Lattea', author: 'Eduardo M S Neves', tone: '#0a1022', ...CC4 },
  { id: 'pillars', file: 'Pillars_of_creation_2014_HST_WFC3-UVIS_full-res_denoised.jpg', title: 'Pilastri della Creazione', author: 'NASA, ESA e Hubble Heritage Team (STScI/AURA)', tone: '#1a1410', license: 'Pubblico dominio', licenseUrl: 'https://commons.wikimedia.org/wiki/Template:PD-USGov-NASA' },
  { id: 'tekapo', file: 'Lake_Tekapo_01.jpg', title: 'Lago Tekapo, Nuova Zelanda', author: 'Krzysztof Golik', tone: '#1c3a52', ...CC4 },
  { id: 'shasta', file: 'Mount_Shasta_as_seen_from_Heart_Lake_in_September_2020.jpg', title: 'Monte Shasta da Heart Lake', author: 'Frank Schulenburg', tone: '#26364f', ...CC4 },
  { id: 'rainier', file: 'Rainier_Aerial_West_Close_Washington_Mar23_R16_07149.jpg', title: 'Monte Rainier dall’alto', author: 'TA Gonsalves', tone: '#4b6283', ...CC4 },
  { id: 'apostoli', file: 'Princetown_(AU),_Port_Campbell_National_Park,_Twelve_Apostles_--_2019_--_0969.jpg', title: 'I Dodici Apostoli, Victoria', author: 'Dietmar Rabich', tone: '#4f6b7a', ...CC4 },
  { id: 'longsheng', file: 'Longsheng_Rice_Terraces_November_2017_014.jpg', title: 'Terrazze di riso di Longsheng', author: 'King of Hearts', tone: '#2d4a2f', ...CC4 },
  { id: 'uyuni', file: 'Isla_del_Pescado,_Salar_de_Uyuni,_Bolivia,_2016-02-04,_DD_42.JPG', title: 'Salar de Uyuni dall’Isla del Pescado', author: 'Diego Delso', tone: '#7d9bb8', ...CC4 },
  { id: 'carpazi', file: 'Карпатский_05.jpg', title: 'Carpazi dalla vetta dell’Hoverla', author: 'Dmytro Balkhovitin', tone: '#4a6275', license: 'CC BY-SA 3.0', licenseUrl: 'https://creativecommons.org/licenses/by-sa/3.0/' },
  { id: 'desenka', file: 'Desenka_meadow_2016_G1.jpg', title: 'Prato all’alba, Desenka', author: 'George Chernilevsky', tone: '#5b6650', license: 'Pubblico dominio', licenseUrl: 'https://commons.wikimedia.org/wiki/Template:PD-self' },
  { id: 'komargorod', file: 'Komargorod_pond_2013_G3.jpg', title: 'Stagno nella nebbia, Komargorod', author: 'George Chernilevsky', tone: '#6c7a76', license: 'Pubblico dominio', licenseUrl: 'https://commons.wikimedia.org/wiki/Template:PD-self' },
  // Più scure
  { id: 'orione', file: 'Orion_Nebula_-_Hubble_2006_mosaic_18000.jpg', title: 'Nebulosa di Orione', author: 'NASA, ESA, M. Robberto (STScI/ESA) e Hubble Space Telescope Orion Treasury Project Team', tone: '#0b0705', license: 'Pubblico dominio', licenseUrl: 'https://commons.wikimedia.org/wiki/Template:PD-USGov-NASA' },
  { id: 'granchio', file: 'Crab_Nebula.jpg', title: 'Nebulosa del Granchio', author: 'NASA, ESA, J. Hester e A. Loll (Arizona State University)', tone: '#05070c', license: 'Pubblico dominio', licenseUrl: 'https://commons.wikimedia.org/wiki/Template:PD-USGov-NASA' },
  { id: 'hongkong', file: 'Hong_Kong_Harbour_Night_2019-06-11.jpg', title: 'Hong Kong di notte, da Victoria Peak', author: 'Benh Lieu Song', tone: '#0a0f18', license: 'CC BY-SA 2.0', licenseUrl: 'https://creativecommons.org/licenses/by-sa/2.0/' },
  { id: 'shinjuku', file: 'Night_in_Shinjuku_3.JPG', title: 'Shinjuku di notte, Tokyo', author: 'Martin Falbisoner', tone: '#0b0a0d', license: 'CC BY-SA 3.0', licenseUrl: 'https://creativecommons.org/licenses/by-sa/3.0/' },
  { id: 'paranal', file: 'Milky_Way_Emerges_as_Sun_Sets_over_Paranal.jpg', title: 'Via Lattea sopra il VLT, Paranal', author: 'ESO/J. Colosimo', tone: '#0a1220', license: 'CC BY 4.0', licenseUrl: 'https://creativecommons.org/licenses/by/4.0/' }
];

export function imageUrl(img, width = 3840) {
  return `https://commons.wikimedia.org/wiki/Special:FilePath/${encodeURIComponent(img.file)}?width=${width}`;
}
export function imagePage(img) {
  return `https://commons.wikimedia.org/wiki/File:${encodeURIComponent(img.file)}`;
}

// Colori per evidenziare un link (come nel menu del link).
export const HIGHLIGHTS = [
  ['#62C370', 'Verde'], ['#4DB38C', 'Smeraldo'], ['#4DB5AE', 'Acqua'], ['#4DA3E8', 'Cielo'], ['#4D83F0', 'Blu'],
  ['#6B6FEA', 'Indaco'], ['#8B5CEE', 'Viola'], ['#C84DE6', 'Magenta'], ['#E5506A', 'Rosso'], ['#EC8236', 'Arancio']
];
