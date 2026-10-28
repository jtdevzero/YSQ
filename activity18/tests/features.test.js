import test from 'node:test';
import assert from 'node:assert/strict';
import {
  awardOpen, beginOpenAward, cancelOpenAward, createGame, currentChallenge,
  currentMode, currentPresenter, eligiblePrompts, finishRound, isOpenRound,
  nextTurn, pause, record, remaining, restoreGame, reveal, roundAwards,
  roundPoints, start, supportsMode, undo, winners,
} from '../game.js';
import { getDifficulty } from '../difficulty.js';
import { parseCustomPack } from '../custom-pack.js';
import { PROMPTS } from '../prompts.js';

const settings = {
  teams: ['Éjjeli baglyok', 'Hajnali hősök'], players: [['Anna', 'Bence'], ['Dóri', 'Máté']],
  duration: 60, rounds: 3, level: 'bold', pack: 'spicy',
  modes: ['describe', 'mime', 'draw'], openRounds: 'off',
};
const make = (changes = {}, prompts = PROMPTS) => createGame({ ...settings, ...changes }, prompts, () => 0.5);
function playing(changes = {}, prompts = PROMPTS, now = Date.now()) {
  const game = make(changes, prompts);
  assert.equal(reveal(game), true);
  assert.equal(start(game, now), true);
  return game;
}
const saved = game => restoreGame(JSON.stringify(game));
const card = (id, changes = {}) => ({
  id: `custom-${id}`, text: `Titkos feladvány ${id}`, level: 'custom',
  themes: ['custom'], modes: ['describe', 'mime', 'draw'], difficulty: 'medium', ...changes,
});
const customCards = Array.from({ length: 7 }, (_, index) => card(index + 1));
const parts = game => game.current.parts.map(prompt => prompt.id);
const pairKey = game => [...parts(game)].sort().join('|');

test('difficulty filtering intersects the selected adult pack and themes independently', () => {
  for (const pack of ['mixed', 'spicy', 'intimate', 'creative']) {
    const all = eligiblePrompts(PROMPTS, 'bold', pack);
    const buckets = ['easy', 'medium', 'hard'].map(difficulty => {
      const selected = eligiblePrompts(PROMPTS, 'bold', pack, null, difficulty);
      assert.ok(selected.length > 0, `${pack} has ${difficulty} cards`);
      assert.ok(selected.every(prompt => getDifficulty(prompt) === difficulty));
      const game = make({ pack, difficulty, modes: ['describe'] });
      assert.equal(game.config.difficulty, difficulty);
      assert.deepEqual(game.pool.map(prompt => prompt.id).sort(), selected.map(prompt => prompt.id).sort());
      return selected;
    });
    assert.equal(buckets.flat().length, all.length);
    assert.equal(new Set(buckets.flat().map(prompt => prompt.id)).size, all.length);
  }
  const candidates = [
    card(1, { level: 'warm', themes: ['party'], difficulty: 'hard' }),
    card(2, { level: 'bold', themes: ['party'], difficulty: 'easy' }),
    card(3, { level: 'bold', themes: ['dating'], difficulty: 'easy' }),
  ];
  assert.deepEqual(eligiblePrompts(candidates, 'bold', 'mixed', ['party'], 'easy').map(prompt => prompt.id), ['custom-2']);
  assert.deepEqual(eligiblePrompts(candidates, 'warm', 'mixed', ['party'], 'hard').map(prompt => prompt.id), ['custom-1']);
});

test('new feature settings reject invalid values and default to classic single-card play', () => {
  const game = make();
  assert.equal(game.config.difficulty, 'all');
  assert.equal(game.config.chaos, false);
  assert.equal(game.config.doubleCards, false);
  for (const changes of [{ difficulty: 'impossible' }, { chaos: 'true' }, { doubleCards: 1 }]) {
    assert.throws(() => make(changes));
    const tampered = make();
    Object.assign(tampered.config, changes);
    assert.equal(saved(tampered), null);
  }
});

