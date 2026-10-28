import test from 'node:test';
import assert from 'node:assert/strict';
import {
  awardOpen, beginOpenAward, cancelOpenAward, createGame, currentMode,
  currentPresenter, currentTeamIndex, eligiblePrompts, finishRound, isOpenRound,
  nextTurn, pause, record, remaining, restoreGame, reveal, roundNumber,
  roundPoints, start, supportsMode, THEMES, undo, winners,
} from '../game.js';
import { PROMPTS } from '../prompts.js';

const config = {
  teams: ['Éjjeli baglyok', 'Hajnali hősök'], duration: 60, rounds: 3,
  level: 'spicy', modes: ['describe', 'mime', 'draw'], openRounds: 'off',
};
const game = (changes = {}, prompts = PROMPTS) => createGame({ ...config, ...changes }, prompts, () => 0.5);
function playing(changes = {}, prompts = PROMPTS) {
  const g = game(changes, prompts);
  reveal(g);
  start(g, 1000);
  return g;
}

test('prompt packs have unique cards and mixed intensity includes milder packs without intimate cards', () => {
  assert.equal(PROMPTS.length, 840);
  assert.equal(new Set(PROMPTS.map(p => p.id)).size, 840);
  assert.equal(new Set(PROMPTS.map(p => p.text)).size, 840);
  assert.equal(eligiblePrompts(PROMPTS, 'warm').length, 60);
  assert.equal(eligiblePrompts(PROMPTS, 'spicy').length, 240);
  assert.equal(eligiblePrompts(PROMPTS, 'bold').length, 420);
  assert.ok(eligiblePrompts(PROMPTS, 'bold', 'mixed').every(p => ['warm', 'spicy', 'bold'].includes(p.level)));
  assert.ok(game({ level: 'warm' }).deck.every(p => p.level === 'warm'));
});

test('dedicated spicy, intimate, and creative packs contain only their cards regardless of mixed intensity', () => {
  for (const level of ['warm', 'spicy', 'bold']) {
    const spicy = eligiblePrompts(PROMPTS, level, 'spicy');
    assert.equal(spicy.length, 360);
    assert.ok(spicy.every(p => ['spicy', 'bold'].includes(p.level)));
    const intimate = eligiblePrompts(PROMPTS, level, 'intimate');
    assert.equal(intimate.length, 300);
    assert.ok(intimate.every(p => p.level === 'intimate'));
    const spicyIds = new Set(spicy.map(p => p.id));
    assert.ok(intimate.every(p => !spicyIds.has(p.id)));
    const creative = eligiblePrompts(PROMPTS, level, 'creative');
    assert.equal(creative.length, 120);
    assert.ok(creative.every(p => p.level === 'creative'));
    assert.ok(creative.every(p => !spicyIds.has(p.id)));
  }
});

test('new games preserve the requested pack and shuffle only that pack into their deck', () => {
  for (const pack of ['mixed', 'spicy', 'intimate', 'creative']) {
    const g = game({ pack, level: 'warm' });
    assert.equal(g.config.pack, pack);
    const eligibleIds = eligiblePrompts(PROMPTS, 'warm', pack).map(p => p.id).sort();
    assert.deepEqual(g.deck.map(p => p.id).sort(), eligibleIds);
  }
  const legacy = game();
  assert.equal(legacy.config.pack, 'mixed');
  assert.equal(legacy.deck.length, 240);
});

test('unknown packs are rejected during creation and saved-game restoration', () => {
  assert.throws(() => game({ pack: 'unknown' }));
  const g = game();
  g.config.pack = 'unknown';
  assert.equal(restoreGame(JSON.stringify(g)), null);
});

