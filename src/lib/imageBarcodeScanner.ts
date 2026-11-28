import { Html5Qrcode, Html5QrcodeSupportedFormats } from 'html5-qrcode';
import { getLoanRefCode } from './loanBarcode';
import type { Loan } from '../types';

export const BARCODE_SUPPORTED_FORMATS = [
  Html5QrcodeSupportedFormats.QR_CODE,
  Html5QrcodeSupportedFormats.CODE_128,
  Html5QrcodeSupportedFormats.CODE_39,
  Html5QrcodeSupportedFormats.CODE_93,
  Html5QrcodeSupportedFormats.EAN_13,
  Html5QrcodeSupportedFormats.EAN_8,
  Html5QrcodeSupportedFormats.UPC_A,
  Html5QrcodeSupportedFormats.UPC_E,
  Html5QrcodeSupportedFormats.CODABAR,
  Html5QrcodeSupportedFormats.ITF,
];

interface BarcodeDetectorLike {
  detect: (
    image: ImageBitmap | HTMLCanvasElement | HTMLImageElement
  ) => Promise<Array<{ rawValue?: string }>>;
}

interface BarcodeDetectorConstructorLike {
  new (options?: { formats?: string[] }): BarcodeDetectorLike;
  getSupportedFormats?: () => Promise<string[]>;
}

async function detectWithNativeApi(
  source: ImageBitmap | HTMLCanvasElement | HTMLImageElement
): Promise<string | null> {
  const Ctor = (
    window as unknown as { BarcodeDetector?: BarcodeDetectorConstructorLike }
  ).BarcodeDetector;
  if (!Ctor) return null;

  try {
    let formats = ['qr_code', 'code_128', 'code_39', 'code_93', 'ean_13', 'ean_8'];
    if (typeof Ctor.getSupportedFormats === 'function') {
      const supported = await Ctor.getSupportedFormats();
      const filtered = formats.filter((f) => supported.includes(f));
      formats = filtered.length > 0 ? filtered : supported;
    }
    const detector = formats.length > 0 ? new Ctor({ formats }) : new Ctor();
    const results = await detector.detect(source);
    for (const item of results) {
      if (typeof item.rawValue === 'string' && item.rawValue.trim()) {
        return item.rawValue.trim();
      }
    }
  } catch {
    // Fallback to Html5Qrcode below
  }
  return null;
}

async function loadImageSource(file: File): Promise<{
  width: number;
  height: number;
  draw: (
    ctx: CanvasRenderingContext2D,
    sx: number,
    sy: number,
    sw: number,
    sh: number,
    dx: number,
    dy: number,
    dw: number,
    dh: number
  ) => void;
  nativeSource: ImageBitmap | HTMLImageElement;
  cleanup: () => void;
}> {
  if (typeof createImageBitmap === 'function') {
    try {
      const bitmap = await createImageBitmap(file);
      return {
        width: bitmap.width,
        height: bitmap.height,
        draw: (ctx, sx, sy, sw, sh, dx, dy, dw, dh) => {
          ctx.drawImage(bitmap, sx, sy, sw, sh, dx, dy, dw, dh);
        },
        nativeSource: bitmap,
        cleanup: () => {
          try {
            bitmap.close();
          } catch {
            // Ignore
          }
        },
      };
    } catch {
      // Fallback to HTMLImageElement
    }
  }

  const url = URL.createObjectURL(file);
  try {
    const img = await new Promise<HTMLImageElement>((resolve, reject) => {
      const el = new Image();
      el.onload = () => resolve(el);
      el.onerror = () => reject(new Error('Gagal memuat gambar.'));
      el.src = url;
    });
    return {
      width: img.naturalWidth || img.width,
      height: img.naturalHeight || img.height,
      draw: (ctx, sx, sy, sw, sh, dx, dy, dw, dh) => {
        ctx.drawImage(img, sx, sy, sw, sh, dx, dy, dw, dh);
      },
      nativeSource: img,
      cleanup: () => URL.revokeObjectURL(url),
    };
  } catch (err) {
    URL.revokeObjectURL(url);
    throw err;
  }
}

