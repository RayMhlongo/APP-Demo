import { formatLocalISO } from '../utils/date.js';
import { formatMoney } from '../utils/format.js';
import {
  averageDailySales,
  averageWeeklySales,
  getNoSaleEntries,
  getSalesEntries,
  monthOverMonth,
  sellingDaysThisMonth,
  totalSales,
  weekOverWeek
} from './analytics.js';

function normalizeRangeDate(value, fallback) {
  const date = value ? String(value).slice(0, 10) : '';
  return date || fallback;
}

function inRange(date, from, to) {
  if (!date) return false;
  return date >= from && date <= to;
}

function toCsv(rows) {
  return rows
    .map((row) => row.map((value) => `"${String(value ?? '').replace(/"/g, '""')}"`).join(','))
    .join('\n');
}

function startOfMonthISO() {
  const now = new Date();
  return formatLocalISO(new Date(now.getFullYear(), now.getMonth(), 1));
}

export function resolveReportRange(state, input = {}) {
  const allDates = state.entries.map((entry) => entry.date).filter(Boolean).sort();
  const minDate = allDates[0] || startOfMonthISO();
  const maxDate = allDates[allDates.length - 1] || formatLocalISO(new Date());
  return {
    from: normalizeRangeDate(input.from, minDate),
    to: normalizeRangeDate(input.to, maxDate)
  };
}

export function buildReportSummary(state, rangeInput = {}) {
  const range = resolveReportRange(state, rangeInput);
  const entries = state.entries.filter((entry) => inRange(entry.date, range.from, range.to));
  const sales = entries.filter((entry) => entry.type === 'sale');
  const noSales = entries.filter((entry) => entry.type === 'no_sale');
  const total = sales.reduce((sum, entry) => sum + Number(entry.amount || 0), 0);
  const saleDays = new Set(sales.map((entry) => entry.date)).size;
  const operatingDaysTracked = new Set(entries.map((entry) => entry.date)).size;
  const reasons = {};
  noSales.forEach((entry) => {
    const key = entry.reasonKey === 'other' ? (entry.reasonText || 'other') : entry.reasonKey;
    reasons[key] = (reasons[key] || 0) + 1;
  });
  const sortedReasons = Object.entries(reasons).sort((a, b) => b[1] - a[1]);

  const customerSales = {};
  sales.forEach((entry) => {
    if (!entry.customerId) return;
    customerSales[entry.customerId] = (customerSales[entry.customerId] || 0) + Number(entry.amount || 0);
  });
  const topCustomerEntry = Object.entries(customerSales).sort((a, b) => b[1] - a[1])[0];
  const topCustomer = topCustomerEntry
    ? state.customers.find((customer) => customer.id === topCustomerEntry[0])?.name || 'Unknown'
    : '';

  const wow = weekOverWeek(state);
  const mom = monthOverMonth(state);
  const topReason = sortedReasons[0] ? { reason: String(sortedReasons[0][0]), count: Number(sortedReasons[0][1]) } : null;

  return {
    range,
    totals: {
      salesTotal: total,
      saleEntries: sales.length,
      noSaleEntries: noSales.length,
      saleDays,
      operatingDaysTracked
    },
    averages: {
      daily: averageDailySales(state),
      weekly: averageWeeklySales(state)
    },
    trend: {
      weekOverWeek: wow,
      monthOverMonth: mom,
      sellingDaysThisMonth: sellingDaysThisMonth(state),
      totalSalesAllTime: totalSales(state)
    },
    reasons: {
      top: topReason,
      distribution: sortedReasons
    },
    loyalty: {
      customerCount: state.customers.length,
      walletCount: state.wallets.length,
      topCustomer
    }
  };
}

