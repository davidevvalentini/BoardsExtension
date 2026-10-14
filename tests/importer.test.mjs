import test from 'node:test';
import assert from 'node:assert/strict';
import { treeToItems, buildPlan, splitLong } from '../importer.js';
import { learn } from '../learned.js';

const A = (u, t = '', path = []) => ({ url: u, title: t, path });
const pageNames = (plan) => plan.pages.map((p) => p.name);
const boardsOf = (plan, name) => plan.pages.find((p) => p.name === name)?.boards ?? [];
const total = (plan) => plan.pages.reduce((a, p) => a + p.boards.reduce((b, x) => b + x.links.length, 0), 0);

test('treeToItems: cartelle e link sciolti, solo http(s)', () => {
  const tree = [{ children: [
    { title: 'Barra dei preferiti', children: [
      { title: 'Lavoro', children: [{ title: 'Progetti', children: [
        { title: 'A', url: 'https://a.example/1' }, { title: 'B', url: 'https://b.example/2' }] }] },
      { title: 'Sciolto', url: 'https://c.example/' },
      { title: 'Interno', url: 'chrome://settings' },
      { title: 'Js', url: 'javascript:alert(1)' }
    ] }
  ] }];
  const items = treeToItems(tree);
  assert.deepEqual(items.map((i) => i.url), ['https://a.example/1', 'https://b.example/2', 'https://c.example/']);
  assert.deepEqual(items[0].path, ['Lavoro', 'Progetti']);
  assert.deepEqual(items[2].path, []);
});

test('folders: pagina = 1° livello, board = 2°, livelli più profondi uniti nel board padre', () => {
  const plan = buildPlan([
    A('https://a.example/1', 'A', ['Lavoro', 'Progetti']),
    A('https://a.example/2', 'B', ['Lavoro', 'Progetti', 'Archivio']),
    A('https://a.example/3', 'C', ['Lavoro'])
  ], { structure: 'folders' });
  assert.deepEqual(pageNames(plan), ['Lavoro']);
  const names = boardsOf(plan, 'Lavoro').map((b) => `${b.name}:${b.links.length}`).sort();
  assert.deepEqual(names, ['Lavoro:1', 'Progetti:2']);
});

test('folders: link sciolti classificati; senza indizi → Da smistare', () => {
  const plan = buildPlan([
    A('https://github.com/x/y', 'x/y'),
    A('https://zxqv.example/a', 'Home')
  ], { structure: 'folders' });
  assert.deepEqual(pageNames(plan), ['Lavoro', 'Da smistare']);
  assert.equal(boardsOf(plan, 'Da smistare')[0].links[0].url, 'https://zxqv.example/a');
});

test('template: solo pagine con link; la cartella d’origine è una parola in più', () => {
  const plan = buildPlan([
    A('https://github.com/x', 'x', ['Cose']),
    A('https://sconosciuto.example/q', 'Home', ['Viaggi 2024'])
  ], { structure: 'template' });
  assert.deepEqual(pageNames(plan), ['Lavoro', 'Viaggi']);
});

test('inbox: unica pagina Da smistare', () => {
  const plan = buildPlan([A('https://github.com/x', 'x', ['Lavoro'])], { structure: 'inbox' });
  assert.deepEqual(pageNames(plan), ['Da smistare']);
});

test('doppioni e indirizzi non validi scartati e contati', () => {
  const plan = buildPlan([
    A('https://www.example.com/p/', 'uno', ['X']),
    A('https://example.com/p?utm_source=n', 'due', ['X']),
    A('javascript:alert(1)', 'js', ['X']),
    A('chrome://settings', 'c', ['X']),
    A('https://altro.example/', 'tre', ['X'])
  ], { structure: 'folders' });
  assert.equal(total(plan), 2);
  assert.equal(plan.dropped, 3);
});

test('board lunghe divise da 25', () => {
  const many = (n) => Array.from({ length: n }, (_, i) => A(`https://s.example/${i}`, `L${i}`, ['Grande']));
  const plan60 = buildPlan(many(60), { structure: 'folders' });
  const b = boardsOf(plan60, 'Grande');
  assert.deepEqual(b.map((x) => x.name), ['Grande (1)', 'Grande (2)', 'Grande (3)']);
  assert.ok(b.every((x) => x.links.length <= 25));
  assert.equal(total(plan60), 60);
  const plan25 = buildPlan(many(25), { structure: 'folders' });
  assert.deepEqual(boardsOf(plan25, 'Grande').map((x) => x.name), ['Grande']);
  assert.equal(splitLong({ name: 'N', links: [] }).length, 1);
});

test('nomi vuoti, lunghi e duplicati dopo il taglio', () => {
  const long = 'x'.repeat(70);
  const plan = buildPlan([
    A('https://a.example/1', 'a', ['', '']),
    A('https://a.example/2', 'b', [long + 'A']),
    A('https://a.example/3', 'c', [long + 'B'])
  ], { structure: 'folders' });
  assert.ok(pageNames(plan).includes('Senza nome'));
  const lp = plan.pages.find((p) => p.name.startsWith('xxx'));
  assert.equal(lp.name.length, 40);
  assert.equal(plan.pages.filter((p) => p.name.startsWith('xxx')).length, 1);
  assert.equal(total(plan), 3);
});

test('titolo vuoto → host; titolo lunghissimo tagliato a 200', () => {
  const plan = buildPlan([A('https://www.example.org/x', '   ', ['P']), A('https://e.example/y', 'T'.repeat(500), ['P'])], { structure: 'folders' });
  const links = plan.pages[0].boards[0].links;
  assert.equal(links[0].title, 'example.org');
  assert.equal(links[1].title.length, 200);
});

test('nessun link valido → piano vuoto', () => {
  const plan = buildPlan([A('javascript:1', 'x')], { structure: 'folders' });
  assert.equal(plan.pages.length, 0);
  assert.equal(plan.dropped, 1);
});

test('regole apprese usate dal piano', () => {
  const plan = buildPlan([A('https://zxqv.example/a', 'Home')], {
    structure: 'template', rules: [{ host: 'zxqv.example', page: 'Svago', board: 'Giochi' }]
  });
  assert.deepEqual(pageNames(plan), ['Svago']);
});

test('learn: una regola per host, vince l’ultima', () => {
  let r = learn([], { url: 'https://www.sito.it/a' }, { page: 'Svago', board: 'Video' });
  r = learn(r, { url: 'https://sito.it/b' }, { page: 'Casa', board: 'Cucina' });
  assert.deepEqual(r, [{ host: 'sito.it', page: 'Casa', board: 'Cucina' }]);
});
