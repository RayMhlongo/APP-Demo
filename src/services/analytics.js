import { addDays, formatLocalISO, startOfWeek, toDate, todayISO } from '../utils/date.js';

const WEEKDAY_SHORT = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];

function sameDay(a, b) {
  return String(a || '').slice(0, 10) === String(b || '').slice(0, 10);
}

function sumAmounts(entries) {
  return entries.reduce((acc, entry) => acc + Number(entry.amount || 0), 0);
}

function countDistinctDays(entries) {
  return new Set(entries.map((entry) => entry.date)).size;
}

function isInMonth(date, year, month) {
  const d = toDate(date);
  return Boolean(d && d.getFullYear() === year && d.getMonth() === month);
}

function inRange(date, from, to) {
  return date >= from && date <= to;
}

export function getSalesEntries(state) {
  return state.entries.filter((entry) => entry.type === 'sale');
}

export function getNoSaleEntries(state) {
  return state.entries.filter((entry) => entry.type === 'no_sale');
}

export function totalSales(state) {
  return sumAmounts(getSalesEntries(state));
}

export function todaySales(state) {
  const today = todayISO();
  const entries = getSalesEntries(state).filter((entry) => sameDay(entry.date, today));
  return { entries, total: sumAmounts(entries) };
}

export function weekSales(state, anchor = new Date()) {
  const start = startOfWeek(anchor);
  const end = addDays(start, 6);
  const from = formatLocalISO(start);
  const to = formatLocalISO(end);
  const entries = getSalesEntries(state).filter((entry) => inRange(entry.date, from, to));
  return { entries, total: sumAmounts(entries), from, to };
}

export function previousWeekSales(state) {
  const currentWeekStart = startOfWeek(new Date());
  return weekSales(state, addDays(currentWeekStart, -1));
}

export function monthSales(state, anchor = new Date()) {
  const year = anchor.getFullYear();
  const month = anchor.getMonth();
  const from = formatLocalISO(new Date(year, month, 1));
  const to = formatLocalISO(new Date(year, month + 1, 0));
  const entries = getSalesEntries(state).filter((entry) => inRange(entry.date, from, to));
  return { entries, total: sumAmounts(entries), from, to, year, month };
}

export function previousMonthSales(state) {
  const now = new Date();
  return monthSales(state, new Date(now.getFullYear(), now.getMonth() - 1, 1));
}

export function sellingDaysThisMonth(state) {
  const current = monthSales(state);
  return countDistinctDays(current.entries);
}

export function noSaleCount(state) {
  return getNoSaleEntries(state).length;
}

export function reasonDistribution(state) {
  const map = {};
  getNoSaleEntries(state).forEach((entry) => {
    const key = String(entry.reasonKey || 'other');
    map[key] = (map[key] || 0) + 1;
  });
  return map;
}

export function mostCommonNoSaleReason(state) {
  const top = Object.entries(reasonDistribution(state)).sort((a, b) => b[1] - a[1])[0];
  return top ? { reason: top[0], count: top[1] } : null;
}

export function salesByWeekday(state, { month, year } = {}) {
  const buckets = [0, 0, 0, 0, 0, 0, 0];
  getSalesEntries(state).forEach((entry) => {
    const d = toDate(entry.date);
    if (!d) return;
    if (Number.isInteger(month) && Number.isInteger(year) && !isInMonth(entry.date, year, month)) return;
    const index = (d.getDay() + 6) % 7;
    buckets[index] += Number(entry.amount || 0);
  });
  return buckets;
}

export function noSalesByWeekday(state, { month, year } = {}) {
  const buckets = [0, 0, 0, 0, 0, 0, 0];
  getNoSaleEntries(state).forEach((entry) => {
    const d = toDate(entry.date);
    if (!d) return;
    if (Number.isInteger(month) && Number.isInteger(year) && !isInMonth(entry.date, year, month)) return;
    const index = (d.getDay() + 6) % 7;
    buckets[index] += 1;
  });
  return buckets;
}

export function strongestDay(state) {
  const buckets = salesByWeekday(state);
  const best = Math.max(...buckets);
  if (best <= 0) return null;
  const index = buckets.findIndex((value) => value === best);
  return { day: WEEKDAY_SHORT[index], amount: best };
}

