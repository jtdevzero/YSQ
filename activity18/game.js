import { DIFFICULTIES, getDifficulty } from './difficulty.js';
export { DIFFICULTIES } from './difficulty.js';

export const MODES = {
  describe: { name: 'Körülírás', icon: 'talk', rule: 'Mondd más szavakkal! A feladvány szavait és szótöveit ne használd.' },
  mime: { name: 'Mutogatás', icon: 'mime', rule: 'Csak mozdulatokkal! Beszéd, hangok és betűk mutatása nélkül.' },
  draw: { name: 'Rajzolás', icon: 'draw', rule: 'Rajzold le! Betűk, számok, beszéd és mutogatás nélkül.' },
  reverse: { name: 'Fordított Activity', icon: 'mime', rule: 'A csapat együtt mutogat, a kijelölt megfejtő találgat. Csak a mutogatók nézhetik a lapot; beszéd és hangok nélkül!' }
};
export const COLORS = ['#dbff7a', '#bb99ff', '#ffb79c', '#8be0df', '#ff93bc', '#f4d477'];
export const PACKS = {
  mixed: { name: 'Vegyes', description: 'Bemelegítő, csípős és merész lapok a választott erősség szerint.' },
  spicy: { name: 'Csak pikáns', description: 'Flört, csábítás, kétértelmű helyzetek és hálószobai humor. Bemelegítő lapok nélkül.' },
  intimate: { name: 'Szex témájú', description: 'Külön szókincspakli: vágy, intimitás, szexualitás és védekezés.' },
  creative: { name: 'Abszurd éjszaka', description: 'Képtelen figurák, váratlan tárgyak és filmszerű helyzetek. Engedjétek szabadon a fantáziátokat!' },
  custom: { name: 'Saját pakli', description: 'A ti belsős poénjaitok és kifejezéseitek. A feladványok ezen az eszközön maradnak.' }
};
export const THEMES = {
  party: 'Buli és káosz', dating: 'Randi és flört', bedroom: 'Hálószobai humor',
  desire: 'Test és vágy', accessories: 'Intim kellékek', health: 'Védekezés és egészség', absurd: 'Abszurd világ', custom: 'Saját feladványok'
};

export function supportsMode(prompt, mode) {
  const matchingMode = mode === 'reverse' ? 'mime' : mode;
  return Object.hasOwn(MODES, mode) && (prompt.modes === undefined || (Array.isArray(prompt.modes) && (prompt.modes.includes(matchingMode) || prompt.modes.includes(mode))));
}

function normalizePlayers(input, count) {
  if (input == null) return Array.from({ length: count }, () => []);
  if (!Array.isArray(input) || input.length !== count) throw new Error('Minden csapathoz külön játékoslistát adj meg.');
  return input.map(list => {
    if (!Array.isArray(list) || list.some(name => typeof name !== 'string')) throw new Error('A játékosneveket csapatonként add meg.');
    const names = list.map(name => name.trim());
    if ((names.length && names.length < 2) || names.length > 12 || names.some(name => !name || name.length > 28)) throw new Error('Csapatonként 2–12 nevet adj meg, vagy hagyd üresen. Egy név legfeljebb 28 karakter lehet.');
    if (new Set(names.map(name => name.toLocaleLowerCase('hu'))).size !== names.length) throw new Error('Egy csapaton belül minden játékosnak külön neve legyen.');
    return names;
  });
}

export function shuffle(items, random = Math.random) {
  const copy = [...items];
  for (let i = copy.length - 1; i > 0; i--) {
    const j = Math.floor(random() * (i + 1));
    [copy[i], copy[j]] = [copy[j], copy[i]];
  }
  return copy;
}

