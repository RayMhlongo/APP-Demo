import {
  averageDailySales,
  averageWeeklySales,
  buildInsights,
  getEntryStatusByDate,
  missedDayPatterns,
  monthOverMonth,
  mostCommonNoSaleReason,
  noSaleCount,
  reasonDistribution,
  recentActivity,
  sellingDaysThisMonth,
  totalSales,
  todaySales,
  weekOverWeek,
  weekSales
} from '../../services/analytics.js';
import { escapeHtml, formatMoney } from '../../utils/format.js';
import { formatLocalISO, getMonthGrid, monthLabel, todayISO } from '../../utils/date.js';

const WEEKDAYS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];

export function initDashboardFeature({ store, modal, navigateToSalesDate }) {
  const kpiGrid = document.getElementById('kpiGrid');
  const weeklyBars = document.getElementById('weeklyBars');
  const weeklySummary = document.getElementById('weeklySummary');
  const deltaGrid = document.getElementById('deltaGrid');
  const deltaSummary = document.getElementById('deltaSummary');
  const reasonBars = document.getElementById('reasonBars');
  const insightList = document.getElementById('insightList');
  const activityList = document.getElementById('activityList');
  const heatmap = document.getElementById('heatmapCalendar');
  const calendarLabel = document.getElementById('calendarLabel');

  const now = new Date();
  let calendarYear = now.getFullYear();
  let calendarMonth = now.getMonth();

  document.getElementById('calendarPrev').addEventListener('click', () => {
    calendarMonth -= 1;
    if (calendarMonth < 0) {
      calendarMonth = 11;
      calendarYear -= 1;
    }
    render(store.getState());
  });

  document.getElementById('calendarNext').addEventListener('click', () => {
    calendarMonth += 1;
    if (calendarMonth > 11) {
      calendarMonth = 0;
      calendarYear += 1;
    }
    render(store.getState());
  });

  heatmap.addEventListener('click', async (event) => {
    const cell = event.target.closest('[data-date]');
    if (!cell) return;
    const date = cell.dataset.date;
    if (!date) return;

    const state = store.getState();
    const map = getEntryStatusByDate(state);
    const current = map.get(date);

    if (!current) {
      const go = await modal.confirm('No Entry Yet', `No sale/no-sale log for ${date}. Log this date now?`);
      if (go) navigateToSalesDate(date);
      return;
    }

    if (current.kind === 'sold') {
      const go = await modal.confirm('Sales Recorded', `Sales exist on ${date}. Open sales screen for details/edit?`);
      if (go) navigateToSalesDate(date);
      return;
    }

    const entry = current.entry;
    await modal.alert(
      'No-Sale Day',
      `${date}\nReason: ${String(entry.reasonKey || '').replace(/_/g, ' ')}${entry.reasonText ? ` (${entry.reasonText})` : ''}\nNotes: ${entry.notes || 'None'}`
    );
  });

  function renderKpis(state) {
    const currency = state.settings.currency || 'ZAR';
    const today = todaySales(state);
    const week = weekSales(state);
    const total = totalSales(state);
    const misses = noSaleCount(state);
    const loyalty = state.customers.length;
    const common = mostCommonNoSaleReason(state);
    const daily = averageDailySales(state);
    const weekly = averageWeeklySales(state);
    const soldThisMonth = sellingDaysThisMonth(state);

    const cards = [
      { label: 'Today Sales', value: formatMoney(today.total, currency), sub: `${today.entries.length} transaction(s)` },
      { label: 'Week Sales', value: formatMoney(week.total, currency), sub: `${week.entries.length} transaction(s)` },
      { label: 'Total Sales', value: formatMoney(total, currency), sub: `${state.entries.filter((entry) => entry.type === 'sale').length} sales logs` },
      { label: 'Missed Days', value: String(misses), sub: common ? `Top reason: ${common.reason.replace(/_/g, ' ')}` : 'No reasons logged' },
      { label: 'Avg Daily Sales', value: formatMoney(daily.amount, currency), sub: `${daily.days || 0} selling day(s)` },
      { label: 'Avg Weekly Sales', value: formatMoney(weekly.amount, currency), sub: `${weekly.weeks || 0} week window` },
      { label: 'Selling Days', value: String(soldThisMonth), sub: 'Current month' },
      { label: 'Loyalty Customers', value: String(loyalty), sub: `${state.wallets.length} wallets` }
    ];

    kpiGrid.innerHTML = cards.map((card) => `
      <div class="kpi-card">
        <p class="kpi-label">${escapeHtml(card.label)}</p>
        <p class="kpi-value">${escapeHtml(card.value)}</p>
        <p class="kpi-sub">${escapeHtml(card.sub)}</p>
      </div>
    `).join('');
  }

  function renderWeeklyBars(state) {
    const today = new Date();
    const weekDates = [];
    const day = (today.getDay() + 6) % 7;
    const start = new Date(today);
    start.setDate(today.getDate() - day);
    for (let i = 0; i < 7; i += 1) {
      const date = new Date(start);
      date.setDate(start.getDate() + i);
      weekDates.push(formatLocalISO(date));
    }

    const totals = weekDates.map((date) => state.entries
      .filter((entry) => entry.type === 'sale' && entry.date === date)
      .reduce((acc, entry) => acc + Number(entry.amount || 0), 0));
    const max = Math.max(1, ...totals);

    weeklyBars.innerHTML = weekDates.map((date, index) => {
      const noSale = state.entries.find((entry) => entry.type === 'no_sale' && entry.date === date);
      const amount = totals[index];
      const height = Math.max(8, Math.round((amount / max) * 100));
      return `
        <div class="bar-col">
          <div class="bar ${noSale && amount <= 0 ? 'no-sale' : ''}" style="height:${height}px"></div>
          <div class="bar-label">${WEEKDAYS[index]}</div>
        </div>
      `;
    }).join('');

    const week = weekSales(state);
    weeklySummary.textContent = week.total > 0
      ? `This week: ${week.entries.length} sales, total ${formatMoney(week.total, state.settings.currency || 'ZAR')}.`
      : 'No sales recorded this week yet.';
  }

  function renderDeltaCards(state) {
    const currency = state.settings.currency || 'ZAR';
    const wow = weekOverWeek(state);
    const mom = monthOverMonth(state);

    function renderDeltaCard(title, current, previous, changePct) {
      const pctLabel = changePct === null ? 'n/a' : `${changePct >= 0 ? '+' : '-'}${Math.abs(changePct).toFixed(1)}%`;
      const trendClass = changePct === null ? 'flat' : (changePct >= 0 ? 'up' : 'down');
      return `
        <div class="delta-card ${trendClass}">
          <p class="delta-title">${escapeHtml(title)}</p>
          <p class="delta-value">${escapeHtml(formatMoney(current, currency))}</p>
          <p class="delta-meta">Prev: ${escapeHtml(formatMoney(previous, currency))}</p>
          <p class="delta-change">${escapeHtml(pctLabel)}</p>
        </div>
      `;
    }

    deltaGrid.innerHTML = [
      renderDeltaCard('Week-over-week', wow.current, wow.previous, wow.changePct),
      renderDeltaCard('Month-over-month', mom.current, mom.previous, mom.changePct)
    ].join('');

    if (wow.changePct === null && mom.changePct === null) {
      deltaSummary.textContent = 'Comparisons need enough historical data.';
      return;
    }

    const trendNotes = [];
    if (wow.changePct !== null) trendNotes.push(`Week-over-week is ${wow.changePct >= 0 ? 'up' : 'down'} ${Math.abs(wow.changePct).toFixed(1)}%.`);
    if (mom.changePct !== null) trendNotes.push(`Month-over-month is ${mom.changePct >= 0 ? 'up' : 'down'} ${Math.abs(mom.changePct).toFixed(1)}%.`);
    deltaSummary.textContent = trendNotes.join(' ');
  }

  function renderReasonBars(state) {
    const reasons = Object.entries(reasonDistribution(state)).sort((a, b) => b[1] - a[1]);
    const max = Math.max(1, ...(reasons.map(([, count]) => count)));

    if (!reasons.length) {
      reasonBars.innerHTML = '<div class="reason-empty">No no-sale reasons logged yet.</div>';
      return;
    }

    reasonBars.innerHTML = reasons.map(([reason, count]) => `
      <div class="reason-row">
        <span class="reason-label">${escapeHtml(reason.replace(/_/g, ' '))}</span>
        <div class="reason-track"><div class="reason-fill" style="width:${Math.max(6, Math.round((count / max) * 100))}%"></div></div>
        <strong class="reason-count">${count}</strong>
      </div>
    `).join('');
  }

  function renderHeatmap(state) {
    const map = getEntryStatusByDate(state);
    const today = todayISO();
    const cells = getMonthGrid(calendarYear, calendarMonth);
    calendarLabel.textContent = monthLabel(calendarYear, calendarMonth);

    heatmap.innerHTML = cells.map((iso) => {
      if (!iso) return '<div class="day empty"></div>';
      const status = map.get(iso);
      const kind = status ? (status.kind === 'sold' ? 'sold' : 'nosale') : 'empty';
      const todayClass = iso === today ? ' today' : '';
      const dayNum = Number(iso.slice(8, 10));
      return `<button type="button" class="day ${kind}${todayClass}" data-date="${escapeHtml(iso)}">${dayNum}</button>`;
    }).join('');
  }

  function renderInsights(state) {
    const insights = buildInsights(state);
    insightList.innerHTML = insights.length
      ? insights.map((insight) => `<li class="insight-item">${escapeHtml(insight)}</li>`).join('')
      : '<li class="insight-item">No insights yet. Add sales/no-sale logs first.</li>';
  }

  function renderActivity(state) {
    const logs = recentActivity(state, 8);
    activityList.innerHTML = logs.length
      ? logs.map((item) => `
        <li class="timeline-item">
          <strong>${escapeHtml(item.message || '')}</strong>
          <div class="customer-meta">${new Date(item.at).toLocaleString('en-ZA')}</div>
        </li>
      `).join('')
      : '<li class="timeline-item">No activity yet.</li>';
  }

  function render(state) {
    renderKpis(state);
    renderWeeklyBars(state);
    renderDeltaCards(state);
    renderReasonBars(state);
    renderHeatmap(state);
    renderInsights(state);
    renderActivity(state);
  }

  return { render };
}
