// Playing difficulty describes how readily a phrase can be conveyed and guessed.
// It is curated separately from the adult-content levels in prompts.js:
// easy = familiar concrete objects/actions, medium = multi-part scenes,
// hard = abstract concepts, specialist vocabulary or subtle wordplay.
export const DIFFICULTIES = Object.freeze({
  all: 'Minden nehézség',
  easy: 'Könnyű',
  medium: 'Közepes',
  hard: 'Nehéz'
});

// Explicit per-deck positions; every unlisted position is deliberately medium.
// IDs stay stable when the selected pack, modes or adult intensity change.
const RATINGS = {
  warm: {
    count: 60,
    easy: [1,3,4,5,6,7,8,9,12,14,16,17,23,24,25,26,27,30,31,32,35,37,39,41,43,44,45,46,50,51,52,55,57,58],
    hard: [15,19,34,40,47,48,53,54,56,59,60]
  },
  spicy: {
    count: 180,
    easy: [4,5,7,8,12,15,17,19,23,27,28,31,32,38,42,43,44,47,50,54,55,58,61,64,67,68,70,74,75,79,82,87,91,92,95,96,102,104,110,111,112,119,120,128,131,135,140,143,147,150,156,158,163,167,169,174],
    hard: [9,18,21,24,25,29,33,34,35,36,39,40,45,48,53,57,59,62,69,73,78,83,84,85,86,89,90,97,100,105,106,109,115,118,123,125,126,127,129,130,132,134,136,138,142,144,145,148,149,151,152,153,154,155,159,160,166,168,170,172,173,175,177,178,179,180]
  },
  bold: {
    count: 180,
    easy: [2,4,9,11,12,14,15,18,19,21,23,24,25,26,27,29,30,31,33,36,39,40,41,42,43,45,47,51,52,53,58,59,60,62,63,64,70,73,75,77,79,80,85,87,88,91,93,95,98,100,103,104,106,107,108,109,111,113,118,119,120,121,123,127,128,130,131,135,137,140,141,144,148,149,152,155,159,164,165,168,169,170,179,180],
    hard: [1,3,13,22,34,35,44,46,48,50,65,66,67,69,71,81,82,83,86,89,90,94,101,105,110,115,116,125,129,142,143,147,150,153,160,161,162,163,166,167,171,172,174,178]
  },
  intimate: {
    count: 300,
    easy: [6,7,10,14,19,24,27,30,31,32,34,35,38,41,42,44,46,61,81,95,103,115,117,124,125,145,151,153,181,182,184,185,188,190,192,193,194,201,203,204,205,207,208,209,211,215,216,218,219,221,222,227,230,233,237,238,241,243,246,247,248,252,255,256,257,258,259,261,274,276,284,288,291,293,295,298],
    hard: [16,17,20,25,29,33,37,39,40,47,48,49,50,51,53,54,55,56,57,59,60,65,67,74,76,78,79,80,82,83,84,85,86,87,88,89,90,91,93,97,98,99,100,101,102,104,105,106,109,110,112,113,116,118,119,121,130,132,133,136,140,143,144,148,155,161,162,165,166,168,169,170,171,173,175,176,177,179,180,187,213,266,268,269,279,280,286,287,290,292,297]
  },
  creative: {
    count: 120,
    easy: [2,4,5,7,11,12,17,18,25,27,29,33,35,37,38,39,42,52,54,57,63,64,75,79,83,87,91,92,94,100,105,107,108,111,114,116],
    hard: [1,14,16,20,22,24,31,32,43,44,45,47,49,50,55,59,60,61,65,68,73,74,76,78,88,98,103,106,109,115,118]
  }
};

export const BUILTIN_DIFFICULTIES = Object.freeze(Object.fromEntries(
  Object.entries(RATINGS).flatMap(([deck, rating]) => {
    const easy = new Set(rating.easy);
    const hard = new Set(rating.hard);
    return Array.from({ length: rating.count }, (_, index) => [
      `${deck}-${String(index + 1).padStart(3, '0')}`,
      easy.has(index + 1) ? 'easy' : hard.has(index + 1) ? 'hard' : 'medium'
    ]);
  })
));

export function getDifficulty(prompt) {
  if (['easy', 'medium', 'hard'].includes(prompt?.difficulty)) return prompt.difficulty;
  return Object.hasOwn(BUILTIN_DIFFICULTIES, prompt?.id) ? BUILTIN_DIFFICULTIES[prompt.id] : 'medium';
}
