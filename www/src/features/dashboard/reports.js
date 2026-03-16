import {
  buildFilteredSalesCsv,
  buildNoSaleCsv,
  buildReportNarrative,
  buildReportSummary,
  buildSummaryCsv,
  resolveReportRange
} from '../../services/reports.js';
import { validateReportRange } from '../../services/validation.js';
import { formatMoney } from '../../utils/format.js';

function downloadBlob(filename, text, mime = 'text/plain;charset=utf-8') {
  const blob = new Blob([text], { type: mime });
  const link = document.createElement('a');
  link.href = URL.createObjectURL(blob);
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(link.href);
}

export function initReportsFeature({ store, showToast, telemetry }) {
  const form = document.getElementById('reportForm');
  const fromInput = document.getElementById('reportFromDate');
  const toInput = document.getElementById('reportToDate');
  const summaryEl = document.getElementById('reportSummary');

  const exportSalesBtn = document.getElementById('reportExportSalesBtn');
  const exportNoSaleBtn = document.getElementById('reportExportNoSaleBtn');
  const exportSummaryBtn = document.getElementById('reportExportSummaryBtn');
  const printBtn = document.getElementById('reportPrintBtn');

  let lastSummary = null;

  function dateStamp() {
    return new Date().toISOString().slice(0, 10);
  }

  function getRange() {
    return {
      from: String(fromInput.value || '').trim(),
      to: String(toInput.value || '').trim()
    };
  }

  function ensureRangeDefaults(state) {
    const range = resolveReportRange(state, getRange());
    if (!fromInput.value) fromInput.value = range.from;
    if (!toInput.value) toInput.value = range.to;
    return range;
  }

  function renderSummary(summary, currency) {
    const lines = buildReportNarrative(summary, currency);
    const reasons = summary.reasons.distribution.length
      ? summary.reasons.distribution.map(([reason, count]) => `<li>${String(reason).replace(/_/g, ' ')}: ${count}</li>`).join('')
      : '<li>No no-sale reasons in selected range.</li>';

    summaryEl.innerHTML = `
      <h4>${summary.range.from} to ${summary.range.to}</h4>
      <div class="report-kpi-grid">
        <div><strong>${formatMoney(summary.totals.salesTotal, currency)}</strong><span>Total sales</span></div>
        <div><strong>${summary.totals.saleEntries}</strong><span>Sale entries</span></div>
        <div><strong>${summary.totals.noSaleEntries}</strong><span>No-sale logs</span></div>
        <div><strong>${summary.totals.saleDays}</strong><span>Selling days</span></div>
      </div>
      <ul class="report-lines">${lines.map((line) => `<li>${line}</li>`).join('')}</ul>
      <h5>Reason breakdown</h5>
      <ul class="report-lines">${reasons}</ul>
    `;
  }

  function generate() {
    const state = store.getState();
    const range = getRange();
    const validation = validateReportRange(range);
    if (!validation.ok) {
      showToast(validation.errors[0]);
      return;
    }

    const summary = buildReportSummary(state, range);
    lastSummary = summary;
    renderSummary(summary, state.settings.currency || 'ZAR');
    telemetry.track('report_generated', {
      from: summary.range.from,
      to: summary.range.to
    });
  }

  form.addEventListener('submit', (event) => {
    event.preventDefault();
    generate();
  });

  exportSalesBtn.addEventListener('click', () => {
    const state = store.getState();
    ensureRangeDefaults(state);
    const csv = buildFilteredSalesCsv(state, getRange());
    downloadBlob(`creamtrack-sales-${dateStamp()}.csv`, csv, 'text/csv;charset=utf-8');
    showToast('Filtered sales CSV exported.');
    telemetry.track('report_export_sales_csv');
  });

  exportNoSaleBtn.addEventListener('click', () => {
    const state = store.getState();
    ensureRangeDefaults(state);
    const csv = buildNoSaleCsv(state, getRange());
    downloadBlob(`creamtrack-nosale-${dateStamp()}.csv`, csv, 'text/csv;charset=utf-8');
    showToast('No-sale CSV exported.');
    telemetry.track('report_export_nosale_csv');
  });

  exportSummaryBtn.addEventListener('click', () => {
    const state = store.getState();
    ensureRangeDefaults(state);
    const summary = lastSummary || buildReportSummary(state, getRange());
    const csv = buildSummaryCsv(summary, state.settings.currency || 'ZAR');
    downloadBlob(`creamtrack-summary-${dateStamp()}.csv`, csv, 'text/csv;charset=utf-8');
    showToast('Summary CSV exported.');
    telemetry.track('report_export_summary_csv');
  });

  printBtn.addEventListener('click', () => {
    telemetry.track('report_print');
    window.print();
  });

  return {
    render(state) {
      ensureRangeDefaults(state);
      if (!lastSummary) {
        lastSummary = buildReportSummary(state, getRange());
      }
      renderSummary(lastSummary, state.settings.currency || 'ZAR');
    },
    regenerate: generate
  };
}
