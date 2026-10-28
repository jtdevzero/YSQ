import { PROMPTS, LEVELS } from './prompts.js';
import { MODES, COLORS, PACKS, THEMES, supportsMode, createGame, eligiblePrompts, currentTeamIndex, currentPresenter, currentChallenge, isOpenRound, roundNumber, currentMode, roundPoints, roundAwards, remaining, reveal, start, pause, record, beginOpenAward, awardOpen, cancelOpenAward, undo, finishRound, nextTurn, winners, restoreGame } from './game.js';
import { DIFFICULTIES, getDifficulty } from './difficulty.js';
import { parseCustomPack } from './custom-pack.js';
import { setupOffline } from './offline.js';

const $ = s => document.querySelector(s);
const $$ = s => [...document.querySelectorAll(s)];
const SAVE_KEY = 'ejfel-utan-game-v1';
const CUSTOM_KEY = 'ejfel-utan-custom-v1';
const esc = value => String(value).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
const icon = (name, cls = '') => `<svg class="${cls}" aria-hidden="true"><use href="#i-${name}"/></svg>`;
let game = null;
let savedGame = null;
let timerId = null;
let toastId;
let storageWarning = false;
let drawing = [];
let audioContext = null;
let customCards = [];
let customError = '';
let roleReadyKey = '';

function readCustomEditor() {
  return { text: $('#custom-prompts').value, modes: $$('input[name="custom-modes"]:checked').map(input => input.value), difficulty: $('#custom-difficulty').value };
}

function refreshCustom(save = false) {
  const settings = readCustomEditor();
  try { customCards = parseCustomPack(settings.text, settings); customError = ''; }
  catch (error) { customCards = []; customError = error.message; }
  $('#custom-error').textContent = customError;
  $('#custom-error').hidden = !customError;
  if (save) {
    try { localStorage.setItem(CUSTOM_KEY, JSON.stringify(settings)); }
    catch { notify('A saját pakli most nem menthető ezen az eszközön. A fájlba mentés gombbal megőrizhetitek.'); }
  }
}

function loadCustomEditor() {
  try {
    const settings = JSON.parse(localStorage.getItem(CUSTOM_KEY));
    if (settings && typeof settings.text === 'string' && settings.text.length <= 25000) {
      $('#custom-prompts').value = settings.text;
      if (['easy', 'medium', 'hard'].includes(settings.difficulty)) $('#custom-difficulty').value = settings.difficulty;
      if (Array.isArray(settings.modes)) $$('input[name="custom-modes"]').forEach(input => { input.checked = settings.modes.includes(input.value); });
    }
  } catch { /* The editor also works without local storage. */ }
  refreshCustom();
}