export function eligiblePrompts(prompts, level, pack = 'mixed', themes = null, difficulty = 'all') {
  const levels = ['warm', 'spicy', 'bold'];
  const ceiling = levels.indexOf(level);
  return prompts.filter(p => {
    const inPack = pack === 'spicy' ? ['spicy', 'bold'].includes(p.level) : pack === 'intimate' ? p.level === 'intimate' : pack === 'creative' ? p.level === 'creative' : pack === 'custom' ? p.level === 'custom' : pack === 'mixed' && levels.indexOf(p.level) >= 0 && levels.indexOf(p.level) <= ceiling;
    return inPack && (difficulty === 'all' || getDifficulty(p) === difficulty) && (themes == null || (Array.isArray(themes) && themes.some(theme => p.themes?.includes(theme))));
  });
}

export function createGame(config, prompts, random = Math.random) {
  const names = (config.teams || []).map(n => String(n).trim());
  if (names.length < 2 || names.length > 6 || names.some(n => !n || n.length > 28)) throw new Error('Adj meg 2–6 csapatnevet, legfeljebb 28 karakterrel.');
  if (new Set(names.map(n => n.toLocaleLowerCase('hu'))).size !== names.length) throw new Error('Minden csapatnak külön neve legyen.');
  const players = normalizePlayers(config.players, names.length);
  const openRounds = config.openRounds ?? 'final';
  if (!['off', 'final', 'all'].includes(openRounds)) throw new Error('Válassz nyíltköri beállítást.');
  if (![30, 60, 90].includes(config.duration) || ![3, 5, 8].includes(config.rounds)) throw new Error('Válassz a megadott időkből és körszámokból.');
  if (!['warm', 'spicy', 'bold'].includes(config.level)) throw new Error('Válassz erősségi szintet.');
  const pack = config.pack ?? 'mixed';
  if (!Object.hasOwn(PACKS, pack)) throw new Error('Válassz az elérhető paklikból.');
  const modeRotation = config.modeRotation ?? 'cards';
  if (!['cards', 'rounds'].includes(modeRotation)) throw new Error('Válassz váltási módot.');
  const difficulty = config.difficulty ?? 'all';
  if (!Object.hasOwn(DIFFICULTIES, difficulty)) throw new Error('Válassz elérhető nehézséget.');
  const chaos = config.chaos ?? false;
  const doubleCards = config.doubleCards ?? false;
  if (typeof chaos !== 'boolean' || typeof doubleCards !== 'boolean') throw new Error('Hibás kihívásbeállítás.');
  if (config.themes != null && (!Array.isArray(config.themes) || !config.themes.length || config.themes.some(theme => !Object.hasOwn(THEMES, theme)))) throw new Error('Válassz legalább egy elérhető témát.');
  const themes = config.themes == null ? null : [...new Set(config.themes)];
  const requestedMatchModes = config.matchModes ?? true;
  if (typeof requestedMatchModes !== 'boolean') throw new Error('Hibás feladattípus-beállítás.');
  const matchModes = requestedMatchModes || doubleCards || config.modes?.includes('reverse');
  if (typeof matchModes !== 'boolean') throw new Error('Hibás feladattípus-beállítás.');
  const modes = [...new Set(config.modes || [])].filter(m => MODES[m]);
  if (!modes.length) throw new Error('Válassz legalább egy feladattípust.');
  const pool = eligiblePrompts(prompts, config.level, pack, themes, difficulty);
  if (!pool.length) throw new Error('Ezekkel a témákkal nincs elérhető feladvány. Válassz másik témát vagy paklit.');
  const required = doubleCards ? 2 : 1;
  const unavailable = matchModes ? modes.filter(mode => new Set(pool.filter(prompt => supportsMode(prompt, mode)).map(prompt => prompt.id)).size < required) : [];
  if (unavailable.length) throw new Error(`A kiválasztott témákhoz és nehézséghez nincs ${doubleCards ? 'legalább két különböző' : 'elérhető'} lap: ${unavailable.map(mode => MODES[mode].name).join(', ')}. Bővítsd a szűrőket vagy kapcsold ki ezt a típust.`);
  return {
    version: 1,
    config: { teams: names, duration: config.duration, rounds: config.rounds, level: config.level, modes, pack, modeRotation, themes, matchModes, players, openRounds, difficulty, chaos, doubleCards },
    teams: names.map((name, i) => ({ name, score: 0, color: COLORS[i], players: [...players[i]] })),
    phase: 'handoff', turn: 0, deck: shuffle(pool, random), cursor: 0,
    current: null, entries: [], history: [], remainingMs: config.duration * 1000, deadline: null,
    pool: matchModes ? [...pool] : undefined
  };
}

