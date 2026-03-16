import { NO_SALE_REASON_OPTIONS } from './models.js';

function isValidDate(value) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(String(value || ''))) return false;
  return !Number.isNaN(new Date(`${value}T12:00:00`).getTime());
}

export function validateSaleInput(input) {
  const errors = [];
  if (!isValidDate(input.date)) errors.push('Choose a valid sale date.');
  if (!(Number(input.amount) > 0)) errors.push('Sale amount must be greater than zero.');
  if (!(Number(input.qty) >= 1)) errors.push('Quantity must be at least 1.');
  if (!String(input.payment || '').trim()) errors.push('Select payment method.');
  return { ok: errors.length === 0, errors };
}

export function validateNoSaleInput(input) {
  const errors = [];
  if (!isValidDate(input.date)) errors.push('Choose a valid date.');
  if (!NO_SALE_REASON_OPTIONS.includes(String(input.reasonKey || ''))) errors.push('Select a valid reason for no-sale.');
  if (String(input.reasonKey) === 'other' && !String(input.reasonText || '').trim()) errors.push('Enter a custom reason.');
  return { ok: errors.length === 0, errors };
}

export function validateCustomerInput(input) {
  const errors = [];
  const type = String(input.type || 'child') === 'adult' ? 'adult' : 'child';
  if (!String(input.name || '').trim()) errors.push(type === 'adult' ? 'Adult name is required.' : 'Child name is required.');
  if (type === 'child' && !String(input.grade || '').trim()) errors.push('Grade number is required for child profiles.');
  if (String(input.walletMode || '') === 'existing' && !String(input.walletId || '').trim()) errors.push('Select an existing wallet.');
  if (Number(input.topup || 0) < 0) errors.push('Top-up cannot be negative.');
  return { ok: errors.length === 0, errors };
}

export function validateSettingsInput(input) {
  const errors = [];
  if (!String(input.businessName || '').trim()) errors.push('Business name is required.');
  if (!Array.isArray(input.operatingDays) || input.operatingDays.length === 0) errors.push('Select at least one operating day.');
  if (!(Number(input.loyaltyThreshold) >= 1)) errors.push('Loyalty threshold must be at least 1.');
  return { ok: errors.length === 0, errors };
}

export function validateReportRange(input) {
  const errors = [];
  const from = String(input.from || '');
  const to = String(input.to || '');
  if (from && !isValidDate(from)) errors.push('Report start date is invalid.');
  if (to && !isValidDate(to)) errors.push('Report end date is invalid.');
  if (from && to && from > to) errors.push('Start date cannot be after end date.');
  return { ok: errors.length === 0, errors };
}
