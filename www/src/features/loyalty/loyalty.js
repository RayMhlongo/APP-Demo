import { renderQrCode, canScanQr, createScanner } from '../qr/qr.js';
import { normalizeGrade, normalizePhone, escapeHtml, formatMoney } from '../../utils/format.js';
import { uid } from '../../utils/id.js';
import { validateCustomerInput } from '../../services/validation.js';

function randomQrId() {
  return `CT-${Math.random().toString(36).slice(2, 10).toUpperCase()}`;
}

export function initLoyaltyFeature({ store, showToast, modal, renderAll, telemetry }) {
  const form = document.getElementById('customerForm');
  const submitBtn = form.querySelector('button[type="submit"]');
  const cancelEditBtn = document.getElementById('customerCancelEditBtn');
  const typeInput = document.getElementById('customerType');
  const nameInput = document.getElementById('customerName');
  const guardianInput = document.getElementById('customerGuardian');
  const gradeInput = document.getElementById('customerGrade');
  const phoneInput = document.getElementById('customerPhone');
  const walletModeInput = document.getElementById('walletMode');
  const walletNameInput = document.getElementById('walletName');
  const walletExistingInput = document.getElementById('walletExisting');
  const walletTopupInput = document.getElementById('walletTopup');
  const customerList = document.getElementById('customerList');
  const customerSearch = document.getElementById('customerSearch');
  const qrPreview = document.getElementById('qrPreview');
  const scanRegion = document.getElementById('scanRegion');

  let scanner = null;
  let scannedQr = '';
  let editingCustomerId = '';

  function setEditMode(customerId = '') {
    editingCustomerId = customerId;
    submitBtn.textContent = customerId ? 'Update Customer' : 'Save Customer';
    cancelEditBtn.hidden = !customerId;
  }

  function resetFormState() {
    form.reset();
    walletTopupInput.value = '0';
    scannedQr = '';
    setEditMode('');
    updateTypeVisibility();
    updateWalletVisibility(store.getState());
  }

  function updateTypeVisibility() {
    const type = typeInput.value;
    document.getElementById('guardianWrap').hidden = type === 'adult';
    document.getElementById('gradeWrap').hidden = type === 'adult';
    document.getElementById('customerNameLabel').textContent = type === 'adult' ? 'Adult Name' : 'Child Name';
    if (type === 'adult') gradeInput.value = '';
  }

  function updateWalletVisibility(state) {
    const mode = walletModeInput.value;
    const walletNameWrap = document.getElementById('walletNameWrap');
    const walletExistingWrap = document.getElementById('walletExistingWrap');
    const currency = state.settings.currency || 'ZAR';

    walletNameWrap.hidden = mode !== 'new';
    walletExistingWrap.hidden = mode !== 'existing';

    const options = state.wallets
      .map((wallet) => `<option value="${escapeHtml(wallet.id)}">${escapeHtml(wallet.label)} (${formatMoney(wallet.balance || 0, currency)})</option>`)
      .join('');
    walletExistingInput.innerHTML = options || '<option value="">No wallet available</option>';
  }

  function visitsByCustomer(state) {
    const map = new Map();
    state.entries.filter((entry) => entry.type === 'sale' && entry.customerId).forEach((sale) => {
      map.set(sale.customerId, (map.get(sale.customerId) || 0) + 1);
    });
    return map;
  }

  function renderCustomerCards(state) {
    const query = String(customerSearch.value || '').toLowerCase().trim();
    const visits = visitsByCustomer(state);
    const threshold = Number(state.settings.loyaltyThreshold || 10);
    const currency = state.settings.currency || 'ZAR';

    const rows = state.customers
      .filter((customer) => {
        const wallet = state.wallets.find((item) => item.id === customer.walletId);
        const blob = [customer.name, customer.guardianName, customer.phone, customer.qrId, wallet?.label || ''].join(' ').toLowerCase();
        return blob.includes(query);
      })
      .map((customer) => {
        const wallet = state.wallets.find((item) => item.id === customer.walletId);
        const visit = visits.get(customer.id) || 0;
        const rewardReady = visit >= threshold;
        const subtitle = customer.type === 'adult'
          ? 'Adult profile'
          : `Grade ${escapeHtml(customer.grade || '-')}${customer.guardianName ? ` - Guardian: ${escapeHtml(customer.guardianName)}` : ''}`;

        return `
          <div class="customer-item">
            <div class="customer-item-head">
              <div>
                <strong>${escapeHtml(customer.name)}</strong>
                <div class="customer-meta">${subtitle}</div>
                <div class="customer-meta">${escapeHtml(customer.phone || 'No phone')} - QR: ${escapeHtml(customer.qrId)}</div>
                <div class="customer-meta">${escapeHtml(wallet?.label || 'Wallet')}: ${formatMoney(wallet?.balance || 0, currency)}</div>
                <div class="customer-meta">Visits: ${visit}/${threshold}${rewardReady ? ' - Reward ready' : ''}</div>
              </div>
              <div>
                <button class="chip" type="button" data-qr-id="${escapeHtml(customer.id)}">Show QR</button>
              </div>
            </div>
            <div class="button-row" style="margin-top:8px;grid-template-columns:1fr 1fr 1fr">
              <button class="btn" type="button" data-topup-id="${escapeHtml(customer.id)}">Top Up</button>
              <button class="btn" type="button" data-edit-id="${escapeHtml(customer.id)}">Edit</button>
              <button class="btn" type="button" data-delete-id="${escapeHtml(customer.id)}">Delete</button>
            </div>
          </div>
        `;
      });

    customerList.innerHTML = rows.length
      ? rows.join('')
      : '<div class="customer-item">No customers found for this search.</div>';
  }

  function renderQr(code, label = '') {
    qrPreview.innerHTML = '';
    if (!code) {
      qrPreview.innerHTML = 'Generate or select a customer QR code.';
      return;
    }

    const title = document.createElement('p');
    title.className = 'customer-meta';
    title.textContent = label || 'QR preview';
    qrPreview.appendChild(title);

    const holder = document.createElement('div');
    holder.style.display = 'grid';
    holder.style.placeItems = 'center';
    holder.style.minHeight = '145px';
    holder.style.width = '100%';
    qrPreview.appendChild(holder);

    const rendered = renderQrCode(holder, code, {
      width: 180,
      height: 180,
      colorDark: '#0f766e'
    });
    if (!rendered.ok) {
      holder.innerHTML = `<div class="customer-meta">QR generator unavailable.<br>ID: ${escapeHtml(code)}</div>`;
    }
  }

  async function promptTopUp(customerId) {
    const state = store.getState();
    const customer = state.customers.find((item) => item.id === customerId);
    if (!customer) return;
    const wallet = state.wallets.find((item) => item.id === customer.walletId);
    if (!wallet) return;

    const amountRaw = window.prompt(`Top up ${wallet.label} (current ${formatMoney(wallet.balance || 0, state.settings.currency || 'ZAR')}):`, '0');
    if (amountRaw === null) return;
    const amount = Number(amountRaw);
    if (!Number.isFinite(amount) || amount <= 0) {
      showToast('Enter a valid top-up amount.');
      return;
    }

    store.update((draft) => {
      const target = draft.wallets.find((item) => item.id === wallet.id);
      if (target) target.balance = Math.max(0, Number(target.balance || 0) + amount);
    }, {
      activityMessage: `Wallet topped up by ${formatMoney(amount, state.settings.currency || 'ZAR')}`,
      activityType: 'wallet'
    });

    telemetry.track('wallet_topup', { amount });
    renderAll();
    showToast('Wallet topped up.');
  }

  async function deleteCustomer(customerId) {
    const state = store.getState();
    const customer = state.customers.find((item) => item.id === customerId);
    if (!customer) return;
    const hasSales = state.entries.some((entry) => entry.type === 'sale' && entry.customerId === customer.id);
    if (hasSales) {
      await modal.alert('Cannot Delete Customer', 'This customer has sale history. Delete linked sales first.');
      return;
    }
    const ok = await modal.confirm('Delete Customer', `Delete ${customer.name}?`);
    if (!ok) return;

    store.update((draft) => {
      draft.customers = draft.customers.filter((item) => item.id !== customer.id);
      draft.wallets.forEach((wallet) => {
        wallet.memberIds = wallet.memberIds.filter((id) => id !== customer.id);
      });
      const usedWalletIds = new Set(draft.customers.map((item) => item.walletId));
      draft.wallets = draft.wallets.filter((wallet) => usedWalletIds.has(wallet.id));
    }, {
      activityMessage: `Customer deleted: ${customer.name}`,
      activityType: 'delete'
    });

    telemetry.track('customer_deleted');
    if (editingCustomerId === customer.id) resetFormState();
    renderAll();
    showToast('Customer deleted.');
  }

  function upsertCustomer(state, payload) {
    const existing = editingCustomerId ? state.customers.find((item) => item.id === editingCustomerId) : null;
    return {
      id: existing?.id || uid('cust'),
      type: payload.type,
      name: payload.name,
      guardianName: payload.guardianName,
      grade: payload.grade,
      phone: payload.phone,
      qrId: payload.qrId || existing?.qrId || randomQrId(),
      walletId: existing?.walletId || ''
    };
  }

  function handleCustomerSave(event) {
    event.preventDefault();
    const state = store.getState();
    const existing = editingCustomerId ? state.customers.find((item) => item.id === editingCustomerId) : null;

    const type = typeInput.value === 'adult' ? 'adult' : 'child';
    const name = String(nameInput.value || '').trim();
    const guardianName = type === 'adult' ? '' : String(guardianInput.value || '').trim();
    const grade = type === 'adult' ? '' : normalizeGrade(gradeInput.value);
    const phone = normalizePhone(phoneInput.value);
    const walletMode = walletModeInput.value;
    const topup = Math.max(0, Number(walletTopupInput.value || 0));

    let selectedWalletId = '';
    if (walletMode === 'existing') selectedWalletId = walletExistingInput.value;

    const validation = validateCustomerInput({
      type,
      name,
      grade,
      walletMode,
      walletId: selectedWalletId,
      topup
    });
    if (!validation.ok) {
      showToast(validation.errors[0]);
      return;
    }

    const customer = upsertCustomer(state, {
      type,
      name,
      guardianName,
      grade,
      phone,
      qrId: scannedQr || existing?.qrId || randomQrId()
    });

    const duplicateQr = state.customers.some((item) => item.qrId === customer.qrId && item.id !== customer.id);
    if (duplicateQr) {
      showToast('This QR ID is already linked to another customer.');
      return;
    }

    store.update((draft) => {
      const oldRecord = draft.customers.find((item) => item.id === customer.id);
      const oldWalletId = oldRecord?.walletId || existing?.walletId || '';
      let finalWalletId = selectedWalletId;

      if (walletMode === 'new') {
        finalWalletId = uid('wallet');
        draft.wallets.unshift({
          id: finalWalletId,
          label: String(walletNameInput.value || `${guardianName || name} Wallet`).trim() || `${name} Wallet`,
          balance: topup,
          memberIds: [customer.id]
        });
      } else {
        const wallet = draft.wallets.find((item) => item.id === selectedWalletId);
        if (wallet && topup > 0) wallet.balance = Math.max(0, Number(wallet.balance || 0) + topup);
      }

      customer.walletId = finalWalletId || oldWalletId;

      const index = draft.customers.findIndex((item) => item.id === customer.id);
      if (index >= 0) draft.customers[index] = customer;
      else draft.customers.unshift(customer);

      if (oldWalletId && oldWalletId !== customer.walletId) {
        const oldWallet = draft.wallets.find((item) => item.id === oldWalletId);
        if (oldWallet) oldWallet.memberIds = oldWallet.memberIds.filter((id) => id !== customer.id);
      }

      const targetWallet = draft.wallets.find((item) => item.id === customer.walletId);
      if (targetWallet && !targetWallet.memberIds.includes(customer.id)) targetWallet.memberIds.push(customer.id);

      const usedWalletIds = new Set(draft.customers.map((item) => item.walletId));
      draft.wallets = draft.wallets
        .map((wallet) => ({ ...wallet, memberIds: wallet.memberIds.filter((id) => draft.customers.some((item) => item.id === id)) }))
        .filter((wallet) => usedWalletIds.has(wallet.id));
    }, {
      activityMessage: existing ? `Customer updated: ${name}` : `Customer saved: ${name}`,
      activityType: 'customer'
    });

    telemetry.track(existing ? 'customer_updated' : 'customer_added', { type });
    resetFormState();
    renderAll();
    showToast(existing ? 'Customer updated.' : 'Customer saved.');
  }

  function editCustomer(customerId) {
    const state = store.getState();
    const customer = state.customers.find((item) => item.id === customerId);
    if (!customer) return;

    setEditMode(customer.id);
    typeInput.value = customer.type;
    updateTypeVisibility();
    nameInput.value = customer.name;
    guardianInput.value = customer.guardianName || '';
    gradeInput.value = customer.grade || '';
    phoneInput.value = customer.phone || '';
    walletModeInput.value = 'existing';
    updateWalletVisibility(state);
    walletExistingInput.value = customer.walletId;
    walletTopupInput.value = '0';
    scannedQr = customer.qrId;
    renderQr(customer.qrId, `${customer.name} QR`);
    showToast('Editing customer profile.');
  }

  async function startScanner() {
    telemetry.track('qr_scan_started');
    if (!canScanQr()) {
      showToast('Scanner unavailable. Use generated or saved QR IDs.');
      telemetry.track('qr_scan_failed', { reason: 'unavailable' });
      return;
    }

    if (!scanner) scanner = createScanner('scanRegion');
    if (!scanner) {
      showToast('Scanner unavailable. QR library is not loaded.');
      telemetry.track('qr_scan_failed', { reason: 'missing_library' });
      return;
    }

    scanRegion.hidden = false;

    try {
      await scanner.start(
        async (decodedText) => {
          await scanner.stop();
          scanRegion.hidden = true;
          const state = store.getState();
          const customer = state.customers.find((item) => item.qrId === decodedText);
          if (customer) {
            renderQr(customer.qrId, `QR belongs to ${customer.name}`);
            showToast(`Scan success: ${customer.name}`);
          } else {
            scannedQr = decodedText;
            renderQr(decodedText, 'Unknown QR. Save customer to assign it.');
            showToast('QR scanned. Complete customer form to assign it.');
          }
          telemetry.track('qr_scan_completed', { known_customer: Boolean(customer) });
        },
        () => {}
      );
    } catch (error) {
      showToast('Unable to start scanner. Camera permission may be blocked.');
      scanRegion.hidden = true;
      telemetry.track('qr_scan_failed', { reason: 'camera_error' });
      telemetry.captureError(error, { area: 'qr_scan' });
    }
  }

  document.getElementById('generateBlankQrBtn').addEventListener('click', () => {
    scannedQr = `CT-BLANK-${Math.random().toString(36).slice(2, 10).toUpperCase()}`;
    renderQr(scannedQr, 'Blank QR generated');
    telemetry.track('qr_generated_blank');
    showToast('Blank QR generated.');
  });

  document.getElementById('startScanBtn').addEventListener('click', () => {
    startScanner();
  });

  typeInput.addEventListener('change', updateTypeVisibility);
  walletModeInput.addEventListener('change', () => updateWalletVisibility(store.getState()));
  customerSearch.addEventListener('input', () => renderCustomerCards(store.getState()));
  form.addEventListener('submit', handleCustomerSave);
  cancelEditBtn.addEventListener('click', () => {
    resetFormState();
    showToast('Edit cancelled.');
  });

  customerList.addEventListener('click', (event) => {
    const qrBtn = event.target.closest('[data-qr-id]');
    const topupBtn = event.target.closest('[data-topup-id]');
    const editBtn = event.target.closest('[data-edit-id]');
    const deleteBtn = event.target.closest('[data-delete-id]');

    if (qrBtn) {
      const customer = store.getState().customers.find((item) => item.id === qrBtn.dataset.qrId);
      if (customer) renderQr(customer.qrId, `${customer.name} QR`);
    }
    if (topupBtn) promptTopUp(topupBtn.dataset.topupId);
    if (editBtn) editCustomer(editBtn.dataset.editId);
    if (deleteBtn) deleteCustomer(deleteBtn.dataset.deleteId);
  });

  return {
    render(state) {
      updateTypeVisibility();
      updateWalletVisibility(state);
      renderCustomerCards(state);
      if (!qrPreview.innerHTML.trim()) renderQr('', '');
    }
  };
}