export const currentTeamIndex = game => game.turn % game.teams.length;
export const roundNumber = game => Math.floor(game.turn / game.teams.length) + 1;
export const currentMode = game => game.config.modes[(roundNumber(game) - 1 + (game.config.modeRotation === 'cards' ? game.entries.length : 0)) % game.config.modes.length];
export const isOpenRound = game => currentMode(game) !== 'reverse' && (game.config.openRounds === 'all' || (game.config.openRounds === 'final' && roundNumber(game) === game.config.rounds));
const CHALLENGES = {
  describe: ['Legfeljebb öt szót mondhatsz ehhez a laphoz. Válaszd meg őket jól!', 'Minden magyarázatod kérdés legyen! A feladvány szavai továbbra is tiltottak.'],
  mime: ['Ülve mutogass! A székből most nem állhatsz fel.', 'Lassított felvétel: minden mozdulatod legyen szándékosan lassú.'],
  draw: ['Az ügyetlenebb kezeddel rajzolj!', 'Egyetlen folytonos vonallal rajzolj: a ceruzát ne emeld fel!'],
  reverse: ['Minden mutogató ülve adja elő a jelenetet!', 'Lassított jelenet: minden mutogató lassú mozdulatokkal dolgozzon.']
};
export function currentChallenge(game) {
  if (!game.config.chaos) return '';
  const options = CHALLENGES[currentMode(game)];
  return options[(game.turn + game.entries.length) % options.length];
}
export function currentPresenter(game, turn = game.turn) {
  const players = game.teams[turn % game.teams.length].players || [];
  const index = Math.floor(turn / game.teams.length) % (players.length || 2);
  return players[index] || `${index + 1}. játékos`;
}
export const roundPoints = game => game.entries.filter(e => e.result === 'correct').length;
export function roundAwards(game) {
  const points = game.teams.map(() => 0);
  game.entries.filter(entry => entry.result === 'correct').forEach(entry => { points[entry.awardTeam ?? currentTeamIndex(game)]++; });
  return points;
}
export const remaining = (game, now = Date.now()) => game.phase === 'playing' ? Math.max(0, game.deadline - now) : game.remainingMs;

function nextCard(game) {
  if (game.config.doubleCards) {
    const mode = currentMode(game);
    const previousIds = new Set((game.current?.parts || []).map(prompt => prompt.id));
    const first = takeMatchedCard(game, mode, new Set(), previousIds, true);
    const second = takeMatchedCard(game, mode, new Set([first.id]), previousIds);
    game.current = { ...first, id: `pair:${first.id}|${second.id}`, text: `${first.text} + ${second.text}`, parts: [first, second] };
    return;
  }
  if (game.config.matchModes) {
    game.current = takeMatchedCard(game, currentMode(game), new Set(), new Set([game.current?.id]));
    return;
  }
  if (game.cursor >= game.deck.length) {
    const last = game.current?.id;
    game.deck = shuffle(game.deck);
    if (game.deck.length > 1 && game.deck[0].id === last) [game.deck[0], game.deck[1]] = [game.deck[1], game.deck[0]];
    game.cursor = 0;
  }
  game.current = game.deck[game.cursor++];
}