test('custom cards stay inside the custom pack and honor difficulty and mode availability', () => {
  const custom = parseCustomPack('Titkos áramszünet | könnyű\nKínos esküvő | nehéz\nLebegő pizzafutár | könnyű', {
    modes: ['mime', 'draw'], difficulty: 'medium',
  });
  const prompts = [...PROMPTS, ...custom];
  const game = playing({ pack: 'custom', difficulty: 'easy', modes: ['reverse', 'draw'] }, prompts);
  assert.equal(game.pool.length, 2);
  assert.ok(game.pool.every(prompt => prompt.level === 'custom' && getDifficulty(prompt) === 'easy'));
  assert.equal(supportsMode(game.current, 'reverse'), true);
  assert.ok(eligiblePrompts(prompts, 'bold', 'spicy').every(prompt => prompt.level !== 'custom'));
  assert.throws(() => make({ pack: 'custom', modes: ['describe'] }, prompts));
  assert.ok(saved(game), 'custom game can be restored without the original editor input');
});

test('reverse Activity deals mime-compatible cards, keeps one guesser and awards only their team', () => {
  const now = Date.now();
  const game = playing({ modes: ['reverse'], openRounds: 'all' }, PROMPTS, now);
  assert.equal(currentMode(game), 'reverse');
  assert.ok(game.current.modes.includes('mime'));
  assert.equal(currentPresenter(game), 'Anna');
  assert.equal(isOpenRound(game), false);
  assert.equal(beginOpenAward(game, now + 1000), false);
  assert.equal(record(game, 'correct', now + 1000, 1), true);
  assert.equal(game.entries[0].awardTeam, 0);
  finishRound(game);
  assert.deepEqual(game.teams.map(team => team.score), [1, 0]);
  nextTurn(game);
  assert.equal(currentPresenter(game), 'Dóri');
});

test('a reverse card temporarily closes an open round and undo restores that card policy', () => {
  const now = Date.now();
  const game = playing({ modes: ['reverse', 'describe'], openRounds: 'all' }, PROMPTS, now);
  record(game, 'correct', now + 1000);
  assert.equal(currentMode(game), 'describe');
  assert.equal(isOpenRound(game), true);
  assert.equal(record(game, 'correct', now + 2000), false, 'ordinary open card needs a winning team');
  assert.equal(beginOpenAward(game, now + 2000), true);
  assert.equal(awardOpen(game, 1, now + 3000), true);
  assert.equal(currentMode(game), 'reverse');
  assert.equal(isOpenRound(game), false);
  assert.equal(undo(game), true);
  assert.equal(currentMode(game), 'describe');
  assert.equal(isOpenRound(game), true);
  assert.deepEqual(roundAwards(game), [1, 0]);
});

test('chaos instructions remain stable through rerenders, pause, undo and save restoration', () => {
  const now = Date.now();
  const game = playing({ modes: ['describe', 'mime', 'draw', 'reverse'], chaos: true }, PROMPTS, now);
  const instruction = currentChallenge(game);
  assert.equal(typeof instruction, 'string');
  assert.ok(instruction.trim().length > 5);
  assert.equal(currentChallenge(game), instruction);
  assert.equal(pause(game, now + 500), true);
  assert.equal(currentChallenge(game), instruction);
  const restored = saved(game);
  assert.ok(restored);
  assert.equal(currentChallenge(restored), instruction);
  start(game, now + 1000);
  const deadline = game.deadline;
  record(game, 'pass', now + 1500);
  assert.equal(currentMode(game), 'mime');
  assert.notEqual(currentChallenge(game), instruction);
  assert.equal(undo(game), true);
  assert.equal(currentChallenge(game), instruction);
  assert.equal(game.deadline, deadline);
  for (let index = 0; index < 4; index++) {
    assert.ok(currentChallenge(game).length > 5, `${currentMode(game)} has a challenge`);
    record(game, 'pass', now + 2000 + index);
  }
  assert.equal(currentChallenge(make()), '');
});

