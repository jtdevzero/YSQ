const ALLOWED_MODES = ['describe', 'mime', 'draw'];
const DIFFICULTY_ALIASES = Object.freeze({
  easy: 'easy', 'könnyű': 'easy', konnyu: 'easy',
  medium: 'medium', 'közepes': 'medium', kozepes: 'medium',
  hard: 'hard', 'nehéz': 'hard', nehez: 'hard'
});

export function parseCustomPack(text, { modes = ALLOWED_MODES, difficulty = 'medium' } = {}) {
  if (typeof text !== 'string') throw new Error('A saját feladványokat szövegként add meg, soronként egyet.');
  if (text.length > 25000) throw new Error('A saját pakli szövege legfeljebb 25 000 karakter lehet.');
  if (!Array.isArray(modes) || !modes.length || modes.some(mode => !ALLOWED_MODES.includes(mode))) throw new Error('A saját lapokhoz válassz legalább egy feladattípust.');
  if (!['easy', 'medium', 'hard'].includes(difficulty)) throw new Error('Válassz nehézséget a saját lapokhoz.');
  const lines = text.split(/\r?\n/).map((value, index) => ({ value: value.trim(), line: index + 1 })).filter(row => row.value);
  if (lines.length > 200) throw new Error('Egy saját pakliba legfeljebb 200 feladvány kerülhet.');
  const seen = new Set();
  return lines.map(({ value, line }, index) => {
    const segments = value.split('|');
    if (segments.length > 2) throw new Error(`${line}. sor: egy feladvány és legfeljebb egy nehézségi jelölés lehet: Szöveg | könnyű.`);
    const phrase = segments[0].trim().normalize('NFC').replace(/\s+/gu, ' ');
    const words = phrase ? phrase.split(' ').length : 0;
    if (words < 2 || words > 8 || phrase.length > 90) throw new Error(`${line}. sor: a feladvány 2–8 szavas és legfeljebb 90 karakteres legyen.`);
    if (/[\u0000-\u001f\u007f]/u.test(phrase)) throw new Error(`${line}. sor: a feladványban nem lehet vezérlőkarakter.`);
    const alias = segments[1]?.trim().normalize('NFC').toLocaleLowerCase('hu');
    const rating = segments.length === 2 ? (Object.hasOwn(DIFFICULTY_ALIASES, alias) ? DIFFICULTY_ALIASES[alias] : null) : difficulty;
    if (!rating) throw new Error(`${line}. sor: a nehézség könnyű, közepes vagy nehéz lehet.`);
    const key = phrase.toLocaleLowerCase('hu');
    if (seen.has(key)) throw new Error(`${line}. sor: ez a feladvány már szerepel a saját pakliban.`);
    seen.add(key);
    return {
      id: `custom-${String(index + 1).padStart(3, '0')}`,
      text: phrase,
      level: 'custom',
      modes: [...new Set(modes)],
      themes: ['custom'],
      difficulty: rating
    };
  });
}

export function customPackText(cards) {
  const names = { easy: 'könnyű', medium: 'közepes', hard: 'nehéz' };
  return cards.map(card => `${card.text} | ${names[card.difficulty] ?? 'közepes'}`).join('\n');
}
