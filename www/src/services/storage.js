import { todayISO } from '../utils/date.js';
import { uid } from '../utils/id.js';
import { NO_SALE_REASON_OPTIONS } from './models.js';

const APP_KEY = 'cathdel.creamy.v3';
const LEGACY_KEYS = ['creamtrack.vendor.v2'];

function sanitizeOperatingDays(days) {
  const list = Array.isArray(days) ? days.map((day) => Number(day)).filter((day) => Number.isInteger(day) && day >= 0 && day <= 6) : [];
  return [...new Set(list)].sort((a, b) => a - b);
}

function defaultState() {
  return {
    version: 4,
    lastSavedAt: new Date().toISOString(),
    settings: {
      businessName: 'Cathdel Creamy',
      valueProp: 'Track sales, loyalty, and missed trading days in one place.',
      currency: 'ZAR',
      operatingDays: [1, 2, 3, 4, 5, 6],
      loyaltyThreshold: 10,
      googleClientId: '',
      googleConnection: {
        connected: false,
        email: '',
        connectedAt: ''
      },
      observability: {
        posthogKey: '',
        posthogHost: 'https://app.posthog.com',
        sentryDsn: ''
      },
      assistant: {
        provider: 'none',
        apiKey: '',
        model: '',
        baseUrl: ''
      }
    },
    products: [
      { id: 'prd-001', name: 'Vanilla Cone', price: 8, stock: 50 },
      { id: 'prd-002', name: 'Choco Dip', price: 12, stock: 35 },
      { id: 'prd-003', name: 'Family Tub', price: 85, stock: 12 }
    ],
    customers: [],
    wallets: [],
    entries: [],
    activity: [
      { id: uid('act'), type: 'system', message: 'Cathdel Creamy initialized', at: new Date().toISOString() }
    ]
  };
}

function sanitizeSettings(rawSettings, baseSettings) {
  const settings = {
    ...baseSettings,
    ...(rawSettings || {}),
    googleConnection: {
      ...baseSettings.googleConnection,
      ...((rawSettings && rawSettings.googleConnection) || {})
    },
    observability: {
      ...baseSettings.observability,
      ...((rawSettings && rawSettings.observability) || {})
    },
    assistant: {
      ...baseSettings.assistant,
      ...((rawSettings && rawSettings.assistant) || {})
    }
  };

  settings.businessName = String(settings.businessName || '').trim() || baseSettings.businessName;
  settings.valueProp = String(settings.valueProp || '').trim() || baseSettings.valueProp;
  settings.currency = String(settings.currency || 'ZAR').trim() || 'ZAR';
  settings.operatingDays = sanitizeOperatingDays(settings.operatingDays);
  if (!settings.operatingDays.length) settings.operatingDays = [...baseSettings.operatingDays];
  settings.loyaltyThreshold = Math.max(1, Number(settings.loyaltyThreshold || baseSettings.loyaltyThreshold || 10));
  settings.googleClientId = String(settings.googleClientId || '').trim();
  settings.googleConnection = {
    connected: Boolean(settings.googleConnection.connected),
    email: String(settings.googleConnection.email || '').trim(),
    connectedAt: String(settings.googleConnection.connectedAt || '').trim()
  };
  settings.observability = {
    posthogKey: String(settings.observability.posthogKey || '').trim(),
    posthogHost: String(settings.observability.posthogHost || baseSettings.observability.posthogHost || 'https://app.posthog.com').trim(),
    sentryDsn: String(settings.observability.sentryDsn || '').trim()
  };
  settings.assistant = {
    provider: ['none', 'groq', 'openrouter'].includes(String(settings.assistant.provider || '').toLowerCase())
      ? String(settings.assistant.provider || 'none').toLowerCase()
      : 'none',
    apiKey: String(settings.assistant.apiKey || '').trim(),
    model: String(settings.assistant.model || '').trim(),
    baseUrl: String(settings.assistant.baseUrl || '').trim()
  };

  return settings;
}

function sanitizeProducts(products, baseProducts) {
  const list = Array.isArray(products) ? products : baseProducts;
  return list
    .map((product, index) => ({
      id: String(product.id || `prd-${String(index + 1).padStart(3, '0')}`),
      name: String(product.name || '').trim(),
      price: Math.max(0, Number(product.price || 0)),
      stock: Math.max(0, Number(product.stock || 0))
    }))
    .filter((product) => product.name);
}

function sanitizeCustomers(customers) {
  const list = Array.isArray(customers) ? customers : [];
  return list
    .map((customer, index) => ({
      id: String(customer.id || `cust-${String(index + 1).padStart(3, '0')}`).trim(),
      type: String(customer.type || '').toLowerCase() === 'adult' ? 'adult' : 'child',
      name: String(customer.name || '').trim(),
      guardianName: String(customer.guardianName || '').trim(),
      grade: String(customer.grade || '').replace(/\D/g, ''),
      phone: String(customer.phone || '').trim(),
      qrId: String(customer.qrId || `CC-CUST-${String(index + 1).padStart(3, '0')}`).trim(),
      walletId: String(customer.walletId || '').trim()
    }))
    .filter((customer) => customer.name);
}

function sanitizeWallets(wallets) {
  const map = new Map();
  (Array.isArray(wallets) ? wallets : []).forEach((wallet, index) => {
    const id = String(wallet.id || `wallet-${String(index + 1).padStart(3, '0')}`).trim();
    map.set(id, {
      id,
      label: String(wallet.label || 'Shared Wallet').trim() || 'Shared Wallet',
      balance: Math.max(0, Number(wallet.balance || 0)),
      memberIds: Array.isArray(wallet.memberIds) ? [...new Set(wallet.memberIds.map((member) => String(member || '').trim()).filter(Boolean))] : []
    });
  });
  return map;
}