test('double cards require two distinct compatible cards for every selected mode', () => {
  assert.throws(() => make({ pack: 'custom', doubleCards: true, modes: ['describe'] }, [card(1)]));
  const restricted = [card(1), card(2, { modes: ['describe'] })];
  assert.throws(() => make({ pack: 'custom', doubleCards: true, modes: ['describe', 'mime'] }, restricted));
  const game = playing({ pack: 'custom', doubleCards: true, modes: ['describe'] }, restricted);
  assert.equal(game.current.parts.length, 2);
  assert.equal(new Set(parts(game)).size, 2);
});

test('double cards stay compatible through repeated mode changes and multiple deck refills', () => {
  const now = Date.now();
  const game = playing({ doubleCards: true, modes: ['describe', 'mime', 'draw', 'reverse'], difficulty: 'medium' }, PROMPTS, now);
  const selectedIds = new Set(game.pool.map(prompt => prompt.id));
  for (let index = 0; index < 1200; index++) {
    assert.equal(game.current.parts.length, 2);
    assert.equal(new Set(parts(game)).size, 2, 'one pair cannot contain the same card twice');
    assert.ok(game.current.parts.every(prompt => selectedIds.has(prompt.id) && getDifficulty(prompt) === 'medium' && supportsMode(prompt, currentMode(game))));
    assert.equal(record(game, 'pass', now + index), true);
  }
  assert.equal(roundPoints(game), 0);
});

test('a small custom double deck can recycle without duplicate parts or consecutive identical pairs', () => {
  const now = Date.now();
  const game = playing({ pack: 'custom', doubleCards: true, modes: ['describe'] }, customCards.slice(0, 3), now);
  let previous;
  for (let index = 0; index < 150; index++) {
    const current = pairKey(game);
    assert.equal(new Set(parts(game)).size, 2);
    assert.notEqual(current, previous, 'a three-card pool has another possible pair');
    previous = current;
    record(game, 'pass', now + index);
  }
  const minimal = playing({ pack: 'custom', doubleCards: true, modes: ['describe'] }, customCards.slice(0, 2), now);
  for (let index = 0; index < 20; index++) {
    assert.equal(new Set(parts(minimal)).size, 2);
    assert.equal(record(minimal, 'pass', now + index), true);
  }
});

test('a double answer earns one point, and undo restores both parts and removes its award', () => {
  const now = Date.now();
  const game = playing({ pack: 'custom', doubleCards: true, modes: ['describe'] }, customCards, now);
  const originalParts = parts(game);
  const deadline = game.deadline;
  assert.equal(record(game, 'correct', now + 1000), true);
  assert.equal(roundPoints(game), 1);
  assert.equal(game.entries[0].parts.length, 2);
  assert.equal(undo(game), true);
  assert.deepEqual(parts(game), originalParts);
  assert.equal(roundPoints(game), 0);
  assert.equal(game.deadline, deadline);
  assert.equal(record(game, 'pass', now + 2000), true);
  assert.equal(roundPoints(game), 0);
  finishRound(game);
  assert.deepEqual(game.teams.map(team => team.score), [0, 0]);
});

test('pending open award saves retain the exact double card, difficulty, chaos and frozen clock', () => {
  const now = Date.now();
  const game = playing({ doubleCards: true, chaos: true, difficulty: 'easy', modes: ['describe'], openRounds: 'all' }, PROMPTS, now);
  const originalParts = parts(game);
  const instruction = currentChallenge(game);
  assert.equal(beginOpenAward(game, now + 10000), true);
  const resumed = saved(game);
  assert.ok(resumed);
  assert.equal(resumed.phase, 'award');
  assert.deepEqual(parts(resumed), originalParts);
  assert.equal(resumed.remainingMs, 50000);
  assert.equal(currentChallenge(resumed), instruction);
  assert.equal(cancelOpenAward(resumed, now + 20000), true);
  assert.equal(remaining(resumed, now + 20000), 50000);
  assert.deepEqual(parts(resumed), originalParts);
  assert.equal(beginOpenAward(resumed, now + 21000), true);
  assert.equal(awardOpen(resumed, 1, now + 22000), true);
  assert.equal(awardOpen(resumed, 1, now + 22001), false);
  assert.deepEqual(roundAwards(resumed), [0, 1]);
  assert.equal(undo(resumed), true);
  assert.deepEqual(parts(resumed), originalParts);
  assert.deepEqual(roundAwards(resumed), [0, 0]);
});

