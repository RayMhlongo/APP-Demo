import { addDays, formatLocalISO, startOfWeek, toDate, todayISO } from '../utils/date.js';

const WEEKDAY_SHORT = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
const WEEKDAY_FULL = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'];

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

export function weekdayPerformance(state, { month, year } = {}) {
  const rows = WEEKDAY_SHORT.map((label, index) => ({
    index,
    label,
    fullLabel: WEEKDAY_FULL[index],
    total: 0,
    saleEntries: 0,
    saleDays: new Set(),
    noSaleEntries: 0,
    reasons: {}
  }));

  getSalesEntries(state).forEach((entry) => {
    const d = toDate(entry.date);
    if (!d) return;
    if (Number.isInteger(month) && Number.isInteger(year) && !isInMonth(entry.date, year, month)) return;
    const index = (d.getDay() + 6) % 7;
    rows[index].total += Number(entry.amount || 0);
    rows[index].saleEntries += 1;
    rows[index].saleDays.add(entry.date);
  });

  getNoSaleEntries(state).forEach((entry) => {
    const d = toDate(entry.date);
    if (!d) return;
    if (Number.isInteger(month) && Number.isInteger(year) && !isInMonth(entry.date, year, month)) return;
    const index = (d.getDay() + 6) % 7;
    rows[index].noSaleEntries += 1;
    const reasonKey = String(entry.reasonKey || 'other');
    rows[index].reasons[reasonKey] = (rows[index].reasons[reasonKey] || 0) + 1;
  });

  return rows.map((row) => ({
    ...row,
    saleDays: row.saleDays.size,
    avgSalePerSellingDay: row.saleDays.size ? row.total / row.saleDays.size : 0,
    topReason: Object.entries(row.reasons).sort((a, b) => b[1] - a[1])[0] || null
  }));
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
  const recommendations = businessRecommendations(state);

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

  if (recommendations.length) results.push(recommendations[0]);

  return results.slice(0, 12);
}

export function businessRecommendations(state) {
  const suggestions = [];
  const strongest = strongestDay(state);
  const commonReason = mostCommonNoSaleReason(state);
  const coverage = businessDayCoverage(state);
  const loyaltyCustomers = state.customers.length;

  if (coverage.missingDays > 0) {
    suggestions.push(`Capture the remaining ${coverage.missingDays} unlogged operating day(s) so reports stay accurate.`);
  }

  if (strongest) {
    suggestions.push(`Prepare extra stock and staff cover before ${strongest.day}, because it is your highest-performing day.`);
  }

  if (commonReason?.reason === 'weather') {
    suggestions.push('Weather is your biggest selling blocker. Plan an indoor route, rainy-day offer, or pre-order message.');
  } else if (commonReason?.reason === 'stock_shortage') {
    suggestions.push('Stock shortage is hurting sales. Refill earlier and review stock levels before peak trading days.');
  } else if (commonReason?.reason === 'transport_issue') {
    suggestions.push('Transport issues are recurring. Build a fallback transport plan for your busiest trading days.');
  } else if (commonReason?.reason === 'equipment_issue') {
    suggestions.push('Equipment issues are recurring. Keep a small maintenance checklist and backup essentials ready.');
  }

  if (!loyaltyCustomers) {
    suggestions.push('Add regular buyers to loyalty so you can track repeat customers and shared wallets.');
  }

  if (!suggestions.length) {
    suggestions.push('Keep logging every trading day consistently so the assistant can give sharper business advice.');
  }

  return suggestions.slice(0, 4);
}