test('restoration supports intimate current cards and defaults legacy saves to the mixed pack', () => {
  const intimate = game({ pack: 'intimate', level: 'warm' });
  reveal(intimate);
  const restoredIntimate = restoreGame(JSON.stringify(intimate));
  assert.ok(restoredIntimate);
  assert.equal(restoredIntimate.config.pack, 'intimate');
  assert.equal(restoredIntimate.current.level, 'intimate');
  assert.equal(restoredIntimate.current.id, intimate.current.id);
  assert.deepEqual(restoredIntimate.deck, intimate.deck);

  const legacy = game();
  delete legacy.config.pack;
  delete legacy.config.matchModes;
  delete legacy.config.themes;
  delete legacy.pool;
  const restoredLegacy = restoreGame(JSON.stringify(legacy));
  assert.ok(restoredLegacy);
  assert.equal(restoredLegacy.config.pack, 'mixed');
  assert.deepEqual(restoredLegacy.deck, legacy.deck);
});

test('new games rotate modes after both correct answers and passes, and undo restores the previous mode', () => {
  const g = playing();
  assert.equal(g.config.modeRotation, 'cards');
  assert.equal(currentMode(g), 'describe');
  record(g, 'correct', 2000);
  assert.equal(g.entries[0].mode, 'describe');
  assert.equal(currentMode(g), 'mime');
  const mimeCard = g.current.id;
  record(g, 'pass', 3000);
  assert.equal(g.entries[1].mode, 'mime');
  assert.equal(currentMode(g), 'draw');
  assert.equal(undo(g), true);
  assert.equal(g.current.id, mimeCard);
  assert.equal(currentMode(g), 'mime');
  record(g, 'correct', 4000);
  assert.equal(currentMode(g), 'draw');
  record(g, 'pass', 5000);
  assert.equal(currentMode(g), 'describe');
});

test('card rotation uses only the selected modes, including a one-mode game', () => {
  const twoModes = playing({ modes: ['mime', 'draw'] });
  const observed = [];
  for (let i = 0; i < 6; i++) {
    observed.push(currentMode(twoModes));
    record(twoModes, i % 2 ? 'correct' : 'pass', 2000 + i);
  }
  assert.deepEqual(observed, ['mime', 'draw', 'mime', 'draw', 'mime', 'draw']);
  assert.ok(twoModes.entries.every(e => ['mime', 'draw'].includes(e.mode)));

  const oneMode = playing({ modes: ['draw'] });
  record(oneMode, 'correct', 2000);
  record(oneMode, 'pass', 3000);
  assert.equal(currentMode(oneMode), 'draw');
  assert.ok(oneMode.entries.every(e => e.mode === 'draw'));
});

test('changing a card mode or undoing an answer never resets the round clock', () => {
  const g = playing();
  const deadline = g.deadline;
  record(g, 'correct', 2000);
  record(g, 'pass', 3000);
  undo(g);
  assert.equal(currentMode(g), 'mime');
  assert.equal(g.deadline, deadline);
  assert.equal(remaining(g, 4000), 57000);
  assert.equal(record(g, 'correct', deadline), false);
  assert.equal(g.phase, 'summary');
  assert.equal(g.teams[0].score, 1);
});

test('explicit round rotation keeps one mode per round and starts every team on the same mode', () => {
  const g = playing({ modeRotation: 'rounds' });
  assert.equal(g.config.modeRotation, 'rounds');
  record(g, 'correct', 2000);
  record(g, 'pass', 3000);
  assert.equal(currentMode(g), 'describe');
  assert.ok(g.entries.every(e => e.mode === 'describe'));
  finishRound(g);
  nextTurn(g);
  assert.equal(currentMode(g), 'describe');
  reveal(g);
  start(g, 1000);
  record(g, 'correct', 2000);
  finishRound(g);
  nextTurn(g);
  assert.equal(roundNumber(g), 2);
  assert.equal(currentMode(g), 'mime');
});

