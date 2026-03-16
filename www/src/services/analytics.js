import { addDays, startOfWeek, toDate, todayISO } from '../utils/date.js';

const WEEKDAY_SHORT = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];

function sameDay(a, b) {
  return String(a || '').slice(0, 10) === String(b || '').slice(0, 10);
}

function money(value, currency = 'ZAR') {
  const amount = Number(value || 0);
  try {
    return new Intl.NumberFormat('en-ZA', { style: 'currency', currency, maximumFractionDigits: 2 }).format(amount);
  } catch {
    return `R${amount.toFixed(2)}`;
  }
}

export function getSalesEntries(state) {
  return state.entries.filter((e) => e.type === 'sale');
}

export function getNoSaleEntries(state) {
  return state.entries.filter((e) => e.type === 'no_sale');
}

export function sum(entries) {
  return entries.reduce((acc, e) => acc + Number(e.amount || 0), 0);
}

export function todaySales(state) {
  const today = todayISO();
  const sales = getSalesEntries(state).filter((e) => sameDay(e.date, today));
  return {
    entries: sales,
    total: sum(sales)
  };
}

export function weekSales(state, anchor = new Date()) {
  const start = startOfWeek(anchor);
  const end = addDays(start, 6);
  const sales = getSalesEntries(state).filter((entry) => {
    const d = toDate(entry.date);
    return d && d >= start && d <= end;
  });
  return {
    entries: sales,
    total: sum(sales)
  };
}

export function previousWeekSales(state) {
  const start = startOfWeek(new Date());
  const previousAnchor = addDays(start, -1);
  return weekSales(state, previousAnchor);
}

export function totalSales(state) {
  return sum(getSalesEntries(state));
}

export function noSaleCount(state) {
  return getNoSaleEntries(state).length;
}

export function reasonDistribution(state) {
  const reasons = {};
  getNoSaleEntries(state).forEach((entry) => {
    const key = entry.reasonKey || 'other';
    reasons[key] = (reasons[key] || 0) + 1;
  });
  return reasons;
}

export function mostCommonNoSaleReason(state) {
  const dist = reasonDistribution(state);
  const top = Object.entries(dist).sort((a, b) => b[1] - a[1])[0];
  return top ? { reason: top[0], count: top[1] } : null;
}

export function salesByWeekday(state) {
  const buckets = [0, 0, 0, 0, 0, 0, 0];
  getSalesEntries(state).forEach((entry) => {
    const d = toDate(entry.date);
    if (!d) return;
    const idx = (d.getDay() + 6) % 7;
    buckets[idx] += Number(entry.amount || 0);
  });
  return buckets;
}

export function noSalesByWeekday(state, { month, year } = {}) {
  const buckets = [0, 0, 0, 0, 0, 0, 0];
  getNoSaleEntries(state).forEach((entry) => {
    const d = toDate(entry.date);
    if (!d) return;
    if (Number.isInteger(month) && d.getMonth() !== month) return;
    if (Number.isInteger(year) && d.getFullYear() !== year) return;
    const idx = (d.getDay() + 6) % 7;
    buckets[idx] += 1;
  });
  return buckets;
}

export function strongestDay(state) {
  const buckets = salesByWeekday(state);
  const max = Math.max(...buckets);
  if (max <= 0) return null;
  const idx = buckets.findIndex((amount) => amount === max);
  return { day: WEEKDAY_SHORT[idx], amount: max };
}

export function weakestDay(state) {
  const buckets = salesByWeekday(state);
  let idx = -1;
  let min = Infinity;
  buckets.forEach((amount, i) => {
    if (amount > 0 && amount < min) {
      min = amount;
      idx = i;
    }
  });
  if (idx < 0) return null;
  return { day: WEEKDAY_SHORT[idx], amount: min };
}

