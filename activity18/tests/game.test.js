import test from 'node:test';
import assert from 'node:assert/strict';
import {
  createGame, currentMode, currentTeamIndex, eligiblePrompts, finishRound,
  nextTurn, pause, record, remaining, restoreGame, reveal, roundNumber,
  roundPoints, start, undo, winners,
} from '../game.js';
import { PROMPTS } from '../prompts.js';

const config = {
  teams: ['Éjjeli baglyok', 'Hajnali hősök'], duration: 60, rounds: 3,
  level: 'spicy', modes: ['describe', 'mime', 'draw'],
};
const game = (changes = {}, prompts = PROMPTS) => createGame({ ...config, ...changes }, prompts, () => 0.5);
function playing(changes = {}, prompts = PROMPTS) {
  const g = game(changes, prompts);
  reveal(g);
  start(g, 1000);
  return g;
}

test('prompt packs have unique cards and the selected intensity includes milder packs', () => {
  assert.equal(PROMPTS.length, 180);
  assert.equal(new Set(PROMPTS.map(p => p.id)).size, 180);
  assert.equal(new Set(PROMPTS.map(p => p.text)).size, 180);
  assert.equal(eligiblePrompts(PROMPTS, 'warm').length, 60);
  assert.equal(eligiblePrompts(PROMPTS, 'spicy').length, 120);
  assert.equal(eligiblePrompts(PROMPTS, 'bold').length, 180);
  assert.ok(game({ level: 'warm' }).deck.every(p => p.level === 'warm'));
});

test('rejects duplicate, blank, and unsupported team or timing settings', () => {
  assert.throws(() => game({ teams: [' Baglyok ', 'baglyok'] }));
  assert.throws(() => game({ teams: ['Egy', ' '] }));
  assert.throws(() => game({ teams: ['Egy'] }));
  assert.throws(() => game({ teams: Array.from({ length: 7 }, (_, i) => `Csapat ${i}`) }));
  assert.throws(() => game({ duration: 1 }));
  assert.throws(() => game({ modes: [] }));
});

test('handoff hides the card and revealing it does not start the clock', () => {
  const g = game();
  assert.equal(g.current, null);
  assert.equal(start(g, 1000), false);
  assert.equal(reveal(g), true);
  assert.equal(g.phase, 'ready');
  assert.equal(g.deadline, null);
  assert.equal(remaining(g, 9999999), 60000);
  assert.equal(record(g, 'correct', 1000), false);
});

test('correct answers score one point and passing never penalizes a team', () => {
  const g = playing();
  const first = g.current.id;
  assert.equal(record(g, 'correct', 2000), true);
  assert.notEqual(g.current.id, first);
  assert.equal(record(g, 'pass', 3000), true);
  assert.equal(roundPoints(g), 1);
  assert.equal(g.teams[0].score, 0);
  finishRound(g);
  assert.equal(g.teams[0].score, 1);
  assert.equal(g.teams[1].score, 0);
});

test('answers at or after the exact deadline are rejected and the round is finalized', () => {
  for (const timestamp of [61000, 999999]) {
    const g = playing();
    record(g, 'correct', 3000);
    assert.equal(record(g, 'correct', timestamp), false);
    assert.equal(g.phase, 'summary');
    assert.equal(g.teams[0].score, 1);
    assert.equal(g.entries.length, 1);
  }
});

test('round finalization is idempotent and cannot double-award points', () => {
  const g = playing();
  record(g, 'correct', 2000);
  assert.equal(finishRound(g), true);
  assert.equal(finishRound(g), false);
  assert.equal(record(g, 'correct', 4000), false);
  assert.equal(g.history.length, 1);
  assert.equal(g.teams[0].score, 1);
});

test('the clock uses elapsed time and a pause freezes only the remaining duration', () => {
  const g = playing();
  assert.equal(remaining(g, 36000), 25000);
  assert.equal(pause(g, 36000), true);
  assert.equal(remaining(g, 999999), 25000);
  assert.equal(record(g, 'correct', 37000), false);
  assert.equal(start(g, 100000), true);
  assert.equal(g.deadline, 125000);
  assert.equal(remaining(g, 110000), 15000);
});

