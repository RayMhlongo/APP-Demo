import { todayISO } from '../utils/date.js';
import { uid } from '../utils/id.js';

const APP_KEY = 'creamtrack.vendor.v2';

function defaultState() {
  const walletA = { id: 'wallet-001', label: 'Mhlongo Family', balance: 0, memberIds: ['cust-001', 'cust-002'] };
  const walletB = { id: 'wallet-002', label: 'Walk-in Adults', balance: 0, memberIds: ['cust-003'] };

  return {
    version: 2,
    lastSavedAt: new Date().toISOString(),
    settings: {
      businessName: 'CreamTrack Vendor',
      valueProp: 'Track sales, loyalty, and missed trading days in one place.',
      currency: 'ZAR',
      operatingDays: [1, 2, 3, 4, 5, 6],
      loyaltyThreshold: 10,
      googleClientId: '',
      googleConnection: {
        connected: false,
        email: '',
        connectedAt: ''
      }
    },
    products: [
      { id: 'prd-001', name: 'Vanilla Cone', price: 8, stock: 50 },
      { id: 'prd-002', name: 'Choco Dip', price: 12, stock: 35 },
      { id: 'prd-003', name: 'Family Tub', price: 85, stock: 12 }
    ],
    customers: [
      { id: 'cust-001', type: 'child', name: 'Akami', guardianName: 'Akami Mom', grade: '5', phone: '+27 72 340 8365', qrId: 'CT-CUST-001', walletId: walletA.id },
      { id: 'cust-002', type: 'child', name: 'Damian', guardianName: 'Damian Mom', grade: '3', phone: '+27 76 822 4643', qrId: 'CT-CUST-002', walletId: walletA.id },
      { id: 'cust-003', type: 'adult', name: 'Mr Dube', guardianName: '', grade: '', phone: '+27 81 123 7788', qrId: 'CT-CUST-003', walletId: walletB.id }
    ],
    wallets: [walletA, walletB],
    entries: [],
    activity: [
      { id: uid('act'), type: 'system', message: 'App initialized', at: new Date().toISOString() }
    ]
  };
}

function sanitize(state) {
  const base = defaultState();
  const merged = {
    ...base,
    ...state,
    settings: {
      ...base.settings,
      ...(state.settings || {}),
      googleConnection: {
        ...base.settings.googleConnection,
        ...((state.settings && state.settings.googleConnection) || {})
      }
    },
    products: Array.isArray(state.products) ? state.products : base.products,
    customers: Array.isArray(state.customers) ? state.customers : base.customers,
    wallets: Array.isArray(state.wallets) ? state.wallets : base.wallets,
    entries: Array.isArray(state.entries) ? state.entries : [],
    activity: Array.isArray(state.activity) ? state.activity : base.activity
  };

  const validCustomers = merged.customers
    .map((c, idx) => ({
      id: String(c.id || `cust-${String(idx + 1).padStart(3, '0')}`),
      type: String(c.type || 'child') === 'adult' ? 'adult' : 'child',
      name: String(c.name || '').trim(),
      guardianName: String(c.guardianName || '').trim(),
      grade: String(c.grade || '').replace(/\D/g, ''),
      phone: String(c.phone || '').trim(),
      qrId: String(c.qrId || `CT-CUST-${String(idx + 1).padStart(3, '0')}`),
      walletId: String(c.walletId || '')
    }))
    .filter((c) => c.name);

  const walletsById = new Map(
    merged.wallets.map((w, idx) => [
      String(w.id || `wallet-${String(idx + 1).padStart(3, '0')}`),
      {
        id: String(w.id || `wallet-${String(idx + 1).padStart(3, '0')}`),
        label: String(w.label || 'Family Wallet').trim() || 'Family Wallet',
        balance: Math.max(0, Number(w.balance || 0)),
        memberIds: Array.isArray(w.memberIds) ? w.memberIds.map((x) => String(x)) : []
      }
    ])
  );

  validCustomers.forEach((cust) => {
    if (!cust.walletId || !walletsById.has(cust.walletId)) {
      const wid = `wallet-${cust.id}`;
      if (!walletsById.has(wid)) {
        walletsById.set(wid, {
          id: wid,
          label: `${cust.guardianName || cust.name} Wallet`,
          balance: 0,
          memberIds: []
        });
      }
      cust.walletId = wid;
    }
    const wallet = walletsById.get(cust.walletId);
    if (!wallet.memberIds.includes(cust.id)) wallet.memberIds.push(cust.id);
  });

  const entries = merged.entries
    .map((e) => ({
      id: String(e.id || uid('entry')),
      type: e.type === 'no_sale' ? 'no_sale' : 'sale',
      date: String(e.date || todayISO()).slice(0, 10),
      amount: Math.max(0, Number(e.amount || 0)),
      reasonKey: String(e.reasonKey || ''),
      reasonText: String(e.reasonText || ''),
      notes: String(e.notes || ''),
      payment: String(e.payment || 'Cash'),
      qty: Math.max(1, Number(e.qty || 1)),
      customerId: String(e.customerId || ''),
      productId: String(e.productId || ''),
      walletUsed: Math.max(0, Number(e.walletUsed || 0)),
      cashPaid: Math.max(0, Number(e.cashPaid || 0)),
      createdAt: String(e.createdAt || new Date().toISOString()),
      updatedAt: String(e.updatedAt || new Date().toISOString())
    }))
    .sort((a, b) => String(b.date).localeCompare(String(a.date)));

  return {
    ...merged,
    customers: validCustomers,
    wallets: [...walletsById.values()],
    entries,
    lastSavedAt: String(state.lastSavedAt || new Date().toISOString())
  };
}

export function loadState() {
  try {
    const raw = localStorage.getItem(APP_KEY);
    if (!raw) return defaultState();
    const parsed = JSON.parse(raw);
    return sanitize(parsed);
  } catch {
    return defaultState();
  }
}

export function saveState(state) {
  const clean = sanitize(state);
  clean.lastSavedAt = new Date().toISOString();
  localStorage.setItem(APP_KEY, JSON.stringify(clean));
  return clean;
}

export function resetState() {
  const base = defaultState();
  localStorage.setItem(APP_KEY, JSON.stringify(base));
  return base;
}

export function exportBackup(state) {
  return {
    version: 2,
    exportedAt: new Date().toISOString(),
    app: 'CreamTrack Vendor',
    state: sanitize(state)
  };
}

export function importBackup(payload) {
  const source = payload && payload.state ? payload.state : payload;
  return saveState(source || defaultState());
}

export const STORAGE_KEY = APP_KEY;
