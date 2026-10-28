/** Show offline readiness only after the active worker confirms the whole shell. */
export async function setupOffline() {
  const status = document.getElementById('offline-status');
  const show = message => { if (status) status.textContent = message; };
  if (!('serviceWorker' in navigator) || !globalThis.isSecureContext) {
    show('Az offline mentés ebben a böngészőben nem érhető el. Internetkapcsolattal játszhattok.');
    return null;
  }
  let ready = false;
  let registration;
  const updateStatus = () => {
    if (registration?.waiting) {
      show(`${ready ? 'Offline játékra kész. ' : ''}Új változat érhető el. A játék végén zárjátok be a játék összes lapját, majd nyissátok meg újra.`);
    } else if (ready) {
      show(navigator.onLine === false ? 'Offline vagytok · a játék internet nélkül is működik.' : 'Offline játékra kész · később internet nélkül is megnyitható ezen az eszközön.');
    } else {
      show('Az offline változat letöltése folyamatban…');
    }
  };
  const inspect = worker => {
    if (!worker || typeof MessageChannel === 'undefined') return;
    const channel = new MessageChannel();
    const timeout = setTimeout(() => { channel.port1.close(); channel.port2.close(); }, 5000);
    channel.port1.onmessage = event => {
      clearTimeout(timeout);
      channel.port1.close();
      channel.port2.close();
      if (event.data?.type === 'OFFLINE_STATUS') ready = event.data.ready === true;
      updateStatus();
    };
    try { worker.postMessage({ type: 'OFFLINE_STATUS' }, [channel.port2]); }
    catch { clearTimeout(timeout); channel.port1.close(); channel.port2.close(); }
  };
  try {
    show('Az offline változat letöltése folyamatban…');
    registration = await navigator.serviceWorker.register(new URL('./sw.js', import.meta.url), { scope: './', updateViaCache: 'none' });
    const watch = worker => {
      if (!worker) return;
      worker.addEventListener('statechange', () => {
        if (worker.state === 'activated') inspect(worker);
        else if (worker.state === 'installed') updateStatus();
        else if (worker.state === 'redundant' && !ready) show('Az offline változat most nem tölthető le. Internetkapcsolattal tovább játszhattok; később nyissátok meg újra.');
      });
    };
    watch(registration.installing);
    registration.addEventListener('updatefound', () => { watch(registration.installing); updateStatus(); });
    navigator.serviceWorker.addEventListener('controllerchange', () => inspect(navigator.serviceWorker.controller));
    globalThis.addEventListener('online', updateStatus);
    globalThis.addEventListener('offline', updateStatus);
    if (registration.active) inspect(registration.active);
    // Do not await ready: a failed first installation must not block the game.
    navigator.serviceWorker.ready.then(result => inspect(result.active)).catch(() => {});
    updateStatus();
    registration.update().catch(() => {});
    return registration;
  } catch {
    show('Az offline mentés most nem érhető el. Internetkapcsolattal tovább játszhattok.');
    return null;
  }
}