test('undo restores the previous card, removes its point, and preserves the next card', () => {
  const g = playing();
  const first = g.current.id;
  record(g, 'correct', 2000);
  const second = g.current.id;
  assert.equal(undo(g), true);
  assert.equal(g.current.id, first);
  assert.equal(roundPoints(g), 0);
  record(g, 'pass', 3000);
  assert.equal(g.current.id, second);
  assert.equal(roundPoints(g), 0);
  assert.equal(undo(g), true);
  assert.equal(undo(g), false);
});

test('a depleted deck recycles without immediately repeating the last card', () => {
  const tinyDeck = [
    { id: 'one', text: 'Első', level: 'warm' },
    { id: 'two', text: 'Második', level: 'warm' },
  ];
  const g = playing({}, tinyDeck);
  for (let i = 0; i < 12; i++) {
    const previous = g.current.id;
    record(g, 'pass', 2000 + i);
    assert.notEqual(g.current.id, previous);
  }
});

test('each team receives the same number of rounds and the same modes before the game ends', () => {
  const g = game({ teams: ['Egy', 'Kettő', 'Három'] });
  const observed = [];
  while (g.phase !== 'finished') {
    observed.push([currentTeamIndex(g), roundNumber(g), currentMode(g)]);
    reveal(g);
    start(g, 1000);
    record(g, 'correct', 2000);
    finishRound(g);
    nextTurn(g);
  }
  assert.equal(observed.length, 9);
  for (let team = 0; team < 3; team++) {
    assert.deepEqual(observed.filter(turn => turn[0] === team).map(turn => turn.slice(1)), [
      [1, 'describe'], [2, 'mime'], [3, 'draw'],
    ]);
  }
  assert.deepEqual(g.teams.map(t => t.score), [3, 3, 3]);
  assert.equal(g.history.length, 9);
  assert.equal(nextTurn(g), false);
  assert.equal(reveal(g), false);
});

test('a tie recognizes every tied winner, and an outright lead recognizes one', () => {
  const g = game({ teams: ['Egy', 'Kettő', 'Három'] });
  g.teams[0].score = 5;
  g.teams[1].score = 5;
  g.teams[2].score = 2;
  assert.deepEqual(winners(g).map(t => t.name), ['Egy', 'Kettő']);
  g.teams[1].score = 6;
  assert.deepEqual(winners(g).map(t => t.name), ['Kettő']);
});

test('restoring a running game pauses it with its true remaining time', t => {
  t.mock.method(Date, 'now', () => 31000);
  const g = playing();
  record(g, 'correct', 2000);
  const restored = restoreGame(JSON.stringify(g));
  assert.equal(restored.phase, 'paused');
  assert.equal(restored.deadline, null);
  assert.equal(restored.remainingMs, 30000);
  assert.equal(roundPoints(restored), 1);
  assert.equal(restored.current.id, g.current.id);
});

test('restoring an expired game settles its score exactly once', t => {
  t.mock.method(Date, 'now', () => 62000);
  const g = playing();
  record(g, 'correct', 2000);
  const restored = restoreGame(JSON.stringify(g));
  assert.equal(restored.phase, 'summary');
  assert.equal(restored.teams[0].score, 1);
  assert.equal(finishRound(restored), false);
  assert.equal(restoreGame(JSON.stringify(restored)).teams[0].score, 1);
});

test('malformed storage and invalid state fields are rejected safely', () => {
  for (const raw of ['not json', 'null', '{}', '[]']) assert.equal(restoreGame(raw), null);
  const mutations = [
    g => { g.phase = 'unknown'; },
    g => { g.teams[0].score = -1; },
    g => { g.cursor = 999999; },
    g => { g.config.modes = ['not-a-mode']; },
    g => { g.deck = []; },
    g => { g.entries = [null]; },
    g => { g.remainingMs = -1; },
  ];
  for (const mutate of mutations) {
    const g = game();
    mutate(g);
    assert.ok(restoreGame(JSON.stringify(g)) === null, mutate.toString());
  }
});