export function streakInfo(state) {
  const soldDays = new Set(getSalesEntries(state).map((e) => e.date));
  const dates = [...soldDays].sort();
  let best = 0;
  let current = 0;
  let prev = null;
  dates.forEach((date) => {
    const d = toDate(date);
    if (!d) return;
    if (!prev) {
      current = 1;
    } else {
      const diff = (d.getTime() - prev.getTime()) / 86400000;
      current = diff === 1 ? current + 1 : 1;
    }
    if (current > best) best = current;
    prev = d;
  });
  return { bestStreak: best, soldDays: soldDays.size };
}

export function businessDayCoverage(state) {
  const now = new Date();
  const month = now.getMonth();
  const year = now.getFullYear();
  const operatingDays = Array.isArray(state.settings.operatingDays) && state.settings.operatingDays.length
    ? new Set(state.settings.operatingDays)
    : new Set([1, 2, 3, 4, 5, 6]);

  const soldSet = new Set(getSalesEntries(state).map((entry) => entry.date));
  const noSaleSet = new Set(getNoSaleEntries(state).map((entry) => entry.date));

  let businessDays = 0;
  let soldDays = 0;
  let noSaleDays = 0;
  let missingDays = 0;

  const cursor = new Date(year, month, 1);
  const end = new Date(year, month + 1, 0);
  while (cursor <= end) {
    const weekday = cursor.getDay();
    if (operatingDays.has(weekday)) {
      businessDays += 1;
      const key = `${cursor.getFullYear()}-${String(cursor.getMonth() + 1).padStart(2, '0')}-${String(cursor.getDate()).padStart(2, '0')}`;
      if (soldSet.has(key)) soldDays += 1;
      else if (noSaleSet.has(key)) noSaleDays += 1;
      else missingDays += 1;
    }
    cursor.setDate(cursor.getDate() + 1);
  }

  return { businessDays, soldDays, noSaleDays, missingDays };
}

export function weekOverWeek(state) {
  const current = weekSales(state);
  const previous = previousWeekSales(state);
  if (previous.total <= 0) {
    return {
      current: current.total,
      previous: previous.total,
      changePct: null
    };
  }
  return {
    current: current.total,
    previous: previous.total,
    changePct: ((current.total - previous.total) / previous.total) * 100
  };
}

export function getEntryStatusByDate(state) {
  const status = new Map();
  getNoSaleEntries(state).forEach((entry) => {
    status.set(entry.date, { kind: 'nosale', entry });
  });
  getSalesEntries(state).forEach((entry) => {
    status.set(entry.date, { kind: 'sold', entry });
  });
  return status;
}

export function recentActivity(state, limit = 8) {
  return [...state.activity].sort((a, b) => String(b.at).localeCompare(String(a.at))).slice(0, limit);
}

export function buildInsights(state) {
  const currency = state.settings.currency || 'ZAR';
  const today = todaySales(state);
  const week = weekSales(state);
  const wow = weekOverWeek(state);
  const streak = streakInfo(state);
  const strongest = strongestDay(state);
  const weakest = weakestDay(state);
  const commonReason = mostCommonNoSaleReason(state);
  const coverage = businessDayCoverage(state);
  const now = new Date();
  const missedBuckets = noSalesByWeekday(state, { month: now.getMonth(), year: now.getFullYear() });
  const topMissCount = Math.max(...missedBuckets);
  const topMissIndex = missedBuckets.findIndex((count) => count === topMissCount);

  const insights = [];
  if (!state.entries.length) {
    insights.push('No logs recorded yet. Start by adding your first sale or no-sale day.');
    return insights;
  }

  insights.push(`Today sales: ${today.entries.length} transaction(s), ${money(today.total, currency)} total.`);
  insights.push(`This week: ${week.entries.length} sales worth ${money(week.total, currency)}.`);

  if (strongest) insights.push(`${strongest.day} is your strongest sales day so far.`);
  if (weakest) insights.push(`${weakest.day} is your weakest sales day so far.`);
  if (commonReason) insights.push(`${commonReason.reason.replace(/_/g, ' ')} is your top no-sale reason (${commonReason.count}).`);

  if (coverage.businessDays > 0) {
    insights.push(`You sold on ${coverage.soldDays} of ${coverage.businessDays} operating days this month.`);
    if (coverage.missingDays > 0) insights.push(`${coverage.missingDays} operating day(s) this month still have no log.`);
  }

  if (topMissCount > 1 && topMissIndex >= 0) {
    insights.push(`You missed ${topMissCount} ${WEEKDAY_SHORT[topMissIndex]}s this month.`);
  }

  if (wow.changePct !== null) {
    const direction = wow.changePct >= 0 ? 'up' : 'down';
    insights.push(`Week-over-week sales are ${direction} ${Math.abs(wow.changePct).toFixed(1)}%.`);
    if (wow.changePct <= -35 && wow.previous >= 1) {
      insights.push('This week dropped sharply vs last week. Check stock, weather, and transport risks.');
    }
  }

  if (streak.bestStreak > 0) insights.push(`Longest sales streak: ${streak.bestStreak} day(s).`);
  return insights.slice(0, 8);
}

