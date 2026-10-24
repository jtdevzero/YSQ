export const MODES = {
  describe: { name: 'Körülírás', icon: 'talk', rule: 'Mondd más szavakkal! A feladvány szavait és szótöveit ne használd.' },
  mime: { name: 'Mutogatás', icon: 'mime', rule: 'Csak mozdulatokkal! Beszéd, hangok és betűk mutatása nélkül.' },
  draw: { name: 'Rajzolás', icon: 'draw', rule: 'Rajzold le! Betűk, számok, beszéd és mutogatás nélkül.' }
};
export const COLORS = ['#dbff7a', '#bb99ff', '#ffb79c', '#8be0df', '#ff93bc', '#f4d477'];
export const PACKS = {
  mixed: { name: 'Vegyes', description: 'Bemelegítő, csípős és merész lapok a választott erősség szerint.' },
  spicy: { name: 'Csak pikáns', description: 'Flört, csábítás, kétértelmű helyzetek és hálószobai humor. Bemelegítő lapok nélkül.' },
  intimate: { name: 'Szex témájú', description: 'Külön szókincspakli: vágy, intimitás, szexualitás és védekezés.' },
  creative: { name: 'Abszurd éjszaka', description: 'Képtelen figurák, váratlan tárgyak és filmszerű helyzetek. Engedjétek szabadon a fantáziátokat!' }
};
export const THEMES = {
  party: 'Buli és káosz', dating: 'Randi és flört', bedroom: 'Hálószobai humor',
  desire: 'Test és vágy', accessories: 'Intim kellékek', health: 'Védekezés és egészség', absurd: 'Abszurd világ'
};

export function supportsMode(prompt, mode) {
  return Object.hasOwn(MODES, mode) && (prompt.modes === undefined || (Array.isArray(prompt.modes) && prompt.modes.includes(mode)));
}

export function shuffle(items, random = Math.random) {
  const copy = [...items];
  for (let i = copy.length - 1; i > 0; i--) {
    const j = Math.floor(random() * (i + 1));
    [copy[i], copy[j]] = [copy[j], copy[i]];
  }
  return copy;
}

export function eligiblePrompts(prompts, level, pack = 'mixed', themes = null) {
  const levels = ['warm', 'spicy', 'bold'];
  const ceiling = levels.indexOf(level);
  return prompts.filter(p => {
    const inPack = pack === 'spicy' ? ['spicy', 'bold'].includes(p.level) : pack === 'intimate' ? p.level === 'intimate' : pack === 'creative' ? p.level === 'creative' : pack === 'mixed' && levels.indexOf(p.level) >= 0 && levels.indexOf(p.level) <= ceiling;
    return inPack && (themes == null || (Array.isArray(themes) && themes.some(theme => p.themes?.includes(theme))));
  });
}

export function createGame(config, prompts, random = Math.random) {
  const names = (config.teams || []).map(n => String(n).trim());
  if (names.length < 2 || names.length > 6 || names.some(n => !n || n.length > 28)) throw new Error('Adj meg 2–6 csapatnevet, legfeljebb 28 karakterrel.');
  if (new Set(names.map(n => n.toLocaleLowerCase('hu'))).size !== names.length) throw new Error('Minden csapatnak külön neve legyen.');
  if (![30, 60, 90].includes(config.duration) || ![3, 5, 8].includes(config.rounds)) throw new Error('Válassz a megadott időkből és körszámokból.');
  if (!['warm', 'spicy', 'bold'].includes(config.level)) throw new Error('Válassz nehézségi szintet.');
  const pack = config.pack ?? 'mixed';
  if (!Object.hasOwn(PACKS, pack)) throw new Error('Válassz az elérhető paklikból.');
  const modeRotation = config.modeRotation ?? 'cards';
  if (!['cards', 'rounds'].includes(modeRotation)) throw new Error('Válassz váltási módot.');
  if (config.themes != null && (!Array.isArray(config.themes) || !config.themes.length || config.themes.some(theme => !Object.hasOwn(THEMES, theme)))) throw new Error('Válassz legalább egy elérhető témát.');
  const themes = config.themes == null ? null : [...new Set(config.themes)];
  const matchModes = config.matchModes ?? true;
  if (typeof matchModes !== 'boolean') throw new Error('Hibás feladattípus-beállítás.');
  const modes = [...new Set(config.modes || [])].filter(m => MODES[m]);
  if (!modes.length) throw new Error('Válassz legalább egy feladattípust.');
  const pool = eligiblePrompts(prompts, config.level, pack, themes);
  if (!pool.length) throw new Error('Ezekkel a témákkal nincs elérhető feladvány. Válassz másik témát vagy paklit.');
  const unavailable = matchModes ? modes.filter(mode => !pool.some(prompt => supportsMode(prompt, mode))) : [];
  if (unavailable.length) throw new Error(`A kiválasztott témákhoz nincs ilyen lap: ${unavailable.map(mode => MODES[mode].name).join(', ')}. Bővítsd a témákat vagy kapcsold ki ezt a típust.`);
  return {
    version: 1,
    config: { teams: names, duration: config.duration, rounds: config.rounds, level: config.level, modes, pack, modeRotation, themes, matchModes },
    teams: names.map((name, i) => ({ name, score: 0, color: COLORS[i] })),
    phase: 'handoff', turn: 0, deck: shuffle(pool, random), cursor: 0,
    current: null, entries: [], history: [], remainingMs: config.duration * 1000, deadline: null,
    pool: matchModes ? [...pool] : undefined
  };
}

