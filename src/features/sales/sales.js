import { todayISO, formatHumanDate } from '../../utils/date.js';
import { escapeHtml, formatMoney, toNumber } from '../../utils/format.js';
import { uid } from '../../utils/id.js';
import { validateNoSaleInput, validateSaleInput } from '../../services/validation.js';

export function initSalesFeature({ store, showToast, modal, renderAll, telemetry }) {
  const saleForm = document.getElementById('saleForm');
  const noSaleForm = document.getElementById('noSaleForm');
  const saleDate = document.getElementById('saleDate');
  const noSaleDate = document.getElementById('noSaleDate');
  const saleSubmitBtn = document.getElementById('saleSubmitBtn');
  const noSaleSubmitBtn = document.getElementById('noSaleSubmitBtn');
  const dayLogList = document.getElementById('dayLogList');
  const noSaleReason = document.getElementById('noSaleReason');
  const customReasonWrap = document.getElementById('customReasonWrap');

  let editingSaleId = '';
  let editingNoSaleId = '';

  saleDate.value = todayISO();
  noSaleDate.value = todayISO();

  function fillSelectors(state) {
    const customerSelect = document.getElementById('saleCustomer');
    const productSelect = document.getElementById('saleProduct');
    const currency = state.settings.currency || 'ZAR';

    customerSelect.innerHTML = ['<option value="">Walk-in / no customer</option>', ...state.customers.map((customer) => `<option value="${escapeHtml(customer.id)}">${escapeHtml(customer.name)}</option>`)].join('');
    productSelect.innerHTML = state.products.map((product) => `<option value="${escapeHtml(product.id)}">${escapeHtml(product.name)} (${formatMoney(product.price, currency)})</option>`).join('');
  }

  function resetForms() {
    editingSaleId = '';
    editingNoSaleId = '';
    saleSubmitBtn.textContent = 'Save Sale';
    noSaleSubmitBtn.textContent = 'Save No-Sale Day';
    saleForm.reset();
    noSaleForm.reset();
    saleDate.value = todayISO();
    noSaleDate.value = todayISO();
    document.getElementById('saleQty').value = '1';
    noSaleReason.value = '';
    customReasonWrap.hidden = true;
  }

  function getNoSaleForDate(state, date, ignoreId = '') {
    return state.entries.find((entry) => entry.type === 'no_sale' && entry.date === date && entry.id !== ignoreId);
  }

  function getSalesForDate(state, date, ignoreId = '') {
    return state.entries.filter((entry) => entry.type === 'sale' && entry.date === date && entry.id !== ignoreId);
  }

  function latestSaleDuplicate(state, candidate, ignoreId = '') {
    return state.entries.some((entry) => {
      if (entry.id === ignoreId || entry.type !== 'sale') return false;
      const sameShape = entry.date === candidate.date
        && Number(entry.amount) === Number(candidate.amount)
        && String(entry.customerId || '') === String(candidate.customerId || '')
        && String(entry.productId || '') === String(candidate.productId || '')
        && Number(entry.qty || 1) === Number(candidate.qty || 1)
        && String(entry.payment || '') === String(candidate.payment || '');
      if (!sameShape) return false;
      const delta = Math.abs(new Date(entry.createdAt).getTime() - Date.now());
      return delta < 120000;
    });
  }

  function rollbackSaleImpact(draft, sale) {
    if (!sale || sale.type !== 'sale') return;

    const product = draft.products.find((item) => item.id === sale.productId);
    if (product) product.stock = Math.max(0, Number(product.stock || 0) + Number(sale.qty || 1));

    if (sale.customerId && Number(sale.walletUsed || 0) > 0) {
      const customer = draft.customers.find((item) => item.id === sale.customerId);
      if (!customer) return;
      const wallet = draft.wallets.find((item) => item.id === customer.walletId);
      if (wallet) wallet.balance = Math.max(0, Number(wallet.balance || 0) + Number(sale.walletUsed || 0));
    }
  }

  function applySaleImpact(draft, sale) {
    if (!sale || sale.type !== 'sale') return;

    if (sale.customerId && Number(sale.walletUsed || 0) > 0) {
      const customer = draft.customers.find((item) => item.id === sale.customerId);
      if (customer) {
        const wallet = draft.wallets.find((item) => item.id === customer.walletId);
        if (wallet) wallet.balance = Math.max(0, Number(wallet.balance || 0) - Number(sale.walletUsed || 0));
      }
    }

    const product = draft.products.find((item) => item.id === sale.productId);
    if (product) product.stock = Math.max(0, Number(product.stock || 0) - Number(sale.qty || 1));
  }

  saleForm.addEventListener('submit', async (event) => {
    event.preventDefault();

    const state = store.getState();
    const payload = {
      date: String(document.getElementById('saleDate').value || '').slice(0, 10),
      amount: toNumber(document.getElementById('saleAmount').value),
      customerId: document.getElementById('saleCustomer').value,
      productId: document.getElementById('saleProduct').value,
      qty: Math.max(1, Math.round(toNumber(document.getElementById('saleQty').value, 1))),
      payment: document.getElementById('salePayment').value,
      notes: String(document.getElementById('saleNotes').value || '').trim()
    };

    const validation = validateSaleInput(payload);
    if (!validation.ok) {
      showToast(validation.errors[0]);
      return;
    }

    const existingNoSale = getNoSaleForDate(state, payload.date, editingSaleId);
    if (existingNoSale) {
      const replace = await modal.confirm('Date Already Marked as No Sale', `This day is marked as "did not sell". Replace it with sale data for ${formatHumanDate(payload.date)}?`);
      if (!replace) return;
    }

    const originalSale = editingSaleId ? state.entries.find((entry) => entry.id === editingSaleId) : null;
    const customer = state.customers.find((item) => item.id === payload.customerId);
    const wallet = customer ? state.wallets.find((item) => item.id === customer.walletId) : null;
    const walletUsed = wallet ? Math.min(Number(wallet.balance || 0), payload.amount) : 0;
    const cashPaid = Math.max(0, payload.amount - walletUsed);

    const candidate = {
      id: editingSaleId || uid('sale'),
      type: 'sale',
      date: payload.date,
      amount: payload.amount,
      reasonKey: '',
      reasonText: '',
      notes: payload.notes,
      payment: payload.payment,
      qty: payload.qty,
      customerId: payload.customerId,
      productId: payload.productId,
      walletUsed,
      cashPaid,
      createdAt: originalSale?.createdAt || new Date().toISOString(),
      updatedAt: new Date().toISOString()
    };

    if (!editingSaleId && latestSaleDuplicate(state, candidate)) {
      showToast('Possible duplicate sale blocked. Edit the existing entry instead.');
      return;
    }

    store.update((draft) => {
      if (existingNoSale) draft.entries = draft.entries.filter((entry) => entry.id !== existingNoSale.id);
      if (originalSale) rollbackSaleImpact(draft, originalSale);
      const index = draft.entries.findIndex((entry) => entry.id === candidate.id);
      if (index >= 0) draft.entries[index] = candidate;
      else draft.entries.unshift(candidate);
      applySaleImpact(draft, candidate);
    }, {
      activityMessage: editingSaleId ? `Sale updated for ${payload.date}` : `Sale recorded for ${payload.date}`,
      activityType: 'sale'
    });

    telemetry.track(editingSaleId ? 'sale_updated' : 'sale_logged', {
      amount: payload.amount,
      payment: payload.payment,
      customer: payload.customerId || 'walk_in'
    });
    resetForms();
    renderAll();
    showToast('Sale saved.');
  });

  noSaleReason.addEventListener('change', () => {
    customReasonWrap.hidden = noSaleReason.value !== 'other';
  });

  noSaleForm.addEventListener('submit', async (event) => {
    event.preventDefault();
    const state = store.getState();

    const payload = {
      date: String(document.getElementById('noSaleDate').value || '').slice(0, 10),
      reasonKey: noSaleReason.value,
      reasonText: String(document.getElementById('noSaleCustomReason').value || '').trim(),
      notes: String(document.getElementById('noSaleNotes').value || '').trim()
    };

    const validation = validateNoSaleInput(payload);
    if (!validation.ok) {
      showToast(validation.errors[0]);
      return;
    }

    const sameDaySales = getSalesForDate(state, payload.date, editingNoSaleId);
    if (sameDaySales.length) {
      showToast('This date has sales. Remove sales first or use a different date.');
      return;
    }

    const existingNoSale = getNoSaleForDate(state, payload.date, editingNoSaleId);
    if (existingNoSale && !editingNoSaleId) {
      showToast('This date already has a no-sale record. Edit it instead.');
      return;
    }

    const entry = {
      id: editingNoSaleId || uid('nosale'),
      type: 'no_sale',
      date: payload.date,
      amount: 0,
      reasonKey: payload.reasonKey,
      reasonText: payload.reasonKey === 'other' ? payload.reasonText : '',
      notes: payload.notes,
      payment: '',
      qty: 1,
      customerId: '',
      productId: '',
      walletUsed: 0,
      cashPaid: 0,
      createdAt: editingNoSaleId ? (state.entries.find((item) => item.id === editingNoSaleId)?.createdAt || new Date().toISOString()) : new Date().toISOString(),
      updatedAt: new Date().toISOString()
    };

    store.update((draft) => {
      const index = draft.entries.findIndex((item) => item.id === entry.id);
      if (index >= 0) draft.entries[index] = entry;
      else draft.entries.unshift(entry);
    }, {
      activityMessage: editingNoSaleId ? `No-sale day updated (${payload.date})` : `No-sale day logged (${payload.date})`,
      activityType: 'nosale'
    });

    telemetry.track(editingNoSaleId ? 'nosale_updated' : 'nosale_logged', {
      reason: payload.reasonKey
    });
    resetForms();
    renderAll();
    showToast('No-sale day saved.');
  });

  async function onDelete(id) {
    const ok = await modal.confirm('Delete Entry', 'Delete this log entry permanently?');
    if (!ok) return;

    store.update((draft) => {
      const target = draft.entries.find((entry) => entry.id === id);
      if (!target) return;
      rollbackSaleImpact(draft, target);
      draft.entries = draft.entries.filter((entry) => entry.id !== id);
    }, {
      activityMessage: 'Entry deleted',
      activityType: 'delete'
    });

    telemetry.track('entry_deleted');
    renderAll();
    showToast('Entry deleted.');
  }

  function onEdit(id) {
    const entry = store.getState().entries.find((item) => item.id === id);
    if (!entry) return;

    if (entry.type === 'sale') {
      editingSaleId = id;
      editingNoSaleId = '';
      saleSubmitBtn.textContent = 'Update Sale';
      noSaleSubmitBtn.textContent = 'Save No-Sale Day';
      document.getElementById('saleDate').value = entry.date;
      document.getElementById('saleAmount').value = String(entry.amount || '');
      document.getElementById('saleCustomer').value = entry.customerId || '';
      document.getElementById('saleProduct').value = entry.productId || '';
      document.getElementById('saleQty').value = String(entry.qty || 1);
      document.getElementById('salePayment').value = entry.payment || 'Cash';
      document.getElementById('saleNotes').value = entry.notes || '';
      showToast('Editing sale entry.');
      return;
    }

    editingNoSaleId = id;
    editingSaleId = '';
    noSaleSubmitBtn.textContent = 'Update No-Sale Day';
    saleSubmitBtn.textContent = 'Save Sale';
    document.getElementById('noSaleDate').value = entry.date;
    document.getElementById('noSaleReason').value = entry.reasonKey || '';
    document.getElementById('noSaleCustomReason').value = entry.reasonText || '';
    document.getElementById('noSaleNotes').value = entry.notes || '';
    customReasonWrap.hidden = entry.reasonKey !== 'other';
    showToast('Editing no-sale entry.');
  }

  dayLogList.addEventListener('click', (event) => {
    const editBtn = event.target.closest('[data-edit-id]');
    const delBtn = event.target.closest('[data-delete-id]');
    if (editBtn) onEdit(editBtn.dataset.editId);
    if (delBtn) onDelete(delBtn.dataset.deleteId);
  });

  function renderLogs(state) {
    const currency = state.settings.currency || 'ZAR';
    const sorted = [...state.entries].sort((a, b) => {
      if (a.date !== b.date) return String(b.date).localeCompare(String(a.date));
      return String(b.updatedAt).localeCompare(String(a.updatedAt));
    });

    if (!sorted.length) {
      dayLogList.innerHTML = '<div class="log-item">No entries yet. Start by saving a sale or marking a no-sale day.</div>';
      return;
    }

    dayLogList.innerHTML = sorted.slice(0, 40).map((entry) => {
      const kind = entry.type === 'sale' ? 'Sale' : 'No Sale';
      const reason = entry.type === 'no_sale'
        ? (entry.reasonKey === 'other' ? entry.reasonText : entry.reasonKey.replace(/_/g, ' '))
        : `${escapeHtml(entry.payment)} - Qty ${Number(entry.qty || 1)}`;
      const amount = entry.type === 'sale' ? formatMoney(entry.amount, currency) : '-';
      return `
        <div class="log-item">
          <div class="log-item-head">
            <div>
              <strong>${kind} - ${formatHumanDate(entry.date)}</strong>
              <div class="customer-meta">${escapeHtml(reason || 'No detail')}</div>
              ${entry.notes ? `<div class="customer-meta">${escapeHtml(entry.notes)}</div>` : ''}
            </div>
            <div>
              <strong>${amount}</strong>
            </div>
          </div>
          <div class="button-row" style="margin-top:8px">
            <button class="btn" type="button" data-edit-id="${escapeHtml(entry.id)}">Edit</button>
            <button class="btn" type="button" data-delete-id="${escapeHtml(entry.id)}">Delete</button>
          </div>
        </div>
      `;
    }).join('');
  }

  return {
    render(state) {
      fillSelectors(state);
      renderLogs(state);
      customReasonWrap.hidden = noSaleReason.value !== 'other';
    },
    resetForms
  };
}
