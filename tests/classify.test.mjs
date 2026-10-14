import test from 'node:test';
import assert from 'node:assert/strict';
import { classify, CATEGORIES, THRESHOLD, DOMAIN_TABLE } from '../classify.js';

const c = (url, title = '', rules = []) => classify({ url, title, path: [] }, rules);

test('dominio noto: github → Lavoro', () => {
  const r = c('https://github.com/foo/bar', 'foo/bar');
  assert.equal(r.page, 'Lavoro');
  assert.ok(r.score >= 0.7);
  assert.match(r.why, /dominio/);
});

test('viaggi', () => {
  assert.equal(c('https://www.booking.com/hotel/it/x').page, 'Viaggi');
  assert.equal(c('https://skyscanner.it/').page, 'Viaggi');
});

test('svago: youtube', () => {
  assert.equal(c('https://youtube.com/watch?v=1').page, 'Svago');
});

test('solo parole: mutuo → Finanza', () => {
  const r = c('https://bancaesempio.it/', 'Conto corrente e mutuo');
  assert.equal(r.page, 'Finanza');
  assert.ok(r.score >= THRESHOLD);
});

test('solo parole: ricetta → Casa / Cucina', () => {
  const r = c('https://sconosciuto.example/x', 'Ricetta tiramisù facile');
  assert.equal(r.page, 'Casa');
  assert.equal(r.board, 'Cucina');
});

test('la regola appresa batte il dominio', () => {
  const r = c('https://github.com/x', 'x', [{ host: 'github.com', page: 'Svago', board: 'Giochi' }]);
  assert.equal(r.page, 'Svago');
  assert.equal(r.board, 'Giochi');
  assert.ok(r.score >= 0.95);
  assert.match(r.why, /appreso/);
});

test('www e sottodomini equivalgono', () => {
  assert.equal(c('https://m.youtube.com/x').page, 'Svago');
  assert.equal(c('https://www.youtube.com/x').page, 'Svago');
});

test('nessun indizio → Da smistare, punteggio 0', () => {
  const r = c('https://zxqv.example/a', 'Home');
  assert.deepEqual([r.page, r.board, r.score], ['Da smistare', 'Da smistare', 0]);
});

test('non lancia con titolo vuoto o URL non valido; board sempre valida', () => {
  for (const [u, t] of [['https://github.com', ''], ['non un url', ''], ['', undefined]]) {
    const r = classify({ url: u, title: t });
    assert.ok(r.board && r.board.length <= 60);
  }
});

test('tabella domini coerente', () => {
  const keys = Object.keys(DOMAIN_TABLE);
  assert.ok(keys.length >= 250, `solo ${keys.length} domini`);
  for (const [host, [page, board]] of Object.entries(DOMAIN_TABLE)) {
    assert.ok(CATEGORIES.includes(page), `${host} → ${page}`);
    assert.ok(board && board.length <= 60, host);
    assert.equal(host, host.toLowerCase());
    assert.ok(!host.startsWith('www.'), host);
  }
});