test('saved card rotation resumes its current mode while legacy saves keep round rotation', () => {
  const g = playing();
  record(g, 'correct', 2000);
  pause(g, 3000);
  const restored = restoreGame(JSON.stringify(g));
  assert.ok(restored);
  assert.equal(restored.config.modeRotation, 'cards');
  assert.equal(currentMode(restored), 'mime');
  assert.equal(restored.entries[0].mode, 'describe');
  assert.equal(restored.current.id, g.current.id);

  const legacy = playing({ modeRotation: 'rounds' });
  record(legacy, 'correct', 2000);
  pause(legacy, 3000);
  delete legacy.config.modeRotation;
  delete legacy.config.matchModes;
  delete legacy.config.themes;
  delete legacy.pool;
  for (const entry of legacy.entries) delete entry.mode;
  const restoredLegacy = restoreGame(JSON.stringify(legacy));
  assert.ok(restoredLegacy);
  assert.equal(restoredLegacy.config.modeRotation, 'rounds');
  assert.equal(currentMode(restoredLegacy), 'describe');

  assert.throws(() => game({ modeRotation: 'unknown' }));
  g.config.modeRotation = 'unknown';
  assert.equal(restoreGame(JSON.stringify(g)), null);
});

test('every catalog card has valid themes and suitable modes, including semantic exceptions', () => {
  const themeIds = ['party', 'dating', 'bedroom', 'desire', 'accessories', 'health', 'absurd'];
  assert.deepEqual(Object.keys(THEMES).sort(), [...themeIds, 'custom'].sort());
  for (const prompt of PROMPTS) {
    assert.ok(Array.isArray(prompt.themes) && prompt.themes.length > 0, `Missing themes: ${prompt.id}`);
    assert.ok(prompt.themes.every(theme => themeIds.includes(theme)), `Unknown theme: ${prompt.id}`);
    assert.ok(Array.isArray(prompt.modes) && prompt.modes.length > 0, `Missing modes: ${prompt.id}`);
    assert.ok(prompt.modes.every(mode => ['describe', 'mime', 'draw'].includes(mode)), `Unknown mode: ${prompt.id}`);
    assert.ok(prompt.modes.includes('describe'), `Description unavailable: ${prompt.id}`);
  }
  const abstract = PROMPTS.find(p => p.text === 'Nemi vágy');
  assert.ok(abstract);
  assert.deepEqual(abstract.modes, ['describe']);
  const concrete = PROMPTS.find(p => p.text === 'Óvszeres kulcstartó');
  assert.ok(concrete);
  assert.ok(supportsMode(concrete, 'draw'));
});

test('theme filtering uses OR membership after pack filtering and an empty selection gives no cards', () => {
  const catalog = [
    { id: 'party', text: 'Buli', level: 'warm', themes: ['party'] },
    { id: 'date', text: 'Randi', level: 'spicy', themes: ['dating'] },
    { id: 'both', text: 'Flört', level: 'bold', themes: ['dating', 'desire'] },
    { id: 'health', text: 'Egészség', level: 'intimate', themes: ['health'] },
    { id: 'creative', text: 'Képzelet', level: 'creative', themes: ['party', 'absurd'] },
  ];
  assert.deepEqual(eligiblePrompts(catalog, 'bold', 'mixed', ['party', 'dating']).map(p => p.id), ['party', 'date', 'both']);
  assert.deepEqual(eligiblePrompts(catalog, 'bold', 'mixed', ['dating', 'desire']).map(p => p.id), ['date', 'both']);
  assert.deepEqual(eligiblePrompts(catalog, 'bold', 'creative', ['party']).map(p => p.id), ['creative']);
  assert.deepEqual(eligiblePrompts(catalog, 'bold', 'intimate', ['party']), []);
  assert.deepEqual(eligiblePrompts(catalog, 'bold', 'mixed', []), []);
  assert.equal(eligiblePrompts(catalog, 'bold', 'mixed', null).length, 3);
});

test('game creation preserves the selected themes and refuses empty or unknown selections', () => {
  const g = game({ themes: ['party', 'dating'], modes: ['describe'] });
  assert.deepEqual(g.config.themes, ['party', 'dating']);
  assert.equal(g.config.matchModes, true);
  assert.deepEqual(g.pool.map(p => p.id).sort(), eligiblePrompts(PROMPTS, 'spicy', 'mixed', ['party', 'dating']).map(p => p.id).sort());
  assert.ok(g.deck.every(p => p.themes.some(theme => ['party', 'dating'].includes(theme))));
  assert.equal(game().config.themes, null);
  assert.throws(() => game({ themes: [] }));
  assert.throws(() => game({ themes: ['unknown-theme'] }));
});