function takeMatchedCard(game, mode, excluded = new Set(), avoid = new Set(), preferFresh = false) {
  const compatible = prompt => supportsMode(prompt, mode) && !excluded.has(prompt.id);
  const candidates = () => game.deck.map((prompt, index) => ({ prompt, index })).filter(item => item.index >= game.cursor && compatible(item.prompt));
  let available = candidates();
  // For a pair, recycle one alternative before repeating the exact previous pair.
  // Ordinary one-card queues retain their original order and refill behavior.
  if (preferFresh && available.length && available.every(item => avoid.has(item.prompt.id))) {
    const waitingIds = new Set(game.deck.slice(game.cursor).map(prompt => prompt.id));
    const fresh = game.pool.find(prompt => compatible(prompt) && !avoid.has(prompt.id) && !waitingIds.has(prompt.id));
    if (fresh) { game.deck.push(fresh); available = candidates(); }
  }
  if (!available.length) {
    const waiting = game.deck.slice(game.cursor);
    const waitingIds = new Set(waiting.map(prompt => prompt.id));
    const recycled = shuffle(game.pool.filter(prompt => supportsMode(prompt, mode) && !waitingIds.has(prompt.id)));
    game.deck = [...waiting, ...recycled];
    game.cursor = 0;
    available = candidates();
  }
  const index = (available.find(item => !avoid.has(item.prompt.id)) ?? available[0])?.index ?? -1;
  if (index < 0) throw new Error('Ehhez a feladattípushoz nincs elérhető lap.');
  [game.deck[game.cursor], game.deck[index]] = [game.deck[index], game.deck[game.cursor]];
  return game.deck[game.cursor++];
}

export function reveal(game) {
  if (game.phase !== 'handoff') return false;
  nextCard(game);
  game.phase = 'ready';
  return true;
}

export function start(game, now = Date.now()) {
  if (!['ready', 'paused'].includes(game.phase)) return false;
  game.deadline = now + game.remainingMs;
  game.phase = 'playing';
  return true;
}

export function pause(game, now = Date.now()) {
  if (game.phase !== 'playing') return false;
  game.remainingMs = remaining(game, now);
  game.deadline = null;
  game.phase = 'paused';
  return true;
}

export function record(game, result, now = Date.now(), winningTeam) {
  if (game.phase !== 'playing' || !['correct', 'pass'].includes(result)) return false;
  if (remaining(game, now) <= 0) { finishRound(game); return false; }
  if (result === 'correct' && isOpenRound(game) && (!Number.isInteger(winningTeam) || winningTeam < 0 || winningTeam >= game.teams.length)) return false;
  const entry = { ...game.current, result, mode: currentMode(game) };
  if (result === 'correct') entry.awardTeam = isOpenRound(game) ? winningTeam : currentTeamIndex(game);
  game.entries.push(entry);
  nextCard(game);
  return true;
}

export function beginOpenAward(game, now = Date.now()) {
  if (game.phase !== 'playing' || !isOpenRound(game)) return false;
  const ms = remaining(game, now);
  if (ms <= 0) { finishRound(game); return false; }
  game.remainingMs = ms;
  game.deadline = null;
  game.phase = 'award';
  return true;
}

export function awardOpen(game, winningTeam, now = Date.now()) {
  if (game.phase !== 'award' || !isOpenRound(game) || !Number.isInteger(winningTeam) || winningTeam < 0 || winningTeam >= game.teams.length) return false;
  game.phase = 'playing';
  game.deadline = now + game.remainingMs;
  return record(game, 'correct', now, winningTeam);
}

export function cancelOpenAward(game, now = Date.now()) {
  if (game.phase !== 'award') return false;
  game.phase = 'playing';
  game.deadline = now + game.remainingMs;
  return true;
}

export function undo(game) {
  if (!['playing', 'paused'].includes(game.phase) || !game.entries.length) return false;
  // Reinsert the replacement card so an undo does not silently consume it.
  game.deck.splice(game.cursor, 0, ...(game.current.parts || [game.current]));
  game.current = game.entries.pop();
  delete game.current.result;
  delete game.current.mode;
  delete game.current.awardTeam;
  return true;
}