export const currentTeamIndex = game => game.turn % game.teams.length;
export const roundNumber = game => Math.floor(game.turn / game.teams.length) + 1;
export const currentMode = game => game.config.modes[(roundNumber(game) - 1 + (game.config.modeRotation === 'cards' ? game.entries.length : 0)) % game.config.modes.length];
export const roundPoints = game => game.entries.filter(e => e.result === 'correct').length;
export const remaining = (game, now = Date.now()) => game.phase === 'playing' ? Math.max(0, game.deadline - now) : game.remainingMs;

function nextCard(game) {
  if (game.config.matchModes) {
    const mode = currentMode(game);
    const findCompatible = () => {
      const candidates = game.deck.map((prompt, index) => ({ prompt, index })).filter(item => item.index >= game.cursor && supportsMode(item.prompt, mode));
      return (candidates.find(item => item.prompt.id !== game.current?.id) ?? candidates[0])?.index ?? -1;
    };
    let index = findCompatible();
    if (index < 0) {
      const waiting = game.deck.slice(game.cursor);
      const waitingIds = new Set(waiting.map(prompt => prompt.id));
      const recycled = shuffle(game.pool.filter(prompt => supportsMode(prompt, mode) && !waitingIds.has(prompt.id)));
      game.deck = [...waiting, ...recycled];
      game.cursor = 0;
      index = findCompatible();
    }
    if (index < 0) throw new Error('Ehhez a feladattípushoz nincs elérhető lap.');
    [game.deck[game.cursor], game.deck[index]] = [game.deck[index], game.deck[game.cursor]];
    game.current = game.deck[game.cursor++];
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

export function record(game, result, now = Date.now()) {
  if (game.phase !== 'playing' || !['correct', 'pass'].includes(result)) return false;
  if (remaining(game, now) <= 0) { finishRound(game); return false; }
  game.entries.push({ ...game.current, result, mode: currentMode(game) });
  nextCard(game);
  return true;
}

export function undo(game) {
  if (!['playing', 'paused'].includes(game.phase) || !game.entries.length) return false;
  // Reinsert the replacement card so an undo does not silently consume it.
  game.deck.splice(game.cursor, 0, game.current);
  game.current = game.entries.pop();
  delete game.current.result;
  delete game.current.mode;
  return true;
}

export function finishRound(game) {
  if (!['playing', 'paused', 'ready'].includes(game.phase)) return false;
  const points = roundPoints(game);
  game.teams[currentTeamIndex(game)].score += points;
  game.history.push({ team: currentTeamIndex(game), round: roundNumber(game), points, mode: currentMode(game) });
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
    if (g.version !== 1 || !['handoff', 'ready', 'playing', 'paused', 'summary', 'finished'].includes(g.phase)) return null;
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
    if (typeof g.config.matchModes !== 'boolean' || (g.config.themes !== null && (!Array.isArray(g.config.themes) || !g.config.themes.length || g.config.themes.some(theme => !Object.hasOwn(THEMES, theme))))) return null;
    if (g.teams.some(t => typeof t.name !== 'string' || !t.name.trim() || t.name.length > 28 || !Number.isInteger(t.score) || t.score < 0)) return null;
    const validPrompt = p => p && typeof p.id === 'string' && typeof p.text === 'string' && p.text.length > 0 && p.text.length <= 180 && ['warm', 'spicy', 'bold', 'intimate', 'creative'].includes(p.level) && (p.modes === undefined || (Array.isArray(p.modes) && p.modes.length > 0 && p.modes.every(mode => Object.hasOwn(MODES, mode)))) && (p.themes === undefined || (Array.isArray(p.themes) && p.themes.length > 0 && p.themes.every(theme => Object.hasOwn(THEMES, theme))));
    if (g.deck.some(p => !validPrompt(p))) return null;
    const inSelection = p => eligiblePrompts([p], g.config.level, g.config.pack, g.config.themes).length === 1;
    if (g.deck.some(p => !inSelection(p))) return null;
    if (g.config.matchModes) {
      if (!Array.isArray(g.pool) || !g.pool.length || g.pool.some(p => !validPrompt(p) || !inSelection(p))) return null;
      const poolIds = new Set(g.pool.map(p => p.id));
      if (poolIds.size !== g.pool.length || g.deck.some(p => !poolIds.has(p.id)) || g.config.modes.some(mode => !g.pool.some(p => supportsMode(p, mode)))) return null;
      if (['ready', 'playing', 'paused'].includes(g.phase) && (!g.current || !poolIds.has(g.current.id) || !supportsMode(g.current, currentMode(g)))) return null;
    }
    if (g.entries.some(e => !validPrompt(e) || !['correct', 'pass'].includes(e.result) || (e.mode !== undefined && !g.config.modes.includes(e.mode)))) return null;
    if (g.history.some(h => !h || !Number.isInteger(h.team) || h.team < 0 || h.team >= g.teams.length || !Number.isInteger(h.round) || h.round < 1 || h.round > g.config.rounds || !Number.isInteger(h.points) || h.points < 0 || !MODES[h.mode])) return null;
    if (['ready', 'playing', 'paused'].includes(g.phase) && !validPrompt(g.current)) return null;
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