test('mode coverage is checked at setup while legacy cards without metadata support every mode', () => {
  const abstractOnly = [
    { id: 'abstract', text: 'Fogalom', level: 'warm', themes: ['desire'], modes: ['describe'] },
  ];
  assert.throws(() => game({ modes: ['describe', 'mime'] }, abstractOnly));
  assert.throws(() => game({ modes: ['draw'] }, abstractOnly));
  assert.doesNotThrow(() => game({ modes: ['describe'] }, abstractOnly));
  assert.doesNotThrow(() => game({ modes: ['mime'], matchModes: false }, abstractOnly));
  const legacyPrompt = { id: 'legacy', text: 'Régi kártya', level: 'warm' };
  for (const mode of ['describe', 'mime', 'draw']) assert.equal(supportsMode(legacyPrompt, mode), true);
  assert.equal(supportsMode(abstractOnly[0], 'describe'), true);
  assert.equal(supportsMode(abstractOnly[0], 'mime'), false);
  assert.equal(supportsMode(abstractOnly[0], 'draw'), false);
});

test('dealt catalog cards remain compatible across mode changes and repeated recycling without changing the pool', () => {
  for (const pack of ['mixed', 'spicy', 'intimate', 'creative']) {
    const g = playing({ pack, level: 'bold' });
    const poolSnapshot = JSON.stringify(g.pool);
    for (let i = 0; i < 500; i++) {
      assert.ok(supportsMode(g.current, currentMode(g)), `${pack}: ${g.current.text} cannot be ${currentMode(g)}`);
      assert.equal(record(g, i % 2 ? 'correct' : 'pass', 2000 + i), true);
    }
    assert.equal(JSON.stringify(g.pool), poolSnapshot);
    assert.ok(g.entries.every(entry => supportsMode(entry, entry.mode)));
  }
});

test('recycling a scarce mode preserves incompatible unconsumed cards for later modes', () => {
  const catalog = [
    { id: 'd1', text: 'Első fogalom', level: 'warm', themes: ['desire'], modes: ['describe'] },
    { id: 'm1', text: 'Mutogatható', level: 'warm', themes: ['party'], modes: ['describe', 'mime'] },
    { id: 'd2', text: 'Második fogalom', level: 'warm', themes: ['desire'], modes: ['describe'] },
    { id: 'd3', text: 'Harmadik fogalom', level: 'warm', themes: ['desire'], modes: ['describe'] },
  ];
  const g = game({ modes: ['describe', 'mime'] }, catalog);
  g.deck = [...catalog];
  const poolSnapshot = JSON.stringify(g.pool);
  reveal(g);
  start(g, 1000);
  const sequence = [g.current.id];
  for (let i = 0; i < 4; i++) {
    record(g, 'pass', 2000 + i);
    sequence.push(g.current.id);
    assert.ok(supportsMode(g.current, currentMode(g)));
  }
  assert.deepEqual(sequence, ['d1', 'm1', 'd2', 'm1', 'd3']);
  assert.equal(JSON.stringify(g.pool), poolSnapshot);
});

test('a one-mode queue skips incompatible cards without dropping them or repeating when alternatives exist', () => {
  const catalog = [
    { id: 'a', text: 'Első mozdulat', level: 'warm', themes: ['party'], modes: ['describe', 'mime'] },
    { id: 'd', text: 'Csak beszéd', level: 'warm', themes: ['desire'], modes: ['describe'] },
    { id: 'b', text: 'Második mozdulat', level: 'warm', themes: ['party'], modes: ['describe', 'mime'] },
  ];
  const g = game({ modes: ['mime'] }, catalog);
  g.deck = [...catalog];
  reveal(g);
  start(g, 1000);
  for (let i = 0; i < 20; i++) {
    const previous = g.current.id;
    assert.notEqual(previous, 'd');
    record(g, 'pass', 2000 + i);
    assert.notEqual(g.current.id, previous);
    assert.ok(g.deck.slice(g.cursor).some(p => p.id === 'd'));
  }
  assert.equal(g.pool.length, 3);
});

