export function hasQrGenerator() {
  return Boolean(window.QRCode);
}

export function canScanQr() {
  return Boolean(window.Html5Qrcode && window.isSecureContext);
}

export function renderQrCode(container, value, options = {}) {
  if (!container) return { ok: false, message: 'Missing QR container.' };
  const code = String(value || '').trim();
  if (!code) return { ok: false, message: 'Missing QR value.' };
  if (!window.QRCode) return { ok: false, message: 'QR generator library unavailable.' };

  // eslint-disable-next-line no-new
  new window.QRCode(container, {
    text: code,
    width: Number(options.width || 180),
    height: Number(options.height || 180),
    colorDark: options.colorDark || '#0f766e',
    colorLight: options.colorLight || '#ffffff',
    correctLevel: window.QRCode.CorrectLevel.H
  });

  return { ok: true };
}

export function createScanner(elementId) {
  if (!window.Html5Qrcode) return null;
  const scanner = new window.Html5Qrcode(elementId);

  return {
    async start(onSuccess, onError) {
      await scanner.start(
        { facingMode: 'environment' },
        { fps: 10, qrbox: { width: 210, height: 210 } },
        onSuccess,
        onError || (() => {})
      );
    },
    async stop() {
      try {
        await scanner.stop();
      } catch {
        // Ignore scanner stop failures when not actively scanning.
      }
      try {
        await scanner.clear();
      } catch {
        // Clear may fail on some devices if scanner was never initialized.
      }
    }
  };
}