async function canvasToPngFile(canvas: HTMLCanvasElement, name: string): Promise<File | null> {
  const blob = await new Promise<Blob | null>((resolve) =>
    canvas.toBlob((b) => resolve(b), 'image/png')
  );
  if (!blob) return null;
  return new File([blob], name, { type: 'image/png' });
}

function applyHighContrastThreshold(canvas: HTMLCanvasElement) {
  const ctx = canvas.getContext('2d');
  if (!ctx) return;
  const imgData = ctx.getImageData(0, 0, canvas.width, canvas.height);
  const d = imgData.data;
  let sum = 0;
  let count = 0;
  for (let i = 0; i < d.length; i += 16) {
    sum += 0.299 * d[i] + 0.587 * d[i + 1] + 0.114 * d[i + 2];
    count += 1;
  }
  const avg = count > 0 ? sum / count : 128;
  const threshold = Math.max(85, Math.min(185, avg * 0.92));

  for (let i = 0; i < d.length; i += 4) {
    const lum = 0.299 * d[i] + 0.587 * d[i + 1] + 0.114 * d[i + 2];
    const v = lum < threshold ? 0 : 255;
    d[i] = v;
    d[i + 1] = v;
    d[i + 2] = v;
    d[i + 3] = 255;
  }
  ctx.putImageData(imgData, 0, 0);
}

async function scanCanvasWithEngines(
  canvas: HTMLCanvasElement,
  fileScanner: Html5Qrcode,
  name: string
): Promise<string | null> {
  const nativeDecoded = await detectWithNativeApi(canvas);
  if (nativeDecoded) return nativeDecoded;

  const pngFile = await canvasToPngFile(canvas, name);
  if (!pngFile) return null;
  try {
    const decoded = await fileScanner.scanFile(pngFile, false);
    if (decoded && decoded.trim()) return decoded.trim();
  } catch {
    // Continue to next candidate variant
  }
  return null;
}

