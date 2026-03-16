export function createSyncService(showToast) {
  let status = navigator.onLine ? 'online' : 'offline';
  const subscribers = new Set();

  function notify() {
    subscribers.forEach((fn) => fn(status));
  }

  window.addEventListener('online', () => {
    status = 'online';
    notify();
    if (showToast) showToast('Back online. Local data is active.', 2200);
  });

  window.addEventListener('offline', () => {
    status = 'offline';
    notify();
    if (showToast) showToast('Offline mode enabled. Entries stay local.', 2600);
  });

  return {
    getStatus() {
      return status;
    },
    subscribe(fn) {
      subscribers.add(fn);
      fn(status);
      return () => subscribers.delete(fn);
    }
  };
}
