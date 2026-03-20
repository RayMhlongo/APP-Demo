const EXPORT_ROOT = 'CathdelCreamy/Exports';

function getCapacitor() {
  return window.Capacitor || null;
}

function getPlugin(name) {
  const cap = getCapacitor();
  return cap && cap.Plugins ? cap.Plugins[name] : null;
}

function isNativeRuntime() {
  const cap = getCapacitor();
  return Boolean(cap && typeof cap.isNativePlatform === 'function' && cap.isNativePlatform());
}

function sanitizeFileName(name, fallback = 'export.txt') {
  const clean = String(name || '').replace(/[\\/:*?"<>|]+/g, '-').trim();
  return clean || fallback;
}

function triggerAnchorDownload(blob, filename) {
  const url = URL.createObjectURL(blob);
  try {
    const link = document.createElement('a');
    link.href = url;
    link.download = filename;
    link.rel = 'noopener';
    document.body.appendChild(link);
    link.click();
    link.remove();
    return { ok: true, method: 'download_triggered', message: 'File download started.' };
  } catch (error) {
    console.error('[file-actions] browser download failed', error);
    return { ok: false, code: 'download_failed', message: 'Unable to start file download in this environment.' };
  } finally {
    setTimeout(() => URL.revokeObjectURL(url), 2000);
  }
}

async function shareNativeUri({ uri, title, text }) {
  const Share = getPlugin('Share');
  if (!Share || typeof Share.share !== 'function') {
    return { ok: false, code: 'share_unavailable', message: 'Native share plugin is unavailable.' };
  }
  try {
    await Share.share({
      title: title || 'Cathdel Creamy',
      text: text || '',
      url: uri,
      dialogTitle: 'Share / Open File'
    });
    return { ok: true };
  } catch (error) {
    const raw = String(error?.message || error || '').toLowerCase();
    if (raw.includes('cancel')) {
      return { ok: false, code: 'share_cancelled', message: 'Share sheet was closed before sharing.' };
    }
    console.error('[file-actions] native share failed', error);
    return { ok: false, code: 'share_failed', message: 'Unable to open Android share options.' };
  }
}

async function writeNativeTextFile({ filename, content }) {
  const Filesystem = getPlugin('Filesystem');
  if (!Filesystem || typeof Filesystem.writeFile !== 'function' || typeof Filesystem.getUri !== 'function') {
    return { ok: false, code: 'filesystem_unavailable', message: 'Native filesystem plugin is unavailable.' };
  }

  const fileName = sanitizeFileName(filename, `export-${new Date().toISOString().slice(0, 10)}.txt`);
  const path = `${EXPORT_ROOT}/${fileName}`;

  try {
    if (typeof Filesystem.mkdir === 'function') {
      await Filesystem.mkdir({ path: EXPORT_ROOT, directory: 'DOCUMENTS', recursive: true }).catch(() => {});
    }

    await Filesystem.writeFile({
      path,
      data: String(content ?? ''),
      directory: 'DOCUMENTS',
      encoding: 'utf8',
      recursive: true
    });

    const uriResult = await Filesystem.getUri({ path, directory: 'DOCUMENTS' });
    console.info('[file-actions] native file written', { path, uri: uriResult.uri });
    return { ok: true, fileName, path, uri: uriResult.uri };
  } catch (error) {
    console.error('[file-actions] native file write failed', error);
    return { ok: false, code: 'write_failed', message: `Could not create file ${fileName}.` };
  }
}

function arrayBufferToBase64(buffer) {
  const bytes = new Uint8Array(buffer);
  let binary = '';
  const chunkSize = 8192;
  for (let i = 0; i < bytes.length; i += chunkSize) {
    const chunk = bytes.subarray(i, i + chunkSize);
    binary += String.fromCharCode(...chunk);
  }
  return btoa(binary);
}

async function writeNativePdfFile({ filename, pdfArrayBuffer }) {
  const Filesystem = getPlugin('Filesystem');
  if (!Filesystem || typeof Filesystem.writeFile !== 'function' || typeof Filesystem.getUri !== 'function') {
    return { ok: false, code: 'filesystem_unavailable', message: 'Native filesystem plugin is unavailable.' };
  }

  const fileName = sanitizeFileName(filename, `summary-${new Date().toISOString().slice(0, 10)}.pdf`);
  const path = `${EXPORT_ROOT}/${fileName}`;

  try {
    if (typeof Filesystem.mkdir === 'function') {
      await Filesystem.mkdir({ path: EXPORT_ROOT, directory: 'DOCUMENTS', recursive: true }).catch(() => {});
    }

    await Filesystem.writeFile({
      path,
      data: arrayBufferToBase64(pdfArrayBuffer),
      directory: 'DOCUMENTS',
      recursive: true
    });

    const uriResult = await Filesystem.getUri({ path, directory: 'DOCUMENTS' });
    console.info('[file-actions] native pdf written', { path, uri: uriResult.uri });
    return { ok: true, fileName, path, uri: uriResult.uri };
  } catch (error) {
    console.error('[file-actions] native pdf write failed', error);
    return { ok: false, code: 'pdf_write_failed', message: `Could not create PDF ${fileName}.` };
  }
}

export async function exportTextFile({
  filename,
  content,
  mime = 'text/plain;charset=utf-8',
  title = 'Export File'
}) {
  const safeName = sanitizeFileName(filename, `export-${new Date().toISOString().slice(0, 10)}.txt`);

  if (isNativeRuntime()) {
    const saved = await writeNativeTextFile({ filename: safeName, content });
    if (!saved.ok) return saved;

    const shared = await shareNativeUri({
      uri: saved.uri,
      title,
      text: `${safeName}\nSaved in Documents/${EXPORT_ROOT}`
    });

    const message = shared.ok
      ? `${safeName} saved to Documents/${EXPORT_ROOT} and share options opened.`
      : `${safeName} saved to Documents/${EXPORT_ROOT}.`;

    return {
      ok: true,
      method: 'native_filesystem',
      fileName: safeName,
      path: saved.path,
      uri: saved.uri,
      shared: shared.ok,
      message
    };
  }

  const blob = new Blob([String(content ?? '')], { type: mime });
  return triggerAnchorDownload(blob, safeName);
}

function getPdfConstructor() {
  const ctor = window.jspdf && window.jspdf.jsPDF ? window.jspdf.jsPDF : null;
  return ctor || null;
}

function buildSummaryPdf({ title, lines }) {
  const JsPdf = getPdfConstructor();
  if (!JsPdf) return { ok: false, code: 'pdf_engine_missing', message: 'PDF engine is not loaded.' };

  const doc = new JsPdf({ unit: 'pt', format: 'a4' });
  const margin = 40;
  const maxWidth = 515;
  let y = 48;

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(16);
  doc.text(String(title || 'Cathdel Creamy Summary'), margin, y);
  y += 24;

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(11);

  (Array.isArray(lines) ? lines : []).forEach((line) => {
    const wrapped = doc.splitTextToSize(String(line || ''), maxWidth);
    doc.text(wrapped, margin, y);
    y += (wrapped.length * 15) + 4;
    if (y > 780) {
      doc.addPage();
      y = 48;
    }
  });

  return { ok: true, buffer: doc.output('arraybuffer') };
}

export async function printSummaryFile({ filename, title, lines }) {
  if (!isNativeRuntime()) {
    if (typeof window.print !== 'function') {
      return { ok: false, code: 'print_unavailable', message: 'Print is not available in this browser.' };
    }
    window.print();
    return { ok: true, method: 'web_print', message: 'Print dialog opened.' };
  }

  const built = buildSummaryPdf({ title, lines });
  if (!built.ok) return built;

  const pdfName = sanitizeFileName(filename, `cathdel-creamy-summary-${new Date().toISOString().slice(0, 10)}.pdf`);
  const saved = await writeNativePdfFile({ filename: pdfName, pdfArrayBuffer: built.buffer });
  if (!saved.ok) return saved;

  const shared = await shareNativeUri({
    uri: saved.uri,
    title: 'Print Summary',
    text: 'Select Print from Android share options.'
  });

  const message = shared.ok
    ? `${pdfName} saved to Documents/${EXPORT_ROOT}. Share options opened (select Print).`
    : `${pdfName} saved to Documents/${EXPORT_ROOT}. Open it from your Files app to print.`;

  return {
    ok: true,
    method: 'native_pdf_share',
    fileName: pdfName,
    path: saved.path,
    uri: saved.uri,
    shared: shared.ok,
    message
  };
}

export function printSupportStatus() {
  if (!isNativeRuntime()) {
    if (typeof window.print !== 'function') {
      return { supported: false, code: 'print_unavailable', message: 'Print is not available in this browser.' };
    }
    return { supported: true, code: 'ok', message: 'Print available in browser.' };
  }

  const Filesystem = getPlugin('Filesystem');
  const Share = getPlugin('Share');
  const JsPdf = getPdfConstructor();

  if (!Filesystem || !Share || !JsPdf) {
    return {
      supported: false,
      code: 'native_print_unavailable',
      message: 'Native print requires Filesystem, Share, and PDF engine support.'
    };
  }

  return { supported: true, code: 'ok', message: 'Native print via PDF/share is available.' };
}

export function nativeCapabilitySnapshot() {
  return {
    native: isNativeRuntime(),
    filesystem: Boolean(getPlugin('Filesystem')),
    share: Boolean(getPlugin('Share')),
    browser: Boolean(getPlugin('Browser')),
    app: Boolean(getPlugin('App')),
    pdf: Boolean(getPdfConstructor())
  };
}