export function weakestDay(state) {
  const buckets = salesByWeekday(state);
  let weakestAmount = Infinity;
  let weakestIndex = -1;
  buckets.forEach((value, index) => {
    if (value > 0 && value < weakestAmount) {
      weakestAmount = value;
      weakestIndex = index;
    }
  });
  if (weakestIndex < 0) return null;
  return { day: WEEKDAY_SHORT[weakestIndex], amount: weakestAmount };
}

export function streakInfo(state) {
  const soldDates = [...new Set(getSalesEntries(state).map((entry) => entry.date))].sort();
  let best = 0;
  let current = 0;
  let previous = null;
  soldDates.forEach((iso) => {
    const date = toDate(iso);
    if (!date) return;
    if (!previous) {
      current = 1;
    } else {
      const diffDays = (date.getTime() - previous.getTime()) / 86400000;
      current = diffDays === 1 ? current + 1 : 1;
    }
    if (current > best) best = current;
    previous = date;
  });
  return { bestStreak: best, soldDays: soldDates.length };
}

export function businessDayCoverage(state) {
  const now = new Date();
  const year = now.getFullYear();
  const month = now.getMonth();
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
      const key = formatLocalISO(cursor);
      if (soldSet.has(key)) soldDays += 1;
      else if (noSaleSet.has(key)) noSaleDays += 1;
      else missingDays += 1;
    }
    cursor.setDate(cursor.getDate() + 1);
  }

  return { businessDays, soldDays, noSaleDays, missingDays };
}

export function averageDailySales(state) {
  const sales = getSalesEntries(state);
  if (!sales.length) return { amount: 0, days: 0 };
  const days = countDistinctDays(sales);
  return {
    amount: days > 0 ? sumAmounts(sales) / days : 0,
    days
  };
}

export function averageWeeklySales(state) {
  const sales = getSalesEntries(state);
  if (!sales.length) return { amount: 0, weeks: 0 };
  const dates = sales.map((entry) => toDate(entry.date)).filter(Boolean).sort((a, b) => a - b);
  const first = dates[0];
  const last = dates[dates.length - 1];
  const elapsedDays = Math.max(1, Math.ceil((last.getTime() - first.getTime()) / 86400000) + 1);
  const weeks = Math.max(1, Math.ceil(elapsedDays / 7));
  return {
    amount: sumAmounts(sales) / weeks,
    weeks
  };
}

export function weekOverWeek(state) {
  const current = weekSales(state);
  const previous = previousWeekSales(state);
  return {
    current: current.total,
    previous: previous.total,
    changePct: previous.total > 0 ? ((current.total - previous.total) / previous.total) * 100 : null
  };
}

export function monthOverMonth(state) {
  const current = monthSales(state);
  const previous = previousMonthSales(state);
  return {
    current: current.total,
    previous: previous.total,
    changePct: previous.total > 0 ? ((current.total - previous.total) / previous.total) * 100 : null
  };
}

export function missedDayPatterns(state) {
  const now = new Date();
  const month = now.getMonth();
  const year = now.getFullYear();
  const buckets = noSalesByWeekday(state, { month, year });
  const top = Math.max(...buckets);
  const index = buckets.findIndex((value) => value === top);
  return {
    buckets,
    topCount: top,
    topDay: index >= 0 ? WEEKDAY_SHORT[index] : ''
  };
}

export function getEntryStatusByDate(state) {
  const map = new Map();
  getNoSaleEntries(state).forEach((entry) => {
    map.set(entry.date, { kind: 'nosale', entry });
  });
  getSalesEntries(state).forEach((entry) => {
    map.set(entry.date, { kind: 'sold', entry });
  });
  return map;
}

export function recentActivity(state, limit = 8) {
  return [...state.activity].sort((a, b) => String(b.at).localeCompare(String(a.at))).slice(0, limit);
}