test('undo across mode-aware recycling restores the card, mode, score, and deadline', () => {
  const catalog = ['a', 'b'].map(id => ({ id, text: id, level: 'warm', themes: ['party'], modes: ['describe', 'mime', 'draw'] }));
  const g = game({}, catalog);
  g.deck = [...catalog];
  reveal(g);
  start(g, 1000);
  const deadline = g.deadline;
  record(g, 'correct', 2000);
  record(g, 'pass', 3000);
  assert.equal(g.current.id, 'a');
  assert.equal(currentMode(g), 'draw');
  undo(g);
  assert.equal(g.current.id, 'b');
  assert.equal(currentMode(g), 'mime');
  assert.equal(roundPoints(g), 1);
  assert.equal(g.deadline, deadline);
  record(g, 'correct', 4000);
  assert.equal(g.current.id, 'a');
  assert.equal(currentMode(g), 'draw');
  assert.ok(supportsMode(g.current, currentMode(g)));
});

test('matched saves preserve their filtered pool and reject incompatible cards while old saves remain usable', () => {
  const g = playing({ pack: 'intimate', themes: ['desire', 'accessories'] });
  record(g, 'correct', 2000);
  pause(g, 3000);
  const restored = restoreGame(JSON.stringify(g));
  assert.ok(restored);
  assert.equal(restored.config.matchModes, true);
  assert.deepEqual(restored.config.themes, ['desire', 'accessories']);
  assert.deepEqual(restored.pool, g.pool);
  assert.ok(supportsMode(restored.current, currentMode(restored)));

  const incompatible = structuredClone(g);
  incompatible.current = { ...incompatible.current, modes: ['describe'] };
  assert.equal(restoreGame(JSON.stringify(incompatible)), null);
  const missingPool = structuredClone(g);
  delete missingPool.pool;
  assert.equal(restoreGame(JSON.stringify(missingPool)), null);

  const legacy = playing({ modeRotation: 'rounds' });
  pause(legacy, 3000);
  delete legacy.config.matchModes;
  delete legacy.config.themes;
  delete legacy.pool;
  const old = restoreGame(JSON.stringify(legacy));
  assert.ok(old);
  assert.equal(old.config.matchModes, false);
  assert.equal(old.config.themes, null);
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

test('open rounds default to the final round and can be disabled or enabled for every round', () => {
  const defaultConfig = { ...config };
  delete defaultConfig.openRounds;
  const g = createGame(defaultConfig, PROMPTS, () => 0.5);
  assert.equal(g.config.openRounds, 'final');
  assert.equal(isOpenRound(g), false);
  g.turn = 3;
  assert.equal(isOpenRound(g), false);
  g.turn = 4;
  assert.equal(isOpenRound(g), true);
  g.turn = 5;
  assert.equal(isOpenRound(g), true);
  assert.equal(isOpenRound(game({ openRounds: 'all' })), true);
  const closed = game({ openRounds: 'off' });
  closed.turn = 4;
  assert.equal(isOpenRound(closed), false);
  assert.throws(() => game({ openRounds: 'unknown' }));
  g.config.openRounds = 'unknown';
  assert.equal(restoreGame(JSON.stringify(g)), null);
});

test('the open-round winner chooser freezes time, rejects invalid winners, and awards a card only once', () => {
  const g = playing({ openRounds: 'all' });
  const card = g.current.id;
  assert.equal(beginOpenAward(g, 11000), true);
  assert.equal(g.phase, 'award');
  assert.equal(g.deadline, null);
  assert.equal(remaining(g, 999000), 50000);
  assert.equal(beginOpenAward(g, 12000), false);
  for (const winner of [-1, g.teams.length, 0.5, '1', undefined]) {
    assert.equal(awardOpen(g, winner, 999000), false);
    assert.equal(g.phase, 'award');
    assert.equal(g.current.id, card);
    assert.equal(g.entries.length, 0);
    assert.equal(g.remainingMs, 50000);
  }
  assert.equal(awardOpen(g, 1, 999000), true);
  assert.equal(g.phase, 'playing');
  assert.equal(g.deadline, 1049000);
  assert.equal(g.entries.length, 1);
  assert.equal(g.entries[0].awardTeam, 1);
  assert.equal(g.entries[0].id, card);
  assert.notEqual(g.current.id, card);
  assert.deepEqual(g.teams.map(t => t.score), [0, 0]);
  assert.equal(awardOpen(g, 1, 999001), false);
  assert.equal(g.entries.length, 1);
  assert.equal(g.deadline, 1049000);
  assert.equal(finishRound(g), true);
  assert.equal(finishRound(g), false);
  assert.deepEqual(g.teams.map(t => t.score), [0, 1]);
});

test('canceling winner selection resumes the same card and mode with exactly the saved duration', () => {
  const g = playing({ openRounds: 'all' });
  const card = g.current.id;
  const mode = currentMode(g);
  beginOpenAward(g, 11000);
  assert.equal(cancelOpenAward(g, 90000), true);
  assert.equal(g.phase, 'playing');
  assert.equal(g.deadline, 140000);
  assert.equal(g.current.id, card);
  assert.equal(currentMode(g), mode);
  assert.equal(g.entries.length, 0);
  assert.equal(cancelOpenAward(g, 90001), false);
  assert.equal(beginOpenAward(playing(), 11000), false);
});

test('opening the chooser at the exact deadline settles earlier awards without granting another point', () => {
  const g = playing({ openRounds: 'all' });
  assert.equal(record(g, 'correct', 2000, 1), true);
  assert.equal(beginOpenAward(g, 61000), false);
  assert.equal(g.phase, 'summary');
  assert.equal(g.entries.length, 1);
  assert.deepEqual(g.teams.map(t => t.score), [0, 1]);
  assert.equal(awardOpen(g, 0, 62000), false);
  assert.equal(cancelOpenAward(g, 62000), false);
  assert.equal(finishRound(g), false);
  assert.deepEqual(g.teams.map(t => t.score), [0, 1]);
});

test('open-round correct answers require an explicit valid winner while passing remains available', () => {
  const g = playing({ openRounds: 'all' });
  const card = g.current.id;
  for (const winner of [undefined, -1, 2, 1.5, '1']) {
    assert.equal(record(g, 'correct', 2000, winner), false);
    assert.equal(g.entries.length, 0);
    assert.equal(g.current.id, card);
  }
  assert.equal(record(g, 'pass', 3000), true);
  assert.equal(roundPoints(g), 0);
  assert.equal(record(g, 'correct', 4000, 1), true);
  assert.equal(g.entries[1].awardTeam, 1);
  assert.equal(roundPoints(g), 1);
  const normal = playing();
  record(normal, 'correct', 2000);
  assert.equal(normal.entries[0].awardTeam, 0);
});

test('round settlement distributes open answers among all winning teams exactly once', () => {
  const g = playing({ openRounds: 'all', teams: ['Egy', 'Kettő', 'Három'] });
  for (const [i, winner] of [2, 1, 2, 0].entries()) {
    assert.equal(record(g, 'correct', 2000 + i, winner), true);
  }
  record(g, 'pass', 3000);
  assert.equal(roundPoints(g), 4);
  assert.deepEqual(g.teams.map(t => t.score), [0, 0, 0]);
  finishRound(g);
  assert.deepEqual(g.teams.map(t => t.score), [1, 1, 2]);
  assert.deepEqual(g.history[0].awards, [1, 1, 2]);
  finishRound(g);
  assert.deepEqual(g.teams.map(t => t.score), [1, 1, 2]);
});

test('undo removes a pending open-round award and restores the card without resetting time', () => {
  const g = playing({ openRounds: 'all' });
  const card = g.current.id;
  const mode = currentMode(g);
  beginOpenAward(g, 11000);
  awardOpen(g, 1, 50000);
  const deadline = g.deadline;
  assert.equal(roundPoints(g), 1);
  assert.equal(undo(g), true);
  assert.equal(g.current.id, card);
  assert.equal(currentMode(g), mode);
  assert.equal(g.deadline, deadline);
  assert.equal(roundPoints(g), 0);
  finishRound(g);
  assert.deepEqual(g.teams.map(t => t.score), [0, 0]);
});

test('a saved winner chooser stays frozen and can be canceled or awarded after restoration', t => {
  t.mock.method(Date, 'now', () => 999000);
  const g = playing({ openRounds: 'all' });
  beginOpenAward(g, 11000);
  const raw = JSON.stringify(g);
  const restored = restoreGame(raw);
  assert.ok(restored);
  assert.equal(restored.phase, 'award');
  assert.equal(restored.remainingMs, 50000);
  assert.equal(restored.deadline, null);
  assert.equal(restored.current.id, g.current.id);
  assert.deepEqual(restored.teams.map(t => t.score), [0, 0]);
  assert.equal(cancelOpenAward(restored, 999000), true);
  assert.equal(restored.current.id, g.current.id);
  assert.equal(restored.deadline, 1049000);
  assert.equal(restored.entries.length, 0);

  const awarded = restoreGame(raw);
  assert.equal(awardOpen(awarded, 1, 999000), true);
  finishRound(awarded);
  assert.deepEqual(awarded.teams.map(t => t.score), [0, 1]);

  const invalid = JSON.parse(raw);
  invalid.config.openRounds = 'off';
  assert.equal(restoreGame(JSON.stringify(invalid)), null);
});

test('presenters rotate independently for three teams with different player counts', () => {
  const players = [[' Anna ', 'Béla'], ['Cili', 'Dani', 'Eszter'], ['Feri', 'Gabi', 'Hédi', 'Imre']];
  const g = game({ teams: ['Egy', 'Kettő', 'Három'], rounds: 5, players });
  assert.deepEqual(g.teams.map(team => team.players), [['Anna', 'Béla'], players[1], players[2]]);
  const actual = Array.from({ length: 15 }, (_, turn) => currentPresenter(g, turn));
  assert.deepEqual(actual, ['Anna', 'Cili', 'Feri', 'Béla', 'Dani', 'Gabi', 'Anna', 'Eszter', 'Hédi', 'Béla', 'Cili', 'Imre', 'Anna', 'Dani', 'Feri']);
  g.turn = 4;
  assert.equal(currentPresenter(g), 'Dani');
  const unnamed = game();
  assert.equal(currentPresenter(unnamed, 0), '1. játékos');
  assert.equal(currentPresenter(unnamed, 1), '1. játékos');
  assert.equal(currentPresenter(unnamed, 2), '2. játékos');
  assert.equal(currentPresenter(unnamed, 4), '1. játékos');
});

test('player lists accept unnamed teams or 2–12 unique names and reject invalid lists', () => {
  assert.doesNotThrow(() => game({ players: [[], []] }));
  assert.doesNotThrow(() => game({ players: [Array.from({ length: 12 }, (_, i) => `Játékos ${i}`), []] }));
  const invalidLists = [
    [['Anna'], []],
    [Array.from({ length: 13 }, (_, i) => `Játékos ${i}`), []],
    [['Anna', ' Anna '], []],
    [['Anna', ' '], []],
    [['Anna', 'H'.repeat(29)], []],
  ];
  for (const players of invalidLists) assert.throws(() => game({ players }));
});

test('legacy saves default to closed rounds and unnamed alternating presenters', () => {
  const legacy = playing();
  record(legacy, 'correct', 2000);
  pause(legacy, 3000);
  delete legacy.config.openRounds;
  delete legacy.config.players;
  for (const team of legacy.teams) delete team.players;
  for (const entry of legacy.entries) delete entry.awardTeam;
  const restored = restoreGame(JSON.stringify(legacy));
  assert.ok(restored);
  assert.equal(restored.config.openRounds, 'off');
  assert.deepEqual(restored.teams.map(team => team.players), [[], []]);
  assert.equal(currentPresenter(restored, 0), '1. játékos');
  assert.equal(currentPresenter(restored, 2), '2. játékos');
  assert.equal(isOpenRound(restored), false);
  finishRound(restored);
  assert.deepEqual(restored.teams.map(team => team.score), [1, 0]);
});
