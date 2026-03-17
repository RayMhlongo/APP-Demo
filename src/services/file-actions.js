function isNativeRuntime() {
  try {
    return Boolean(window.Capacitor && typeof window.Capacitor.isNativePlatform === 'function' && window.Capacitor.isNativePlatform());
  } catch {
    return false;
  }
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
    return { ok: true, method: 'download_triggered', message: 'File export has started. Check Downloads.' };
  } catch {
    return { ok: false, code: 'download_failed', message: 'Unable to start file download in this environment.' };
  } finally {
    setTimeout(() => URL.revokeObjectURL(url), 2000);
  }
}

async function tryShareFile(blob, filename, mime, title) {
  if (!(typeof navigator.share === 'function' && typeof File === 'function')) {
    return { ok: false, code: 'share_unavailable', message: 'File share is unavailable on this device.' };
  }
  const file = new File([blob], filename, { type: mime });
  if (typeof navigator.canShare === 'function' && !navigator.canShare({ files: [file] })) {
    return { ok: false, code: 'share_unsupported', message: 'File share is not supported for this file type.' };
  }
  try {
    await navigator.share({
      title: title || filename,
      text: filename,
      files: [file]
    });
    return { ok: true, method: 'shared', message: 'File shared successfully.' };
  } catch (error) {
    if (String(error?.name || '').toLowerCase() === 'aborterror') {
      return { ok: false, code: 'share_cancelled', message: 'Share cancelled. File was not exported.' };
    }
    return { ok: false, code: 'share_failed', message: 'Unable to open the share sheet for this file.' };
  }
}

export async function exportTextFile({
  filename,
  content,
  mime = 'text/plain;charset=utf-8',
  title = 'Export File'
}) {
  const safeName = String(filename || '').trim() || `export-${new Date().toISOString().slice(0, 10)}.txt`;
  const blob = new Blob([String(content ?? '')], { type: mime });

  if (isNativeRuntime()) {
    const shared = await tryShareFile(blob, safeName, mime, title);
    if (shared.ok) return shared;
    return {
      ok: false,
      code: shared.code || 'native_export_unsupported',
      message: `${shared.message} Use the PWA in Chrome if you need direct file download.`
    };
  }

  return triggerAnchorDownload(blob, safeName);
}

export function printSupportStatus() {
  if (isNativeRuntime()) {
    return {
      supported: false,
      code: 'unsupported_environment',
      message: 'Print is not supported in this APK WebView. Export Summary CSV and print from another app.'
    };
  }
  if (typeof window.print !== 'function') {
    return { supported: false, code: 'print_unavailable', message: 'Print is not available in this browser.' };
  }
  return { supported: true, code: 'ok', message: 'Print available.' };
}
