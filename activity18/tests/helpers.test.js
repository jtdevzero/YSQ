import test from 'node:test';
import assert from 'node:assert/strict';
import { PROMPTS } from '../prompts.js';
import { DIFFICULTIES, BUILTIN_DIFFICULTIES, getDifficulty } from '../difficulty.js';
import { parseCustomPack, customPackText } from '../custom-pack.js';

test('all built-in cards have a curated difficulty independent of adult intensity', () => {
  assert.equal(Object.keys(BUILTIN_DIFFICULTIES).length, PROMPTS.length);
  for (const prompt of PROMPTS) assert.ok(['easy', 'medium', 'hard'].includes(BUILTIN_DIFFICULTIES[prompt.id]), prompt.id);
  for (const level of new Set(PROMPTS.map(prompt => prompt.level))) {
    const ratings = PROMPTS.filter(prompt => prompt.level === level).map(getDifficulty);
    for (const rating of ['easy', 'medium', 'hard']) assert.ok(ratings.includes(rating), `${level}: ${rating}`);
  }
  assert.equal(getDifficulty(PROMPTS.find(prompt => prompt.text === 'Reggeli merevedés')), 'easy');
  assert.equal(getDifficulty(PROMPTS.find(prompt => prompt.text === 'Hintaágyas állásinterjú')), 'hard');
  assert.equal(getDifficulty(PROMPTS.find(prompt => prompt.text === 'Szexuális kompatibilitás')), 'hard');
  assert.equal(getDifficulty({ id: 'old-save-card' }), 'medium');
  assert.equal(getDifficulty({ id: '__proto__' }), 'medium');
  assert.equal(getDifficulty({ id: 'warm-001', difficulty: 'hard' }), 'hard');
  assert.equal(DIFFICULTIES.all, 'Minden nehézség');
});

test('custom pack parses Hungarian difficulty overrides, Unicode and selected modes', () => {
  const cards = parseCustomPack('  Titkos  randi | könnyű\r\n\nRepülő papucs | HARD\nŰrlény a lagziban', { modes: ['mime', 'draw', 'mime'], difficulty: 'medium' });
  assert.deepEqual(cards.map(card => card.text), ['Titkos randi', 'Repülő papucs', 'Űrlény a lagziban']);
  assert.deepEqual(cards.map(card => card.difficulty), ['easy', 'hard', 'medium']);
  assert.deepEqual(cards[0].modes, ['mime', 'draw']);
  assert.deepEqual(cards.map(card => card.id), ['custom-001', 'custom-002', 'custom-003']);
  assert.ok(cards.every(card => card.level === 'custom' && card.themes[0] === 'custom'));
  cards[0].modes.push('describe');
  assert.deepEqual(cards[1].modes, ['mime', 'draw']);
  assert.deepEqual(parseCustomPack(customPackText(cards), { modes: ['mime', 'draw'] }).map(card => [card.text, card.difficulty]), cards.map(card => [card.text, card.difficulty]));
});

test('custom pack rejects malformed or excessive input with line-specific errors', () => {
  assert.deepEqual(parseCustomPack(' \n\n '), []);
  for (const text of ['Egyetlen', 'egy kettő három négy öt hat hét nyolc kilenc', `${'a'.repeat(90)} b`]) assert.throws(() => parseCustomPack(text), /1\. sor/);
  assert.throws(() => parseCustomPack('Titkos randi\nTITKOS  RANDI'), /2\. sor.*már szerepel/);
  assert.throws(() => parseCustomPack('Titkos randi\nRepu\u0308lo\u030b papucs\nRepülő papucs'), /3\. sor.*már szerepel/);
  assert.throws(() => parseCustomPack('Titkos randi | brutál'), /nehézség/);
  assert.throws(() => parseCustomPack('Titkos randi | constructor'), /nehézség/);
  assert.throws(() => parseCustomPack('Titkos randi | könnyű | más'), /legfeljebb egy/);
  assert.throws(() => parseCustomPack(Array.from({ length: 201 }, (_, index) => `Titkos randi${index}`).join('\n')), /200/);
  assert.equal(parseCustomPack(Array.from({ length: 200 }, (_, index) => `Titkos randi${index}`).join('\n')).length, 200);
  assert.throws(() => parseCustomPack('a'.repeat(25001)), /25 000/);
  assert.throws(() => parseCustomPack('Titkos randi', { modes: [] }), /feladattípust/);
  assert.throws(() => parseCustomPack('Titkos randi', { modes: ['reverse'] }), /feladattípust/);
  assert.throws(() => parseCustomPack('Titkos randi', { difficulty: 'all' }), /nehézséget/);
  assert.throws(() => parseCustomPack(null), /szövegként/);
});