export async function scanBarcodeFromImageFile(
  file: File,
  containerId: string
): Promise<string> {
  const fileScanner = new Html5Qrcode(containerId, {
    formatsToSupport: BARCODE_SUPPORTED_FORMATS,
    verbose: false,
  });

  let loaded: Awaited<ReturnType<typeof loadImageSource>> | null = null;

  try {
    // Pass 1: Direct raw file scan via Html5Qrcode
    try {
      const direct = await fileScanner.scanFile(file, false);
      if (direct && direct.trim()) return direct.trim();
    } catch {
      // Proceed to native & preprocessed passes
    }

    loaded = await loadImageSource(file);

    // Pass 2: Native BarcodeDetector on full loaded image
    const nativeFull = await detectWithNativeApi(loaded.nativeSource);
    if (nativeFull) return nativeFull;

    const { width, height, draw } = loaded;
    if (width <= 0 || height <= 0) {
      throw new Error('Dimensi gambar tidak valid.');
    }

    const renderVariant = (opts: {
      sx: number;
      sy: number;
      sw: number;
      sh: number;
      maxDim: number;
      padding: number;
      contrast?: boolean;
      rotate90?: boolean;
    }): HTMLCanvasElement => {
      const scale = Math.min(1.5, opts.maxDim / Math.max(opts.sw, opts.sh));
      const dw = Math.max(1, Math.round(opts.sw * scale));
      const dh = Math.max(1, Math.round(opts.sh * scale));
      const pad = opts.padding;

      const canvas = document.createElement('canvas');
      if (opts.rotate90) {
        canvas.width = dh + pad * 2;
        canvas.height = dw + pad * 2;
      } else {
        canvas.width = dw + pad * 2;
        canvas.height = dh + pad * 2;
      }

      const ctx = canvas.getContext('2d');
      if (ctx) {
        ctx.fillStyle = '#ffffff';
        ctx.fillRect(0, 0, canvas.width, canvas.height);
        ctx.imageSmoothingEnabled = true;
        ctx.imageSmoothingQuality = 'high';
        if (opts.rotate90) {
          ctx.translate(canvas.width / 2, canvas.height / 2);
          ctx.rotate(Math.PI / 2);
          draw(ctx, opts.sx, opts.sy, opts.sw, opts.sh, -dw / 2, -dh / 2, dw, dh);
          ctx.setTransform(1, 0, 0, 1, 0, 0);
        } else {
          draw(ctx, opts.sx, opts.sy, opts.sw, opts.sh, pad, pad, dw, dh);
        }
        if (opts.contrast) {
          applyHighContrastThreshold(canvas);
        }
      }
      return canvas;
    };

    const variants: Array<{ label: string; canvas: () => HTMLCanvasElement }> = [
      // Normalized full image with quiet-zone border
      {
        label: 'norm-1280.png',
        canvas: () =>
          renderVariant({ sx: 0, sy: 0, sw: width, sh: height, maxDim: 1280, padding: 36 }),
      },
      // High-contrast binarized full image (screen photos / glare / shadow)
      {
        label: 'contrast-1280.png',
        canvas: () =>
          renderVariant({
            sx: 0,
            sy: 0,
            sw: width,
            sh: height,
            maxDim: 1280,
            padding: 36,
            contrast: true,
          }),
      },
      // Top 60% crop (isolates QR code on SIPALAK barcode card/screenshot)
      {
        label: 'top-crop.png',
        canvas: () =>
          renderVariant({
            sx: 0,
            sy: 0,
            sw: width,
            sh: Math.max(1, Math.round(height * 0.62)),
            maxDim: 1000,
            padding: 36,
          }),
      },
      // Bottom 60% crop (isolates Code 128 barcode on SIPALAK card/screenshot)
      {
        label: 'bottom-crop.png',
        canvas: () => {
          const sy = Math.round(height * 0.38);
          return renderVariant({
            sx: 0,
            sy,
            sw: width,
            sh: Math.max(1, height - sy),
            maxDim: 1000,
            padding: 36,
          });
        },
      },
      // Center 65% crop (phone photo with surrounding room/desk)
      {
        label: 'center-crop.png',
        canvas: () => {
          const sx = Math.round(width * 0.175);
          const sy = Math.round(height * 0.175);
          return renderVariant({
            sx,
            sy,
            sw: Math.max(1, Math.round(width * 0.65)),
            sh: Math.max(1, Math.round(height * 0.65)),
            maxDim: 1000,
            padding: 36,
          });
        },
      },
      // High-contrast top & center crops
      {
        label: 'top-contrast.png',
        canvas: () =>
          renderVariant({
            sx: 0,
            sy: 0,
            sw: width,
            sh: Math.max(1, Math.round(height * 0.62)),
            maxDim: 900,
            padding: 36,
            contrast: true,
          }),
      },
      // Rotated 90deg pass for sideways photos
      {
        label: 'rotated-90.png',
        canvas: () =>
          renderVariant({
            sx: 0,
            sy: 0,
            sw: width,
            sh: height,
            maxDim: 1000,
            padding: 36,
            rotate90: true,
          }),
      },
    ];

    for (const v of variants) {
      const c = v.canvas();
      const decoded = await scanCanvasWithEngines(c, fileScanner, v.label);
      if (decoded) return decoded;
    }

    throw new Error(
      'Barcode / QR tidak terdeteksi pada gambar tersebut. Pastikan gambar jelas, tidak terpotong, dan tidak buram.'
    );
  } finally {
    loaded?.cleanup();
    try {
      fileScanner.clear();
    } catch {
      // Ignore clear errors
    }
  }
}

async function svgElementToImage(svgEl: SVGSVGElement): Promise<{
  img: HTMLImageElement;
  cleanup: () => void;
}> {
  const clone = svgEl.cloneNode(true) as SVGSVGElement;
  if (!clone.getAttribute('xmlns')) {
    clone.setAttribute('xmlns', 'http://www.w3.org/2000/svg');
  }
  const rect = svgEl.getBoundingClientRect();
  if (!clone.getAttribute('width') && rect.width > 0) {
    clone.setAttribute('width', String(Math.round(rect.width)));
  }
  if (!clone.getAttribute('height') && rect.height > 0) {
    clone.setAttribute('height', String(Math.round(rect.height)));
  }
  const serialized = new XMLSerializer().serializeToString(clone);
  const blob = new Blob([serialized], { type: 'image/svg+xml;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const img = await new Promise<HTMLImageElement>((resolve, reject) => {
    const el = new Image();
    el.onload = () => resolve(el);
    el.onerror = () => reject(new Error('Gagal merender SVG barcode.'));
    el.src = url;
  });
  return { img, cleanup: () => URL.revokeObjectURL(url) };
}