export function assistantReply(question, state) {
  const q = String(question || '').toLowerCase().trim();
  if (!q) return 'Ask me about sales, missed-day reasons, loyalty activity, or week-over-week trends.';

  const currency = state.settings.currency || 'ZAR';
  const today = todaySales(state);
  const week = weekSales(state);
  const wow = weekOverWeek(state);
  const commonReason = mostCommonNoSaleReason(state);
  const strongest = strongestDay(state);
  const weakest = weakestDay(state);
  const streak = streakInfo(state);
  const coverage = businessDayCoverage(state);
  const loyaltyCount = state.customers.length;

  if (q.includes('today')) {
    return `Today: ${today.entries.length} sale entr${today.entries.length === 1 ? 'y' : 'ies'}, total ${money(today.total, currency)}.`;
  }
  if (q.includes('week') && (q.includes('summary') || q.includes('sale') || q.includes('total'))) {
    return `This week: ${week.entries.length} sales, total ${money(week.total, currency)}.`;
  }
  if (q.includes('week') && q.includes('over')) {
    if (wow.changePct === null) return 'Week-over-week comparison is available after at least one previous week with sales.';
    return `Week-over-week is ${wow.changePct >= 0 ? 'up' : 'down'} ${Math.abs(wow.changePct).toFixed(1)}%.`;
  }
  if (q.includes('reason') || q.includes('missed')) {
    return commonReason
      ? `Most common no-sale reason is "${commonReason.reason.replace(/_/g, ' ')}" (${commonReason.count} time${commonReason.count === 1 ? '' : 's'}).`
      : 'No missed trading days logged yet.';
  }
  if (q.includes('strong') || q.includes('best')) {
    return strongest ? `${strongest.day} is currently your strongest sales day.` : 'Not enough sales yet to identify a strongest day.';
  }
  if (q.includes('weak') || q.includes('drop')) {
    return weakest ? `${weakest.day} is currently your weakest sales day.` : 'Not enough sales yet to identify a weakest day.';
  }
  if (q.includes('streak')) {
    return `Your longest sales streak is ${streak.bestStreak} day(s).`;
  }
  if (q.includes('loyal') || q.includes('customer')) {
    return `You currently have ${loyaltyCount} loyalty customer profile${loyaltyCount === 1 ? '' : 's'}.`;
  }
  if (q.includes('month') || q.includes('operating')) {
    return `This month: sold ${coverage.soldDays}/${coverage.businessDays} operating days, no-sale logged on ${coverage.noSaleDays}, missing logs on ${coverage.missingDays}.`;
  }

  return [
    'I can help with:',
    '- today sales',
    '- week summary',
    '- week over week',
    '- missed-day reasons',
    '- strongest/weakest day',
    '- loyalty activity'
  ].join('\n');
}
