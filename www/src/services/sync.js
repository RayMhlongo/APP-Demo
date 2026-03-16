const OFFLINE_WRITES_KEY = 'creamtrack.offline_writes';

function readOfflineWrites() {
  try {
    return Math.max(0, Number(localStorage.getItem(OFFLINE_WRITES_KEY) || 0));
  } catch {
    return 0;
  }
}

function writeOfflineWrites(value) {
  try {
    localStorage.setItem(OFFLINE_WRITES_KEY, String(Math.max(0, Number(value || 0))));
  } catch {
    // Ignore localStorage failures.
  }
}

export function createSyncService(showToast) {
  let status = navigator.onLine ? 'online' : 'offline';
  let offlineWrites = readOfflineWrites();
  const subscribers = new Set();

  function notify() {
    subscribers.forEach((fn) => fn({ status, offlineWrites }));
  }

  window.addEventListener('online', () => {
    status = 'online';
    notify();
    if (showToast) {
      if (offlineWrites > 0) showToast(`Back online. ${offlineWrites} change(s) already saved locally.`, 2800);
      else showToast('Back online. Local data is active.', 2200);
    }
    offlineWrites = 0;
    writeOfflineWrites(offlineWrites);
    notify();
  });

  window.addEventListener('offline', () => {
    status = 'offline';
    notify();
    if (showToast) showToast('Offline mode enabled. Changes stay local until connection returns.', 2600);
  });

  return {
    getStatus() {
      return { status, offlineWrites };
    },
    recordLocalWrite() {
      if (status !== 'offline') return;
      offlineWrites += 1;
      writeOfflineWrites(offlineWrites);
      notify();
    },
    subscribe(fn) {
      subscribers.add(fn);
      fn({ status, offlineWrites });
      return () => subscribers.delete(fn);
    }
  };
}
