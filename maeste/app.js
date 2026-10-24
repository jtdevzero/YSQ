(() => {
  'use strict';
  const $ = (selector, root = document) => root.querySelector(selector);
  const $$ = (selector, root = document) => [...root.querySelectorAll(selector)];
  const esc = value => String(value ?? '').replace(/[&<>"']/g, character => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[character]));
  const image = (path, size = 'w500') => typeof path === 'string' && /^\/[A-Za-z0-9._/-]+$/.test(path) ? `https://image.tmdb.org/t/p/${size}${path}` : '';
  const read = (key, fallback) => { try { return JSON.parse(localStorage.getItem(key)) ?? fallback; } catch { return fallback; } };
  const save = (key, value) => { try { localStorage.setItem(key, JSON.stringify(value)); } catch { /* The app also works with session-only preferences. */ } };
  const configuredApi = $('meta[name="maeste-api-origin"]')?.content.trim();
  const apiOrigin = configuredApi ? new URL(configuredApi).origin : location.origin;
  let accessToken = ''; try { accessToken = sessionStorage.getItem('maeste.access') || ''; } catch { /* Session access also works in memory. */ }
  let accessLocked = true, accessRequired = true, accessBusy = false, accessEpoch = 0, accessBootstrapSerial = 0;
  const pendingRequests = new Set();
  function saveAccessToken(token) { accessToken = typeof token === 'string' ? token : ''; try { if (accessToken) sessionStorage.setItem('maeste.access', accessToken); else sessionStorage.removeItem('maeste.access'); } catch { /* Keep only in memory when storage is unavailable. */ } }
  function accessError(message = '') { $('#access-error').textContent = message; $('#access-error').hidden = !message; }
  function accessLoading(busy, message = '') {
    accessBusy = busy; $('#access-submit').disabled = busy; $('#access-password').disabled = busy; $('#access-retry').disabled = busy;
    $('#access-status').textContent = message; $('#access-status').hidden = !message;
    $('#access-gate').setAttribute('aria-busy', String(busy));
  }
  function lockAccess(message = '', showPassword = true) {
    accessLocked = true; accessEpoch++; saveAccessToken('');
    for (const controller of pendingRequests) controller.abort(); pendingRequests.clear();
    state.discoverSerial++; state.configSerial++; state.detailsSerial++; state.roomRevision++; state.libraryMutation++;
    cancelSearch(); state.pollBusy = false; state.busy = false; state.libraryBusy = false; state.configReady = false;
    for (const dialog of $$('dialog[open]')) dialog.close();
    $('#filters-panel').classList.remove('is-open'); $('#filters-backdrop').hidden = true; document.body.classList.remove('sheet-open');
    clearTimeout(state.toastTimer); $('#toast').hidden = true;
    $('.app-shell').hidden = true; $('#access-gate').hidden = false; $('#access-form').hidden = !showPassword;
    $('#access-retry').hidden = showPassword; $('#access-password').value = ''; accessLoading(false); accessError(message);
    if (showPassword) $('#access-password').focus({ preventScroll: true });
  }
  async function enterApp() {
    accessLocked = false; $('#access-gate').hidden = true; $('.app-shell').hidden = false; $('#access-logout').hidden = !accessRequired;
    accessLoading(false); accessError(); $('#access-password').value = '';
    await initialize();
  }
  async function checkAccess() {
    if (accessBusy) return;
    const serial = ++accessBootstrapSerial;
    accessLoading(true, 'Belépés ellenőrzése…'); accessError(); $('#access-form').hidden = true; $('#access-retry').hidden = true;
    try {
      const data = await api('/api/access/status');
      if (serial !== accessBootstrapSerial) return;
      accessRequired = data.required !== false;
      if (!accessRequired || data.authenticated === true) { if (!accessRequired) saveAccessToken(''); await enterApp(); }
      else lockAccess();
    } catch (error) { if (serial === accessBootstrapSerial) lockAccess(error.message, false); }
    finally { if (serial === accessBootstrapSerial && accessLocked) accessLoading(false); }
  }
  async function unlockAccess(event) {
    event.preventDefault(); if (accessBusy) return;
    const input = $('#access-password'), password = input.value;
    if (!password) { input.reportValidity(); return; }
    const serial = ++accessBootstrapSerial;
    accessLoading(true, 'Egy pillanat, nyitjuk a mozit…'); accessError();
    try {
      const data = await post('/api/access/unlock', { password });
      input.value = '';
      if (serial !== accessBootstrapSerial) return;
      if (typeof data.token !== 'string' || !data.token) throw new Error('A belépés nem sikerült. Próbáld újra.');
      saveAccessToken(data.token); accessRequired = true; await enterApp();
    } catch (error) { if (serial === accessBootstrapSerial) { accessLoading(false); accessError(error.message); input.value = ''; input.focus(); } }
    finally { if (serial === accessBootstrapSerial) accessLoading(false); }
  }
  const initialFilters = read('maeste.filters', {});
  const initialLikes = read('maeste.likes', []);
  const initialSeen = read('maeste.seen', []);
  const initialDismissed = read('maeste.dismissed', []);
  let profileToken = read('maeste.profile', null);
  if (typeof profileToken !== 'string' || !/^[a-f0-9]{64}$/.test(profileToken)) {
    const bytes = new Uint8Array(32); crypto.getRandomValues(bytes);
    profileToken = [...bytes].map(byte => byte.toString(16).padStart(2, '0')).join(''); save('maeste.profile', profileToken);
  }
  const state = { genres: [], providers: [], selectedProviders: new Set(), deck: [], page: 1, totalPages: 1, index: 0, likes: Array.isArray(initialLikes) ? initialLikes : [], history: [], room: null, busy: false, voting: false, pollBusy: false, pollErrors: 0, configReady: false, discoverSerial: 0, detailsSerial: 0, toastTimer: null, seen: Array.isArray(initialSeen) ? initialSeen : [], librarySynced: false, libraryStorage: 'device', libraryBusy: false, libraryMutation: 0, seenFailure: null, taste: read('maeste.taste', 'popular') === 'recommended' ? 'recommended' : 'popular', recommendation: null, appliedTaste: 'popular', decisionBusy: false, decisionError: '', decisionSignature: '', promptedDecisions: new Set(), autoSeenBusy: false, roomRevision: 0, currentDetails: null, mediaType: initialFilters.mediaType === 'tv' ? 'tv' : 'movie', configSerial: 0, availabilityCache: new Map(), availabilityPending: new Map(), roundBusy: false, roundError: '', roundRelaxNeeded: false, connection: navigator.onLine === false ? 'offline' : 'reconnecting', backupBusy: false, excludedGenres: new Set(), dismissed: Array.isArray(initialDismissed) ? initialDismissed : [], searchSerial: 0, searchController: null, searchItems: [], searchQuery: '', searchType: 'movie', searchPage: 1, searchNextPage: 2, searchHasMore: false, searchBusy: false, searchFailedMore: false, searchError: '', seenVoteHold: null };
  let lastOpener = null;
  const dialogOpeners = new WeakMap();
  const likedMovies = () => state.room ? (state.room.matches || []) : state.likes;
  const typeOf = movie => movie?.media_type === 'tv' || movie?.mediaType === 'tv' ? 'tv' : 'movie';
  const mediaKey = movie => `${typeOf(movie)}:${Number(movie.id)}`;
  const identity = (value, fallback = state.mediaType) => { if (value && typeof value === 'object') return { id: Number(value.id), media_type: typeOf(value) }; const match = /^(movie|tv):(\d+)$/.exec(String(value)); return match ? { id: Number(match[2]), media_type: match[1] } : { id: Number(value), media_type: fallback === 'tv' ? 'tv' : 'movie' }; };
  const roomVersion = (room = state.room) => Number.isSafeInteger(room?.roundVersion) ? room.roundVersion : 0;
  const noun = (type = state.mediaType) => type === 'tv' ? 'sorozat' : 'film';
  const title = movie => movie.title || movie.name || movie.original_title || movie.original_name || 'Ismeretlen cím';
  const year = movie => (movie.release_date || movie.first_air_date || '').slice(0, 4);
  const rating = movie => Number(movie.vote_average) > 0 ? Number(movie.vote_average).toFixed(1).replace('.', ',') : '';
  const genreNames = movie => (movie.genres || (movie.genre_ids || []).map(id => state.genres.find(genre => genre.id === id))).filter(Boolean).map(genre => genre.name);
  const filters = () => ({ mediaType: state.mediaType, providers: [...state.selectedProviders], genres: $('#genre-select').value ? [Number($('#genre-select').value)] : [], runtime: state.mediaType === 'tv' ? null : Number($('#runtime-select').value) || null, rating: Number($('#rating-select').value) || 0, yearFrom: $('#year-from')?.value.trim() ? Number($('#year-from').value) : null, yearTo: $('#year-to')?.value.trim() ? Number($('#year-to').value) : null, excludedGenres: [...state.excludedGenres] });

  function preferenceSummary(item) {
    return { id: Number(item.id), media_type: typeOf(item), title: title(item).slice(0, 300), release_date: String(item.release_date || item.first_air_date || '').slice(0, 10), poster_path: typeof item.poster_path === 'string' ? item.poster_path : null, backdrop_path: typeof item.backdrop_path === 'string' ? item.backdrop_path : null, overview: String(item.overview || '').slice(0, 2000), vote_average: Number(item.vote_average) || 0, vote_count: Number(item.vote_count) || 0, genre_ids: (item.genre_ids || (item.genres || []).map(genre => genre.id)).map(Number).filter(Number.isSafeInteger) };
  }
  function boundDismissed(items, likes = state.likes) {
    const positives = new Set(likes.map(mediaKey)), keys = new Set(), counts = { movie: 0, tv: 0 }, result = [];
    for (const item of [...(Array.isArray(items) ? items : [])].reverse()) {
      if (!item || !Number.isSafeInteger(Number(item.id)) || Number(item.id) < 1 || Number(item.id) > 999999999) continue;
      const key = mediaKey(item), type = typeOf(item);
      if (positives.has(key) || keys.has(key) || counts[type] >= 50) continue;
      keys.add(key); counts[type]++; result.unshift(preferenceSummary(item));
    }
    return result;
  }
  function persistDismissed() { state.dismissed = boundDismissed(state.dismissed); save('maeste.dismissed', state.dismissed); renderTaste(); renderRecommendation(); }
  function learnPreference(movie, choice) {
    if (choice !== 'no' && choice !== 'yes') return;
    const key = mediaKey(movie);
    state.dismissed = state.dismissed.filter(item => mediaKey(item) !== key);
    if (choice === 'no' && !state.likes.some(item => mediaKey(item) === key)) state.dismissed.push(preferenceSummary(movie));
    persistDismissed();
  }
  function renderExcludedGenres() {
    const element = $('#excluded-genres'); if (!element) return;
    element.innerHTML = state.genres.map(genre => `<button type="button" class="excluded-genre${state.excludedGenres.has(Number(genre.id)) ? ' selected' : ''}" data-excluded-genre="${Number(genre.id)}" aria-pressed="${state.excludedGenres.has(Number(genre.id))}">${esc(genre.name)}</button>`).join('');
    if ($('#exclusion-note')) $('#exclusion-note').textContent = state.excludedGenres.size ? `${state.excludedGenres.size} műfajt kizártál. Ezek a műfajok kimaradnak az ajánlásokból.` : 'A kiválasztott műfajokat kihagyjuk az ajánlásokból. A címkeresés a teljes katalógusban keres.';
  }
  function reconcileIncludedGenre() {
    const id = Number($('#genre-select').value); if (id) state.excludedGenres.delete(id);
    renderExcludedGenres(); syncMoodButtons(); renderSummary();
  }
  function validateYearFilters() {
    const from = $('#year-from'), to = $('#year-to'), max = new Date().getUTCFullYear() + 5;
    let message = '', invalid = null;
    for (const input of [from, to].filter(Boolean)) {
      input.min = '1870'; input.max = String(max); input.step = '1'; input.setCustomValidity(''); input.removeAttribute('aria-invalid');
      if (input.validity.badInput || (input.value.trim() && (!Number.isInteger(Number(input.value)) || Number(input.value) < 1870 || Number(input.value) > max))) { message = `Az év egész szám legyen 1870 és ${max} között.`; invalid = input; break; }
    }
    if (!message && from?.value.trim() && to?.value.trim() && Number(from.value) > Number(to.value)) { message = 'A kezdőév legfeljebb a záróév lehet.'; invalid = to; }
    if ($('#filter-validation')) { $('#filter-validation').textContent = message; $('#filter-validation').hidden = !message; }
    if (!message) return true;
    invalid?.setCustomValidity(message); invalid?.setAttribute('aria-invalid', 'true');
    if ($('#room-dialog').open) roomError(message);
    else { if (matchMedia('(max-width:640px)').matches) toggleFilters(true); invalid?.focus(); }
    return false;
  }
  function searchValidation(message = '') {
    const input = $('#title-search-input'); if (input) { input.setCustomValidity(message); if (message) input.setAttribute('aria-invalid', 'true'); else input.removeAttribute('aria-invalid'); }
    if ($('#title-search-validation')) { $('#title-search-validation').textContent = message; $('#title-search-validation').hidden = !message; }
    if (message) input?.focus();
  }
  function cancelSearch(close = false) {
    state.searchSerial++; state.searchController?.abort(); state.searchController = null; state.searchBusy = false;
    if ($('#title-search-submit')) $('#title-search-submit').disabled = false;
    if (close && $('#search-dialog')?.open) closeDialog($('#search-dialog'));
  }
  function renderSearchResults() {
    const results = $('#search-results'); if (!results) return;
    const likes = new Set(state.likes.map(mediaKey)), seen = new Set(state.seen.map(mediaKey));
    const locked = state.libraryBusy || state.backupBusy || state.voting || state.autoSeenBusy;
    results.innerHTML = state.searchItems.map(movie => {
      const key = mediaKey(movie), liked = likes.has(key), watched = seen.has(key), poster = image(movie.poster_path, 'w154');
      return `<article class="search-item">${poster ? `<img class="search-poster" src="${poster}" alt="" loading="lazy">` : '<div class="search-poster-placeholder" aria-hidden="true">✦</div>'}<div class="search-copy"><h3>${esc(title(movie))}</h3><p>${typeOf(movie) === 'tv' ? 'Sorozat' : 'Film'}${year(movie) ? ` · ${esc(year(movie))}` : ''}${rating(movie) ? ` · ★ ${rating(movie)}` : ''}</p><button type="button" class="candidate-details" data-details="${key}">Részletek és elérhetőség →</button></div><div class="search-actions"><button type="button" class="secondary-button${liked ? ' selected' : ''}" data-search-like="${key}" aria-pressed="${liked}" ${locked || liked ? 'disabled' : ''}>${liked ? '✓ Saját kedvenc' : state.room ? '♡ Saját kedvenc' : '♡ Kedvencnek'}</button><button type="button" class="secondary-button${watched ? ' selected' : ''}" data-search-seen="${key}" aria-pressed="${watched}" ${locked || watched ? 'disabled' : ''}>${watched ? '✓ Már láttam' : '◉ Már láttam'}</button></div></article>`;
    }).join('');
    if (!state.searchItems.length && !state.searchBusy && !state.searchError && state.searchQuery) results.innerHTML = '<div class="search-empty"><p>Nincs találat erre a címre. Próbálj rövidebb címet, más írásmódot vagy eredeti címet.</p></div>';
    if (state.searchError) results.insertAdjacentHTML('beforeend', `<div class="search-empty inline-error"><span>${esc(state.searchError)}</span><button type="button" class="error-inline-retry" data-action="retry-search">Újrapróbálom →</button></div>`);
    const more = $('#search-more'); if (more) { more.hidden = !state.searchHasMore || !!state.searchError; more.disabled = state.searchBusy; more.textContent = state.searchBusy ? 'Találatok betöltése…' : 'További találatok'; }
  }
  async function searchTitles({ more = false } = {}) {
    const input = $('#title-search-input'), query = more ? state.searchQuery : input.value.trim(), type = more ? state.searchType : state.mediaType;
    if (query.length < 2 || query.length > 100 || /[\u0000-\u001f\u007f]/.test(query)) { searchValidation('Írj be 2–100 karakteres címet a kereséshez.'); return; }
    searchValidation();
    state.searchController?.abort(); const controller = new AbortController(), serial = ++state.searchSerial;
    const page = more ? state.searchNextPage : 1;
    state.searchController = controller; state.searchBusy = true; state.searchError = ''; state.searchFailedMore = more;
    if (!more) { state.searchItems = []; state.searchQuery = query; state.searchType = type; state.searchPage = 1; state.searchNextPage = 2; state.searchHasMore = false; }
    $('#search-type-label').textContent = type === 'tv' ? 'SOROZATKERESÉS' : 'FILMKERESÉS';
    $('#search-title').textContent = `Találatok: ${query}`;
    $('#search-status').textContent = more ? 'További találatok érkeznek…' : 'Keresés a teljes katalógusban…';
    $('#search-status').classList.remove('is-error'); $('#title-search-submit').disabled = true;
    if (!$('#search-dialog').open) openDialog($('#search-dialog')); renderSearchResults();
    const timeout = setTimeout(() => controller.abort(), 25000);
    try {
      const data = await api(`/api/search?${new URLSearchParams({ query, mediaType: type, page: String(page) })}`, { signal: controller.signal });
      if (serial !== state.searchSerial || !$('#search-dialog').open || state.searchType !== type || state.searchQuery !== query) return;
      const keys = new Set(state.searchItems.map(mediaKey));
      for (const item of data.results || []) { const normalized = { ...item, media_type: item.media_type === 'tv' ? 'tv' : 'movie' }; if (typeOf(normalized) !== type || keys.has(mediaKey(normalized))) continue; keys.add(mediaKey(normalized)); state.searchItems.push(normalized); }
      state.searchPage = Number(data.page) || page; state.searchNextPage = Number(data.nextPage) || state.searchPage + 1; state.searchHasMore = data.hasMore ?? state.searchPage < Number(data.total_pages || 1);
      $('#search-status').textContent = state.searchItems.length ? `${state.searchItems.length} megjelenített találat${Number.isSafeInteger(Number(data.total_results)) ? ` · Összesen ${Number(data.total_results)}` : ''}` : 'Most nincs találat erre a címre.';
    } catch (error) {
      if (serial !== state.searchSerial || !$('#search-dialog').open) return;
      state.searchError = error.message; $('#search-status').textContent = 'A keresés most nem sikerült.'; $('#search-status').classList.add('is-error');
    } finally {
      clearTimeout(timeout);
      if (serial === state.searchSerial) { state.searchBusy = false; state.searchController = null; $('#title-search-submit').disabled = false; renderSearchResults(); }
    }
  }
  function favoriteSearchItem(key) {
    if (state.backupBusy || state.voting || state.libraryBusy || state.autoSeenBusy) return;
    const movie = state.searchItems.find(item => mediaKey(item) === key); if (!movie) return;
    if (!state.likes.some(item => mediaKey(item) === key)) { state.likes.push(preferenceSummary(movie)); save('maeste.likes', state.likes); }
    learnPreference(movie, 'yes'); renderLists(); renderSearchResults(); toast('A saját kedvenceid közé került.');
  }
  async function seenSearchItem(key) {
    if (state.backupBusy || state.voting || state.libraryBusy || state.autoSeenBusy || state.seen.some(item => mediaKey(item) === key)) return;
    const movie = state.searchItems.find(item => mediaKey(item) === key); if (!movie) return;
    const searchAtRequest = state.searchSerial;
    try {
      const operation = updateSeen(key); renderSearchResults(); await operation;
      if (mediaKey(state.deck[state.index] || {}) === key) renderCard();
      if (searchAtRequest === state.searchSerial) { $('#search-status').textContent = 'A látott történeteidhez mentettük.'; $('#search-status').classList.remove('is-error'); } synchronizeRoomSeen();
    } catch (error) { if (searchAtRequest === state.searchSerial) { $('#search-status').textContent = `A mentés nem sikerült. ${error.message} A Már láttam gombbal újrapróbálhatod.`; $('#search-status').classList.add('is-error'); } }
    finally { renderSearchResults(); }
  }

  async function api(path, options = {}) {
    const publicAccess = path === '/api/access/status' || path === '/api/access/unlock';
    const requiredError = () => Object.assign(new Error('A folytatáshoz lépj be újra az alkalmazásjelszóval.'), { status: 401, code: 'ACCESS_REQUIRED' });
    if (accessLocked && !publicAccess) throw requiredError();
    const controller = new AbortController(), epoch = accessEpoch;
    pendingRequests.add(controller);
    try {
      let response;
      try {
        response = await fetch(new URL(path, apiOrigin).href, { ...options, credentials: apiOrigin === location.origin ? 'same-origin' : 'omit', headers: { ...(options.body ? { 'Content-Type': 'application/json' } : {}), ...options.headers, ...(!publicAccess ? { 'X-Maeste-Profile': profileToken } : {}), ...(accessToken ? { 'X-Maeste-Access': accessToken } : {}) }, signal: AbortSignal.any([controller.signal, options.signal || AbortSignal.timeout(25000)]) });
      } catch (error) {
        if (epoch !== accessEpoch || (accessLocked && !publicAccess)) throw requiredError();
        throw new Error(error.name === 'TimeoutError' ? 'A kapcsolat most lassú. Próbáld meg újra.' : 'Nem sikerült kapcsolódni. Ellenőrizd az internetkapcsolatot, és próbáld újra.');
      }
      let data;
      try { data = await response.json(); } catch { throw new Error('A szerver most nem adott használható választ. Próbáld újra.'); }
      if (epoch !== accessEpoch) throw requiredError();
      if (!response.ok) {
        const error = Object.assign(new Error(typeof data.error === 'string' ? data.error : typeof data.message === 'string' ? data.message : 'Most nem sikerült a művelet. Próbáld újra.'), { status: response.status, code: data.code });
        if (!publicAccess && data.code === 'ACCESS_REQUIRED') lockAccess('A belépésed lejárt. Add meg újra az alkalmazásjelszót.');
        throw error;
      }
      return data;
    } finally { pendingRequests.delete(controller); }
  }
  const post = (path, body) => api(path, { method: 'POST', body: JSON.stringify(body) });
  function toast(message) {
    if (accessLocked) return;
    clearTimeout(state.toastTimer); $('#toast').textContent = message; $('#toast').hidden = false;
    state.toastTimer = setTimeout(() => { $('#toast').hidden = true; }, 3800);
  }
  function openDialog(dialog) {
    if (accessLocked || dialog.open) return;
    lastOpener = document.activeElement; dialogOpeners.set(dialog, lastOpener); dialog.showModal();
  }
  function closeDialog(dialog) {
    const opener = dialogOpeners.get(dialog) || lastOpener;
    if (dialog.open) dialog.close();
    if (opener instanceof HTMLElement && document.contains(opener) && !opener.closest('dialog:not([open])')) opener.focus({ preventScroll: true });
  }
  function toggleFilters(open) {
    $('#filters-panel').classList.toggle('is-open', open); $('#filters-backdrop').hidden = !open; document.body.classList.toggle('sheet-open', open);
  $('#filters-toggle').setAttribute('aria-expanded', String(open));
    if (open) $('#filters-close').focus(); else if (matchMedia('(max-width:640px)').matches) $('#filters-toggle').focus({ preventScroll: true });
  }
  function setBusy(busy) {
    state.busy = busy;
    renderMediaType();
    const heldSeen = activeSeenVoteHold();
    for (const id of ['vote-no','vote-yes','vote-seen']) $(`#${id}`).disabled = busy || state.voting || state.autoSeenBusy || state.libraryBusy || state.backupBusy || (!!heldSeen && id !== 'vote-seen');
    $('#apply-filters').disabled = busy || state.voting || state.libraryBusy || state.backupBusy || !!state.room || !state.configReady;
    $('#undo-vote').disabled = busy || state.voting || state.libraryBusy || state.backupBusy || !!state.room || state.history.length === 0;
  }
  function showState(kind, message = '') {
    $('#movie-actions').hidden = true; $('#gesture-hint').hidden = true;
    if (kind === 'loading') $('#card-stage').innerHTML = '<div class="state-card"><div class="loading-reel" aria-hidden="true">✦</div><h3>Mindjárt kezdődik.</h3><p>Keressük a következő ma esti kedvencet.</p></div>';
    else if (kind === 'error') $('#card-stage').innerHTML = `<div class="state-card"><span class="state-icon" aria-hidden="true">☁</span><h3>Egy kis szünet a vetítésben.</h3><p>${esc(message)}</p><button type="button" class="secondary-button error-retry" data-action="retry">Megpróbálom újra →</button></div>`;
    else if (kind === 'empty' && state.hasMore && !state.room) $('#card-stage').innerHTML = '<div class="state-card"><span class="state-icon" aria-hidden="true">✧</span><h3>Ezek már ismerős történetek.</h3><p>A látott filmjeidet kihagytuk. Nézzünk körül a következő válogatásban!</p><button type="button" class="secondary-button" data-action="next-page">További filmek →</button></div>';
    else if (kind === 'empty') $('#card-stage').innerHTML = '<div class="state-card"><span class="state-icon" aria-hidden="true">✧</span><h3>Ez most túl szűk válogatás.</h3><p>Lazíts egy szűrőn, vagy válaszd a Bármelyik szolgáltatót. Így több filmből kereshetünk.</p><button type="button" class="secondary-button" data-action="edit-filters">Módosítom a szűrőket →</button></div>';
    else {
      const count = likedMovies().length;
      const heading = state.room ? 'Megvan minden szavazatod.' : 'Szép kis válogatás!';
      const note = state.room ? (state.room.members?.length < 2 ? 'Amint a párod csatlakozik és szavaz, itt jelennek meg a közös találatok.' : !(state.room.matches || []).length ? (state.room.roundReady ? 'Ebben a körben nincs közös találat. Indítsatok új kört ugyanebben a szobában.' : 'A te köröd kész. Még nincs közös találat; várjuk a párod további szavazatait.') : 'A közös igenekből választhattok. A párod szavazatai közben is érkezhetnek.') : `${count ? `${count} cím került a listádra. ` : ''}Jöhet a döntés, vagy nézzünk még egy kört?`;
      $('#card-stage').innerHTML = `<div class="state-card"><span class="state-icon" aria-hidden="true">✦</span><h3>${heading}</h3><p>${esc(note)}</p>${count ? '<button type="button" class="primary-button" data-action="open-list">Megnézem a találatokat →</button>' : ''}${!state.room && state.page < state.totalPages ? '<button type="button" class="secondary-button" data-action="next-page">Jöhet még pár film →</button>' : ''}${!state.room && state.history.length ? '<button type="button" class="text-button" data-action="undo-last">Utolsó döntés visszavonása ↶</button>' : ''}${!state.room && !count ? '<button type="button" class="secondary-button" data-action="edit-filters">Más hangulatra váltok →</button>' : ''}</div>`;
    }
  }
  function renderCard() {
    if (state.busy) return;
    const seenIds = new Set(state.seen.map(mediaKey)), heldSeen = activeSeenVoteHold();
    if (heldSeen) state.index = heldSeen.index;
    else if (state.room) state.index = state.deck.findIndex(movie => !Object.prototype.hasOwnProperty.call(state.room.myVotes || {}, String(movie.id)) && !seenIds.has(mediaKey(movie)));
    else while (state.index < state.deck.length && seenIds.has(mediaKey(state.deck[state.index] || {}))) state.index++;
    const movie = state.deck[state.index];
    const voted = state.room ? Object.keys(state.room.myVotes || {}).length : Math.max(0, state.index);
    $('#deck-counter').textContent = `${String(Math.min(voted + (movie ? 1 : 0), state.deck.length)).padStart(2,'0')} / ${String(state.deck.length).padStart(2,'0')}`;
    if (!movie) { showState(state.deck.length || state.room ? 'finished' : 'empty'); if (state.room) $('.state-card', $('#card-stage'))?.insertAdjacentHTML('beforeend', roundControls()); return; }
    const poster = image(movie.poster_path, 'w780');
    const metadata = [rating(movie) ? `<span class="rating-tag">★ ${rating(movie)}</span>` : '', year(movie) ? `<span>${esc(year(movie))}</span>` : '', ...genreNames(movie).slice(0, 2).map(name => `<span>${esc(name)}</span>`)].filter(Boolean).join('<span class="meta-dot">·</span>');
    $('#card-stage').innerHTML = `<article class="movie-card" data-movie-id="${Number(movie.id)}" data-media-type="${typeOf(movie)}" aria-label="${esc(title(movie))}">${poster ? `<img class="poster-image" src="${poster}" alt="${esc(title(movie))} ${noun(typeOf(movie))}poszter" draggable="false" fetchpriority="high">` : '<div class="poster-placeholder" aria-hidden="true">✦</div>'}<div class="card-shade"></div><div class="card-top"><span class="card-kicker"><span aria-hidden="true">✦</span> ${state.recommendation?.personalized && !state.room ? 'AZ ÍZLÉSEDHEZ HANGOLVA' : 'EGY ÚJABB LEHETŐSÉG'}</span><button type="button" class="card-info" data-details="${mediaKey(movie)}" aria-label="${esc(title(movie))} részletei">i</button></div><div class="swipe-stamp yes" aria-hidden="true">JÖHET</div><div class="swipe-stamp no" aria-hidden="true">MOST NEM</div><div class="swipe-stamp seen" aria-hidden="true">MÁR LÁTTAM</div><div class="card-body"><div class="card-availability availability-loading" aria-live="polite">Elérhetőség ellenőrzése…</div><div class="movie-tags">${metadata}</div><h3>${esc(title(movie))}</h3><p class="card-overview">${esc(movie.overview || 'Egy új történet, amit érdemes felfedezni. Nyisd meg a részleteket és az előzetest.')}</p><button class="card-details-link" type="button" data-details="${mediaKey(movie)}">A történet és az előzetes <span aria-hidden="true">→</span></button></div></article>`;
    $('.poster-image')?.addEventListener('error', event => { event.target.remove(); });
    $('#movie-actions').hidden = false; $('#gesture-hint').hidden = false;
    setBusy(false); attachSwipe(); loadCardAvailability(movie);
    const next = state.deck[state.index + 1]; if (next) prefetchAvailability(next); if (next?.poster_path) { const preload = new Image(); preload.src = image(next.poster_path, 'w780'); }
  }
  function renderSummary() {
    const active = state.room?.filters || filters();
    const names = (active.providers || []).map(id => state.providers.find(provider => Number(provider.provider_id) === Number(id))?.provider_name).filter(Boolean);
    $('#summary-providers').textContent = names.length ? names.join(', ') : 'Bármelyik';
    $('#summary-genre').textContent = (active.genres || []).map(id => state.genres.find(genre => Number(genre.id) === Number(id))?.name).filter(Boolean).join(', ') || 'Bármi jöhet';
    $('#summary-runtime').textContent = state.mediaType === 'tv' ? 'Nincs időszűrés' : active.runtime ? `Legfeljebb ${active.runtime} perc${state.mediaType === 'tv' ? ' / epizód' : ''}` : 'Ráérünk';
    if ($('#summary-type')) $('#summary-type').textContent = state.mediaType === 'tv' ? 'Sorozat' : 'Film';
    if ($('#summary-years')) $('#summary-years').textContent = active.yearFrom && active.yearTo ? `${active.yearFrom}–${active.yearTo}` : active.yearFrom ? `${active.yearFrom}-től` : active.yearTo ? `${active.yearTo}-ig` : 'Bármelyik év';
    if ($('#summary-excluded')) $('#summary-excluded').textContent = (active.excludedGenres || []).map(id => state.genres.find(genre => Number(genre.id) === Number(id))?.name).filter(Boolean).join(', ') || 'Nincs kizárás';
    $('#night-description').innerHTML = state.room ? `Két külön ízlés.<br><em>Egy közös ${noun()}.</em>` : `Egy jó ${state.mediaType === 'tv' ? 'sorozathoz' : 'filmhez'}<br><em>csak egy igen kell.</em>`;
  }
  function renderLists() {
    const movies = likedMovies();
    $('#favorites-count').textContent = movies.length; $('#shortlist-count').textContent = movies.length;
    $('#list-label').textContent = state.room ? 'Találatok' : 'Listám';
    $('#shortlist-title').textContent = state.room ? 'KÖZÖS IGENEK' : 'EDDIG TETSZIK';
    $('#random-choice').disabled = !movies.length; $('#favorites-random').disabled = !movies.length;
    $('#random-choice').innerHTML = `${state.room ? 'Válassz helyettünk' : 'Válassz helyettem'} <span aria-hidden="true">→</span>`;
    $('#shortlist').innerHTML = movies.length ? movies.slice(-3).reverse().map(movie => `<button type="button" class="mini-movie" data-details="${mediaKey(movie)}">${image(movie.poster_path, 'w92') ? `<img src="${image(movie.poster_path, 'w92')}" alt="" loading="lazy">` : '<span class="mini-poster-empty"></span>'}<span>${esc(title(movie))}<small>${esc(year(movie))}${rating(movie) ? ` · ★ ${rating(movie)}` : ''}</small></span></button>`).join('') : `<p class="empty-mini">${state.room ? 'Amire mindketten igent mondtok, ide kerül. Jöhet az első közös találat?' : 'A neked tetsző filmek itt gyűlnek. Jöhet az első?'}</p>`;
    $('#favorites-title').textContent = state.room ? 'Ezekre együtt mondtatok igent.' : 'Ezt még megnézném.';
    $('#favorites-eyebrow').textContent = state.room ? 'A KÖZÖS VÁLOGATÁSOTOK' : 'A TE VÁLOGATÁSOD';
    $('#favorites-description').textContent = state.room ? 'A közös találatok erről a szobakódról mindkettőtöknek elérhetők.' : 'A kedvenceid ezen az eszközön maradnak meg.';
    renderTaste();
    $('#favorites-list').innerHTML = movies.length ? [...movies].reverse().map(movie => `<article class="favorite-item">${image(movie.poster_path, 'w154') ? `<img class="favorite-poster" src="${image(movie.poster_path, 'w154')}" alt="" loading="lazy">` : '<div class="favorite-poster no-poster" aria-hidden="true">✦</div>'}<div class="favorite-copy"><h3>${esc(title(movie))}</h3><p>${typeOf(movie) === 'tv' ? 'Sorozat' : 'Film'}${year(movie) ? ` · ${esc(year(movie))}` : ''}${rating(movie) ? ` · ★ ${rating(movie)}` : ''}</p><button type="button" data-details="${mediaKey(movie)}">Részletek és elérhetőség →</button></div>${!state.room ? `<button type="button" class="remove-favorite" data-remove="${mediaKey(movie)}" aria-label="${esc(title(movie))} eltávolítása a listáról">×</button>` : ''}</article>`).join('') : `<div class="empty-list"><span aria-hidden="true">♡</span>${state.room ? 'Még nincs közös találat. Lapozzatok tovább: a közös igenek itt fognak gyűlni.' : 'A listád még üres. Nyomj a szívre egy filmnél, és itt megtalálod.'}</div>`;
  }
  function renderRoom() {
    const paired = !!state.room;
    $('#solo-mode').classList.toggle('active', !paired); $('#solo-mode').setAttribute('aria-pressed', String(!paired));
    $('#pair-mode').classList.toggle('active', paired); $('#pair-mode').setAttribute('aria-pressed', String(paired));
    $('#room-summary').hidden = !paired; $('#pair-banner').hidden = !paired;
    $('#room-create-content').hidden = paired; $('#room-active-content').hidden = !paired;
    $('#filter-fields').disabled = paired; $('#filter-lock-note').hidden = !paired;
    $('#apply-filters').disabled = paired || state.busy || state.voting || state.libraryBusy || !state.configReady;
    $('#undo-vote').hidden = paired;
    renderMediaType(); renderConnection();
    for (const id of ['quick-solo','quick-pair']) if ($(`#${id}`)) $(`#${id}`).setAttribute('aria-pressed', String((id === 'quick-pair') === paired));
    $$('.taste-tab').forEach(button => { button.disabled = paired; });
    renderDecision();
    if (!paired) return;
    const room = state.room;
    $('#room-code-small').textContent = room.code; $('#room-code-large').textContent = room.code;
    const members = room.members || [];
    $('#pair-status').textContent = state.connection !== 'connected' ? 'A szoba legutóbbi mentett állapota' : members.length < 2 ? 'Várjuk a párodat…' : 'Ketten vagytok. Kezdődhet az este.';
    $('#pair-progress').textContent = members.map(member => `${member.name}: ${member.voted || 0}/${room.deck?.length || state.deck.length}`).join(' · ');
    $('#room-members').innerHTML = members.map(member => `<div class="member-row"><span class="member-avatar">${esc((member.name || '?').slice(0, 1).toUpperCase())}</span><strong>${esc(member.name || 'Mozi társ')}</strong><small>${Number(member.voted) || 0} döntés</small></div>`).join('') + (members.length < 2 ? '<p class="field-hint">A második hely még szabad. Küldd el a meghívólinket!</p>' : '');
  }
  function syncFilterUI(nextFilters) {
    state.mediaType = nextFilters.mediaType === 'tv' ? 'tv' : 'movie';
    state.selectedProviders = new Set((nextFilters.providers || []).map(Number));
    $('#genre-select').value = (nextFilters.genres || [])[0] || '';
    $('#runtime-select').value = nextFilters.runtime || '';
    $('#rating-select').value = nextFilters.rating || 0;
    if ($('#year-from')) $('#year-from').value = nextFilters.yearFrom ?? '';
    if ($('#year-to')) $('#year-to').value = nextFilters.yearTo ?? '';
    const included = Number($('#genre-select').value);
    state.excludedGenres = new Set((nextFilters.excludedGenres || []).map(Number).filter(id => id !== included && state.genres.some(genre => Number(genre.id) === id)));
    renderExcludedGenres();
    syncProviderButtons(); syncMoodButtons(); renderMediaType(); renderSummary();
  }
  function syncProviderButtons() {
    $$('#provider-options [data-provider]').forEach(button => { const selected = button.dataset.provider === 'any' ? !state.selectedProviders.size : state.selectedProviders.has(Number(button.dataset.provider)); button.classList.toggle('selected', selected); button.setAttribute('aria-pressed', String(selected)); });
  }
  function syncMoodButtons() {
    const value = $('#genre-select').value;
    $$('.mood-chip').forEach(button => { const selected = button.dataset.mood === value; button.classList.toggle('selected', selected); button.setAttribute('aria-pressed', String(selected)); });
  }
  async function loadConfig({ filterValues = null } = {}) {
    const requestedType = state.mediaType, serial = ++state.configSerial;
    const config = await api(`/api/config?mediaType=${requestedType}`);
    if (serial !== state.configSerial || requestedType !== state.mediaType) return;
    state.genres = config.genres || []; state.providers = config.providers || []; state.configReady = true;
    $('#genre-select').innerHTML = '<option value="">Minden műfaj</option>' + state.genres.map(genre => `<option value="${Number(genre.id)}">${esc(genre.name)}</option>`).join('');
    const featured = [8, 337, 1899, 119, 350, 1773, 531, 15];
    const sortedProviders = [...state.providers].sort((a, b) => { const ai = featured.indexOf(Number(a.provider_id)); const bi = featured.indexOf(Number(b.provider_id)); return (ai < 0 ? 999 : ai) - (bi < 0 ? 999 : bi) || String(a.provider_name).localeCompare(String(b.provider_name), 'hu'); });
    $('#provider-options').innerHTML = '<button type="button" class="provider-chip selected" data-provider="any" aria-pressed="true">✦ Bármelyik</button>' + sortedProviders.map((provider, index) => `<button type="button" class="provider-chip${index >= 7 ? ' extra-provider' : ''}" data-provider="${Number(provider.provider_id)}" aria-pressed="false">${image(provider.logo_path, 'w45') ? `<img src="${image(provider.logo_path, 'w45')}" alt="" loading="lazy">` : ''}${esc(provider.provider_name)}</button>`).join('') + (sortedProviders.length > 7 ? `<button type="button" id="providers-more" class="providers-more" aria-expanded="false">További szolgáltatók (${sortedProviders.length - 7}) +</button>` : '');
    if (!state.providers.length) $('#provider-options').insertAdjacentHTML('beforeend', '<p class="field-hint">A szolgáltatói lista most üres. A Bármelyik opcióval kereshetsz.</p>');
    const savedFilters = filterValues || read('maeste.filters', null); if (savedFilters) syncFilterUI({ ...savedFilters, mediaType: requestedType, genres: (savedFilters.genres || []).filter(id => state.genres.some(genre => Number(genre.id) === Number(id))), providers: (savedFilters.providers || []).filter(id => state.providers.some(provider => Number(provider.provider_id) === Number(id))) });
    const moods = requestedType === 'tv' ? [['', 'Bármi jöhet'], ['35', '☀ Könnyed'], ['10759', 'ϟ Kalandos'], ['18', '◈ Drámai'], ['10765', '✧ Más világ']] : [['', 'Bármi jöhet'], ['35', '☀ Könnyed'], ['53', 'ϟ Izgalmas'], ['10749', '♡ Romantikus'], ['878', '✧ Más világ']];
    $$('.mood-chip').forEach((button, index) => { const [value, label] = moods[index] || ['', 'Bármi jöhet']; button.dataset.mood = value; button.textContent = label; button.hidden = !!value && !state.genres.some(genre => String(genre.id) === value); });
    syncMoodButtons(); renderExcludedGenres();
    renderSummary(); renderRoom(); renderTaste();
  }
  async function discover({ next = false } = {}) {
    if (!validateYearFilters()) return;
    const serial = ++state.discoverSerial;
    state.history = [];
    if (!next) { state.page = 1; }
    else state.page = state.nextPage || state.page + 1;
    const currentFilters = filters(); save('maeste.filters', currentFilters);
    const params = new URLSearchParams({ mediaType: state.mediaType, page: String(state.page), rating: String(currentFilters.rating) });
    if (currentFilters.providers.length) params.set('providers', currentFilters.providers.join(','));
    if (currentFilters.genres.length) params.set('genres', currentFilters.genres.join(','));
    if (currentFilters.runtime) params.set('runtime', String(currentFilters.runtime));
    if (currentFilters.yearFrom != null) params.set('yearFrom', String(currentFilters.yearFrom));
    if (currentFilters.yearTo != null) params.set('yearTo', String(currentFilters.yearTo));
    if (currentFilters.excludedGenres.length) params.set('excludedGenres', currentFilters.excludedGenres.join(','));
    state.appliedTaste = state.taste;
    if (state.taste === 'recommended') { params.set('personalized', '1'); const seeds = recommendationSeeds(); if (seeds.length) params.set('seeds', seeds.join(',')); const dismissed = dismissalSeeds(); if (dismissed.length) params.set('dismissed', dismissed.join(',')); }
    setBusy(true); showState('loading'); renderSummary();
    try {
      const data = await api(`/api/discover?${params}`);
      if (serial !== state.discoverSerial || state.room) return;
      state.recommendation = data.recommendation || { personalized: false, seedCount: 0, genreIds: [] }; renderRecommendation();
      state.deck = data.results || []; state.totalPages = data.total_pages || 1; state.page = Number(data.page) || state.page; state.hasMore = data.hasMore ?? state.page < state.totalPages; state.nextPage = data.nextPage || state.page + 1; state.emptyReason = data.emptyReason; state.index = 0;
      setConnection('connected'); setBusy(false); renderCard();
    } catch (error) { if (serial !== state.discoverSerial) return; setBusy(false); showState('error', error.message); }
  }
  function activeSeenVoteHold() {
    const hold = state.seenVoteHold;
    if (!hold || state.room?.code !== hold.code || state.room?.memberToken !== hold.memberToken || roomVersion() !== hold.roundVersion) return null;
    const index = state.deck.findIndex(movie => mediaKey(movie) === hold.key);
    return index < 0 ? null : { ...hold, index };
  }
  function clearVoteCardState(card, preservePose = false) {
    if (!card) return;
    card.classList.remove('dragging', 'dragging-seen', 'dragging-no', 'dragging-yes', 'is-vote-saving', 'saving-no', 'saving-yes', 'is-seen-saving', 'is-burning', 'is-archiving', 'is-portaling');
    card.style.pointerEvents = ''; card.style.opacity = ''; card.removeAttribute('aria-busy');
    if (!preservePose) {
      card.style.transform = '';
      for (const property of ['--choice-x', '--choice-y', '--choice-rotation']) card.style.removeProperty(property);
    }
    $$('.swipe-stamp', card).forEach(stamp => { stamp.style.opacity = '0'; });
  }
  function markVoteSaving(card, choice) {
    if (!card?.isConnected) return;
    clearVoteCardState(card, true); card.style.pointerEvents = 'none'; card.setAttribute('aria-busy', 'true');
    card.classList.add('is-vote-saving', choice === 'seen' ? 'is-seen-saving' : `saving-${choice}`);
  }
  async function playVoteAnimation(card, choice) {
    const motion = matchMedia('(prefers-reduced-motion: reduce)');
    if (!card?.isConnected || !['no', 'seen', 'yes'].includes(choice)) return;
    const stage = card.parentElement, originDeck = state.deck, originIndex = state.index, originSerial = state.discoverSerial;
    const originRoom = state.room ? { code: state.room.code, memberToken: state.room.memberToken, roundVersion: roomVersion() } : null;
    const contextCurrent = () => card.isConnected && card.parentElement === stage && $('.movie-card', stage) === card && (originRoom ? state.room?.code === originRoom.code && state.room?.memberToken === originRoom.memberToken && roomVersion() === originRoom.roundVersion : !state.room && state.deck === originDeck && state.index === originIndex && state.discoverSerial === originSerial);
    clearVoteCardState(card, true); card.style.pointerEvents = 'none';
    if (!contextCurrent() || document.hidden || motion.matches) return;
    const effects = document.createElement('div'); effects.setAttribute('aria-hidden', 'true');
    const append = (className, parent = effects, tag = 'div', text = '') => { const element = document.createElement(tag); element.className = className; if (text) element.textContent = text; parent.append(element); return element; };
    const variants = { no: ['is-burning', 'choice-card-burn'], seen: ['is-archiving', 'card-file-away'], yes: ['is-portaling', 'card-enter-portal'] };
    const [cardClass, animationName] = variants[choice];
    if (choice === 'no') {
      effects.className = 'burn-effects'; append('burn-glow'); const front = append('burn-front');
      for (let index = 0; index < 24; index++) {
        const spark = append(index % 4 === 0 ? 'burn-spark burn-ash' : 'burn-spark', front, 'i');
        spark.style.setProperty('--spark-x', `${3 + Math.random() * 94}%`);
        spark.style.setProperty('--spark-drift', `${Math.round((Math.random() - .5) * 90)}px`);
        spark.style.setProperty('--spark-delay', `${Math.round(Math.random() * 180)}ms`);
        spark.style.setProperty('--spark-size', `${2 + Math.random() * 3}px`);
      }
    } else if (choice === 'seen') {
      effects.className = 'vote-effects archive-effects'; const cabinet = append('archive-cabinet');
      for (let index = 0; index < 4; index++) append('archive-book', cabinet, 'i').style.setProperty('--book-index', String(index));
      append('archive-slot', cabinet); append('archive-label', cabinet, 'span', 'MÁR LÁTTAM');
      append('effect-caption', effects, 'span', 'A KÖNYVTÁRADBA KERÜLT');
    } else {
      effects.className = 'vote-effects portal-effects'; append('portal-halo'); append('portal-ring'); append('portal-core');
      for (let index = 0; index < 6; index++) {
        const spark = append('portal-spark', effects, 'i');
        spark.style.setProperty('--spark-x', `${72 + Math.round(Math.random() * 20)}%`);
        spark.style.setProperty('--spark-y', `${30 + Math.round(Math.random() * 40)}%`);
        spark.style.setProperty('--spark-delay', `${Math.round(Math.random() * 120)}ms`);
        spark.style.setProperty('--spark-drift', `${Math.round((Math.random() - .5) * 60)}px`);
      }
      append('effect-caption', effects, 'span', 'JÖHET!');
    }
    await new Promise(resolve => {
      let finished = false, timeout, frame;
      const finish = () => {
        if (finished) return; finished = true;
        clearTimeout(timeout); cancelAnimationFrame(frame);
        card.removeEventListener('animationend', onEnd); card.removeEventListener('animationcancel', onEnd);
        document.removeEventListener('visibilitychange', onVisibility);
        if (motion.removeEventListener) motion.removeEventListener('change', onMotion); else motion.removeListener?.(onMotion);
        effects.remove(); clearVoteCardState(card); resolve();
      };
      const onEnd = event => { if (event.target === card && event.animationName === animationName) finish(); };
      const onVisibility = () => { if (document.hidden) finish(); };
      const onMotion = () => { if (motion.matches) finish(); };
      const checkContext = () => { if (!contextCurrent()) finish(); else frame = requestAnimationFrame(checkContext); };
      try {
        card.addEventListener('animationend', onEnd); card.addEventListener('animationcancel', onEnd);
        document.addEventListener('visibilitychange', onVisibility);
        if (motion.addEventListener) motion.addEventListener('change', onMotion); else motion.addListener?.(onMotion);
        timeout = setTimeout(finish, 1100); stage.append(effects);
        // The exit starts at the released pose; replace the inline drag transform
        // and the saving state together before the browser paints another frame.
        card.style.transform = ''; card.classList.add(cardClass); frame = requestAnimationFrame(checkContext);
        if (document.hidden || motion.matches || !contextCurrent()) finish();
      } catch { finish(); }
    });
  }
  async function vote(choice) {
    const movie = state.deck[state.index]; if (!movie || !['no', 'yes', 'seen'].includes(choice) || state.busy || state.voting || state.libraryBusy || state.backupBusy || state.autoSeenBusy || $('dialog[open]')) return;
    const heldSeen = activeSeenVoteHold();
    if (heldSeen) { if (choice === 'seen') return retryRoomSeenVote(heldSeen.key, heldSeen.code, heldSeen.roundVersion); return; }
    const originDeck = state.deck, originSerial = state.discoverSerial, originIndex = state.index;
    const originRoom = state.room ? { code: state.room.code, memberToken: state.room.memberToken, roundVersion: roomVersion() } : null;
    const stillCurrent = () => originRoom ? state.room?.code === originRoom.code && state.room?.memberToken === originRoom.memberToken && roomVersion() === originRoom.roundVersion : !state.room && state.deck === originDeck && state.discoverSerial === originSerial;
    state.voting = true; state.roomRevision++; clearSeenFailure(); setBusy(state.busy);
    const hadSeen = state.seen.some(item => mediaKey(item) === mediaKey(movie)), hadLike = state.likes.some(item => mediaKey(item) === mediaKey(movie));
    const priorDismissed = state.dismissed.find(item => mediaKey(item) === mediaKey(movie)) || null; let seenSaved = false;
    const card = $('.movie-card'); markVoteSaving(card, choice);
    try {
      if (choice === 'seen') { await updateSeen(mediaKey(movie)); seenSaved = true; }
      if (!stillCurrent()) return;
      let roomData;
      if (originRoom) {
        roomData = await post(`/api/rooms/${encodeURIComponent(originRoom.code)}/vote`, { memberToken: originRoom.memberToken, roundVersion: originRoom.roundVersion, movieId: movie.id, mediaType: typeOf(movie), choice });
        if (!stillCurrent()) return;
      }
      if (!originRoom && choice === 'yes' && !hadLike) { state.likes.push(movie); save('maeste.likes', state.likes); }
      learnPreference(movie, choice);
      await playVoteAnimation(card, choice);
      if (!stillCurrent()) return;
      if (originRoom) applyRoom(roomData, true);
      else {
        state.history.push({ index: originIndex, movie, choice, hadLike, hadSeen, priorDismissed });
        state.index++;
        if (choice === 'yes') toast('A listádra került. Egy jó lehetőség estére.');
        if (choice === 'seen') toast('A látott történeteidhez mentettük. Legközelebb már kihagyjuk.');
      }
    } catch (error) {
      if (!stillCurrent()) return;
      if (choice === 'seen') {
        if (seenSaved && originRoom) state.seenVoteHold = { ...originRoom, key: mediaKey(movie) };
        showSeenFailure(error.message, seenSaved && originRoom ? () => retryRoomSeenVote(mediaKey(movie), originRoom.code, originRoom.roundVersion) : () => vote('seen'), seenSaved && !!originRoom);
      }
      else toast(error.message);
    } finally {
      clearVoteCardState(card); state.voting = false; setBusy(state.busy); renderLists(); renderCard(); synchronizeRoomSeen(); maybePromptDecision();
    }
  }
  async function undoVote() {
    if (state.room || state.busy || state.voting || state.libraryBusy || !state.history.length) return;
    const previous = state.history[state.history.length - 1], originDeck = state.deck, originSerial = state.discoverSerial;
    const stillCurrent = () => !state.room && state.deck === originDeck && state.discoverSerial === originSerial && state.history[state.history.length - 1] === previous;
    state.voting = true; clearSeenFailure(); setBusy(state.busy);
    try {
      if (previous.choice === 'seen' && !previous.hadSeen) await updateSeen(mediaKey(previous.movie), true);
      if (!stillCurrent()) return;
      state.history.pop(); state.index = previous.index;
      if (previous.choice === 'yes' && !previous.hadLike) { state.likes = state.likes.filter(movie => mediaKey(movie) !== mediaKey(previous.movie)); save('maeste.likes', state.likes); }
      if (previous.choice === 'no' || previous.choice === 'yes') { state.dismissed = state.dismissed.filter(movie => mediaKey(movie) !== mediaKey(previous.movie)); if (previous.priorDismissed) state.dismissed.push(previous.priorDismissed); persistDismissed(); }
      toast('Az előző film visszakerült.');
    } catch (error) { if (stillCurrent()) showSeenFailure(error.message, undoVote); }
    finally { state.voting = false; setBusy(state.busy); renderLists(); renderCard(); }
  }
  function attachSwipe() {
    const card = $('.movie-card'); if (!card) return;
    let startX = 0, startY = 0, active = false, dx = 0, dy = 0, axis = null, pointerId;
    let pose = { x: 0, y: 0, rotation: 0 };
    const setPose = (x, y, rotation) => {
      pose = matchMedia('(prefers-reduced-motion: reduce)').matches ? { x: 0, y: 0, rotation: 0 } : { x, y, rotation: Math.max(-6, Math.min(6, rotation)) };
      card.style.transform = `translate3d(${pose.x}px,${pose.y}px,0) rotate(${pose.rotation}deg)`;
    };
    const reset = () => {
      card.classList.remove('dragging', 'dragging-seen', 'dragging-no', 'dragging-yes'); card.style.transform = '';
      for (const property of ['--choice-x', '--choice-y', '--choice-rotation']) card.style.removeProperty(property);
      $$('.swipe-stamp', card).forEach(stamp => { stamp.style.opacity = '0'; });
    };
    card.addEventListener('pointerdown', event => {
      if (event.target.closest('button,a,input,select,textarea') || state.voting || state.busy || state.libraryBusy || state.autoSeenBusy || event.button !== 0 || !event.isPrimary) return;
      startX = event.clientX; startY = event.clientY; dx = 0; dy = 0; axis = null; pose = { x: 0, y: 0, rotation: 0 }; active = true; pointerId = event.pointerId;
      try { card.setPointerCapture(pointerId); } catch { active = false; }
    });
    card.addEventListener('pointermove', event => {
      if (!active || event.pointerId !== pointerId) return;
      dx = event.clientX - startX; dy = event.clientY - startY;
      if (!axis && Math.hypot(dx, dy) >= 12) {
        if (Math.abs(dy) > Math.abs(dx) * 1.2) axis = 'y';
        else if (Math.abs(dx) > Math.abs(dy) * 1.2 || Math.hypot(dx, dy) >= 24) axis = 'x';
      }
      if (!axis) return;
      card.classList.add('dragging');
      if (axis === 'y') {
        const down = Math.max(0, dy);
        card.classList.toggle('dragging-seen', down > 12); card.classList.remove('dragging-no', 'dragging-yes');
        setPose(Math.max(-20, Math.min(20, dx * .12)), Math.max(-30, Math.min(card.clientHeight * .35, dy * .5)), dx / 70);
        $('.swipe-stamp.seen', card).style.opacity = String(Math.min(1, down / 100));
        $('.swipe-stamp.yes', card).style.opacity = '0'; $('.swipe-stamp.no', card).style.opacity = '0';
      } else {
        card.classList.remove('dragging-seen'); card.classList.toggle('dragging-no', dx < -12); card.classList.toggle('dragging-yes', dx > 12);
        setPose(Math.max(-card.clientWidth * .6, Math.min(card.clientWidth * .6, dx)), Math.max(-12, Math.min(12, dy * .08)), dx / 28);
        $('.swipe-stamp.yes', card).style.opacity = String(Math.min(1, Math.max(0, dx / 90)));
        $('.swipe-stamp.no', card).style.opacity = String(Math.min(1, Math.max(0, -dx / 90)));
        $('.swipe-stamp.seen', card).style.opacity = '0';
      }
    });
    const release = (event, cancelled = false) => {
      if (!active || event.pointerId !== pointerId) return;
      active = false;
      const choice = !cancelled && axis === 'y' && dy > Math.min(110, card.clientHeight * .2) ? 'seen'
        : !cancelled && axis === 'x' && Math.abs(dx) > Math.min(85, card.clientWidth * .23) ? (dx > 0 ? 'yes' : 'no') : null;
      if (choice) {
        card.style.setProperty('--choice-x', `${pose.x}px`);
        card.style.setProperty('--choice-y', `${pose.y}px`);
        card.style.setProperty('--choice-rotation', `${pose.rotation}deg`);
        card.classList.remove('dragging', 'dragging-seen', 'dragging-no', 'dragging-yes');
      } else reset();
      try { if (card.hasPointerCapture(pointerId)) card.releasePointerCapture(pointerId); } catch { /* Capture may already be released by the browser. */ }
      if (choice) vote(choice).finally(() => { if (card.isConnected && !state.voting) reset(); });
    };
    card.addEventListener('pointerup', event => release(event));
    card.addEventListener('pointercancel', event => release(event, true));
    card.addEventListener('lostpointercapture', event => release(event, true));
  }
  function roomError(message = '') { $('#room-error').textContent = message; $('#room-error').hidden = !message; }
  async function startRoom(join = false) {
    if (state.busy || !state.configReady || state.roundBusy || state.backupBusy || state.voting || state.libraryBusy) return;
    if (!join && !validateYearFilters()) return;
    const name = $('#player-name').value.trim() || 'Filmrajongó';
    const code = $('#join-code').value.trim().toUpperCase();
    if (join && !code) { roomError('Írd be a párodtól kapott meghívókódot.'); $('#join-code').focus(); return; }
    if (!join) save('maeste.filters', filters());
    roomError(); $('#create-room').disabled = true; $('#join-room').disabled = true;
    try {
      const data = await post(join ? '/api/rooms/join' : '/api/rooms', join ? { name, code, seeds: recommendationSeeds(), dismissed: dismissalSeeds(), personalized: state.taste === 'recommended' } : { name, filters: filters(), seeds: recommendationSeeds(), dismissed: dismissalSeeds(), personalized: state.taste === 'recommended' });
      if (!data.memberToken || !data.code) throw new Error('A szoba nem adott vissza csatlakozási adatot. Próbáld újra.');
      state.discoverSerial++; state.roomRevision++; state.room = null; applyRoom(data, false); save('maeste.name', name);
      if (join) { closeDialog($('#room-dialog')); toast('Csatlakoztál. Indulhat a közös válogatás!'); }
      else toast('Elkészült a moziest. Küldd el a meghívólinket!');
      clearInviteQuery(); toggleFilters(false);
    } catch (error) { roomError(error.message); }
    finally { $('#create-room').disabled = false; $('#join-room').disabled = false; }
  }
  function applyRoom(data, notify = false) {
    const oldMatches = new Set((state.room?.matches || []).map(mediaKey));
    if (state.room?.code === data.code && Number.isSafeInteger(data.roundVersion) && data.roundVersion < roomVersion()) return;
    const heldSeen = activeSeenVoteHold();
    if (heldSeen && data.code === heldSeen.code && (data.roundVersion ?? roomVersion()) === heldSeen.roundVersion && data.myVotes?.[identity(heldSeen.key).id] === 'seen') clearSeenFailure();
    const nextRound = state.room?.code === data.code && Number.isSafeInteger(data.roundVersion) && data.roundVersion > roomVersion();
    const typeChanged = data.filters?.mediaType && data.filters.mediaType !== state.mediaType;
    if (nextRound) { clearSeenFailure(); state.roomRevision++; state.roundError = ''; state.roundRelaxNeeded = false; state.decisionError = ''; state.decisionSignature = ''; if ($('#decision-dialog').open) closeDialog($('#decision-dialog')); }
    const oldDecision = state.room?.decision;
    const refreshCard = state.room?.code !== data.code || nextRound || JSON.stringify(state.room?.myVotes || {}) !== JSON.stringify(data.myVotes || {}) || (state.deck || []).map(movie => movie.id).join(',') !== (data.deck || []).map(movie => movie.id).join(',') || !$('.movie-card');
    state.room = { ...state.room, ...data, memberToken: data.memberToken || state.room?.memberToken };
    state.deck = state.room.deck || []; state.busy = false; state.pollErrors = 0; setConnection('connected');
    save('maeste.room', { code: state.room.code, memberToken: state.room.memberToken, roundVersion: roomVersion() });
    if (data.filters) { if (typeChanged) { state.mediaType = data.filters.mediaType === 'tv' ? 'tv' : 'movie'; state.configReady = false; loadConfig({ filterValues: data.filters }).catch(() => toast('A műfajok és szolgáltatók frissítése nem sikerült.')); } else if (state.configReady) syncFilterUI(data.filters); }
    renderRoom(); renderSummary(); renderLists();
    if (!state.voting && refreshCard) renderCard();
    const decisionReady = (state.room.decision?.candidates || []).length >= 3;
    if (notify && !decisionReady) { const fresh = (state.room.matches || []).filter(movie => !oldMatches.has(mediaKey(movie))); if (fresh.length) showMatch(fresh[fresh.length - 1]); }
    if (notify && state.room.decision?.status === 'tie' && oldDecision?.status !== 'tie' && !$('#decision-dialog').open) toast('Két külön választás született. Nyissátok meg a döntőkört!');
    synchronizeRoomSeen(); maybePromptDecision();
  }
  function showMatch(movie) {
    if ($('dialog[open]')) { toast(`Közös találat: ${title(movie)}`); return; }
    $('#match-content').innerHTML = `<div class="match-movie">${image(movie.poster_path, 'w154') ? `<img src="${image(movie.poster_path, 'w154')}" alt="">` : ''}<div><h3>${esc(title(movie))}</h3><p>${typeOf(movie) === 'tv' ? 'Sorozat' : 'Film'}${year(movie) ? ` · ${esc(year(movie))}` : ''}${rating(movie) ? ` · ★ ${rating(movie)}` : ''}</p><button type="button" data-details="${mediaKey(movie)}">Hol nézhetjük meg? →</button></div></div>`;
    openDialog($('#match-dialog'));
  }
  async function pollRoom() {
    if (accessLocked || !state.room || state.pollBusy || state.voting || state.decisionBusy || state.autoSeenBusy || state.libraryBusy || state.roundBusy || document.hidden) return;
    const code = state.room.code;
    const votesAtRequest = JSON.stringify(state.room.myVotes || {});
    const revisionAtRequest = state.roomRevision, roundAtRequest = roomVersion();
    state.pollBusy = true;
    try { const data = await api(`/api/rooms/${encodeURIComponent(code)}?memberToken=${encodeURIComponent(state.room.memberToken)}`); if (state.room?.code === code && !state.voting && !state.decisionBusy && !state.autoSeenBusy && revisionAtRequest === state.roomRevision && roomVersion() === roundAtRequest && votesAtRequest === JSON.stringify(state.room.myVotes || {})) applyRoom(data, true); }
    catch { if (state.room?.code === code && revisionAtRequest === state.roomRevision && roomVersion() === roundAtRequest) { state.pollErrors++; setConnection(navigator.onLine === false ? 'offline' : 'reconnecting'); } }
    finally { state.pollBusy = false; renderConnection(); }
  }
  async function leaveRoom() {
    if (state.roundBusy || state.backupBusy || state.voting || state.libraryBusy) return;
    clearSeenFailure();
    state.roomRevision++; state.room = null; state.decisionError = ''; state.decisionSignature = ''; if ($('#decision-dialog').open) closeDialog($('#decision-dialog')); save('maeste.room', null); closeDialog($('#room-dialog')); state.history = []; renderRoom(); renderLists(); renderSummary(); await discover();
  }
  function clearInviteQuery() { const url = new URL(location.href); if (url.searchParams.has('room')) { url.searchParams.delete('room'); history.replaceState({}, '', url.pathname + url.search + url.hash); } }
  async function copyInvite(codeOnly = false) {
    if (!state.room) return;
    const invite = new URL(location.href); invite.search = ''; invite.hash = ''; invite.searchParams.set('room', state.room.code);
    const text = codeOnly ? state.room.code : invite.href;
    try { await navigator.clipboard.writeText(text); toast(codeOnly ? `Kód másolva: ${state.room.code}` : 'A meghívólinket kimásoltuk. Küldd el a párodnak!'); }
    catch { openDialog($('#room-dialog')); toast(`A meghívókód: ${state.room.code}`); }
  }
  async function openDetails(value) {
    const entry = identity(value), key = mediaKey(entry), serial = ++state.detailsSerial;
    if ($('#match-dialog').open) closeDialog($('#match-dialog'));
    $('#details-content').innerHTML = `<div class="state-card" style="min-height:330px"><div class="loading-reel" aria-hidden="true">✦</div><p>Érkeznek a ${noun(entry.media_type)} részletei…</p></div>`;
    openDialog($('#details-dialog'));
    try {
      const data = await api(`/api/movies/${entry.id}?mediaType=${entry.media_type}`); if (serial !== state.detailsSerial) return;
      const movie = { ...data, media_type: entry.media_type };
      state.currentDetails = movie;
      const providers = movie['watch/providers']?.results?.HU || movie.watch_providers?.results?.HU || movie.watchProviders?.results?.HU || {};
      const videos = movie.videos?.results || [];
      const trailer = videos.find(video => video.site === 'YouTube' && video.type === 'Trailer' && /^[\w-]+$/.test(video.key)) || videos.find(video => video.site === 'YouTube' && /^[\w-]+$/.test(video.key));
      const backdrop = image(movie.backdrop_path || movie.poster_path, 'w1280');
      const availability = (items, label) => !items?.length ? '' : `<p class="availability-category">${esc(label)}</p><div class="provider-availability">${items.map(provider => `<div class="availability-provider">${image(provider.logo_path,'w92') ? `<img src="${image(provider.logo_path,'w92')}" alt="" loading="lazy">` : ''}<span>${esc(provider.provider_name)}</span></div>`).join('')}</div>`;
      const providerSections = availability(providers.flatrate, 'Előfizetéssel') + availability(providers.rent, 'Kölcsönözhető') + availability(providers.buy, 'Megvásárolható');
      const watchLink = typeof providers.link === 'string' && /^https:\/\/(www\.)?themoviedb\.org\//.test(providers.link) ? providers.link : '';
      const duration = entry.media_type === 'tv' ? (movie.episode_run_time || []).find(value => Number(value) > 0) || Number(movie.runtime) : Number(movie.runtime);
      const timeMeta = duration > 0 ? `<span>· ${Number(duration)} perc${entry.media_type === 'tv' ? ' / epizód' : ''}</span>` : '';
      const seasons = entry.media_type === 'tv' && Number(movie.number_of_seasons) > 0 ? `${Number(movie.number_of_seasons)} évad${Number(movie.number_of_episodes) > 0 ? ` · ${Number(movie.number_of_episodes)} epizód` : ''}` : '';
      $('#details-content').innerHTML = `<div class="detail-hero">${backdrop ? `<img src="${backdrop}" alt="" loading="eager">` : ''}</div><div class="detail-content"><div class="movie-tags"><span>${entry.media_type === 'tv' ? 'Sorozat' : 'Film'}</span>${rating(movie) ? `<span class="rating-tag">★ ${rating(movie)}</span>` : ''}<span>${esc(year(movie))}</span>${timeMeta}</div><h2>${esc(title(movie))}</h2><p class="detail-metadata">${esc(genreNames(movie).join(' · '))}${seasons ? `<br>${esc(seasons)}` : ''}${movie.tagline ? `<br><em>${esc(movie.tagline)}</em>` : ''}</p><p class="detail-overview">${esc(movie.overview || `Ehhez a ${entry.media_type === 'tv' ? 'sorozathoz' : 'filmhez'} jelenleg nincs magyar nyelvű leírás.`)}</p><div id="details-seen-control" class="details-seen-control"></div><div id="details-seen-error" class="inline-error" role="alert" hidden></div><h3 class="detail-section-title">HOL NÉZHETŐ? · MAGYARORSZÁG</h3>${providerSections || '<p class="detail-overview">Jelenleg nincs elérhetőségi adat ehhez a címhez Magyarországon.</p>'}<p class="availability-note">Az elérhetőségi adatokat a JustWatch biztosítja a TMDB-n keresztül. A kínálat és az árak változhatnak.</p><div class="detail-links">${trailer ? `<a href="https://www.youtube.com/watch?v=${encodeURIComponent(trailer.key)}" target="_blank" rel="noopener noreferrer">▶ Előzetes</a>` : ''}${watchLink ? `<a href="${esc(watchLink)}" target="_blank" rel="noopener noreferrer">Nézési lehetőségek →</a>` : ''}<a href="https://www.themoviedb.org/${entry.media_type}/${entry.id}" target="_blank" rel="noopener noreferrer">Adatlap a TMDB-n →</a></div></div>`;
      renderDetailsSeenControl();
    } catch (error) { if (serial === state.detailsSerial) $('#details-content').innerHTML = `<div class="state-card" style="min-height:330px"><span class="state-icon" aria-hidden="true">☁</span><h3>A részletek most váratnak magukra.</h3><p>${esc(error.message)}</p><button type="button" class="secondary-button" data-details="${key}">Újrapróbálom →</button></div>`; }
  }

  const recommendationSeeds = () => state.likes.filter(movie => typeOf(movie) === state.mediaType).slice(-5).map(movie => Number(movie.id)).filter(Number.isSafeInteger);
  const dismissalSeeds = () => { const positives = new Set(state.likes.map(mediaKey)); return state.dismissed.filter(movie => typeOf(movie) === state.mediaType && !positives.has(mediaKey(movie))).slice(-5).map(movie => Number(movie.id)).filter(Number.isSafeInteger); };
  function renderTaste() {
    const personalized = state.taste === 'recommended';
    $('#taste-recommended').classList.toggle('active', personalized); $('#taste-recommended').setAttribute('aria-pressed', String(personalized));
    $('#taste-popular').classList.toggle('active', !personalized); $('#taste-popular').setAttribute('aria-pressed', String(!personalized));
    const positives = recommendationSeeds().length, negatives = dismissalSeeds().length, plural = state.mediaType === 'tv' ? 'sorozatok' : 'filmek';
    $('#taste-hint').textContent = personalized ? (positives || negatives ? `${positives} kedvelt és ${negatives} kihagyott cím segít az ajánlásban. A már látott jelölés nem jelent elutasítást. A szűrőid továbbra is érvényesek; a keresőgombbal alkalmazhatod.` : 'A kedvencek és a Kihagyom döntéseid segítenek az ajánlásban. A már látott jelölés csak az ismétlést szűri. Addig a népszerű kínálatból válogatunk.') : `Népszerű ${plural} a szűrőiddel. Ízlésjelzéseid: ${positives} kedvelt, ${negatives} kihagyott cím.`;
  }
  function renderRecommendation() {
    const element = $('#recommendation-status');
    element.hidden = !!state.room || state.appliedTaste !== 'recommended'; if (element.hidden) return;
    const counts = `${Number(state.recommendation?.seedCount) || 0} kedvelt · ${Number(state.recommendation?.dismissedCount) || 0} kihagyott cím`;
    element.textContent = state.recommendation?.fallback ? `✦ Kevés hasonló ${noun()} volt; a szűrőid szerint bővítettük a válogatást. ${counts}` : state.recommendation?.personalized ? `✦ A korábbi döntéseid figyelembevételével válogattunk · ${counts}` : '✦ Még gyűjtjük az ízlésjelzéseket. Addig a népszerű kínálatból válogatunk a szűrőiddel.';
  }
  function renderSeen() {
    $('#seen-count').textContent = state.seen.length;
    $('#seen-open').setAttribute('aria-label', `Már látott történeteim megnyitása, ${state.seen.length} cím`);
    $('#seen-storage-note').textContent = !state.librarySynced ? 'A legutóbbi helyi másolatot látod. A kapcsolat helyreállása után frissítsd a listát.' : state.libraryStorage === 'account' ? 'A fiókodhoz mentett lista azonos bejelentkezéssel másik eszközön is elérhető. A látott filmeket kihagyjuk az új ajánlásokból.' : 'A listád tartósan mentve, ebből a böngészőből elérhető. A látott filmeket kihagyjuk az új ajánlásokból.';
    $('#seen-sync').hidden = state.librarySynced; $('#seen-sync').disabled = state.libraryBusy;
    $('#seen-list').innerHTML = state.seen.length ? [...state.seen].reverse().map(movie => `<article class="favorite-item">${image(movie.poster_path, 'w154') ? `<img class="favorite-poster" src="${image(movie.poster_path, 'w154')}" alt="" loading="lazy">` : '<div class="favorite-poster no-poster" aria-hidden="true">✦</div>'}<div class="favorite-copy"><h3>${esc(title(movie))}</h3><p>${typeOf(movie) === 'tv' ? 'Sorozat' : 'Film'}${year(movie) ? ` · ${esc(year(movie))}` : ''}${rating(movie) ? ` · ★ ${rating(movie)}` : ''}</p><button type="button" data-details="${mediaKey(movie)}">Részletek →</button></div><button type="button" class="remove-favorite" data-seen-remove="${mediaKey(movie)}" aria-label="${esc(title(movie))} eltávolítása a látott filmek közül" ${state.libraryBusy ? 'disabled' : ''}>×</button></article>`).join('') : '<div class="empty-list"><span aria-hidden="true">◉</span>A már látott történeteid ide kerülnek. Jelöld őket a szem ikonnal vagy a film adatlapján.</div>';
    renderDetailsSeenControl();
  }
  function receiveLibrary(data) {
    state.seen = Array.isArray(data.seen) ? data.seen : []; state.libraryStorage = data.storage === 'account' ? 'account' : 'device'; state.librarySynced = true;
    save('maeste.seen', state.seen); renderSeen(); renderSearchResults();
  }
  async function loadLibrary() {
    if (accessLocked || state.libraryBusy) return;
    const mutation = state.libraryMutation;
    try { const data = await api('/api/library'); if (mutation === state.libraryMutation && !state.libraryBusy) receiveLibrary(data); }
    catch { if (mutation === state.libraryMutation) { state.librarySynced = false; renderSeen(); } }
  }
  function clearSeenFailure(keepHold = false) {
    if (!keepHold) state.seenVoteHold = null;
    state.seenFailure = null; $('#action-error').hidden = true; $('#seen-library-error').hidden = true;
    if ($('#details-seen-error')) $('#details-seen-error').hidden = true;
  }
  function showSeenFailure(message, retry, saved = false) {
    state.seenFailure = retry;
    const text = `${saved ? 'A látott film mentve van, a közös szavazatot újra kell küldeni.' : 'A mentés nem sikerült.'} ${message}`;
    $('#action-error-text').textContent = text; $('#action-error').hidden = false;
    if ($('#seen-dialog').open) { $('#seen-library-error').innerHTML = `<span>${esc(text)}</span><button type="button" class="error-inline-retry" data-action="retry-seen">Újrapróbálom →</button>`; $('#seen-library-error').hidden = false; }
    if ($('#details-dialog').open && $('#details-seen-error')) { $('#details-seen-error').innerHTML = `<span>${esc(text)}</span><button type="button" class="error-inline-retry" data-action="retry-seen">Újrapróbálom →</button>`; $('#details-seen-error').hidden = false; }
  }
  async function updateSeen(value, remove = false) {
    const entry = identity(value);
    state.libraryBusy = true; state.libraryMutation++; setBusy(state.busy); renderSeen();
    try { const data = await post(`/api/library/seen${remove ? '/remove' : ''}`, { movieId: entry.id, mediaType: entry.media_type }); receiveLibrary(data); return data; }
    finally { state.libraryBusy = false; renderSeen(); setBusy(state.busy); }
  }
  async function removeSeen(movieId) {
    if (state.libraryBusy) return;
    const heldSeen = activeSeenVoteHold();
    if (heldSeen?.key === mediaKey(identity(movieId))) { toast('Előbb küldd újra a közös szavazatot, vagy lépj ki a szobából.'); return; }
    if (!heldSeen) clearSeenFailure();
    try { await updateSeen(movieId, true); toast('Kivettük a látott filmek közül. Új keresésben ismét felbukkanhat.'); }
    catch (error) { if (heldSeen && activeSeenVoteHold()) toast(error.message); else showSeenFailure(error.message, () => removeSeen(movieId)); }
  }
  function renderDetailsSeenControl() {
    const control = $('#details-seen-control'); if (!control || !state.currentDetails) return;
    const id = mediaKey(state.currentDetails), isSeen = state.seen.some(movie => mediaKey(movie) === id);
    control.innerHTML = `<button type="button" class="secondary-button details-seen-button${isSeen ? ' is-seen' : ''}" data-details-seen="${id}" ${state.libraryBusy ? 'disabled' : ''}><span aria-hidden="true">${isSeen ? '✓' : '◉'}</span> ${state.libraryBusy ? 'Mentés…' : isSeen ? 'Láttam · visszavonom' : `Már láttam ezt a ${noun(typeOf(state.currentDetails)) === 'film' ? 'filmet' : 'sorozatot'}`}</button><span>${isSeen ? 'Új ajánlásokban már kihagyjuk.' : 'Mentsd a látott történeteid közé.'}</span>`;
  }
  async function toggleDetailsSeen(movieId, requestedRemove = null) {
    if (state.libraryBusy || state.voting || state.autoSeenBusy || state.backupBusy) return;
    const heldSeen = activeSeenVoteHold();
    if (heldSeen?.key === mediaKey(identity(movieId))) { toast('A közös szavazatot az Újrapróbálom gombbal küldheted el.'); return; }
    const remove = requestedRemove === null ? state.seen.some(movie => mediaKey(movie) === mediaKey(identity(movieId))) : requestedRemove;
    const originRoom = state.room ? { code: state.room.code, memberToken: state.room.memberToken, roundVersion: roomVersion() } : null;
    let librarySaved = false;
    if (!heldSeen) clearSeenFailure(); state.roomRevision++;
    try {
      await updateSeen(movieId, remove); librarySaved = true;
      if (!remove && originRoom && state.room?.code === originRoom.code && state.room?.memberToken === originRoom.memberToken && roomVersion() === originRoom.roundVersion && state.room.deck.some(movie => mediaKey(movie) === mediaKey(identity(movieId))) && state.room.myVotes?.[identity(movieId).id] !== 'seen') {
        const data = await post(`/api/rooms/${encodeURIComponent(originRoom.code)}/vote`, { memberToken: originRoom.memberToken, roundVersion: originRoom.roundVersion, movieId: identity(movieId).id, mediaType: identity(movieId).media_type, choice: 'seen' });
        if (state.room?.code === originRoom.code && state.room?.memberToken === originRoom.memberToken && roomVersion() === originRoom.roundVersion) applyRoom(data, false);
      }
      renderCard(); toast(remove ? 'Kivettük a látott filmek közül.' : 'A látott történeteidhez mentettük.'); synchronizeRoomSeen();
    } catch (error) {
      if (librarySaved && originRoom && state.room?.code !== originRoom.code) return;
      if (heldSeen && activeSeenVoteHold()) toast(error.message); else showSeenFailure(error.message, () => toggleDetailsSeen(movieId, remove), librarySaved && !remove && !!originRoom);
    }
  }
  async function retryRoomSeenVote(movieId, code, expectedRound = roomVersion()) {
    if (state.room?.code !== code || roomVersion() !== expectedRound || state.voting || state.autoSeenBusy || state.libraryBusy || state.backupBusy) return;
    const memberToken = state.room.memberToken, key = mediaKey(identity(movieId));
    const stillCurrent = () => state.room?.code === code && state.room?.memberToken === memberToken && roomVersion() === expectedRound;
    const candidate = $('.movie-card');
    const card = candidate && mediaKey({ id: Number(candidate.dataset.movieId), media_type: candidate.dataset.mediaType }) === key ? candidate : null;
    state.voting = true; state.roomRevision++; clearSeenFailure(true); setBusy(state.busy); markVoteSaving(card, 'seen');
    try {
      const data = await post(`/api/rooms/${encodeURIComponent(code)}/vote`, { memberToken, roundVersion: expectedRound, movieId: identity(movieId).id, mediaType: identity(movieId).media_type, choice: 'seen' });
      if (!stillCurrent()) return;
      if (card) await playVoteAnimation(card, 'seen');
      if (!stillCurrent()) return;
      applyRoom(data, false); clearSeenFailure(); toast('A közös szavazatot is mentettük.');
    } catch (error) {
      if (stillCurrent()) { if (card) state.seenVoteHold = { code, memberToken, roundVersion: expectedRound, key }; showSeenFailure(error.message, () => retryRoomSeenVote(movieId, code, expectedRound), true); }
    } finally { clearVoteCardState(card); state.voting = false; setBusy(state.busy); renderCard(); synchronizeRoomSeen(); }
  }
  async function synchronizeRoomSeen() {
    if (accessLocked || !state.room || state.autoSeenBusy || state.voting || state.decisionBusy || state.libraryBusy || state.roundBusy || activeSeenVoteHold()) return;
    const seenIds = new Set(state.seen.map(mediaKey));
    const pending = state.room.deck.filter(movie => seenIds.has(mediaKey(movie)) && !Object.prototype.hasOwnProperty.call(state.room.myVotes || {}, String(movie.id)));
    if (!pending.length) return;
    const code = state.room.code, expectedRound = roomVersion(); state.autoSeenBusy = true; state.roomRevision++; setBusy(state.busy);
    try {
      for (const movie of pending) {
        if (state.room?.code !== code || roomVersion() !== expectedRound) break;
        const data = await post(`/api/rooms/${encodeURIComponent(code)}/vote`, { memberToken: state.room.memberToken, roundVersion: expectedRound, movieId: movie.id, mediaType: typeOf(movie), choice: 'seen' });
        if (state.room?.code === code && roomVersion() === expectedRound) applyRoom(data, false);
      }
    } catch (error) { showSeenFailure(error.message, synchronizeRoomSeen, true); }
    finally { state.autoSeenBusy = false; setBusy(state.busy); renderCard(); maybePromptDecision(); }
  }
  function decisionPromptKey(stage) {
    const decision = state.room?.decision;
    return state.room && decision ? `maeste.decision:${state.room.code}:${roomVersion()}:${decision.version || (decision.candidates || []).map(movie => movie.id).join('-')}:${stage}` : '';
  }
  function decisionWasPrompted(key) { if (state.promptedDecisions.has(key)) return true; try { return sessionStorage.getItem(key) === '1'; } catch { return false; } }
  function rememberDecisionPrompt(stage) { const key = decisionPromptKey(stage); if (!key) return; state.promptedDecisions.add(key); try { sessionStorage.setItem(key, '1'); } catch { /* Session memory is also retained in state. */ } }
  function renderDecision(force = false) {
    const room = state.room, decision = room?.decision;
    $('#decision-banner').hidden = !room || (!(room.matches || []).length && (!decision?.status || decision.status === 'collecting') && (decision?.candidates || []).length < 3); renderRecommendation();
    if (!room) { state.decisionSignature = ''; return; }
    const ready = (decision?.candidates || []).length >= 3;
    const status = decision?.status || 'collecting';
    if (status === 'decided' && $('#decision-dialog').open) rememberDecisionPrompt('winner');
    $('#decision-open').disabled = !ready;
    $('#decision-open').textContent = status === 'decided' ? 'A ma esti film →' : 'Döntőkör →';
    $('#decision-banner').classList.toggle('is-decided', status === 'decided');
    $('#decision-banner-title').textContent = status === 'decided' && decision.winner ? `Ezt nézzük ma este: ${title(decision.winner)}` : status === 'tie' ? 'Két külön választás. Egy utolsó sorsolás.' : ready ? 'Megvan a három döntős. Válasszatok egyet!' : 'Három közös igen. Egy ma esti film.';
    $('#decision-banner-note').textContent = status === 'decided' ? (decision.resolution === 'agreement' ? 'Ugyanarra szavaztatok. Indulhat a film.' : 'A két választásotok közül sorsoltunk.') : status === 'tie' ? 'A két választott filmből közösen indítható sorsolás dönt.' : status === 'waiting' ? 'A te szavazatod megvan. Várjuk a párod választását.' : ready ? 'Mindketten válasszatok a közös kedvenceitek közül.' : `Még ${Math.max(0, 3 - (room.matches || []).length)} közös találat kell a döntőkörhöz.`;
    const signature = `${room.code}:${roomVersion()}:${JSON.stringify(decision)}:${state.decisionBusy}:${state.decisionError}`;
    if (!force && state.decisionSignature === signature) return;
    state.decisionSignature = signature;
    if (!ready) $('#decision-content').innerHTML = '<h2>Gyűjtjük a<br><em>közös kedvenceket.</em></h2><p class="dialog-description">Három közös igen után indul a döntőkör.</p>';
    else if (status === 'decided' && decision.winner) {
      const winner = decision.winner;
      $('#decision-content').innerHTML = `<div class="decision-winner-star" aria-hidden="true">✦</div><h2>Ezt nézzük<br><em>ma este.</em></h2><div class="decision-winner">${image(winner.poster_path, 'w342') ? `<img src="${image(winner.poster_path, 'w342')}" alt="${esc(title(winner))} filmposzter">` : ''}<div><span class="eyebrow">A KÖZÖS VÁLASZTÁSOTOK</span><h3>${esc(title(winner))}</h3><p>${esc(year(winner))}${rating(winner) ? ` · ★ ${rating(winner)}` : ''}</p><button type="button" class="secondary-button" data-details="${mediaKey(winner)}">Részletek és elérhetőség →</button></div></div><p class="decision-resolution">${decision.resolution === 'agreement' ? 'Mindketten erre a filmre szavaztatok.' : 'A két választott filmetek közül ezt sorsoltuk ki.'}</p><button type="button" class="primary-button" data-close-dialog>Jöhet a mozi <span aria-hidden="true">→</span></button>`;
    } else {
      const isTie = status === 'tie';
      const candidates = isTie && decision.tiedCandidates?.length ? decision.tiedCandidates : decision.candidates;
      $('#decision-content').innerHTML = `<h2>${isTie ? 'Két jó választás.<br><em>Döntsön a szerencse.</em>' : 'Három döntős.<br><em>Melyik legyen?</em>'}</h2><p class="dialog-description">${isTie ? 'Más-más filmet választottatok. A sorsolás kizárólag ebből a két filmből választ, és mindkettőtöknél ugyanazt az eredményt mutatja.' : status === 'waiting' ? 'A te szavazatod már megvan. Amíg a párod választ, még módosíthatod.' : 'Válassz egy filmet. Ha ugyanarra szavaztok, megvan a ma esti program.'}</p><div class="decision-candidates">${candidates.map(movie => { const selected = Number(decision.myPick) === Number(movie.id); return `<article class="decision-candidate${selected ? ' selected' : ''}">${image(movie.poster_path,'w154') ? `<img src="${image(movie.poster_path,'w154')}" alt="" loading="lazy">` : '<div class="decision-poster-empty" aria-hidden="true">✦</div>'}<div class="decision-candidate-copy"><h3>${esc(title(movie))}</h3><p>${typeOf(movie) === 'tv' ? 'Sorozat' : 'Film'}${year(movie) ? ` · ${esc(year(movie))}` : ''}${rating(movie) ? ` · ★ ${rating(movie)}` : ''}</p><button type="button" class="candidate-details" data-details="${mediaKey(movie)}">Részletek →</button></div>${!isTie ? `<button type="button" class="decision-pick${selected ? ' selected' : ''}" data-decision-pick="${Number(movie.id)}" ${state.decisionBusy || selected ? 'disabled' : ''}>${selected ? '✓ A választásod' : 'Ezt választom'}</button>` : ''}</article>`; }).join('')}</div><p class="decision-vote-count" role="status">${Number(decision.submittedCount) || 0} / ${Number(decision.memberCount) || 2} szavazat érkezett</p>${isTie ? `<button type="button" id="decision-draw" class="primary-button" ${state.decisionBusy ? 'disabled' : ''}>${state.decisionBusy ? 'Sorsolás…' : 'Sorsolj a két választásból'} <span aria-hidden="true">✦</span></button>` : status === 'waiting' ? '<div class="decision-waiting"><span class="live-dot"></span> Várjuk a párod választását. Az eredmény automatikusan frissül.</div>' : ''}`;
    }
    $('#decision-error').textContent = state.decisionError; $('#decision-error').hidden = !state.decisionError;
  }
  function openDecision() {
    if ((state.room?.decision?.candidates || []).length < 3) return;
    if ($('#match-dialog').open) closeDialog($('#match-dialog'));
    rememberDecisionPrompt(state.room.decision.status === 'decided' ? 'winner' : 'round');
    state.decisionError = ''; renderDecision(true); openDialog($('#decision-dialog'));
  }
  function maybePromptDecision() {
    const decision = state.room?.decision;
    if ((decision?.candidates || []).length < 3 || state.voting || state.decisionBusy || state.autoSeenBusy || $('dialog[open]')) return;
    const stage = decision.status === 'decided' ? 'winner' : 'round';
    if (!decisionWasPrompted(decisionPromptKey(stage))) openDecision();
  }
  async function submitDecision(movieId, draw = false) {
    if (!state.room || state.decisionBusy || state.roundBusy || state.backupBusy) return;
    const code = state.room.code, expectedRound = roomVersion(); state.decisionBusy = true; state.decisionError = ''; state.roomRevision++; renderDecision(true);
    try {
      const data = await post(`/api/rooms/${encodeURIComponent(code)}/decision${draw ? '/draw' : ''}`, { memberToken: state.room.memberToken, roundVersion: expectedRound, ...(draw ? {} : { movieId: Number(movieId) }) });
      if (state.room?.code === code && roomVersion() === expectedRound) applyRoom(data, false);
    } catch (error) { state.decisionError = error.message; }
    finally { state.decisionBusy = false; renderDecision(true); maybePromptDecision(); }
  }

  function renderMediaType() {
    const tv = state.mediaType === 'tv';
    for (const type of ['movie', 'tv']) { const button = $(`#media-${type}`); if (!button) continue; button.classList.toggle('active', state.mediaType === type); button.setAttribute('aria-pressed', String(state.mediaType === type)); button.disabled = !!state.room || state.busy || state.voting || state.libraryBusy || state.backupBusy || state.roundBusy; }
    if ($('#runtime-label')) $('#runtime-label').textContent = tv ? 'Epizódhossz az adatlapon' : 'Ennyi időnk van';
    for (const id of ['quick-solo','quick-pair']) if ($(`#${id}`)) $(`#${id}`).disabled = state.busy || state.voting || state.libraryBusy || state.backupBusy || state.roundBusy;
    $('#runtime-select').disabled = tv || !!state.room;
    if (tv) $('#runtime-select').value = '';
    if ($('#year-from-label')) $('#year-from-label').textContent = tv ? 'Első bemutató ettől' : 'Megjelenés ettől';
    if ($('#year-to-label')) $('#year-to-label').textContent = tv ? 'Első bemutató eddig' : 'Megjelenés eddig';
    const maxYear = new Date().getUTCFullYear() + 5;
    for (const id of ['year-from', 'year-to']) if ($(`#${id}`)) { $(`#${id}`).min = '1870'; $(`#${id}`).max = String(maxYear); $(`#${id}`).step = '1'; }
    if ($('#year-hint')) $('#year-hint').textContent = tv ? `Az első bemutató éve, 1870–${maxYear}. Üresen bármelyik év.` : `Megjelenési év, 1870–${maxYear}. Üresen bármelyik év.`;
    const anyRuntime = $('#runtime-select option[value=""]'); if (anyRuntime) anyRuntime.textContent = tv ? 'Sorozatnál nincs időszűrés' : 'Bármennyi';
    const applyLabel = $('#apply-filters span'); if (applyLabel) applyLabel.textContent = tv ? 'Mutasd a sorozatokat' : 'Mutasd a filmeket';
    $('#vote-no').setAttribute('aria-label', `${tv ? 'Sorozat' : 'Film'} kihagyása`);
    $('#vote-seen').setAttribute('aria-label', `Már láttam ezt a ${tv ? 'sorozatot' : 'filmet'}`);
    $('#vote-yes').setAttribute('aria-label', `Tetszik ez a ${tv ? 'sorozat' : 'film'}`);
  }
  async function changeMediaType(type) {
    if (!['movie', 'tv'].includes(type) || type === state.mediaType || state.room || state.busy || state.voting || state.libraryBusy || state.backupBusy) return;
    const previous = filters(); clearSeenFailure(); state.mediaType = type; state.configReady = false; state.discoverSerial++; state.history = []; state.recommendation = null;
    setBusy(true); showState('loading');
    cancelSearch(true);
    const next = { ...previous, mediaType: type, genres: [], excludedGenres: [], runtime: type === 'tv' ? null : previous.runtime };
    save('maeste.filters', next);
    try { await loadConfig({ filterValues: next }); if (state.mediaType !== type) return; await discover(); }
    catch (error) { setBusy(false); showState('error', error.message); }
    finally { renderMediaType(); renderTaste(); renderLists(); }
  }
  function availabilityPair() {
    const current = state.deck[state.index], next = state.deck[state.index + 1];
    return new Set([current, next].filter(Boolean).map(mediaKey));
  }
  function pruneAvailability() {
    const keep = availabilityPair();
    for (const key of state.availabilityCache.keys()) if (!keep.has(key)) state.availabilityCache.delete(key);
    for (const [key, task] of state.availabilityPending) if (!keep.has(key)) { task.controller.abort(); state.availabilityPending.delete(key); }
  }
  function requestAvailability(movie) {
    const key = mediaKey(movie); pruneAvailability();
    const cached = state.availabilityCache.get(key); if (cached) return Promise.resolve(cached);
    if (state.availabilityPending.has(key)) return state.availabilityPending.get(key).promise;
    const controller = new AbortController(), timeout = setTimeout(() => controller.abort(), 15000);
    const promise = api(`/api/availability/${Number(movie.id)}?mediaType=${typeOf(movie)}`, { signal: controller.signal }).then(data => {
      const result = { providers: Array.isArray(data.providers) ? data.providers.filter(provider => provider && typeof provider.provider_name === 'string') : [], available: data.available === true };
      if (availabilityPair().has(key)) state.availabilityCache.set(key, result);
      return result;
    }).finally(() => { clearTimeout(timeout); if (state.availabilityPending.get(key)?.controller === controller) state.availabilityPending.delete(key); });
    state.availabilityPending.set(key, { controller, promise }); return promise;
  }
  function prefetchAvailability(movie) { requestAvailability(movie).catch(() => {}); }
  async function loadCardAvailability(movie) {
    const key = mediaKey(movie), card = $('.movie-card'), element = $('.card-availability', card || document);
    if (!element) return;
    try {
      const result = await requestAvailability(movie);
      if (!card?.isConnected || mediaKey({ id: Number(card.dataset.movieId), media_type: card.dataset.mediaType }) !== key || mediaKey(state.deck[state.index] || {}) !== key) return;
      element.className = 'card-availability';
      if (result.providers.length) element.innerHTML = `<span class="availability-label">Előfizetéssel</span> ${result.providers.slice(0, 3).map(provider => `<span class="availability-service">${esc(provider.provider_name)}</span>`).join('')}${result.providers.length > 3 ? `<span class="availability-more">+${result.providers.length - 3}</span>` : ''}`;
      else { element.classList.add('availability-empty'); element.textContent = 'Nincs magyar előfizetéses elérhetőségi adat'; }
    } catch {
      if (!card?.isConnected || mediaKey(state.deck[state.index] || {}) !== key) return;
      element.className = 'card-availability availability-error'; element.textContent = 'Az elérhetőség most nem ellenőrizhető';
    }
  }
  function setConnection(value) { state.connection = navigator.onLine === false ? 'offline' : value; renderConnection(); }
  function renderConnection() {
    const banner = $('#connection-banner'), element = $('#connection-status'), retry = $('#connection-retry'); if (!element) return;
    const status = navigator.onLine === false ? 'offline' : state.connection;
    if (banner) banner.hidden = !state.room && status === 'connected';
    element.dataset.state = status;
    element.textContent = status === 'offline' ? 'Nincs internetkapcsolat. A szoba legutóbbi állapotát látod; a döntéseket kapcsolódás után mentheted.' : status === 'reconnecting' ? 'Újracsatlakozunk. A legutóbbi mentett állapotot látod.' : state.room ? 'Kapcsolat rendben · Automatikus frissítés' : 'Kapcsolat rendben.';
    if (retry) { retry.hidden = status === 'connected'; retry.disabled = state.pollBusy; }
    if (state.room) { $('#pair-banner').dataset.connection = status; const dot = $('.live-dot', $('#pair-banner')); if (dot) dot.style.opacity = status === 'connected' ? '' : '.35'; if (status !== 'connected') $('#pair-status').textContent = 'A szoba legutóbbi mentett állapota'; }
  }
  async function reconnect() {
    if (accessLocked) return;
    if (navigator.onLine === false) { setConnection('offline'); return; }
    setConnection('reconnecting');
    if (state.room) await pollRoom();
    else { try { await api('/api/health'); setConnection('connected'); await loadLibrary(); if (!state.busy && !state.voting) { if (state.configReady) await discover(); else await initialize(); } } catch { setConnection('reconnecting'); } }
    renderConnection();
  }
  function roundControls() {
    const room = state.room; if (!room) return '';
    const ready = room.roundReady === true;
    const matches = room.matches || [];
    const message = state.roundBusy ? 'Készül a következő közös válogatás…' : state.roundError || (!ready ? (room.members?.length < 2 ? 'Az új körhöz a párod csatlakozása és minden szavazat szükséges.' : matches.length ? 'Válasszatok a közös találatokból. A sorsolás egy vagy két találattal is működik.' : 'Várjuk, hogy a párod is befejezze ezt a kört.') : (room.hasMoreRounds === false ? 'A jelenlegi válogatás elfogyott. Ellenőrizhetjük, indítható-e további kör.' : 'Mindketten végeztetek. Indíthattok új közös válogatást ugyanebben a szobában.'));
    return `<div class="round-controls"><p class="round-status" role="status">${esc(message)}</p>${state.roundRelaxNeeded ? `<button type="button" class="secondary-button" data-action="relax-round" ${!ready || state.roundBusy ? 'disabled' : ''}>Új kör tágabb szűréssel →</button><p class="field-hint">A műfajt, játékidőt és minimumértékelést töröljük. A szolgáltatók, az évek, a kizárt műfajok és a ${state.mediaType === 'tv' ? 'sorozat' : 'film'} mód megmarad.</p>` : `<button type="button" class="secondary-button" data-action="next-round" ${!ready || state.roundBusy ? 'disabled' : ''}>${state.roundBusy ? 'Új kör indítása…' : 'Új közös kör →'}</button>`}</div>`;
  }
  async function nextRound(relax = false) {
    if (!state.room || state.roundBusy || state.room.roundReady !== true || state.voting || state.libraryBusy || state.decisionBusy) return;
    const origin = { code: state.room.code, memberToken: state.room.memberToken, roundVersion: roomVersion() };
    state.roundBusy = true; state.roundError = ''; state.roomRevision++; renderCard(); renderMediaType();
    try {
      const data = await post(`/api/rooms/${encodeURIComponent(origin.code)}/round`, { memberToken: origin.memberToken, roundVersion: origin.roundVersion, ...(relax ? { relax: true } : {}) });
      if (state.room?.code === origin.code && roomVersion() === origin.roundVersion) { state.roundRelaxNeeded = false; applyRoom(data, false); toast('Új közös kör indult. A szobakódotok változatlan.'); }
    } catch (error) {
      if (state.room?.code !== origin.code || roomVersion() !== origin.roundVersion) return;
      state.roundError = error.message; if (error.status === 422) state.roundRelaxNeeded = true;
      if (error.status === 409) { state.roundError = 'A szoba közben frissült. Ellenőrizzük az aktuális kört.'; }
    } finally { state.roundBusy = false; renderCard(); renderMediaType(); if (state.room?.code === origin.code) pollRoom(); }
  }
  function backupStatus(message, error = false) { const element = $('#backup-status'); if (!element) return; element.hidden = false; element.textContent = message; element.classList.toggle('is-error', error); }
  function backupControls(busy) { state.backupBusy = busy; setBusy(state.busy); $$('[data-remove]').forEach(button => { button.disabled = busy; }); for (const id of ['backup-import','backup-export']) if ($(`#${id}`)) $(`#${id}`).disabled = busy; renderMediaType(); }
  function exportBackup() {
    try {
      if (!window.MaesteBackup) throw new Error('A mentéshez szükséges modul nem töltődött be. Frissítsd az oldalt.');
      const serialized = window.MaesteBackup.serialize({ likes: state.likes, seen: state.seen, dismissed: state.dismissed });
      const url = URL.createObjectURL(new Blob([serialized], { type: 'application/json;charset=utf-8' }));
      const link = document.createElement('a'); link.href = url; link.download = `maeste-mentes-${new Date().toISOString().slice(0, 10)}.json`; link.hidden = true; document.body.append(link); link.click(); link.remove(); setTimeout(() => URL.revokeObjectURL(url), 1000);
      backupStatus(`Mentés elkészült: ${state.likes.length} kedvenc és ${state.seen.length} látott cím és ${state.dismissed.length} ízlésjelzés. A fájl kizárólag a listáidat tartalmazza.`);
    } catch (error) { backupStatus(error.message, true); }
  }
  async function importBackup(file) {
    if (!file || state.backupBusy || state.libraryBusy || state.voting || state.roundBusy) return;
    backupControls(true);
    let imported = 0;
    try {
      if (file.size > 1024 * 1024) throw new Error('A mentés legfeljebb 1 MB méretű lehet.');
      if (!window.MaesteBackup) throw new Error('A mentéshez szükséges modul nem töltődött be. Frissítsd az oldalt.');
      let parsed; try { parsed = JSON.parse(await file.text()); } catch { throw new Error('Ez nem olvasható JSON-mentés. Válaszd a MaEste által exportált fájlt.'); }
      const incoming = window.MaesteBackup.normalize(parsed);
      const mergedLikes = window.MaesteBackup.merge(state.likes, incoming.likes);
      const mergedDismissed = boundDismissed(window.MaesteBackup.merge(state.dismissed, incoming.dismissed || []), mergedLikes);
      await loadLibrary();
      state.libraryBusy = true; state.libraryMutation++; setBusy(state.busy); renderSeen();
      const known = new Set(state.librarySynced ? state.seen.map(mediaKey) : []);
      const remaining = incoming.seen.filter(item => !known.has(mediaKey(item)));
      for (let offset = 0; offset < remaining.length; offset += 10) {
        const chunk = remaining.slice(offset, offset + 10);
        backupStatus(`Látott címek visszaállítása: ${imported} / ${remaining.length}…`);
        const data = await post('/api/library/import', { items: chunk.map(item => ({ id: Number(item.id), media_type: typeOf(item) })) });
        receiveLibrary(data); imported += chunk.length;
      }
      state.likes = mergedLikes; save('maeste.likes', state.likes); state.dismissed = mergedDismissed; persistDismissed(); renderLists(); renderSearchResults();
      backupStatus(`Visszaállítás kész: ${incoming.likes.length} kedvenc és ${incoming.seen.length} látott cím és ${(incoming.dismissed || []).length} ízlésjelzés feldolgozva. A meglévő listák megmaradtak.`);
      renderCard();
    } catch (error) { backupStatus(`${error.message}${imported ? ` ${imported} látott címet már mentettünk; ugyanennek a fájlnak az újrapróbálása biztonságos.` : ''}`, true); }
    finally { state.libraryBusy = false; backupControls(false); renderSeen(); setBusy(state.busy); renderCard(); synchronizeRoomSeen(); if ($('#backup-file')) $('#backup-file').value = ''; }
  }
  function randomChoice() {
    const movies = likedMovies(); if (!movies.length) return;
    const values = new Uint32Array(1); crypto.getRandomValues(values); const movie = movies[values[0] % movies.length];
    toast(state.room ? 'A ma esti közös választásotok… ✦' : 'A ma esti választásod… ✦'); openDetails(mediaKey(movie));
  }

  function openPairFlow() { toggleFilters(false); roomError(); openDialog($('#room-dialog')); }
  function quickSolo() { if (state.room) { openPairFlow(); return; } toggleFilters(false); const card = $('.movie-card') || $('#card-stage'); card.setAttribute('tabindex', '-1'); card.focus({ preventScroll: true }); $('#main-content').scrollIntoView({ behavior: matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth', block: 'start' }); }
  for (const type of ['movie', 'tv']) $(`#media-${type}`)?.addEventListener('click', () => changeMediaType(type));
  $('#quick-solo')?.addEventListener('click', quickSolo);
  $('#quick-pair')?.addEventListener('click', openPairFlow);
  $('#connection-retry')?.addEventListener('click', reconnect);
  window.addEventListener('offline', () => { setConnection('offline'); });
  window.addEventListener('online', () => { setConnection('reconnecting'); reconnect(); });
  $('#backup-export')?.addEventListener('click', exportBackup);
  $('#backup-import')?.addEventListener('click', () => { if (!state.backupBusy) $('#backup-file')?.click(); });
  $('#backup-file')?.addEventListener('change', event => { if (event.target.files?.[0]) importBackup(event.target.files[0]); });
  if ($('#title-search-form')) { $('#title-search-form').noValidate = true; $('#title-search-form').addEventListener('submit', event => { event.preventDefault(); searchTitles(); }); }
  $('#title-search-input')?.addEventListener('input', () => { searchValidation(); if (state.searchBusy && $('#title-search-input').value.trim() !== state.searchQuery) cancelSearch(); });
  $('#search-more')?.addEventListener('click', () => { if (!state.searchBusy && state.searchHasMore) searchTitles({ more: true }); });
  $('#excluded-genres')?.addEventListener('click', event => { const button = event.target.closest('[data-excluded-genre]'); if (!button || state.room) return; const id = Number(button.dataset.excludedGenre); if (state.excludedGenres.has(id)) state.excludedGenres.delete(id); else { state.excludedGenres.add(id); if (Number($('#genre-select').value) === id) $('#genre-select').value = ''; } renderExcludedGenres(); syncMoodButtons(); renderSummary(); });
  for (const id of ['year-from', 'year-to']) $(`#${id}`)?.addEventListener('input', () => { $(`#${id}`).setCustomValidity(''); $(`#${id}`).removeAttribute('aria-invalid'); if ($('#filter-validation')) $('#filter-validation').hidden = true; renderSummary(); });
  $('#filters-form').noValidate = true;
  $('#seen-open').addEventListener('click', () => { renderSeen(); openDialog($('#seen-dialog')); if (!state.libraryBusy) loadLibrary(); });
  $('#seen-sync').addEventListener('click', loadLibrary);
  $('#decision-open').addEventListener('click', openDecision);
  $('#taste-recommended').addEventListener('click', () => { state.taste = 'recommended'; save('maeste.taste', state.taste); renderTaste(); });
  $('#taste-popular').addEventListener('click', () => { state.taste = 'popular'; save('maeste.taste', state.taste); renderTaste(); });
  $('#filters-toggle').setAttribute('aria-expanded', 'false');
  $('#filters-toggle').addEventListener('click', () => toggleFilters(true));
  $('#filters-close').addEventListener('click', () => toggleFilters(false));
  $('#filters-backdrop').addEventListener('click', () => toggleFilters(false));
  $('#provider-options').addEventListener('click', event => { if (event.target.closest('#providers-more')) { const expanded = $('#provider-options').classList.toggle('is-expanded'); $('#providers-more').setAttribute('aria-expanded', String(expanded)); $('#providers-more').textContent = expanded ? 'Kevesebb szolgáltató −' : `További szolgáltatók (${Math.max(0, state.providers.length - 7)}) +`; return; } const button = event.target.closest('[data-provider]'); if (!button || state.room) return; const id = button.dataset.provider; if (id === 'any') state.selectedProviders.clear(); else if (state.selectedProviders.has(Number(id))) state.selectedProviders.delete(Number(id)); else state.selectedProviders.add(Number(id)); syncProviderButtons(); renderSummary(); });
  $$('.mood-chip').forEach(button => button.addEventListener('click', () => { if (state.room) return; $('#genre-select').value = button.dataset.mood; reconcileIncludedGenre(); }));
  for (const id of ['genre-select','runtime-select','rating-select']) $(`#${id}`).addEventListener('change', () => { if (id === 'genre-select') reconcileIncludedGenre(); else { syncMoodButtons(); renderSummary(); } });
  $('#filters-form').addEventListener('submit', async event => { event.preventDefault(); if (state.room || state.busy || state.voting || state.libraryBusy || state.backupBusy) return; toggleFilters(false); if (!state.configReady) { await initialize(); return; } await discover(); });
  $('#vote-no').addEventListener('click', () => vote('no')); $('#vote-yes').addEventListener('click', () => vote('yes')); $('#vote-seen').addEventListener('click', () => vote('seen')); $('#undo-vote').addEventListener('click', undoVote);
  $('#favorites-open').addEventListener('click', () => { renderLists(); openDialog($('#favorites-dialog')); });
  $('#random-choice').addEventListener('click', randomChoice); $('#favorites-random').addEventListener('click', randomChoice);
  $('#pair-mode').addEventListener('click', openPairFlow);
  $('#room-info').addEventListener('click', () => { roomError(); openDialog($('#room-dialog')); });
  $('#solo-mode').addEventListener('click', () => { if (state.room) { roomError(); openDialog($('#room-dialog')); } });
  $('#create-room').addEventListener('click', () => startRoom()); $('#join-room').addEventListener('click', () => startRoom(true));
  $('#join-code').addEventListener('input', event => { event.target.value = event.target.value.toUpperCase().replace(/[^A-Z0-9]/g, ''); });
  $('#join-code').addEventListener('keydown', event => { if (event.key === 'Enter') startRoom(true); });
  $('#copy-invite').addEventListener('click', () => copyInvite()); $('#share-room').addEventListener('click', () => copyInvite(true)); $('#leave-room').addEventListener('click', leaveRoom); $('#match-continue').addEventListener('click', () => closeDialog($('#match-dialog')));
  document.addEventListener('click', event => {
    const close = event.target.closest('[data-close-dialog]'); if (close) { closeDialog(close.closest('dialog')); return; }
    const searchLike = event.target.closest('[data-search-like]'); if (searchLike) { favoriteSearchItem(searchLike.dataset.searchLike); return; }
    const searchSeen = event.target.closest('[data-search-seen]'); if (searchSeen) { seenSearchItem(searchSeen.dataset.searchSeen); return; }
    const seenRemove = event.target.closest('[data-seen-remove]'); if (seenRemove) { removeSeen(seenRemove.dataset.seenRemove); return; }
    const detailsSeen = event.target.closest('[data-details-seen]'); if (detailsSeen) { toggleDetailsSeen(detailsSeen.dataset.detailsSeen); return; }
    const pick = event.target.closest('[data-decision-pick]'); if (pick) { submitDecision(Number(pick.dataset.decisionPick)); return; }
    if (event.target.closest('#decision-draw')) { submitDecision(null, true); return; }
    const details = event.target.closest('[data-details]'); if (details) { openDetails(details.dataset.details); return; }
    const remove = event.target.closest('[data-remove]'); if (remove && !state.room && !state.backupBusy) { state.likes = state.likes.filter(movie => mediaKey(movie) !== mediaKey(identity(remove.dataset.remove))); save('maeste.likes', state.likes); renderLists(); toast('A filmet levettük a listádról.'); return; }
    const action = event.target.closest('[data-action]')?.dataset.action;
    if (action === 'retry') { if (state.configReady) discover(); else initialize(); }
    if (action === 'next-page') discover({ next: true });
    if (action === 'edit-filters') { if (matchMedia('(max-width:640px)').matches) toggleFilters(true); else $('#genre-select').focus(); }
    if (action === 'open-list') { renderLists(); openDialog($('#favorites-dialog')); }
    if (action === 'undo-last') undoVote();
    if (action === 'retry-seen' && state.seenFailure) state.seenFailure();
    if (action === 'next-round') nextRound();
    if (action === 'relax-round') nextRound(true);
    if (action === 'retry-search') searchTitles({ more: state.searchFailedMore });
  });
  $$('dialog').forEach(dialog => {
    dialog.addEventListener('click', event => { if (event.target === dialog) { const bounds = dialog.getBoundingClientRect(); if (event.clientX < bounds.left || event.clientX > bounds.right || event.clientY < bounds.top || event.clientY > bounds.bottom) closeDialog(dialog); } });
    dialog.addEventListener('close', () => { if (dialog.id === 'details-dialog') state.detailsSerial++; if (dialog.id === 'search-dialog') cancelSearch(); queueMicrotask(maybePromptDecision); });
  });
  document.addEventListener('keydown', event => {
    if (accessLocked) return;
    if (event.key === 'Escape' && $('#filters-panel').classList.contains('is-open')) toggleFilters(false);
    if ($('dialog[open]') || document.body.classList.contains('sheet-open') || /INPUT|SELECT|TEXTAREA|BUTTON/.test(event.target.tagName) || event.altKey || event.ctrlKey || event.metaKey) return;
    if (event.key === 'ArrowLeft') { event.preventDefault(); vote('no'); }
    if (event.key === 'ArrowRight') { event.preventDefault(); vote('yes'); }
    if (event.key === 'ArrowDown') { event.preventDefault(); vote('seen'); }
  });
  document.addEventListener('visibilitychange', () => { if (!accessLocked && !document.hidden) { pollRoom(); if (!state.libraryBusy) loadLibrary().then(() => { if (!state.voting && !state.busy) renderCard(); synchronizeRoomSeen(); }); } });
  setInterval(pollRoom, 4000);
  async function initialize() {
    if (accessLocked) return;
    const epoch = accessEpoch;
    setBusy(true); showState('loading');
    try {
      await Promise.all([state.configReady ? Promise.resolve() : loadConfig(), loadLibrary()]);
      if (accessLocked || epoch !== accessEpoch) return;
      $('#player-name').value = read('maeste.name', '') || '';
      const inviteCode = new URL(location.href).searchParams.get('room');
      const savedRoom = read('maeste.room', null);
      if (savedRoom?.code && savedRoom?.memberToken && (!inviteCode || inviteCode.toUpperCase() === savedRoom.code)) {
        try { const data = await api(`/api/rooms/${encodeURIComponent(savedRoom.code)}?memberToken=${encodeURIComponent(savedRoom.memberToken)}`); applyRoom({ ...data, memberToken: savedRoom.memberToken }, false); clearInviteQuery(); return; }
        catch (error) { if (error.code === 'ACCESS_REQUIRED') throw error; save('maeste.room', null); toast('A korábbi szoba nem elérhető. Indíthatsz új moziestet.'); }
      }
      await discover();
      if (!accessLocked && epoch === accessEpoch && inviteCode) { $('#join-code').value = inviteCode.toUpperCase().replace(/[^A-Z0-9]/g,'').slice(0, 8); openDialog($('#room-dialog')); $('#player-name').focus(); }
    } catch (error) { setBusy(false); showState('error', error.message); }
    finally { renderLists(); renderRoom(); renderSummary(); renderSeen(); renderTaste(); }
  }
  state.dismissed = boundDismissed(state.dismissed); save('maeste.dismissed', state.dismissed);
  renderConnection(); renderMediaType();
  $('#access-form').addEventListener('submit', unlockAccess);
  $('#access-retry').addEventListener('click', checkAccess);
  $('#access-logout').addEventListener('click', () => { accessBootstrapSerial++; lockAccess('Kiléptél. A listáid megmaradtak ebben a böngészőben.'); });
  checkAccess();
})();