export function finishRound(game) {
  if (!['playing', 'paused', 'ready'].includes(game.phase)) return false;
  const points = roundPoints(game);
  const awards = roundAwards(game);
  awards.forEach((value, index) => { game.teams[index].score += value; });
  const hadOpenCards = (game.config.openRounds === 'all' || (game.config.openRounds === 'final' && roundNumber(game) === game.config.rounds)) && (currentMode(game) !== 'reverse' || game.entries.some(entry => entry.mode !== 'reverse'));
  game.history.push({ team: currentTeamIndex(game), round: roundNumber(game), points, mode: currentMode(game), awards, presenter: currentPresenter(game), open: hadOpenCards });
  game.phase = 'summary';
  game.remainingMs = 0;
  game.deadline = null;
  return true;
}

export function nextTurn(game) {
  if (game.phase !== 'summary') return false;
  game.turn++;
  if (game.turn >= game.teams.length * game.config.rounds) {
    game.phase = 'finished';
  } else {
    game.phase = 'handoff';
    game.remainingMs = game.config.duration * 1000;
    game.current = null;
    game.entries = [];
  }
  return true;
}

export function winners(game) {
  const max = Math.max(...game.teams.map(t => t.score));
  return game.teams.filter(t => t.score === max);
}

export function restoreGame(raw) {
  try {
    const g = JSON.parse(raw);
    if (g.version !== 1 || !['handoff', 'ready', 'playing', 'paused', 'award', 'summary', 'finished'].includes(g.phase)) return null;
    if (!Array.isArray(g.teams) || g.teams.length < 2 || g.teams.length > 6 || !Array.isArray(g.deck) || !g.deck.length || !Array.isArray(g.entries) || !Array.isArray(g.history)) return null;
    if (!Number.isInteger(g.turn) || g.turn < 0 || g.turn > g.teams.length * g.config.rounds || !Number.isInteger(g.cursor) || g.cursor < 0 || g.cursor > g.deck.length || !Number.isFinite(g.remainingMs) || g.remainingMs < 0 || g.remainingMs > g.config.duration * 1000) return null;
    if (!g.config.modes?.length || g.config.modes.some(m => !MODES[m]) || ![30, 60, 90].includes(g.config.duration) || ![3, 5, 8].includes(g.config.rounds)) return null;
    if (!['warm', 'spicy', 'bold'].includes(g.config.level)) return null;
    g.config.pack ??= 'mixed';
    if (!Object.hasOwn(PACKS, g.config.pack)) return null;
    g.config.modeRotation ??= 'rounds';
    if (!['cards', 'rounds'].includes(g.config.modeRotation)) return null;
    g.config.matchModes ??= false;
    g.config.themes ??= null;
    g.config.difficulty ??= 'all';
    g.config.chaos ??= false;
    g.config.doubleCards ??= false;
    if (!Object.hasOwn(DIFFICULTIES, g.config.difficulty) || typeof g.config.chaos !== 'boolean' || typeof g.config.doubleCards !== 'boolean' || ((g.config.doubleCards || g.config.modes.includes('reverse')) && !g.config.matchModes)) return null;
    if (typeof g.config.matchModes !== 'boolean' || (g.config.themes !== null && (!Array.isArray(g.config.themes) || !g.config.themes.length || g.config.themes.some(theme => !Object.hasOwn(THEMES, theme))))) return null;
    if (g.teams.some(t => typeof t.name !== 'string' || !t.name.trim() || t.name.length > 28 || !Number.isInteger(t.score) || t.score < 0)) return null;
    g.config.openRounds ??= 'off';
    if (!['off', 'final', 'all'].includes(g.config.openRounds)) return null;
    const players = normalizePlayers(g.config.players ?? g.teams.map(team => team.players || []), g.teams.length);
    for (let i = 0; i < g.teams.length; i++) {
      if (g.teams[i].players !== undefined && JSON.stringify(normalizePlayers([g.teams[i].players], 1)[0]) !== JSON.stringify(players[i])) return null;
      g.teams[i].players = players[i];
    }
    g.config.players = players;
    if (g.phase === 'award' && (!isOpenRound(g) || g.remainingMs <= 0 || g.deadline !== null)) return null;
    const validPrompt = p => p && p.parts === undefined && typeof p.id === 'string' && p.id.length > 0 && typeof p.text === 'string' && p.text.length > 0 && p.text.length <= 180 && ['warm', 'spicy', 'bold', 'intimate', 'creative', 'custom'].includes(p.level) && (p.difficulty === undefined || ['easy', 'medium', 'hard'].includes(p.difficulty)) && (p.modes === undefined || (Array.isArray(p.modes) && p.modes.length > 0 && p.modes.every(mode => Object.hasOwn(MODES, mode)))) && (p.themes === undefined || (Array.isArray(p.themes) && p.themes.length > 0 && p.themes.every(theme => Object.hasOwn(THEMES, theme))));
    if (g.deck.some(p => !validPrompt(p))) return null;
    const inSelection = p => eligiblePrompts([p], g.config.level, g.config.pack, g.config.themes, g.config.difficulty).length === 1;
    const parts = prompt => g.config.doubleCards ? prompt?.parts : [prompt];
    const validDisplay = (prompt, mode) => {
      const cards = parts(prompt);
      if (!Array.isArray(cards) || cards.length !== (g.config.doubleCards ? 2 : 1) || cards.some(card => !validPrompt(card) || !inSelection(card) || (g.config.matchModes && mode && !supportsMode(card, mode)))) return false;
      if (!g.config.doubleCards) return true;
      return cards[0].id !== cards[1].id && prompt.id === `pair:${cards[0].id}|${cards[1].id}` && prompt.text === `${cards[0].text} + ${cards[1].text}`;
    };
    if (g.deck.some(p => !inSelection(p))) return null;
    if (g.config.matchModes) {
      if (!Array.isArray(g.pool) || !g.pool.length || g.pool.some(p => !validPrompt(p) || !inSelection(p))) return null;
      const poolIds = new Set(g.pool.map(p => p.id));
      const minimum = g.config.doubleCards ? 2 : 1;
      if (poolIds.size !== g.pool.length || g.deck.some(p => !poolIds.has(p.id)) || g.config.modes.some(mode => g.pool.filter(p => supportsMode(p, mode)).length < minimum)) return null;
      if (['ready', 'playing', 'paused', 'award'].includes(g.phase) && (!validDisplay(g.current, currentMode(g)) || parts(g.current).some(p => !poolIds.has(p.id)))) return null;
    }
    const entryTeam = g.phase === 'finished' ? (g.turn - 1) % g.teams.length : currentTeamIndex(g);
    if (g.entries.some(e => !validDisplay(e, e.mode) || !['correct', 'pass'].includes(e.result) || (e.mode !== undefined && !g.config.modes.includes(e.mode)) || (e.awardTeam !== undefined && (e.result !== 'correct' || !Number.isInteger(e.awardTeam) || e.awardTeam < 0 || e.awardTeam >= g.teams.length || (e.mode === 'reverse' && e.awardTeam !== entryTeam))))) return null;
    if (g.history.some(h => !h || !Number.isInteger(h.team) || h.team < 0 || h.team >= g.teams.length || !Number.isInteger(h.round) || h.round < 1 || h.round > g.config.rounds || !Number.isInteger(h.points) || h.points < 0 || !MODES[h.mode])) return null;
    if (['ready', 'playing', 'paused', 'award'].includes(g.phase) && !validDisplay(g.current, currentMode(g))) return null;
    if ((g.phase === 'finished') !== (g.turn === g.teams.length * g.config.rounds)) return null;
    if (g.phase === 'playing') {
      if (!Number.isFinite(g.deadline)) return null;
      // Reloads preserve the actual deadline; closing the tab does not grant extra time.
      g.remainingMs = Math.max(0, g.deadline - Date.now());
      if (g.remainingMs <= 0) finishRound(g);
      else { g.phase = 'paused'; g.deadline = null; }
    }
    return g;
  } catch { return null; }
}