export function buildReportNarrative(summary, currency = 'ZAR') {
  const lines = [];
  lines.push(`Period: ${summary.range.from} to ${summary.range.to}`);
  lines.push(`Sales total: ${formatMoney(summary.totals.salesTotal, currency)} from ${summary.totals.saleEntries} sale entries.`);
  lines.push(`No-sale logs: ${summary.totals.noSaleEntries}. Selling days in period: ${summary.totals.saleDays}.`);
  lines.push(`Average daily sales: ${formatMoney(summary.averages.daily.amount, currency)}.`);
  lines.push(`Average weekly sales: ${formatMoney(summary.averages.weekly.amount, currency)}.`);

  if (summary.trend.weekOverWeek.changePct !== null) {
    const dir = summary.trend.weekOverWeek.changePct >= 0 ? 'up' : 'down';
    lines.push(`Week over week is ${dir} ${Math.abs(summary.trend.weekOverWeek.changePct).toFixed(1)}%.`);
  } else {
    lines.push('Week over week needs at least one previous week with sales.');
  }

  if (summary.trend.monthOverMonth.changePct !== null) {
    const dir = summary.trend.monthOverMonth.changePct >= 0 ? 'up' : 'down';
    lines.push(`Month over month is ${dir} ${Math.abs(summary.trend.monthOverMonth.changePct).toFixed(1)}%.`);
  } else {
    lines.push('Month over month needs previous month data.');
  }

  if (summary.reasons.top) {
    lines.push(`Top no-sale reason overall: ${summary.reasons.top.reason.replace(/_/g, ' ')} (${summary.reasons.top.count}).`);
  }

  if (summary.loyalty.topCustomer) lines.push(`Top customer in this range: ${summary.loyalty.topCustomer}.`);
  return lines;
}

export function buildFilteredSalesCsv(state, rangeInput = {}) {
  const range = resolveReportRange(state, rangeInput);
  const rows = [
    ['id', 'date', 'amount', 'payment', 'qty', 'customerId', 'productId', 'walletUsed', 'cashPaid', 'notes']
  ];
  getSalesEntries(state)
    .filter((entry) => inRange(entry.date, range.from, range.to))
    .forEach((entry) => {
      rows.push([
        entry.id,
        entry.date,
        entry.amount,
        entry.payment,
        entry.qty,
        entry.customerId,
        entry.productId,
        entry.walletUsed,
        entry.cashPaid,
        entry.notes
      ]);
    });
  return toCsv(rows);
}

export function buildNoSaleCsv(state, rangeInput = {}) {
  const range = resolveReportRange(state, rangeInput);
  const rows = [['id', 'date', 'reason', 'notes']];
  getNoSaleEntries(state)
    .filter((entry) => inRange(entry.date, range.from, range.to))
    .forEach((entry) => {
      rows.push([
        entry.id,
        entry.date,
        entry.reasonKey === 'other' ? entry.reasonText : entry.reasonKey,
        entry.notes
      ]);
    });
  return toCsv(rows);
}

export function buildSummaryCsv(summary, currency = 'ZAR') {
  const reasonText = summary.reasons.distribution
    .map(([reason, count]) => `${String(reason).replace(/_/g, ' ')} (${count})`)
    .join('; ');
  const rows = [
    ['period_from', summary.range.from],
    ['period_to', summary.range.to],
    ['sales_total', formatMoney(summary.totals.salesTotal, currency)],
    ['sale_entries', summary.totals.saleEntries],
    ['no_sale_entries', summary.totals.noSaleEntries],
    ['selling_days', summary.totals.saleDays],
    ['tracked_days', summary.totals.operatingDaysTracked],
    ['avg_daily_sales', formatMoney(summary.averages.daily.amount, currency)],
    ['avg_weekly_sales', formatMoney(summary.averages.weekly.amount, currency)],
    ['week_over_week_pct', summary.trend.weekOverWeek.changePct === null ? 'n/a' : summary.trend.weekOverWeek.changePct.toFixed(2)],
    ['month_over_month_pct', summary.trend.monthOverMonth.changePct === null ? 'n/a' : summary.trend.monthOverMonth.changePct.toFixed(2)],
    ['top_reason', summary.reasons.top ? summary.reasons.top.reason : 'none'],
    ['reasons', reasonText || 'none'],
    ['loyalty_customers', summary.loyalty.customerCount],
    ['wallet_count', summary.loyalty.walletCount],
    ['top_customer_in_period', summary.loyalty.topCustomer || 'n/a']
  ];
  return toCsv(rows);
}
