import {
  buildFilteredSalesCsv,
  buildNoSaleCsv,
  buildReportNarrative,
  buildReportSummary,
  buildSummaryCsv,
  resolveReportRange
} from '../../services/reports.js';
import { exportTextFile, printSummaryFile, printSupportStatus } from '../../services/file-actions.js';
import { validateReportRange } from '../../services/validation.js';
import { formatMoney } from '../../utils/format.js';

function toggleBusy(button, busy, label = 'Working...') {
  if (!button) return;
  if (!button.dataset.originalLabel) button.dataset.originalLabel = button.textContent;
  button.disabled = busy;
  button.textContent = busy ? label : button.dataset.originalLabel;
}

export function initReportsFeature({ store, showToast, telemetry, modal }) {
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

  async function runCsvExport({ button, filename, content, successEvent, failEvent, title, successMessage }) {
    toggleBusy(button, true, 'Preparing...');
    try {
      const result = await exportTextFile({
        filename,
        content,
        mime: 'text/csv;charset=utf-8',
        title
      });

      if (!result.ok) {
        telemetry.track(failEvent, { code: result.code || 'unknown' });
        await modal.alert('Export Not Completed', result.message || 'The export could not be completed on this device.');
        return;
      }

      telemetry.track(successEvent, { method: result.method || 'unknown' });
      showToast(result.message || successMessage);
    } finally {
      toggleBusy(button, false);
    }
  }

  form.addEventListener('submit', (event) => {
    event.preventDefault();
    generate();
  });

  exportSalesBtn.addEventListener('click', async () => {
    const state = store.getState();
    ensureRangeDefaults(state);
    const csv = buildFilteredSalesCsv(state, getRange());
    await runCsvExport({
      button: exportSalesBtn,
      filename: `cathdel-creamy-sales-${dateStamp()}.csv`,
      content: csv,
      successEvent: 'report_export_sales_csv',
      failEvent: 'report_export_sales_csv_failed',
      title: 'Sales CSV',
      successMessage: 'Sales CSV export has started.'
    });
  });

  exportNoSaleBtn.addEventListener('click', async () => {
    const state = store.getState();
    ensureRangeDefaults(state);
    const csv = buildNoSaleCsv(state, getRange());
    await runCsvExport({
      button: exportNoSaleBtn,
      filename: `cathdel-creamy-nosale-${dateStamp()}.csv`,
      content: csv,
      successEvent: 'report_export_nosale_csv',
      failEvent: 'report_export_nosale_csv_failed',
      title: 'No-Sale CSV',
      successMessage: 'No-sale CSV export has started.'
    });
  });

  exportSummaryBtn.addEventListener('click', async () => {
    const state = store.getState();
    ensureRangeDefaults(state);
    const summary = lastSummary || buildReportSummary(state, getRange());
    const csv = buildSummaryCsv(summary, state.settings.currency || 'ZAR');
    await runCsvExport({
      button: exportSummaryBtn,
      filename: `cathdel-creamy-summary-${dateStamp()}.csv`,
      content: csv,
      successEvent: 'report_export_summary_csv',
      failEvent: 'report_export_summary_csv_failed',
      title: 'Summary CSV',
      successMessage: 'Summary CSV export has started.'
    });
  });

  printBtn.addEventListener('click', async () => {
    const support = printSupportStatus();
    if (!support.supported) {
      telemetry.track('report_print_failed', { code: support.code });
      await modal.alert('Print Unavailable', support.message);
      return;
    }

    const state = store.getState();
    const summary = lastSummary || buildReportSummary(state, getRange());
    const lines = buildReportNarrative(summary, state.settings.currency || 'ZAR');
    const printResult = await printSummaryFile({
      filename: `cathdel-creamy-summary-${dateStamp()}.pdf`,
      title: `Cathdel Creamy Summary (${summary.range.from} to ${summary.range.to})`,
      lines
    });

    if (!printResult.ok) {
      telemetry.track('report_print_failed', { code: printResult.code || 'unknown' });
      await modal.alert('Print Failed', printResult.message || 'Unable to generate printable summary.');
      return;
    }

    telemetry.track('report_print_requested', { method: printResult.method || 'unknown' });
    showToast(printResult.message || 'Print flow started.');
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
