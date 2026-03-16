import { assistantReply } from '../../services/analytics.js';
import { escapeHtml } from '../../utils/format.js';

export function initAssistantFeature({ store, showToast }) {
  const stateEl = document.getElementById('assistantState');
  const chatEl = document.getElementById('assistantChat');
  const form = document.getElementById('assistantForm');
  const input = document.getElementById('assistantInput');
  const sendBtn = document.getElementById('assistantSendBtn');
  const quickBtns = [...document.querySelectorAll('[data-assistant-q]')];

  const messages = [];

  function setState(text, mode = 'info') {
    stateEl.textContent = text;
    stateEl.dataset.mode = mode;
  }

  function pushMessage(role, text) {
    messages.push({ role, text, at: new Date().toISOString() });
    renderMessages();
  }

  function renderMessages() {
    if (!messages.length) {
      chatEl.innerHTML = '<div class="msg assistant">No messages yet. Ask a question to begin.</div>';
      return;
    }

    chatEl.innerHTML = messages
      .map((message) => `<div class="msg ${message.role === 'user' ? 'user' : 'assistant'}">${escapeHtml(message.text).replace(/\n/g, '<br>')}</div>`)
      .join('');
    chatEl.scrollTop = chatEl.scrollHeight;
  }

  async function answer(question) {
    const q = String(question || '').trim();
    if (!q) {
      setState('Please type a question first.', 'error');
      return;
    }
    if (sendBtn.disabled) return;

    pushMessage('user', q);
    sendBtn.disabled = true;
    sendBtn.textContent = 'Sending...';
    input.disabled = true;
    setState('Assistant is thinking...', 'sending');

    try {
      await new Promise((resolve) => setTimeout(resolve, 350));
      const response = assistantReply(q, store.getState());
      if (!response || !String(response).trim()) {
        throw new Error('Assistant returned an empty response.');
      }
      pushMessage('assistant', response);
      setState('Response ready.', 'success');
    } catch (error) {
      const fallback = 'I could not process that request. Ask about today sales, week summary, missed-day reasons, or strongest day.';
      pushMessage('assistant', fallback);
      setState(`Assistant error: ${error.message || 'Unknown issue.'}`, 'error');
      showToast('Assistant had an issue. A fallback reply was shown.');
    } finally {
      sendBtn.disabled = false;
      sendBtn.textContent = 'Send';
      input.disabled = false;
      input.focus();
    }
  }

  form.addEventListener('submit', async (event) => {
    event.preventDefault();
    const question = input.value;
    input.value = '';
    await answer(question);
  });

  quickBtns.forEach((btn) => {
    btn.addEventListener('click', async () => {
      const question = btn.dataset.assistantQ || '';
      if (!question) return;
      await answer(question);
    });
  });

  renderMessages();

  return {
    render() {
      if (!messages.length) setState('Ask a question to get quick business guidance.', 'idle');
    },
    answer
  };
}