test('expired double cards settle accumulated points once and never grant a late answer', () => {
  const now = Date.now();
  const game = playing({ doubleCards: true, modes: ['describe'] }, PROMPTS, now);
  assert.equal(record(game, 'correct', now + 1000), true);
  assert.equal(record(game, 'correct', game.deadline), false);
  assert.equal(game.phase, 'summary');
  assert.equal(game.teams[0].score, 1);
  assert.equal(finishRound(game), false);
  assert.equal(game.teams[0].score, 1);
});

test('all new game variants can complete a fair match together with custom cards and cross-team awards', () => {
  const game = make({
    pack: 'custom', difficulty: 'medium', modes: ['reverse', 'describe', 'draw', 'mime'],
    chaos: true, doubleCards: true, openRounds: 'all',
  }, customCards);
  const expected = [0, 0];
  let turns = 0;
  while (game.phase !== 'finished') {
    const now = Date.now();
    assert.equal(reveal(game), true);
    assert.equal(start(game, now), true);
    for (let index = 0; index < 5; index++) {
      assert.ok(currentChallenge(game));
      assert.equal(new Set(parts(game)).size, 2);
      assert.ok(game.current.parts.every(prompt => supportsMode(prompt, currentMode(game))));
      if (index === 2) {
        assert.equal(record(game, 'pass', now + index + 1), true);
      } else if (isOpenRound(game)) {
        const recipient = (turns + index) % 2;
        assert.equal(beginOpenAward(game, now + index + 1), true);
        assert.equal(awardOpen(game, recipient, now + index + 2), true);
        expected[recipient]++;
      } else {
        assert.equal(record(game, 'correct', now + index + 1), true);
        expected[turns % 2]++;
      }
    }
    assert.equal(finishRound(game), true);
    assert.deepEqual(game.teams.map(team => team.score), expected);
    assert.equal(nextTurn(game), true);
    turns++;
  }
  assert.equal(turns, 6);
  assert.equal(game.history.filter(turn => turn.team === 0).length, 3);
  assert.equal(game.history.filter(turn => turn.team === 1).length, 3);
  assert.equal(expected.reduce((sum, score) => sum + score, 0), 24);
  assert.ok(winners(game).length >= 1);
  assert.ok(saved(game));
});

test('double-card restoration rejects missing, repeated and incompatible parts', () => {
  const now = Date.now();
  const game = playing({ doubleCards: true, modes: ['draw'] }, PROMPTS, now);
  pause(game, now + 1000);
  assert.ok(saved(game));
  const clone = () => JSON.parse(JSON.stringify(game));
  const missing = clone();
  delete missing.current.parts;
  assert.equal(saved(missing), null);
  const duplicate = clone();
  duplicate.current.parts[1] = { ...duplicate.current.parts[0] };
  assert.equal(saved(duplicate), null);
  const incompatible = clone();
  incompatible.current.parts[0].modes = ['describe'];
  assert.equal(saved(incompatible), null);
});

test('old single-card saves restore with all new features disabled and keep their existing card', () => {
  const now = Date.now();
  const game = playing({ modes: ['mime'] }, PROMPTS, now);
  pause(game, now + 5000);
  delete game.config.difficulty;
  delete game.config.chaos;
  delete game.config.doubleCards;
  const resumed = saved(game);
  assert.ok(resumed);
  assert.equal(resumed.config.difficulty, 'all');
  assert.equal(resumed.config.chaos, false);
  assert.equal(resumed.config.doubleCards, false);
  assert.equal(resumed.current.id, game.current.id);
  assert.equal(resumed.remainingMs, 55000);
  assert.equal(currentChallenge(resumed), '');
});
