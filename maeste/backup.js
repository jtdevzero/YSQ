(() => {
  'use strict';

  const MAX_ITEMS = 1000;
  const MAX_ID = 999999999;
  const MAX_BYTES = 1024 * 1024;
  const own = (value, field) => Object.prototype.hasOwnProperty.call(value, field);
  const record = value => value !== null && typeof value === 'object' && !Array.isArray(value) && Object.prototype.toString.call(value) === '[object Object]';
  const fail = message => { throw new Error(message); };
  const validId = value => Number.isInteger(value) && value > 0 && value <= MAX_ID;

  function mediaType(item) {
    const type = own(item, 'media_type') ? item.media_type : 'movie';
    if (type !== 'movie' && type !== 'tv') fail('A mentésben érvénytelen tartalomtípus szerepel. Csak film és sorozat használható.');
    return type;
  }

  function key(item) {
    if (!record(item) || !validId(item.id)) fail('A mentésben érvénytelen film- vagy sorozatazonosító szerepel.');
    return `${mediaType(item)}:${item.id}`;
  }

  function textField(item, output, field, maximum) {
    if (!own(item, field)) return;
    const value = item[field];
    if (value !== null && (typeof value !== 'string' || value.length > maximum)) fail('A mentésben hibás vagy túl hosszú szöveg szerepel.');
    output[field] = value;
  }

  function dateField(item, output, field) {
    if (!own(item, field)) return;
    const value = item[field];
    if (value === null || value === '') { output[field] = value; return; }
    if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) fail('A mentésben érvénytelen megjelenési dátum szerepel.');
    const date = new Date(`${value}T00:00:00.000Z`);
    if (!Number.isFinite(date.getTime()) || date.toISOString().slice(0, 10) !== value) fail('A mentésben érvénytelen megjelenési dátum szerepel.');
    output[field] = value;
  }

  function imageField(item, output, field) {
    if (!own(item, field)) return;
    const value = item[field];
    if (value === null || value === '') { output[field] = value; return; }
    if (typeof value !== 'string' || value.length > 200 || !/^\/[A-Za-z0-9._/-]+$/.test(value) || value.includes('//') || value.split('/').some(part => part === '.' || part === '..')) fail('A mentésben érvénytelen filmkép-hivatkozás szerepel.');
    output[field] = value;
  }

  function summary(item) {
    key(item);
    const output = { id: item.id, media_type: mediaType(item) };
    textField(item, output, 'title', 300);
    textField(item, output, 'original_title', 300);
    textField(item, output, 'name', 300);
    textField(item, output, 'overview', 12000);
    dateField(item, output, 'release_date');
    dateField(item, output, 'first_air_date');
    imageField(item, output, 'poster_path');
    imageField(item, output, 'backdrop_path');
    if (own(item, 'vote_average')) {
      if (typeof item.vote_average !== 'number' || !Number.isFinite(item.vote_average) || item.vote_average < 0 || item.vote_average > 10) fail('A mentésben érvénytelen értékelés szerepel.');
      output.vote_average = item.vote_average;
    }
    if (own(item, 'genre_ids')) {
      if (!Array.isArray(item.genre_ids) || item.genre_ids.length > 30 || !item.genre_ids.every(validId)) fail('A mentésben érvénytelen műfajlista szerepel.');
      output.genre_ids = [...new Set(item.genre_ids)];
    }
    if (output.media_type === 'tv') {
      if (!output.title && output.name) output.title = output.name;
      if (!output.release_date && output.first_air_date) output.release_date = output.first_air_date;
    }
    return output;
  }

  function list(value) {
    if (!Array.isArray(value)) fail('A mentésnek kedvenc- és látottfilm-listát kell tartalmaznia.');
    if (value.length > MAX_ITEMS) fail('Egy listába legfeljebb 1000 film vagy sorozat menthető.');
    const result = [];
    for (let index = 0; index < value.length; index++) result.push(summary(value[index]));
    return result;
  }

  function checkSize(value) {
    const json = JSON.stringify(value);
    let bytes = 0;
    for (const character of json) {
      const code = character.codePointAt(0);
      bytes += code <= 0x7f ? 1 : code <= 0x7ff ? 2 : code <= 0xffff ? 3 : 4;
      if (bytes > MAX_BYTES) fail('A mentés túl nagy. Legfeljebb 1 MB adat használható.');
    }
    return json;
  }

  function lists(value) {
    if (!record(value)) fail('Ez nem érvényes MaEste-mentés.');
    const result = { likes: list(value.likes), seen: list(value.seen) };
    if (own(value, 'dismissed')) result.dismissed = list(value.dismissed);
    checkSize(result);
    return result;
  }

  function normalize(value) {
    if (!record(value) || value.app !== 'MaEste' || value.version !== 1) fail('Ez nem támogatott MaEste-mentés. Az alkalmazásnak MaEste, a verziónak 1 értékűnek kell lennie.');
    if (own(value, 'exportedAt') && (typeof value.exportedAt !== 'string' || value.exportedAt.length > 40 || !Number.isFinite(Date.parse(value.exportedAt)))) fail('A mentés készítési dátuma érvénytelen.');
    return lists(value);
  }

  function serialize(value) {
    const sanitized = lists(value);
    return checkSize({ app: 'MaEste', version: 1, exportedAt: new Date().toISOString(), ...sanitized });
  }

  function merge(current, incoming) {
    const existing = list(current);
    const additions = list(incoming);
    const entries = new Map();
    for (const item of [...existing, ...additions]) {
      const typedKey = key(item);
      entries.set(typedKey, { ...entries.get(typedKey), ...item });
    }
    if (entries.size > MAX_ITEMS) fail('Az összevont listába legfeljebb 1000 film vagy sorozat fér.');
    const result = [...entries.values()];
    checkSize(result);
    return result;
  }

  window.MaesteBackup = Object.freeze({ normalize, serialize, merge, key });
})();