function extractWeekdayIndex(question) {
  const q = String(question || '').toLowerCase();
  const names = [
    ['monday', 'mon'],
    ['tuesday', 'tue', 'tues'],
    ['wednesday', 'wed'],
    ['thursday', 'thu', 'thur', 'thurs'],
    ['friday', 'fri'],
    ['saturday', 'sat'],
    ['sunday', 'sun']
  ];
  return names.findIndex((aliases) => aliases.some((alias) => {
    const escaped = alias.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    return new RegExp(`(^|\\W)${escaped}(\\W|$)`).test(q);
  }));
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
  const coverage = businessDayCoverage(state);
  const missed = missedDayPatterns(state);
  const weekdayStats = weekdayPerformance(state);
  const loyaltyCustomers = state.customers.length;
  const walletCount = state.wallets.length;
  const totalNoSaleLogs = getNoSaleEntries(state).length;
  const dayIndex = extractWeekdayIndex(q);
  const recommendations = businessRecommendations(state);

  function hasAny(words) {
    return words.some((word) => {
      const value = String(word || '').toLowerCase();
      if (!value) return false;
      if (value.includes(' ')) return q.includes(value);
      const escaped = value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      return new RegExp(`(^|\\W)${escaped}(\\W|$)`).test(q);
    });
  }

  if (hasAny(['hello', 'hi', 'hey'])) {
    return 'I can help with sales summaries, missed-day patterns, weekday performance, loyalty activity, reports, and practical next steps.';
  }

  if (hasAny(['today', 'daily']) && hasAny(['sale', 'sold', 'summary', 'total'])) {
    return `Today you have ${today.entries.length} sale entr${today.entries.length === 1 ? 'y' : 'ies'} totaling ${today.total.toFixed(2)}.`;
  }

  if (hasAny(['week summary', 'weekly summary', 'this week', 'weekly'])) {
    return `This week total is ${week.total.toFixed(2)} from ${week.entries.length} sale entr${week.entries.length === 1 ? 'y' : 'ies'} between ${week.from} and ${week.to}.`;
  }

  if (hasAny(['month summary', 'monthly summary', 'this month', 'monthly'])) {
    return `This month total is ${month.total.toFixed(2)} from ${month.entries.length} sale entr${month.entries.length === 1 ? 'y' : 'ies'} between ${month.from} and ${month.to}.`;
  }

  if (dayIndex >= 0 && hasAny(['why', 'low', 'weak', 'poor', 'bad'])) {
    const day = weekdayStats[dayIndex];
    if (!day.saleEntries && !day.noSaleEntries) {
      return `I do not have enough ${day.fullLabel} data yet to explain low performance. Keep logging both sales and no-sale days.`;
    }

    const pieces = [
      `${day.fullLabel} brought in ${day.total.toFixed(2)} across ${day.saleEntries} sale entr${day.saleEntries === 1 ? 'y' : 'ies'} and ${day.saleDays} selling day${day.saleDays === 1 ? '' : 's'}.`
    ];
    if (day.noSaleEntries > 0) {
      const reasonText = day.topReason ? ` Top no-sale reason was ${day.topReason[0].replace(/_/g, ' ')}.` : '';
      pieces.push(`${day.fullLabel} also had ${day.noSaleEntries} recorded no-sale day${day.noSaleEntries === 1 ? '' : 's'}.${reasonText}`);
    }
    if (day.avgSalePerSellingDay > 0) {
      pieces.push(`Average ${day.fullLabel} sales on days you traded were ${day.avgSalePerSellingDay.toFixed(2)}.`);
    }
    return pieces.join(' ');
  }

  if (dayIndex >= 0 && hasAny(['sales', 'sold', 'highest', 'lowest', 'best', 'worst', 'how did'])) {
    const day = weekdayStats[dayIndex];
    if (!day.saleEntries && !day.noSaleEntries) {
      return `There is no meaningful ${day.fullLabel} history yet.`;
    }
    return `${day.fullLabel} total sales are ${day.total.toFixed(2)} across ${day.saleDays} selling day${day.saleDays === 1 ? '' : 's'}, with ${day.noSaleEntries} no-sale log${day.noSaleEntries === 1 ? '' : 's'}.`;
  }

  if (hasAny(['strongest', 'best day', 'top day', 'highest day'])) {
    return strongest ? `${strongest.day} is your strongest sales day.` : 'Not enough data yet to identify the strongest day.';
  }

  if (hasAny(['weakest', 'worst day', 'lowest day'])) {
    return weakest ? `${weakest.day} is your weakest sales day.` : 'Not enough data yet to identify the weakest day.';
  }

  if (hasAny(['reason', 'why no sale', 'no-sale reason', 'did not sell'])) {
    if (!commonReason) return 'No no-sale reasons recorded yet.';
    return `Top no-sale reason is ${commonReason.reason.replace(/_/g, ' ')} (${commonReason.count} times).`;
  }

  if (hasAny(['missed', 'not sold', 'no sale days', 'unlogged'])) {
    if (coverage.businessDays <= 0) return 'No operating days configured for this month yet.';
    return `This month: sold ${coverage.soldDays}/${coverage.businessDays} operating days, no-sale logs ${coverage.noSaleDays}, missing logs ${coverage.missingDays}.`;
  }

  if (hasAny(['streak', 'consecutive'])) {
    return streak.bestStreak > 0
      ? `Longest sales streak is ${streak.bestStreak} day(s).`
      : 'No sales streak available yet.';
  }

  if (hasAny(['average', 'avg'])) {
    return `Average daily sales are ${dailyAvg.amount.toFixed(2)} and average weekly sales are ${weeklyAvg.amount.toFixed(2)}.`;
  }

  if (hasAny(['week over week', 'compare week', 'last week vs', 'wow'])) {
    return wow.changePct === null
      ? 'Week-over-week comparison is not available yet.'
      : `Week-over-week is ${wow.changePct >= 0 ? 'up' : 'down'} ${Math.abs(wow.changePct).toFixed(1)}% (${wow.current.toFixed(2)} vs ${wow.previous.toFixed(2)}).`;
  }

  if (hasAny(['month over month', 'compare month', 'last month vs', 'mom'])) {
    return mom.changePct === null
      ? 'Month-over-month comparison is not available yet.'
      : `Month-over-month is ${mom.changePct >= 0 ? 'up' : 'down'} ${Math.abs(mom.changePct).toFixed(1)}% (${mom.current.toFixed(2)} vs ${mom.previous.toFixed(2)}).`;
  }

  if (hasAny(['loyalty', 'customer', 'wallet', 'qr'])) {
    return `Loyalty overview: ${loyaltyCustomers} customer profile(s) across ${walletCount} wallet(s). Use this to track repeat buyers, shared family balances, and QR-based checkout.`;
  }

  if (hasAny(['report', 'explain'])) {
    return [
      `Current view: ${week.entries.length} sales this week totaling ${week.total.toFixed(2)}.`,
      `No-sale logs recorded: ${totalNoSaleLogs}.`,
      commonReason ? `Top no-sale reason: ${commonReason.reason.replace(/_/g, ' ')}.` : 'No top no-sale reason yet.'
    ].join(' ');
  }

  if (hasAny(['pattern', 'trend'])) {
    const patternLine = missed.topCount > 0 && missed.topDay
      ? `${missed.topDay} is the most missed day this month (${missed.topCount}).`
      : 'No clear missed-day pattern yet.';
    return `${patternLine} Week total is ${week.total.toFixed(2)} and month total is ${month.total.toFixed(2)}.`;
  }

  if (hasAny(['improve', 'improvement', 'suggest', 'recommend', 'advice', 'help my business', 'grow'])) {
    return recommendations.join(' ');
  }

  if (hasAny(['how are we doing', 'how is the business', 'business doing'])) {
    return [
      `This week you made ${week.total.toFixed(2)} from ${week.entries.length} sales.`,
      strongest ? `${strongest.day} is your strongest day.` : 'There is not enough data to identify your strongest day yet.',
      coverage.businessDays > 0 ? `You have logged ${coverage.soldDays} sold day(s), ${coverage.noSaleDays} no-sale day(s), and ${coverage.missingDays} missing operating day(s) this month.` : 'Operating days are not configured clearly yet.'
    ].join(' ');
  }

  return [
    'Try asking things like:',
    '- How were sales this week?',
    '- Which day had the highest sales?',
    '- Why were sales low on Monday?',
    '- What patterns matter this month?',
    '- How can I improve the business?',
    '- Explain this report or summarize loyalty activity.'
  ].join('\n');
}