export function buildInsights(state) {
  const results = [];
  if (!state.entries.length) {
    results.push('No logs yet. Start by recording a sale or a no-sale day.');
    return results;
  }

  const strongest = strongestDay(state);
  const weakest = weakestDay(state);
  const commonReason = mostCommonNoSaleReason(state);
  const streak = streakInfo(state);
  const coverage = businessDayCoverage(state);
  const wow = weekOverWeek(state);
  const mom = monthOverMonth(state);
  const dailyAvg = averageDailySales(state);
  const weeklyAvg = averageWeeklySales(state);
  const missedPatterns = missedDayPatterns(state);
  const currentMonthSellingDays = sellingDaysThisMonth(state);

  if (strongest) results.push(`${strongest.day} is your strongest sales day.`);
  if (weakest) results.push(`${weakest.day} is your weakest sales day.`);
  if (commonReason) results.push(`${commonReason.reason.replace(/_/g, ' ')} is the top no-sale reason (${commonReason.count}x).`);
  results.push(`Selling days this month: ${currentMonthSellingDays}.`);

  if (coverage.businessDays > 0) {
    results.push(`You sold on ${coverage.soldDays} of ${coverage.businessDays} operating days this month.`);
    if (coverage.missingDays > 0) results.push(`${coverage.missingDays} operating days this month still have no log.`);
  }

  if (streak.bestStreak > 0) results.push(`Longest sales streak is ${streak.bestStreak} day(s).`);

  if (wow.changePct !== null) {
    results.push(`Week-over-week sales are ${wow.changePct >= 0 ? 'up' : 'down'} ${Math.abs(wow.changePct).toFixed(1)}%.`);
  } else {
    results.push('Week-over-week needs at least one previous week with sales.');
  }

  if (mom.changePct !== null) {
    results.push(`Month-over-month sales are ${mom.changePct >= 0 ? 'up' : 'down'} ${Math.abs(mom.changePct).toFixed(1)}%.`);
  } else {
    results.push('Month-over-month needs previous month data.');
  }

  results.push(`Average daily sales: ${dailyAvg.amount.toFixed(2)}.`);
  results.push(`Average weekly sales: ${weeklyAvg.amount.toFixed(2)}.`);

  if (missedPatterns.topCount > 1 && missedPatterns.topDay) {
    results.push(`${missedPatterns.topDay} is your most missed day this month (${missedPatterns.topCount}).`);
  }

  return results.slice(0, 12);
}

export function assistantReply(question, state) {
  const q = String(question || '').toLowerCase().trim();
  if (!q) return 'Ask about sales, no-sale patterns, streaks, and trends.';

  const today = todaySales(state);
  const week = weekSales(state);
  const month = monthSales(state);
  const wow = weekOverWeek(state);
  const mom = monthOverMonth(state);
  const commonReason = mostCommonNoSaleReason(state);
  const strongest = strongestDay(state);
  const weakest = weakestDay(state);
  const streak = streakInfo(state);
  const dailyAvg = averageDailySales(state);
  const weeklyAvg = averageWeeklySales(state);

  if (q.includes('today')) return `Today: ${today.entries.length} sale entries, total ${today.total.toFixed(2)}.`;
  if (q.includes('week') && q.includes('summary')) return `This week total is ${week.total.toFixed(2)} from ${week.entries.length} sales.`;
  if (q.includes('month') && q.includes('summary')) return `This month total is ${month.total.toFixed(2)} from ${month.entries.length} sales.`;
  if (q.includes('strong')) return strongest ? `${strongest.day} is your strongest sales day.` : 'Not enough data yet.';
  if (q.includes('weak')) return weakest ? `${weakest.day} is your weakest sales day.` : 'Not enough data yet.';
  if (q.includes('reason')) {
    return commonReason ? `Top no-sale reason is ${commonReason.reason.replace(/_/g, ' ')} (${commonReason.count} times).` : 'No no-sale reasons recorded yet.';
  }
  if (q.includes('streak')) return `Longest streak is ${streak.bestStreak} day(s).`;
  if (q.includes('week') && q.includes('over')) {
    return wow.changePct === null
      ? 'Week-over-week comparison is not available yet.'
      : `Week-over-week is ${wow.changePct >= 0 ? 'up' : 'down'} ${Math.abs(wow.changePct).toFixed(1)}%.`;
  }
  if (q.includes('month') && q.includes('over')) {
    return mom.changePct === null
      ? 'Month-over-month comparison is not available yet.'
      : `Month-over-month is ${mom.changePct >= 0 ? 'up' : 'down'} ${Math.abs(mom.changePct).toFixed(1)}%.`;
  }
  if (q.includes('average')) {
    return `Average daily sales are ${dailyAvg.amount.toFixed(2)} and average weekly sales are ${weeklyAvg.amount.toFixed(2)}.`;
  }

  return [
    'I can answer:',
    '- today / week / month summary',
    '- strongest and weakest day',
    '- no-sale reason patterns',
    '- streak and averages',
    '- week-over-week and month-over-month'
  ].join('\n');
}
