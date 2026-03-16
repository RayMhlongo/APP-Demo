let hideTimer = null;

export function createToast(el) {
  return function showToast(message, timeout = 2600) {
    if (!el) return;
    el.textContent = message;
    el.classList.add('show');
    if (hideTimer) clearTimeout(hideTimer);
    hideTimer = setTimeout(() => el.classList.remove('show'), timeout);
  };
}