function exportCustom() {
  refreshCustom(true);
  if (customError || !customCards.length) { notify(customError || 'Előbb adjatok meg legalább egy saját feladványt.'); return; }
  const blob = new Blob([JSON.stringify({ version: 1, ...readCustomEditor() }, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url; link.download = 'ejfel-utan-sajat-pakli.json'; link.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

async function importCustom(file) {
  if (!file) return;
  try {
    if (file.size > 64000) throw new Error('Legfeljebb 64 kB méretű paklit tölts be.');
    const raw = await file.text();
    const settings = /\.json$/i.test(file.name) ? JSON.parse(raw) : { ...readCustomEditor(), text: raw };
    if (typeof settings?.text !== 'string' || settings.text.length > 25000) throw new Error('A fájl nem megfelelő saját paklit tartalmaz.');
    parseCustomPack(settings.text, settings);
    $('#custom-prompts').value = settings.text;
    $('#custom-difficulty').value = settings.difficulty || 'medium';
    $$('input[name="custom-modes"]').forEach(input => { input.checked = (settings.modes || ['describe', 'mime', 'draw']).includes(input.value); });
    $('#pack').value = 'custom';
    refreshCustom(true); updateLevel();
    notify('A saját paklit betöltöttük.');
  } catch (error) { notify(error instanceof SyntaxError ? 'A JSON-fájl nem olvasható. Tölts be saját paklit vagy egyszerű szövegfájlt.' : error.message); }
  finally { $('#import-custom').value = ''; }
}

function notify(message) {
  $('#toast').textContent = message;
  $('#toast').hidden = false;
  clearTimeout(toastId);
  toastId = setTimeout(() => { $('#toast').hidden = true; }, 4200);
}

function persist() {
  try { localStorage.setItem(SAVE_KEY, JSON.stringify(game)); }
  catch { if (!storageWarning) { storageWarning = true; notify('A böngésződ nem engedi a mentést. Ezt a lapot tartsátok nyitva a játék végéig.'); } }
}

function removeSave() { try { localStorage.removeItem(SAVE_KEY); } catch { /* Private browsing may block storage. */ } }

function addTeam(name = '') {
  const list = $('#team-list');
  if (list.children.length >= 6) return;
  const row = document.createElement('div');
  row.className = 'team-row';
  row.innerHTML = `<span class="team-number"></span><input class="team-input" type="text" maxlength="28" required autocomplete="off" value="${esc(name)}"><button class="icon-button" type="button" data-action="remove-team" title="Csapat törlése">×</button><label class="team-member-field"><span>Játékosok sorrendben, vesszővel elválasztva · nem kötelező</span><input class="team-players" type="text" maxlength="360" autocomplete="off" placeholder="Pl. Anna, Bence, Csilla"></label>`;
  list.append(row);
  updateTeams();
  if (!name) row.querySelector('input').focus();
}

function updateTeams() {
  const rows = $$('.team-row');
  rows.forEach((row, index) => {
    row.querySelector('.team-number').textContent = String(index + 1).padStart(2, '0');
    row.style.setProperty('--team-color', COLORS[index]);
    row.querySelector('input').setAttribute('aria-label', `${index + 1}. csapat neve`);
    row.querySelector('input').placeholder = `${index + 1}. csapat neve`;
    row.querySelector('.team-players').setAttribute('aria-label', `${index + 1}. csapat játékosai, vesszővel elválasztva`);
    row.querySelector('button').disabled = rows.length <= 2;
    row.querySelector('button').setAttribute('aria-label', `${index + 1}. csapat törlése`);
  });
  $('#add-team').disabled = rows.length >= 6;
  updateEstimate();
}

function updateEstimate() {
  const minutes = Math.round($$('.team-row').length * Number($('#duration').value) * Number($('#rounds').value) / 60);
  $('#game-estimate').textContent = `Kb. ${minutes} perc, plusz a nevetés.`;
  updateOpenInfo();
}

function updateOpenInfo() {
  const setting = $('#open-rounds').value;
  $('#open-round-help').textContent = setting === 'off' ? 'Minden csapat csak a saját fordulójában találgat.' : `${setting === 'all' ? 'Minden teljes körben' : `Az utolsó (${$('#rounds').value}.) teljes körben`} az előadón kívül mindenki találgathat. A Megvan gomb után válaszd ki a megfejtő csapatot. A fordított lapokon csak a saját csapat játszik.`;
}

function updateModeInfo() {
  const selected = $$('input[name="modes"]:checked').map(input => input.value);
  const modes = selected.map(mode => MODES[mode].name);
  const rotation = $('#mode-rotation').value;
  const pool = selectionPool();
  const counts = Object.fromEntries(Object.keys(MODES).map(mode => [mode, pool.filter(prompt => supportsMode(prompt, mode)).length]));
  $$('[data-mode-count]').forEach(label => { label.textContent = `${counts[label.dataset.modeCount]} lap`; });
  const minimum = $('#double-cards').checked ? 2 : 1;
  const unavailable = selected.filter(mode => counts[mode] < minimum);
  const warning = $('#pack').value === 'custom' && customError ? customError : !pool.length ? ($('#pack').value === 'custom' ? 'Adj meg saját lapokat, és válassz hozzájuk megfelelő nehézséget.' : 'Ezzel a téma- és nehézségszűréssel nincs lap. Bővítsd a választást.') : !modes.length ? 'Válassz legalább egy feladattípust.' : unavailable.length ? `Legalább ${minimum} megfelelő lap kell: ${unavailable.map(mode => MODES[mode].name).join(', ')}. Bővítsd a szűrést vagy kapcsold ki ezt a típust.` : '';
  $('#mode-order').textContent = warning || (modes.length === 1 ? `Csak ${modes[0].toLocaleLowerCase('hu')} lesz.` : `${rotation === 'cards' ? 'Lapról lapra' : 'Csapatkörönként'}: ${modes.join(' → ')}.`);
  $('#mode-order').classList.toggle('is-warning', Boolean(warning));
  $('#start-game').disabled = Boolean(warning);
}

function selectedThemes() { return $$('input[name="themes"]:checked').map(input => input.value); }
function selectedCatalog() { return $('#pack').value === 'custom' ? customCards : PROMPTS; }
function selectionPool() { return eligiblePrompts(selectedCatalog(), $('input[name="level"]:checked').value, $('#pack').value, selectedThemes(), $('#difficulty').value); }

function updateSelection() {
  const themes = selectedThemes();
  const pool = selectionPool();
  $('#deck-info').textContent = `${pool.length} feladvány · ${themes.length} téma · ${DIFFICULTIES[$('#difficulty').value].toLocaleLowerCase('hu')}`;
  updateModeInfo();
}

function updateLevel() {
  const level = $('input[name="level"]:checked').value;
  const pack = $('#pack').value;
  $$('.level-option').forEach(el => el.classList.toggle('is-selected', el.querySelector('input').checked));
  $('#level-options').hidden = pack !== 'mixed';
  $('#level-help').hidden = pack !== 'mixed';
  $('#custom-editor').hidden = pack !== 'custom';
  $('#pack-description').textContent = PACKS[pack].description;
  $$('#pack option').forEach(option => { option.textContent = `${PACKS[option.value].name} · ${eligiblePrompts(option.value === 'custom' ? customCards : PROMPTS, level, option.value).length} lap`; });
  const pool = eligiblePrompts(selectedCatalog(), level, pack);
  $('#theme-options').innerHTML = Object.entries(THEMES).map(([id, name]) => {
    const count = pool.filter(prompt => prompt.themes.includes(id)).length;
    return count ? `<label class="theme-chip"><input type="checkbox" name="themes" value="${id}" form="setup-form" checked><span>${name}</span><small>${count}</small></label>` : '';
  }).join('');
  $('#prompt-count').textContent = PROMPTS.length;
  updateSelection();
}

function goToGame() {
  $('#lobby').hidden = true;
  $('#game-page').hidden = false;
  render();
  window.scrollTo({ top: 0, behavior: 'instant' });
}

function scoreBoard() {
  return `<div class="scoreboard" aria-label="Pontállás">${game.teams.map((team, index) => `<div class="team-score ${index === currentTeamIndex(game) && game.phase !== 'finished' ? 'is-current' : ''}" style="--team-color:${COLORS[index]}"><span class="team-dot"></span><span>${esc(team.name)}</span><strong class="score-value">${team.score}</strong></div>`).join('')}</div>`;
}

function turnHasOpenRules() {
  return game.config.modes.some(mode => mode !== 'reverse') && (game.config.openRounds === 'all' || (game.config.openRounds === 'final' && roundNumber(game) === game.config.rounds));
}

function roleKey() { return `${game.turn}:${game.entries.length}:${game.current?.id}`; }
function needsRoleCheck() {
  return ['ready', 'playing'].includes(game.phase) && roleReadyKey !== roleKey() && (currentMode(game) === 'reverse' || game.entries.at(-1)?.mode === 'reverse');
}

function sideBar() {
  const mode = MODES[currentMode(game)];
  const reversed = currentMode(game) === 'reverse';
  const sharedPoints = turnHasOpenRules();
  const level = LEVELS.find(l => l.id === game.config.level);
  const packName = (game.config.pack ?? 'mixed') === 'mixed' ? level?.label : PACKS[game.config.pack].name;
  const themeNames = game.config.themes?.map(theme => THEMES[theme]).join(' · ') || 'Minden téma';
  return `<aside class="round-sidebar"><div class="panel"><span class="eyebrow">${sharedPoints ? 'A KÖR PONTJAI CSAPATONKÉNT' : 'EBBEN A KÖRBEN'}</span><div class="round-points"><strong id="live-points">${roundPoints(game)}</strong><span>megfejtés ebben a körben</span></div><div class="log-list" id="live-log">${liveLog()}</div>${sharedPoints ? awardSummary() : ''}<p class="helper">${game.config.doubleCards ? 'Mindkét kifejezés együtt +1' : 'Megfejtés +1'} · Passz 0</p></div><div class="panel mini-rules"><span class="field-label">${esc(mode.name)}</span><p class="helper">${reversed ? 'Most ő találgat' : 'Előadó'}: <strong>${esc(currentPresenter(game))}</strong></p><p class="helper">${esc(mode.rule)}</p><p class="helper">${esc(packName || '')} pakli · ${game.config.duration} mp</p><p class="helper">${esc(themeNames)} · ${esc(DIFFICULTIES[game.config.difficulty || 'all'])}</p><p class="helper">${reversed ? 'A lapot csak a saját csapat többi tagja nézze; a találgató ne lássa.' : 'A feladványt csak az előadó láthatja.'}</p></div></aside>`;
}

function entryDetails(entry) {
  const parts = [entry.mode ? MODES[entry.mode].name : '', turnHasOpenRules() && entry.result === 'correct' ? game.teams[entry.awardTeam ?? currentTeamIndex(game)].name : ''].filter(Boolean);
  return parts.length ? `<small class="log-mode">${esc(parts.join(' · '))}</small>` : '';
}

function awardSummary() {
  return `<div class="award-summary">${roundAwards(game).map((points, index) => points ? `<div><span>${esc(game.teams[index].name)}</span><strong>+${points}</strong></div>` : '').join('')}</div>`;
}

function liveLog() {
  if (!game.entries.length) return '<p class="empty-note">Az első nagy megfejtésre várunk.</p>';
  return game.entries.slice(-6).reverse().map(e => `<div class="log-item" data-result="${e.result}"><span>${esc(e.text)}${entryDetails(e)}</span><strong>${e.result === 'correct' ? '+1' : 'passz'}</strong></div>`).join('');
}

function render() {
  if (game.phase === 'paused') roleReadyKey = '';
  if ($('#canvas-modal').open) { restoreCanvas(); $('#canvas-modal').close(); }
  if ($('#award-modal').open) $('#award-modal').close();
  clearInterval(timerId);
  timerId = null;
  const finished = game.phase === 'finished';
  const team = game.teams[currentTeamIndex(game)];
  const heading = `<div class="game-topline"><span class="round-label">${finished ? 'EZ EGY JÓ ESTE VOLT' : `${roundNumber(game)}. KÖR / ${game.config.rounds} · ${currentTeamIndex(game) + 1}. CSAPAT${isOpenRound(game) ? ' · NYÍLT KÖR' : ''}`}</span><button class="button button-quiet" data-action="reset">Új játék</button></div>${scoreBoard()}`;
  $('#game-content').innerHTML = heading + (finished ? renderFinish() : `<div class="game-layout"><section class="panel play-panel" style="--team-color:${COLORS[currentTeamIndex(game)]}">${renderPhase(team)}</section>${sideBar()}</div>`);
  if (['ready', 'playing'].includes(game.phase) && currentMode(game) === 'draw' && $('#drawing-canvas')) setupCanvas();
  if (game.phase === 'playing') {
    timerId = setInterval(tick, 100);
    tick();
  }
  const focus = $('#game-content [data-autofocus]');
  if (focus) focus.focus({ preventScroll: true });
  persist();
  if (game.phase === 'award') {
    $('#award-teams').innerHTML = game.teams.map((entry, index) => `<button class="award-team-button" data-action="award-open" data-team="${index}" style="--team-color:${COLORS[index]}"><span class="team-dot"></span><span>${esc(entry.name)}</span><strong>+1</strong></button>`).join('');
    $('#award-modal').showModal();
  }
}

function modeCard() {
  const mode = MODES[currentMode(game)];
  const next = game.config.modes[(game.config.modes.indexOf(currentMode(game)) + 1) % game.config.modes.length];
  const note = game.config.modes.length === 1 ? 'Ebben a játékban csak ez a típus szerepel.' : game.config.modeRotation === 'cards' ? `Következő lap: ${MODES[next].name}` : 'Ez a típus marad a csapatkör végéig.';
  return `<div class="mode-card" data-mode="${currentMode(game)}"><span class="mode-icon">${icon(mode.icon)}</span><span><strong class="mode-name">Most: ${mode.name}</strong><span class="mode-rule">${mode.rule}</span><span class="mode-next">${note}</span></span></div>`;
}

function promptCard() {
  const parts = game.current.parts || [game.current];
  const themes = [...new Set(parts.flatMap(part => part.themes || []))].map(theme => THEMES[theme]).join(' · ');
  const reversed = currentMode(game) === 'reverse';
  return `<div class="prompt-card ${parts.length === 2 ? 'paired-card' : ''}"><div class="prompt-meta"><span>${reversed ? 'CSAK A MUTOGATÓ CSAPATTAGOKNAK' : 'CSAK AZ ELŐADÓNAK'}</span><span>${parts.length === 2 ? 'KÉTLAPOS KIHÍVÁS' : esc(LEVELS.find(l => l.id === game.current.level)?.label || '')}</span></div><h2 class="prompt-word" id="prompt-word" aria-live="polite" aria-atomic="true">${parts.map((part, i) => `${i ? '<span class="pair-plus" aria-hidden="true">+</span>' : ''}<span class="prompt-part">${esc(part.text)}<small class="difficulty-badge">${esc(DIFFICULTIES[getDifficulty(part)])}</small></span>`).join('')}</h2>${parts.length === 2 ? '<p class="pair-rule">Egy közös jelenetben vagy rajzban jelenjen meg mindkettő. Az 1 pontért mindkét kifejezést ki kell találni.</p>' : ''}${themes ? `<span class="prompt-theme">${esc(themes)}</span>` : ''}</div>`;
}

function challengeCard() {
  const challenge = currentChallenge(game);
  return challenge ? `<div class="challenge-card"><strong>✳ KÁOSZKÖR</strong><p>${esc(challenge)}</p></div>` : '';
}

function timerMarkup() {
  return `<div class="timer" id="timer"><strong class="timer-digits" id="timer-digits" role="timer" aria-label="Hátralévő másodpercek">${Math.ceil(remaining(game) / 1000)}</strong><span class="timer-label">másodperc</span></div><div class="timer-track"><div class="timer-fill" id="timer-fill"></div></div>`;
}

function drawingMarkup() {
  if (currentMode(game) !== 'draw') return '';
  return `<div class="canvas-wrap"><div class="drawing-tools"><span class="helper">Rajzoljatok ide vagy papírra.</span><button class="button button-quiet" data-action="show-canvas" type="button">Csapatnézet ↗</button><button class="button button-quiet" data-action="clear-drawing" type="button">Törlés</button></div><canvas class="drawing-canvas" id="drawing-canvas" width="900" height="440" aria-label="Rajzvászon: húzd az egeret vagy az ujjad a rajzoláshoz"></canvas><p class="helper canvas-note">A Csapatnézet elrejti a feladványt, így megmutathatjátok a rajzot. Papíron is játszhattok.</p></div>`;
}

function renderPhase(team) {
  const presenter = currentPresenter(game);
  const open = isOpenRound(game);
  const reversed = currentMode(game) === 'reverse';
  const notice = open ? '<p class="open-notice">Nyílt kör: az előadón kívül bárki tippelhet, a saját csapata is. A pontot a megfejtő csapat kapja.</p>' : '';
  if (game.phase === 'handoff') return `<span class="phase-pill ${open ? 'open-pill' : ''}">${open ? 'NYÍLT KÖR · MINDEN CSAPAT JÁTSZIK' : 'MOST TI JÖTTÖK'}</span><h1 class="turn-heading">${esc(team.name)}<span class="brand-dot">.</span></h1><div class="presenter-card"><span>${reversed ? 'Most ő találgat' : 'Most ő ad elő'}</span><strong>${esc(presenter)}</strong></div><p class="turn-note">${reversed ? `${esc(presenter)} forduljon el a képernyőtől.<br>A telefont a csapat többi tagja vegye kézbe!` : `${esc(presenter)} vegye kézbe a telefont.<br>A következő lapot már csak ő nézheti!`}</p>${notice}<div class="handoff-graphic" aria-hidden="true">${icon('moon')}<span>pszt.</span></div>${modeCard()}<button class="button button-primary" data-action="reveal" data-autofocus>${reversed ? 'A mutogató csapat készen áll' : 'Én vagyok az előadó'} <span aria-hidden="true">↗</span></button><p class="helper">A lap felfedése még nem indítja el az órát.</p>`;
  if (game.phase === 'award') return `<span class="phase-pill open-pill">NYÍLT KÖR · MEGFEJTÉS JELÖLVE</span><h1 class="turn-heading">Kié a pont?</h1><p class="turn-note">Válaszd ki a megfejtő csapatot. A feladvány rejtve marad, az óra most áll.</p>${timerMarkup()}`;
  if (game.phase === 'paused') return `<span class="phase-pill">EGY KIS SZUSSZANÁS</span><h1 class="turn-heading">Tartunk egy<br>szünetet<span class="brand-dot">.</span></h1><p class="turn-note">A lapot elrejtettük. ${reversed ? `${esc(presenter)} találgat; a telefont a csapat többi tagja vegye vissza.` : `A folytatáshoz ${esc(presenter)} vegye vissza a telefont.`}</p>${timerMarkup()}<button class="button button-primary" data-action="resume" data-autofocus>Folytatjuk <span aria-hidden="true">↗</span></button><button class="button button-quiet" data-action="end-round">Kör lezárása</button>`;
  if (game.phase === 'summary') {
    const sharedPoints = turnHasOpenRules();
    const pts = roundPoints(game);
    const last = game.turn + 1 >= game.teams.length * game.config.rounds;
    const modeLabel = game.config.modeRotation === 'cards' && game.config.modes.length > 1 ? 'Váltakozó feladattípusok' : MODES[currentMode(game)].name;
    return `<div class="round-summary"><span class="phase-pill ${sharedPoints ? 'open-pill' : ''}">${sharedPoints ? 'NYÍLT KÖR LEZÁRVA' : 'KÖR LEZÁRVA'}</span><h1 class="turn-heading">${pts ? 'Ez szép volt!' : 'A következő jobb lesz!'}<span class="brand-dot">.</span></h1><p class="turn-note">${esc(team.name)} · Soros játékos: ${esc(presenter)}<br>${modeLabel}</p><div class="summary-number">+${pts}<span>${sharedPoints ? 'pont kiosztva a csapatoknak' : 'pont ebben a körben'}</span></div>${sharedPoints ? awardSummary() : ''}<div class="result-list">${game.entries.length ? game.entries.map(e => `<div class="result-item"><span>${esc(e.text)}${entryDetails(e)}</span><strong>${e.result === 'correct' ? '+1' : 'passz'}</strong></div>`).join('') : '<p class="helper">Ebben a körben nem született megfejtés.</p>'}</div><button class="button button-primary" data-action="next-turn" data-autofocus>${last ? 'Jöjjön az eredmény' : 'Következő csapat'} <span aria-hidden="true">↗</span></button></div>`;
  }
  if (needsRoleCheck()) return `<span class="phase-pill">SZEREPCSERE · A LAP MÉG REJTVE</span><h1 class="turn-heading">${reversed ? 'Most a csapat mutogat.' : 'Vissza az előadóhoz.'}</h1><p class="turn-note">${reversed ? `<strong>${esc(presenter)}</strong> találgat, forduljon el a képernyőtől. A saját csapat többi tagja vegye kézbe a telefont; csak ők nézhetik a lapot.` : `<strong>${esc(presenter)}</strong> vegye vissza a telefont. A csapattársak már ne nézzék a képernyőt.`}</p>${modeCard()}${game.phase === 'playing' ? timerMarkup() : ''}<button class="button button-primary" data-action="ready-role" data-autofocus>${reversed ? 'A mutogatók nézik a telefont' : 'Csak az előadó nézi'}</button><p class="helper">${game.phase === 'playing' ? 'Az idő közben tovább telik. ' : ''}A következő gombnyomás felfedi a lapot.</p>${game.phase === 'playing' ? '<button class="button button-quiet" data-action="pause">Ⅱ Szünet</button>' : ''}`;
  return `<span class="phase-pill ${open ? 'open-pill' : ''}">${open ? 'NYÍLT KÖR' : esc(team.name)} · ${esc(presenter)}${reversed ? ' TALÁLGAT' : ''}</span>${notice}${modeCard()}${challengeCard()}${promptCard()}${game.phase === 'ready' ? `<p class="helper">Jegyezzétek meg a feladványt, aztán indulhat!</p><button class="button button-primary" data-action="start" data-autofocus>Induljon az idő! <span aria-hidden="true">↗</span></button>` : `${timerMarkup()}<div class="action-row"><button class="button button-secondary" data-action="pass">Passz <span aria-hidden="true">↪</span></button><button class="button button-primary" data-action="correct" data-autofocus>Megvan! <span>+1</span></button></div><div class="action-row secondary-actions"><button class="button button-quiet" id="undo-button" data-action="undo" ${!game.entries.length ? 'disabled' : ''}>↶ Visszavonás</button><button class="button button-quiet" data-action="pause">Ⅱ Szünet</button><button class="button button-quiet" data-action="sound" aria-pressed="${soundOn}">${soundOn ? 'Hang: be' : 'Hang: ki'}</button></div>`}${drawingMarkup()}`;
}

function renderFinish() {
  const winning = winners(game);
  const max = Math.max(1, ...game.teams.map(t => t.score));
  const ranked = game.teams.map((t, i) => ({ ...t, color: COLORS[i] })).sort((a, b) => b.score - a.score);
  return `<section class="panel round-summary finish-panel"><div class="winner-mark" aria-hidden="true">${icon('star')}</div><span class="eyebrow">A DICSŐSÉG MA ESTÉRE</span><h1 class="turn-heading">${winning.length > 1 ? 'Közös győzelem!' : `${esc(winning[0].name)} nyert!`}</h1><p class="turn-note">${winning.length > 1 ? winning.map(t => esc(t.name)).join(' & ') : 'Az előadásotokra még holnap is emlékezni fogunk.'}</p><div class="result-list final-scores">${ranked.map(t => `<div class="final-score"><div class="result-item"><span><span class="rank-number">${ranked.findIndex(other => other.score === t.score) + 1}.</span> ${esc(t.name)}</span><strong>${t.score} pont</strong></div><div class="score-track"><div class="score-track-fill" style="width:${t.score / max * 100}%;background:${t.color}"></div></div></div>`).join('')}</div><p class="helper">${game.config.rounds} kör csapatonként · ${game.teams.reduce((sum, t) => sum + t.score, 0)} közös megfejtés</p><div class="action-row"><button class="button button-secondary" data-action="reset">Új csapatok</button><button class="button button-primary" data-action="rematch" data-autofocus>Visszavágót! <span aria-hidden="true">↗</span></button></div></section>`;
}

let soundOn = true;
let lastBeep = 0;
function unlockAudio() {
  try { audioContext ||= new (window.AudioContext || window.webkitAudioContext)(); audioContext.resume().catch(() => {}); } catch { /* Sound is optional. */ }
}
function beep(final = false) {
  if (!soundOn || !audioContext || audioContext.state !== 'running') return;
  try {
    const osc = audioContext.createOscillator(), gain = audioContext.createGain();
    osc.connect(gain); gain.connect(audioContext.destination);
    osc.frequency.value = final ? 440 : 760;
    gain.gain.setValueAtTime(0.12, audioContext.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.001, audioContext.currentTime + (final ? 0.6 : 0.12));
    osc.start(); osc.stop(audioContext.currentTime + (final ? 0.65 : 0.15));
  } catch { /* Browsers may suspend audio when backgrounded. */ }
}

function tick() {
  if (game?.phase !== 'playing') return;
  const ms = remaining(game);
  const seconds = Math.ceil(ms / 1000);
  if ($('#timer-digits')) $('#timer-digits').textContent = seconds;
  if ($('#canvas-time')) $('#canvas-time').textContent = seconds;
  if ($('#timer-fill')) $('#timer-fill').style.width = `${ms / (game.config.duration * 1000) * 100}%`;
  $('#timer')?.classList.toggle('is-danger', seconds <= 10);
  if (seconds > 0 && seconds <= 3 && seconds !== lastBeep) { lastBeep = seconds; beep(); }
  if (ms <= 0) {
    beep(true);
    finishRound(game);
    drawing = [];
    render();
    notify('Lejárt az idő! Jöhet a következő csapat.');
  }
}

function recordAnswer(result) {
  if (!game || game.phase !== 'playing') return;
  if (remaining(game) <= 0) { tick(); return; }
  if (result === 'correct' && isOpenRound(game)) { beginOpenAward(game); render(); return; }
  record(game, result);
  drawing = [];
  render();
}

function resetToLobby() {
  clearInterval(timerId);
  game = null; savedGame = null; drawing = []; roleReadyKey = '';
  removeSave();
  $('#confirm-modal').close();
  $('#award-modal').close();
  $('#lobby').hidden = false;
  $('#game-page').hidden = true;
  window.scrollTo({ top: $('.section-heading').offsetTop - 20, behavior: 'smooth' });
  $('#team-list input').focus({ preventScroll: true });
}

function clearCanvas() {
  drawing = [];
  const canvas = $('#drawing-canvas');
  if (canvas) canvas.getContext('2d')?.clearRect(0, 0, canvas.width, canvas.height);
}

function restoreCanvas() {
  const shared = $('#shared-canvas canvas');
  const home = $('.canvas-wrap');
  if (shared && home) home.insertBefore(shared, home.querySelector('.canvas-note'));
}

function setupCanvas() {
  const canvas = $('#drawing-canvas');
  const ctx = canvas.getContext('2d');
  if (!ctx) return;
  ctx.strokeStyle = '#27202e'; ctx.lineWidth = 5; ctx.lineCap = 'round'; ctx.lineJoin = 'round';
  const line = points => {
    if (!points.length) return;
    ctx.beginPath(); ctx.moveTo(points[0].x, points[0].y);
    if (points.length === 1) ctx.lineTo(points[0].x + 0.1, points[0].y + 0.1);
    else points.slice(1).forEach(p => ctx.lineTo(p.x, p.y));
    ctx.stroke();
  };
  drawing.forEach(line);
  let activeStroke = null;
  const point = event => { const r = canvas.getBoundingClientRect(); return { x: (event.clientX - r.left) * canvas.width / r.width, y: (event.clientY - r.top) * canvas.height / r.height }; };
  canvas.addEventListener('pointerdown', event => {
    if (event.button !== 0) return;
    canvas.setPointerCapture(event.pointerId);
    activeStroke = [point(event)]; drawing.push(activeStroke); line(activeStroke);
  });
  canvas.addEventListener('pointermove', event => {
    if (!activeStroke) return;
    activeStroke.push(point(event)); line(activeStroke.slice(-2));
  });
  const end = () => { activeStroke = null; };
  canvas.addEventListener('pointerup', end);
  canvas.addEventListener('pointercancel', end);
}

document.addEventListener('click', event => {
  const button = event.target.closest('[data-action]');
  if (!button || button.disabled) return;
  const action = button.dataset.action;
  if (action === 'themes-all' || action === 'themes-none') { $$('input[name="themes"]').forEach(input => { input.checked = action === 'themes-all'; }); updateSelection(); }
  if (action === 'remove-team') { button.closest('.team-row').remove(); updateTeams(); }
  if (action === 'export-custom') exportCustom();
  if (action === 'reveal') { drawing = []; reveal(game); render(); }
  if (action === 'ready-role') { roleReadyKey = roleKey(); render(); }
  if (action === 'start' || action === 'resume') { unlockAudio(); lastBeep = 0; start(game); render(); }
  if (action === 'correct' || action === 'pass') recordAnswer(action === 'correct' ? 'correct' : 'pass');
  if (action === 'award-open') { if (awardOpen(game, Number(button.dataset.team))) { drawing = []; render(); } }
  if (action === 'cancel-award') { cancelOpenAward(game); render(); }
  if (action === 'pause') { pause(game); render(); }
  if (action === 'undo') { if (undo(game)) { drawing = []; render(); } }
  if (action === 'next-turn') { nextTurn(game); drawing = []; render(); window.scrollTo({ top: 0, behavior: 'instant' }); }
  if (action === 'clear-drawing') clearCanvas();
  if (action === 'show-canvas') {
    $('#shared-canvas').append($('#drawing-canvas'));
    $('#canvas-time').textContent = Math.ceil(remaining(game) / 1000);
    $('#canvas-modal').showModal();
  }
  if (action === 'close-canvas') { restoreCanvas(); $('#canvas-modal').close(); }
  if (action === 'sound') { soundOn = !soundOn; button.textContent = soundOn ? 'Hang: be' : 'Hang: ki'; button.setAttribute('aria-pressed', String(soundOn)); if (soundOn) unlockAudio(); }
  if (action === 'end-round') { finishRound(game); render(); }
  if (action === 'reset') { if (game?.phase === 'playing') { pause(game); render(); } $('#confirm-modal').showModal(); }
  if (action === 'cancel-reset') $('#confirm-modal').close();
  if (action === 'confirm-reset') resetToLobby();
  if (action === 'rematch') { game = createGame(game.config, game.config.pack === 'custom' ? game.pool : PROMPTS); drawing = []; roleReadyKey = ''; render(); window.scrollTo({ top: 0, behavior: 'instant' }); }
  if (action === 'close-rules') $('#rules-modal').close();
  if (action === 'discard-save') { savedGame = null; removeSave(); $('#resume-modal').close(); }
  if (action === 'resume-save') { game = savedGame; savedGame = null; $('#resume-modal').close(); goToGame(); }
});

$('#setup-form').addEventListener('submit', event => {
  event.preventDefault();
  const config = { teams: $$('.team-input').map(input => input.value), duration: Number($('#duration').value), rounds: Number($('#rounds').value), level: $('input[name="level"]:checked').value, modes: $$('input[name="modes"]:checked').map(el => el.value), pack: $('#pack').value, modeRotation: $('#mode-rotation').value, themes: selectedThemes(), openRounds: $('#open-rounds').value, players: $$('.team-players').map(input => input.value.split(/[,;\n]+/).map(name => name.trim()).filter(Boolean)), difficulty: $('#difficulty').value, chaos: $('#chaos').checked, doubleCards: $('#double-cards').checked };
  try {
    if (config.pack === 'custom') { refreshCustom(true); if (customError) throw new Error(customError); }
    game = createGame(config, selectedCatalog()); $('#setup-error').hidden = true; drawing = []; roleReadyKey = ''; goToGame();
  }
  catch (error) { $('#setup-error').textContent = error.message; $('#setup-error').hidden = false; }
});
$('#add-team').addEventListener('click', () => addTeam());
$('#duration').addEventListener('change', updateEstimate);
$('#rounds').addEventListener('change', updateEstimate);
$('#open-rounds').addEventListener('change', updateOpenInfo);
$('#pack').addEventListener('change', updateLevel);
$('#theme-options').addEventListener('change', updateSelection);
$('#difficulty').addEventListener('change', updateSelection);
$('#double-cards').addEventListener('change', updateModeInfo);
$('#custom-prompts').addEventListener('input', () => { refreshCustom(true); updateLevel(); });
$('#custom-difficulty').addEventListener('change', () => { refreshCustom(true); updateLevel(); });
$$('input[name="custom-modes"]').forEach(input => input.addEventListener('change', () => { refreshCustom(true); updateLevel(); }));
$('#import-custom').addEventListener('change', event => { importCustom(event.target.files[0]); });
$('#mode-rotation').addEventListener('change', updateModeInfo);
$$('input[name="modes"]').forEach(input => input.addEventListener('change', updateModeInfo));
$$('input[name="level"]').forEach(input => input.addEventListener('change', updateLevel));
$('#rules-button').addEventListener('click', () => {
  if (game?.phase === 'playing') { pause(game); render(); }
  $('#rules-modal').showModal();
});
$('#brand-link').addEventListener('click', event => {
  event.preventDefault();
  if (game) { if (game.phase === 'playing') { pause(game); render(); } $('#confirm-modal').showModal(); }
  else window.scrollTo({ top: 0, behavior: 'smooth' });
});
document.addEventListener('visibilitychange', () => { if (!document.hidden && game?.phase === 'playing') tick(); });
window.addEventListener('pagehide', () => { if (game) persist(); });
$('#canvas-modal').addEventListener('close', restoreCanvas);
$('#award-modal').addEventListener('cancel', event => { event.preventDefault(); if (game?.phase === 'award') { cancelOpenAward(game); render(); } });

loadCustomEditor();
addTeam('Éjjeli baglyok');
addTeam('Másnapos zsenik');
updateLevel();
updateModeInfo();
try { savedGame = restoreGame(localStorage.getItem(SAVE_KEY)); } catch { /* Start fresh when storage is unavailable. */ }
if (savedGame) {
  $('#resume-description').textContent = `${savedGame.teams.map(t => t.name).join(' · ')} — ${savedGame.phase === 'finished' ? 'befejezett játék' : `${Math.min(roundNumber(savedGame), savedGame.config.rounds)}. kör / ${savedGame.config.rounds}`}`;
  if (savedGame.config.modeRotation === 'rounds') $('#resume-description').textContent += '. Ez a mentés csapatkörönként vált típust. Az új, laponkénti váltáshoz indíts új játékot.';
  if (!savedGame.config.matchModes) $('#resume-description').textContent += ' A témaszűrőkhöz és a módhoz illő lapokhoz indíts új játékot.';
  $('#resume-modal').showModal();
}
setupOffline();
