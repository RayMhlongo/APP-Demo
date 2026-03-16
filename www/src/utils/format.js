export function escapeHtml(value) {
  return String(value ?? '').replace(/[&<>"']/g, (char) => ({
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    '"': '&quot;',
    "'": '&#39;'
  }[char]));
}

export function normalizePhone(raw) {
  const digits = String(raw || '').replace(/\D/g, '');
  if (!digits) return '';
  let d = digits;
  if (d.startsWith('27')) d = d.slice(2);
  if (d.startsWith('0')) d = d.slice(1);
  d = d.slice(0, 9);
  const p1 = d.slice(0, 2);
  const p2 = d.slice(2, 5);
  const p3 = d.slice(5, 9);
  return `+27${p1 ? ` ${p1}` : ''}${p2 ? ` ${p2}` : ''}${p3 ? ` ${p3}` : ''}`;
}

export function normalizeGrade(raw) {
  const digits = String(raw ?? '').replace(/\D/g, '');
  return digits;
}

export function formatMoney(amount, currency = 'ZAR') {
  const num = Number(amount || 0);
  const safe = Number.isFinite(num) ? num : 0;
  try {
    return new Intl.NumberFormat('en-ZA', { style: 'currency', currency, maximumFractionDigits: 2 }).format(safe);
  } catch {
    return `R${safe.toFixed(2)}`;
  }
}

export function toNumber(value, fallback = 0) {
  const n = Number(value);
  return Number.isFinite(n) ? n : fallback;
}
