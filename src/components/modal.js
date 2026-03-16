import { escapeHtml } from '../utils/format.js';

export function createModal(root) {
  if (!root) {
    return {
      alert: async () => {},
      confirm: async () => false,
      close: () => {}
    };
  }

  function close() {
    root.classList.remove('is-open');
    root.innerHTML = '';
  }

  function render({ title, bodyHtml, actions }) {
    root.innerHTML = `
      <div class="modal-card" role="dialog" aria-modal="true">
        <h3>${escapeHtml(title)}</h3>
        <div>${bodyHtml}</div>
        <div class="modal-actions" id="modalActions"></div>
      </div>
    `;
    const actionsHost = root.querySelector('#modalActions');
    actions.forEach((action) => {
      const btn = document.createElement('button');
      btn.className = action.primary ? 'btn btn-primary' : 'btn';
      btn.type = 'button';
      btn.textContent = action.label;
      btn.addEventListener('click', action.onClick);
      actionsHost.appendChild(btn);
    });
    root.classList.add('is-open');
  }

  function alert(title, message) {
    const safeMessage = escapeHtml(message).replace(/\n/g, '<br>');
    return new Promise((resolve) => {
      render({
        title,
        bodyHtml: `<p class="muted">${safeMessage}</p>`,
        actions: [{ label: 'Close', primary: true, onClick: () => { close(); resolve(); } }]
      });
    });
  }

  function confirm(title, message) {
    const safeMessage = escapeHtml(message).replace(/\n/g, '<br>');
    return new Promise((resolve) => {
      render({
        title,
        bodyHtml: `<p class="muted">${safeMessage}</p>`,
        actions: [
          { label: 'Cancel', onClick: () => { close(); resolve(false); } },
          { label: 'Confirm', primary: true, onClick: () => { close(); resolve(true); } }
        ]
      });
    });
  }

  root.addEventListener('click', (event) => {
    if (event.target === root) close();
  });

  return { alert, confirm, close };
}