export async function downloadLoanBarcodePng(
  containerEl: HTMLElement | null,
  loan: Loan,
  headerLabel: string
): Promise<void> {
  if (!containerEl) {
    throw new Error('Elemen barcode belum siap.');
  }
  const svgs = Array.from(containerEl.querySelectorAll('svg'));
  if (svgs.length === 0) {
    throw new Error('Gambar barcode tidak ditemukan.');
  }

  const loadedSvgs = await Promise.all(svgs.map((svg) => svgElementToImage(svg)));
  try {
    const qrImg = loadedSvgs[0]?.img;
    const barImg = loadedSvgs[1]?.img;

    const width = 720;
    const height = barImg ? 780 : 620;
    const canvas = document.createElement('canvas');
    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext('2d');
    if (!ctx) throw new Error('Kanvas tidak tersedia.');

    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, width, height);

    // Subtle border
    ctx.strokeStyle = '#cbd5e1';
    ctx.lineWidth = 4;
    ctx.strokeRect(16, 16, width - 32, height - 32);

    ctx.textAlign = 'center';
    ctx.fillStyle = '#0f172a';
    ctx.font = 'bold 22px system-ui, -apple-system, sans-serif';
    ctx.fillText(headerLabel, width / 2, 66);

    const refCode = getLoanRefCode(loan.id);
    ctx.fillStyle = '#475569';
    ctx.font = 'bold 16px monospace';
    ctx.fillText(`BARCODE PEMINJAMAN ADMIN · REF: ${refCode}`, width / 2, 98);

    let yCursor = 128;
    if (qrImg) {
      const qrSize = 300;
      ctx.fillStyle = '#ffffff';
      ctx.fillRect((width - qrSize) / 2 - 16, yCursor - 8, qrSize + 32, qrSize + 16);
      ctx.drawImage(qrImg, (width - qrSize) / 2, yCursor, qrSize, qrSize);
      yCursor += qrSize + 28;
    }

    if (barImg) {
      const maxBarW = width - 120;
      const ratio = barImg.width > 0 ? Math.min(2.2, maxBarW / barImg.width) : 1;
      const barW = Math.round((barImg.width || 360) * ratio);
      const barH = Math.round((barImg.height || 90) * ratio);
      ctx.drawImage(barImg, (width - barW) / 2, yCursor, barW, barH);
      yCursor += barH + 28;
    }

    ctx.fillStyle = '#0f172a';
    ctx.font = 'bold 18px system-ui, -apple-system, sans-serif';
    ctx.fillText(`[${loan.assetCode}] ${loan.assetName}`.slice(0, 52), width / 2, yCursor);
    yCursor += 28;

    ctx.fillStyle = '#334155';
    ctx.font = '15px system-ui, -apple-system, sans-serif';
    ctx.fillText(`Peminjam: ${loan.borrowerName} (${loan.unit})`.slice(0, 58), width / 2, yCursor);
    yCursor += 24;

    ctx.fillStyle = '#64748b';
    ctx.font = '14px monospace';
    ctx.fillText(`Pinjam ${loan.borrowDate} -> Kembali ${loan.returnDate}`, width / 2, yCursor);

    const blob = await new Promise<Blob | null>((resolve) =>
      canvas.toBlob((b) => resolve(b), 'image/png')
    );
    if (!blob) throw new Error('Gagal membuat file gambar PNG.');

    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `barcode-peminjaman-${refCode}.png`;
    document.body.appendChild(link);
    link.click();
    link.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  } finally {
    loadedSvgs.forEach((item) => item.cleanup());
  }
}