function sanitizeEntries(entries) {
  return (Array.isArray(entries) ? entries : [])
    .map((entry) => {
      const type = entry.type === 'no_sale' ? 'no_sale' : 'sale';
      const reasonKey = String(entry.reasonKey || '').trim();
      return {
        id: String(entry.id || uid('entry')).trim(),
        type,
        date: String(entry.date || todayISO()).slice(0, 10),
        amount: type === 'sale' ? Math.max(0, Number(entry.amount || 0)) : 0,
        reasonKey: type === 'no_sale'
          ? (NO_SALE_REASON_OPTIONS.includes(reasonKey) ? reasonKey : 'other')
          : '',
        reasonText: type === 'no_sale' ? String(entry.reasonText || '').trim() : '',
        notes: String(entry.notes || '').trim(),
        payment: type === 'sale' ? String(entry.payment || 'Cash').trim() : '',
        qty: type === 'sale' ? Math.max(1, Number(entry.qty || 1)) : 1,
        customerId: type === 'sale' ? String(entry.customerId || '').trim() : '',
        productId: type === 'sale' ? String(entry.productId || '').trim() : '',
        walletUsed: type === 'sale' ? Math.max(0, Number(entry.walletUsed || 0)) : 0,
        cashPaid: type === 'sale' ? Math.max(0, Number(entry.cashPaid || 0)) : 0,
        createdAt: String(entry.createdAt || new Date().toISOString()),
        updatedAt: String(entry.updatedAt || new Date().toISOString())
      };
    })
    .sort((a, b) => String(b.date).localeCompare(String(a.date)));
}

function sanitizeActivity(activity, baseActivity) {
  const list = Array.isArray(activity) ? activity : baseActivity;
  return list
    .map((item, index) => ({
      id: String(item.id || `act-${String(index + 1).padStart(4, '0')}`).trim(),
      type: String(item.type || 'info').trim(),
      message: String(item.message || '').trim(),
      at: String(item.at || new Date().toISOString())
    }))
    .filter((item) => item.message)
    .slice(0, 400);
}

function reconcileWalletMembers(customers, walletsById) {
  customers.forEach((customer) => {
    if (!customer.walletId || !walletsById.has(customer.walletId)) {
      const fallbackId = `wallet-${customer.id}`;
      if (!walletsById.has(fallbackId)) {
        walletsById.set(fallbackId, {
          id: fallbackId,
          label: `${customer.name} Wallet`,
          balance: 0,
          memberIds: []
        });
      }
      customer.walletId = fallbackId;
    }
    const wallet = walletsById.get(customer.walletId);
    if (!wallet.memberIds.includes(customer.id)) wallet.memberIds.push(customer.id);
  });

  walletsById.forEach((wallet) => {
    wallet.memberIds = wallet.memberIds.filter((memberId) => customers.some((customer) => customer.id === memberId));
  });
}

function hasLegacyPersonalSeed(customers, entries) {
  if (!Array.isArray(customers) || customers.length !== 3) return false;
  if (Array.isArray(entries) && entries.length > 0) return false;
  const names = customers.map((customer) => String(customer.name || '').trim().toLowerCase()).sort().join('|');
  return names === 'akami|damian|mr dube';
}

function sanitize(state) {
  const base = defaultState();
  const settings = sanitizeSettings(state?.settings, base.settings);
  const products = sanitizeProducts(state?.products, base.products);
  const entries = sanitizeEntries(state?.entries);
  const customers = sanitizeCustomers(state?.customers);
  const walletsById = sanitizeWallets(state?.wallets);

  if (hasLegacyPersonalSeed(customers, entries)) {
    customers.length = 0;
    walletsById.clear();
  }

  reconcileWalletMembers(customers, walletsById);
  const activity = sanitizeActivity(state?.activity, base.activity);

  return {
    version: 4,
    lastSavedAt: String(state?.lastSavedAt || new Date().toISOString()),
    settings,
    products,
    customers,
    wallets: [...walletsById.values()],
    entries,
    activity
  };
}

function readStoredState() {
  try {
    const nextRaw = localStorage.getItem(APP_KEY);
    if (nextRaw) return { key: APP_KEY, raw: nextRaw };
    for (const key of LEGACY_KEYS) {
      const raw = localStorage.getItem(key);
      if (raw) return { key, raw };
    }
  } catch {
    return null;
  }
  return null;
}

export function loadState() {
  try {
    const found = readStoredState();
    if (!found) return defaultState();
    const clean = sanitize(JSON.parse(found.raw));
    if (found.key !== APP_KEY) {
      localStorage.setItem(APP_KEY, JSON.stringify(clean));
    }
    return clean;
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
  LEGACY_KEYS.forEach((key) => {
    try {
      localStorage.removeItem(key);
    } catch {
      // Ignore legacy key cleanup errors.
    }
  });
  return base;
}

export function exportBackup(state) {
  return {
    version: 4,
    exportedAt: new Date().toISOString(),
    app: 'Cathdel Creamy',
    state: sanitize(state)
  };
}

export function importBackup(payload) {
  const source = payload && payload.state ? payload.state : payload;
  return saveState(source || defaultState());
}

export const STORAGE_KEY = APP_KEY;
