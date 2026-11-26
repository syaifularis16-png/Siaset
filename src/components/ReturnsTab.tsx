import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Html5Qrcode, Html5QrcodeSupportedFormats } from 'html5-qrcode';
import { QRCodeSVG } from 'qrcode.react';
import {
  AlertTriangle,
  Camera,
  CameraOff,
  Check,
  CheckCircle2,
  Copy,
  ImageUp,
  PackageCheck,
  QrCode,
  RefreshCw,
  ScanBarcode,
  Search,
  ShieldCheck,
  X,
} from 'lucide-react';
import { apiFetch } from '../lib/api';
import {
  buildLoanQrPayload,
  findMatchingLoanForScan,
  getLoanRefCode,
  isReturnableLoanStatus,
  parseScannedIdentifier,
} from '../lib/loanBarcode';
import { LoanBarcodeSvg } from './LoanBarcodeSvg';
import {
  currentHmTime,
  todayIsoDate,
  type Asset,
  type Loan,
  type UserProfile,
} from '../types';

interface ReturnsTabProps {
  loans: Loan[];
  assets: Asset[];
  profile: UserProfile;
  isAdmin: boolean;
  onRefresh: () => Promise<void>;
  onNotify: (msg: string, type?: 'success' | 'error') => void;
}

const SUPPORTED_FORMATS = [
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

export const ReturnsTab: React.FC<ReturnsTabProps> = ({
  loans,
  assets,
  profile,
  isAdmin,
  onRefresh,
  onNotify,
}) => {
  const today = todayIsoDate();
  const scannerRegionId = 'sipalak-barcode-reader';
  const fileRegionId = 'sipalak-barcode-file-reader';

  const scannerRef = useRef<Html5Qrcode | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const manualInputRef = useRef<HTMLInputElement | null>(null);

  const [cameraActive, setCameraActive] = useState(false);
  const [cameraStarting, setCameraStarting] = useState(false);
  const [cameraError, setCameraError] = useState<string | null>(null);
  const [cameras, setCameras] = useState<Array<{ id: string; label: string }>>([]);
  const [selectedCameraId, setSelectedCameraId] = useState<string>('');

  const [manualCode, setManualCode] = useState('');
  const [lastScannedRaw, setLastScannedRaw] = useState('');
  const [verifiedBarcodeCode, setVerifiedBarcodeCode] = useState('');
  const [scanError, setScanError] = useState<string | null>(null);
  const [matchedLoanId, setMatchedLoanId] = useState<string | null>(null);
  const [previewBarcodeLoanId, setPreviewBarcodeLoanId] = useState<string | null>(null);
  const [copiedCode, setCopiedCode] = useState(false);
  const [returnNotes, setReturnNotes] = useState('');
  const [submitting, setSubmitting] = useState(false);

  const canAccessLoan = useCallback(
    (l: Loan) => isAdmin || l.requesterId === profile.uid,
    [isAdmin, profile.uid]
  );

  // Active returnable loans (Disetujui or Dipinjam) for current user (or all for admin)
  const returnableLoans = useMemo(() => {
    return loans.filter((l) => isReturnableLoanStatus(l.status) && canAccessLoan(l));
  }, [loans, canAccessLoan]);

  const returnedLoans = useMemo(() => {
    return loans
      .filter((l) => l.status === 'Dikembalikan' && canAccessLoan(l))
      .slice(0, 8);
  }, [loans, canAccessLoan]);

  // Live-sync matchedLoan with incoming Firestore snapshot updates
  const matchedLoan = useMemo(() => {
    if (!matchedLoanId) return null;
    const live = loans.find((l) => l.id === matchedLoanId) ?? null;
    if (!live || !isReturnableLoanStatus(live.status) || !canAccessLoan(live)) return null;
    return live;
  }, [loans, matchedLoanId, canAccessLoan]);

  useEffect(() => {
    if (matchedLoanId && !matchedLoan) {
      setMatchedLoanId(null);
      setReturnNotes('');
    }
  }, [matchedLoanId, matchedLoan]);

  const previewBarcodeLoan = useMemo(() => {
    if (!previewBarcodeLoanId) return null;
    return loans.find((l) => l.id === previewBarcodeLoanId) ?? null;
  }, [loans, previewBarcodeLoanId]);

  const matchedAsset = useMemo(() => {
    if (!matchedLoan) return null;
    return assets.find((a) => a.id === matchedLoan.assetId) ?? null;
  }, [assets, matchedLoan]);

  const stopCamera = useCallback(async () => {
    const instance = scannerRef.current;
    scannerRef.current = null;
    setCameraActive(false);
    setCameraStarting(false);
    if (!instance) return;
    try {
      await instance.stop();
    } catch {
      // Ignore if scanner was not running
    }
    try {
      instance.clear();
    } catch {
      // Ignore clear errors
    }
  }, []);

  useEffect(() => {
    return () => {
      void stopCamera();
    };
  }, [stopCamera]);

  const processScannedCode = useCallback(
    (rawText: string) => {
      const parsed = parseScannedIdentifier(rawText);
      const { returnableLoan, otherStatusLoan, foundAsset, matchedAssetOnly, displayCode } =
        findMatchingLoanForScan(loans, assets, parsed, canAccessLoan, {
          allowAssetCodeMatch: isAdmin,
        });

      setLastScannedRaw(displayCode);
      setScanError(null);

      if (!displayCode) {
        setMatchedLoanId(null);
        setVerifiedBarcodeCode('');
        setScanError('Kode barcode / QR tidak terbaca.');
        return;
      }

      if (returnableLoan) {
        setMatchedLoanId(returnableLoan.id);
        setVerifiedBarcodeCode(displayCode);
        setReturnNotes('');
        setManualCode(isAdmin ? getLoanRefCode(returnableLoan.id) : '');
        setScanError(null);
        return;
      }

      setMatchedLoanId(null);
      setVerifiedBarcodeCode('');

      if (otherStatusLoan) {
        if (otherStatusLoan.status === 'Menunggu') {
          setScanError(
            `Peminjaman [${otherStatusLoan.assetCode}] ${otherStatusLoan.assetName} masih berstatus "Menunggu" persetujuan admin.`
          );
        } else if (otherStatusLoan.status === 'Dikembalikan') {
          setScanError(
            `Peminjaman [${otherStatusLoan.assetCode}] ${otherStatusLoan.assetName} sudah tercatat dikembalikan.`
          );
        } else {
          setScanError(
            `Pengajuan untuk [${otherStatusLoan.assetCode}] berstatus "${otherStatusLoan.status}" sehingga tidak dapat diproses pengembaliannya.`
          );
        }
        return;
      }

      if (matchedAssetOnly && foundAsset) {
        setScanError(
          `Kode aset [${foundAsset.code}] terdeteksi, namun pengembalian wajib memindai Barcode Peminjaman yang diberikan oleh Admin.`
        );
        return;
      }

      if (foundAsset) {
        setScanError(
          `Perangkat [${foundAsset.code}] ${foundAsset.name} tidak tercatat memiliki peminjaman aktif.`
        );
      } else {
        setScanError(
          isAdmin
            ? `Kode "${displayCode}" tidak cocok dengan barcode peminjaman maupun kode aset aktif.`
            : 'Barcode tidak valid atau tidak sesuai dengan Barcode Peminjaman dari Admin untuk akun Anda.'
        );
      }
    },
    [assets, canAccessLoan, isAdmin, loans]
  );

  const startCamera = async (overrideCameraId?: string) => {
    setCameraError(null);
    setCameraStarting(true);

    try {
      await stopCamera();

      let deviceList = cameras;
      try {
        deviceList = await Html5Qrcode.getCameras();
        setCameras(deviceList);
      } catch {
        deviceList = [];
      }

      const targetId = overrideCameraId || selectedCameraId;
      const rearCamera = deviceList.find((c) => /back|rear|environment/i.test(c.label));
      const cameraConfig: string | MediaTrackConstraints = targetId
        ? targetId
        : rearCamera
          ? rearCamera.id
          : deviceList[0]?.id || { facingMode: 'environment' };

      if (!targetId && typeof cameraConfig === 'string') {
        setSelectedCameraId(cameraConfig);
      }

      const instance = new Html5Qrcode(scannerRegionId, {
        formatsToSupport: SUPPORTED_FORMATS,
        verbose: false,
      });
      scannerRef.current = instance;

      await instance.start(
        cameraConfig,
        {
          fps: 10,
          qrbox: { width: 240, height: 160 },
          aspectRatio: 1.333,
        },
        (decodedText) => {
          processScannedCode(decodedText);
          void stopCamera();
          onNotify('Barcode peminjaman berhasil dipindai.');
        },
        () => {
          // Ignore per-frame decode misses
        }
      );

      setCameraActive(true);
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      if (/NotAllowedError|Permission/i.test(msg)) {
        setCameraError(
          'Izin kamera ditolak. Izinkan akses kamera di browser atau gunakan Scan dari Gambar / Input Manual.'
        );
      } else if (/NotFoundError|Requested device not found/i.test(msg)) {
        setCameraError(
          'Perangkat kamera tidak ditemukan. Gunakan scanner USB atau ketik kode peminjaman / kode aset secara manual.'
        );
      } else {
        setCameraError(
          'Kamera tidak dapat dibuka pada perangkat ini. Gunakan Scan dari Gambar atau ketik kode.'
        );
      }
      await stopCamera();
    } finally {
      setCameraStarting(false);
    }
  };

  const handleFileScan = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;

    setScanError(null);
    try {
      const fileScanner = new Html5Qrcode(fileRegionId, {
        formatsToSupport: SUPPORTED_FORMATS,
        verbose: false,
      });
      const decoded = await fileScanner.scanFile(file, false);
      fileScanner.clear();
      processScannedCode(decoded);
      onNotify('Barcode dari gambar berhasil dibaca.');
    } catch {
      setScanError(
        'Barcode / QR tidak terdeteksi pada gambar tersebut. Pastikan gambar jelas dan tidak buram.'
      );
    }
  };

  const handleManualSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    processScannedCode(manualCode);
  };

  const handleHandoverToBorrowed = async () => {
    if (!matchedLoan || !isAdmin) return;
    setSubmitting(true);
    try {
      await apiFetch(`/api/loans/${matchedLoan.id}`, {
        method: 'PUT',
        body: JSON.stringify({ status: 'Dipinjam' }),
      });
      onNotify(
        `Perangkat [${matchedLoan.assetCode}] diserahkan — status diperbarui menjadi Dipinjam.`
      );
      await onRefresh();
    } catch (err) {
      onNotify(err instanceof Error ? err.message : 'Gagal memperbarui status serah terima.', 'error');
    } finally {
      setSubmitting(false);
    }
  };

  const handleConfirmReturn = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!matchedLoan) return;

    setSubmitting(true);
    try {
      const timeStamp = currentHmTime();
      const extraNote = returnNotes.trim();
      const nextNotes = extraNote
        ? matchedLoan.notes
          ? `${matchedLoan.notes} | Kembali (${today} ${timeStamp}): ${extraNote}`.slice(0, 240)
          : `Dikembalikan (${today} ${timeStamp}): ${extraNote}`.slice(0, 240)
        : matchedLoan.notes
          ? `${matchedLoan.notes} | Kembali via scan (${today} ${timeStamp})`.slice(0, 240)
          : `Dikembalikan via scan barcode (${today} ${timeStamp})`;

      await apiFetch(`/api/loans/${matchedLoan.id}`, {
        method: 'PUT',
        body: JSON.stringify({
          status: 'Dikembalikan',
          returnDate: today,
          notes: nextNotes,
          scannedAdminBarcode: verifiedBarcodeCode || lastScannedRaw,
        }),
      });

      onNotify(
        `Pengembalian [${matchedLoan.assetCode}] ${matchedLoan.assetName} berhasil dicatat.`
      );
      setMatchedLoanId(null);
      setVerifiedBarcodeCode('');
      setManualCode('');
      setLastScannedRaw('');
      setReturnNotes('');
      setScanError(null);
      await onRefresh();
    } catch (err) {
      onNotify(err instanceof Error ? err.message : 'Gagal memproses pengembalian.', 'error');
    } finally {
      setSubmitting(false);
    }
  };

  const handleCopyLoanCode = async (code: string) => {
    try {
      await navigator.clipboard.writeText(code);
      setCopiedCode(true);
      onNotify('Kode barcode peminjaman disalin.');
      setTimeout(() => setCopiedCode(false), 2000);
    } catch {
      onNotify('Gagal menyalin kode.', 'error');
    }
  };

  return (
    <div className="space-y-5">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div>
          <h2 className="text-2xl font-bold tracking-tight text-slate-900">
            Pengembalian dengan Scan Barcode
          </h2>
          <p className="text-sm text-slate-500 mt-0.5">
            {isAdmin
              ? 'Pindai Barcode / QR Peminjaman maupun Barcode / QR Aset untuk memverifikasi dan menyelesaikan pengembalian.'
              : 'Saat mengembalikan barang, wajib memindai Barcode / QR Peminjaman yang ditunjukkan oleh Admin Lab.'}
          </p>
        </div>
        <div className="inline-flex items-center gap-2 px-3.5 py-2 rounded-xl bg-white border border-slate-200 text-xs font-medium text-slate-700 self-start sm:self-auto">
          <PackageCheck className="w-4 h-4 text-indigo-600" />
          Peminjaman Aktif:{' '}
          <span className="font-mono font-bold text-indigo-700">{returnableLoans.length}</span>
        </div>
      </div>

      {!isAdmin && (
        <div className="rounded-2xl bg-blue-50/90 border border-blue-200 px-4 py-3 text-xs text-blue-900 flex items-start gap-2.5">
          <ShieldCheck className="w-4 h-4 text-blue-600 shrink-0 mt-0.5" />
          <div>
            <span className="font-semibold">Wajib Scan Barcode dari Admin: </span>
            Pengembalian perangkat hanya dapat dikonfirmasi setelah Anda memindai Barcode / QR
            Peminjaman yang ditunjukkan oleh Admin Lab.
          </div>
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-5">
        {/* Left: Barcode Scanner & Confirmation */}
        <div className="lg:col-span-7 space-y-5">
          <div className="bg-white rounded-2xl border border-slate-200/90 p-5 space-y-4">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div className="flex items-center gap-2">
                <div className="w-9 h-9 rounded-xl bg-blue-50 text-blue-600 flex items-center justify-center">
                  <ScanBarcode className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="text-sm font-bold text-slate-900">
                    {isAdmin
                      ? 'Pemindai Barcode Peminjaman & Aset'
                      : 'Pemindai Barcode dari Admin'}
                  </h3>
                  <p className="text-xs text-slate-500">
                    {isAdmin
                      ? 'Mendukung Barcode Peminjaman (No. Ref / QR / Code 128) & Kode Aset'
                      : 'Arahkan kamera ke Barcode / QR Peminjaman yang ditunjukkan Admin'}
                  </p>
                </div>
              </div>

              <div className="flex flex-wrap items-center gap-2">
                {!cameraActive ? (
                  <button
                    type="button"
                    disabled={cameraStarting}
                    onClick={() => void startCamera()}
                    className="px-3.5 py-2 rounded-xl bg-[#2563eb] hover:bg-[#1d4ed8] disabled:opacity-60 text-white text-xs font-semibold inline-flex items-center gap-1.5 cursor-pointer"
                  >
                    <Camera className="w-4 h-4" />
                    {cameraStarting ? 'Membuka Kamera...' : 'Aktifkan Kamera'}
                  </button>
                ) : (
                  <button
                    type="button"
                    onClick={() => void stopCamera()}
                    className="px-3.5 py-2 rounded-xl bg-rose-600 hover:bg-rose-700 text-white text-xs font-semibold inline-flex items-center gap-1.5 cursor-pointer"
                  >
                    <CameraOff className="w-4 h-4" />
                    Hentikan Kamera
                  </button>
                )}

                <button
                  type="button"
                  onClick={() => fileInputRef.current?.click()}
                  className="px-3 py-2 rounded-xl border border-slate-200 bg-white hover:bg-slate-50 text-slate-700 text-xs font-semibold inline-flex items-center gap-1.5 cursor-pointer"
                >
                  <ImageUp className="w-4 h-4 text-slate-500" />
                  Scan dari Gambar
                </button>
                <input
                  ref={fileInputRef}
                  type="file"
                  accept="image/*"
                  onChange={handleFileScan}
                  className="hidden"
                />
              </div>
            </div>

            {cameras.length > 1 && (
              <div className="flex items-center gap-2 text-xs">
                <label className="text-slate-500 font-medium shrink-0">Pilih Kamera:</label>
                <select
                  value={selectedCameraId}
                  onChange={(e) => {
                    const nextId = e.target.value;
                    setSelectedCameraId(nextId);
                    if (cameraActive) {
                      void startCamera(nextId);
                    }
                  }}
                  className="px-2.5 py-1.5 rounded-lg border border-slate-200 bg-white text-slate-700 text-xs max-w-xs"
                >
                  {cameras.map((cam, idx) => (
                    <option key={cam.id} value={cam.id}>
                      {cam.label || `Kamera ${idx + 1}`}
                    </option>
                  ))}
                </select>
              </div>
            )}

            {/* Camera viewport container (kept empty of React children for html5-qrcode) */}
            <div className="relative rounded-xl border border-dashed border-slate-300 bg-slate-950/95 overflow-hidden min-h-[220px] flex items-center justify-center">
              <div id={scannerRegionId} className="w-full" />
              {!cameraActive && !cameraStarting && (
                <div className="absolute inset-0 flex flex-col items-center justify-center p-6 text-center pointer-events-none">
                  <QrCode className="w-10 h-10 text-slate-400 mb-2" />
                  <p className="text-xs font-medium text-slate-200">
                    {isAdmin
                      ? 'Kamera belum aktif. Tekan "Aktifkan Kamera" untuk memindai Barcode / QR Peminjaman maupun Label Aset.'
                      : 'Kamera belum aktif. Tekan "Aktifkan Kamera" lalu scan Barcode / QR Peminjaman dari Admin.'}
                  </p>
                  <p className="text-[11px] text-slate-400 mt-1">
                    {isAdmin
                      ? 'Atau gunakan barcode scanner USB / ketik No. Ref peminjaman atau kode aset di bawah ini.'
                      : 'Atau pindai menggunakan barcode scanner USB pada kolom di bawah ini.'}
                  </p>
                </div>
              )}
            </div>

            {/* Hidden container for file scanning */}
            <div id={fileRegionId} className="hidden" />

            {cameraError && (
              <div className="rounded-xl bg-amber-50 border border-amber-200 px-3.5 py-2.5 text-xs text-amber-800 flex items-start gap-2">
                <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5" />
                <span>{cameraError}</span>
              </div>
            )}

            {/* USB Barcode Scanner / Manual Code Input */}
            <form onSubmit={handleManualSubmit} className="space-y-2 pt-1">
              <label className="block text-xs font-semibold text-slate-700">
                {isAdmin
                  ? 'Scan USB Barcode / Input Kode Peminjaman (No. Ref) atau Kode Aset'
                  : 'Scan USB Barcode / Input Kode Barcode Peminjaman dari Admin'}
              </label>
              <div className="flex flex-col sm:flex-row gap-2">
                <div className="relative flex-1">
                  <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
                  <input
                    ref={manualInputRef}
                    type="text"
                    value={manualCode}
                    onChange={(e) => setManualCode(e.target.value)}
                    placeholder={
                      isAdmin
                        ? 'Scan barcode peminjaman, No. Ref, atau kode aset (cth. LAB-PC-001)'
                        : 'Scan Barcode / QR Peminjaman yang ditunjukkan Admin'
                    }
                    className="w-full pl-9 pr-3 py-2.5 rounded-xl border border-slate-200 text-sm font-mono text-slate-800 placeholder-slate-400 focus:outline-none focus:border-[#2563eb]"
                  />
                </div>
                <button
                  type="submit"
                  className="px-4 py-2.5 rounded-xl bg-slate-900 hover:bg-slate-800 text-white text-xs font-semibold inline-flex items-center justify-center gap-1.5 cursor-pointer shrink-0"
                >
                  <ScanBarcode className="w-4 h-4" />
                  Verifikasi Barcode
                </button>
              </div>
            </form>

            {scanError && (
              <div className="rounded-xl bg-rose-50 border border-rose-200 px-3.5 py-3 text-xs text-rose-700 flex items-start justify-between gap-2">
                <div className="flex items-start gap-2">
                  <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5" />
                  <div>
                    <div className="font-semibold">
                      Hasil Scan{lastScannedRaw ? `: ${lastScannedRaw}` : ''}
                    </div>
                    <div className="mt-0.5">{scanError}</div>
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => setScanError(null)}
                  className="p-1 rounded-md text-rose-500 hover:bg-rose-100 cursor-pointer"
                >
                  <X className="w-3.5 h-3.5" />
                </button>
              </div>
            )}
          </div>

          {/* Matched Loan Confirmation Card */}
          {matchedLoan && (
            <form
              onSubmit={handleConfirmReturn}
              className="bg-white rounded-2xl border-2 border-emerald-500/70 shadow-sm p-5 space-y-4"
            >
              <div className="flex items-start justify-between gap-3">
                <div className="flex items-center gap-2.5">
                  <div className="w-10 h-10 rounded-xl bg-emerald-50 text-emerald-600 flex items-center justify-center shrink-0">
                    <CheckCircle2 className="w-5 h-5" />
                  </div>
                  <div>
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="text-[11px] font-semibold uppercase tracking-wider text-emerald-700">
                        Barcode Admin Terverifikasi
                      </span>
                      <span
                        className={`text-[10px] font-semibold px-2 py-0.5 rounded-md ${
                          matchedLoan.status === 'Dipinjam'
                            ? 'bg-indigo-100 text-indigo-700'
                            : 'bg-sky-100 text-sky-700'
                        }`}
                      >
                        {matchedLoan.status}
                      </span>
                    </div>
                    <h3 className="text-base font-bold text-slate-900 mt-0.5">
                      [{matchedLoan.assetCode}] {matchedLoan.assetName}
                    </h3>
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => {
                    setMatchedLoanId(null);
                    setVerifiedBarcodeCode('');
                    setReturnNotes('');
                  }}
                  className="p-1.5 rounded-lg text-slate-400 hover:text-slate-600 cursor-pointer"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>

              <dl className="grid grid-cols-2 gap-3 text-xs bg-slate-50 rounded-xl p-3.5 border border-slate-100">
                <div>
                  <dt className="text-slate-500">Verifikasi Barcode</dt>
                  <dd className="font-mono font-semibold text-emerald-700 mt-0.5">
                    {isAdmin ? getLoanRefCode(matchedLoan.id) : 'Valid (Barcode Admin)'}
                  </dd>
                </div>
                <div>
                  <dt className="text-slate-500">Peminjam</dt>
                  <dd className="font-semibold text-slate-900 mt-0.5">
                    {matchedLoan.borrowerName} ({matchedLoan.borrowerRole})
                  </dd>
                </div>
                <div>
                  <dt className="text-slate-500">Kelas / Unit</dt>
                  <dd className="font-semibold text-slate-900 mt-0.5">{matchedLoan.unit}</dd>
                </div>
                <div>
                  <dt className="text-slate-500">Lokasi / Kondisi Aset</dt>
                  <dd className="font-semibold text-slate-900 mt-0.5">
                    {matchedAsset
                      ? `${matchedAsset.location} · ${matchedAsset.condition}`
                      : 'Terdaftar di Inventaris'}
                  </dd>
                </div>
                <div>
                  <dt className="text-slate-500">Tanggal Pinjam – Rencana Kembali</dt>
                  <dd className="font-mono font-semibold text-slate-900 mt-0.5">
                    {matchedLoan.borrowDate} → {matchedLoan.returnDate}
                  </dd>
                </div>
                <div>
                  <dt className="text-slate-500">Keperluan</dt>
                  <dd className="font-medium text-slate-800 mt-0.5">{matchedLoan.purpose}</dd>
                </div>
              </dl>

              <div>
                <label className="block text-xs font-medium text-slate-700 mb-1">
                  Catatan Kondisi Pengembalian (Opsional)
                </label>
                <input
                  type="text"
                  maxLength={140}
                  value={returnNotes}
                  onChange={(e) => setReturnNotes(e.target.value)}
                  placeholder="cth. Perangkat lengkap beserta adaptor & mouse dalam kondisi baik"
                  className="w-full px-3 py-2 rounded-xl border border-slate-200 text-sm focus:outline-none focus:border-emerald-500"
                />
              </div>

              <div className="flex flex-wrap items-center justify-end gap-2 pt-1">
                {isAdmin && (
                  <button
                    type="button"
                    onClick={() => setPreviewBarcodeLoanId(matchedLoan.id)}
                    className="px-3.5 py-2 rounded-xl border border-slate-200 text-xs font-semibold text-slate-700 hover:bg-slate-50 inline-flex items-center gap-1.5 cursor-pointer mr-auto"
                  >
                    <ScanBarcode className="w-4 h-4" />
                    Lihat Barcode
                  </button>
                )}
                <button
                  type="button"
                  onClick={() => {
                    setMatchedLoanId(null);
                    setVerifiedBarcodeCode('');
                    setReturnNotes('');
                  }}
                  className="px-4 py-2 rounded-xl text-sm font-medium text-slate-600 hover:bg-slate-100 cursor-pointer"
                >
                  Batal
                </button>
                {isAdmin && matchedLoan.status === 'Disetujui' && (
                  <button
                    type="button"
                    disabled={submitting}
                    onClick={() => void handleHandoverToBorrowed()}
                    className="px-4 py-2.5 rounded-xl bg-indigo-600 hover:bg-indigo-700 disabled:opacity-60 text-white text-sm font-semibold cursor-pointer"
                  >
                    Serahkan (Dipinjam)
                  </button>
                )}
                <button
                  type="submit"
                  disabled={submitting}
                  className="px-4 py-2.5 rounded-xl bg-emerald-600 hover:bg-emerald-700 disabled:opacity-60 text-white text-sm font-semibold inline-flex items-center gap-1.5 cursor-pointer"
                >
                  <CheckCircle2 className="w-4 h-4" />
                  {submitting ? 'Memproses...' : 'Konfirmasi Pengembalian'}
                </button>
              </div>
            </form>
          )}
        </div>

        {/* Right: Active Borrowed List & Recent Returns */}
        <div className="lg:col-span-5 space-y-5">
          <div className="bg-white rounded-2xl border border-slate-200/90 p-5">
            <div className="flex items-center justify-between gap-2 mb-3">
              <h3 className="text-sm font-bold text-slate-900">
                {isAdmin ? 'Daftar Peminjaman Aktif' : 'Peminjaman Aktif Anda'}
              </h3>
              <button
                type="button"
                onClick={() => void onRefresh()}
                className="p-1.5 rounded-lg text-slate-400 hover:text-slate-700 hover:bg-slate-100 cursor-pointer"
                title="Muat ulang data"
              >
                <RefreshCw className="w-3.5 h-3.5" />
              </button>
            </div>

            {returnableLoans.length === 0 ? (
              <div className="py-8 text-center text-xs text-slate-500">
                Tidak ada peminjaman berstatus <strong>Disetujui</strong> atau{' '}
                <strong>Dipinjam</strong> saat ini.
              </div>
            ) : (
              <div className="divide-y divide-slate-100">
                {returnableLoans.map((loan) => {
                  const isOverdue = Boolean(
                    loan.status === 'Dipinjam' && loan.returnDate && loan.returnDate < today
                  );
                  const isSelected = matchedLoan?.id === loan.id;
                  return (
                    <div
                      key={loan.id}
                      className={`py-3 first:pt-0 last:pb-0 flex items-start justify-between gap-2.5 ${
                        isSelected ? 'bg-emerald-50/50 -mx-2 px-2 rounded-xl' : ''
                      }`}
                    >
                      <div className="min-w-0">
                        <div className="flex items-center gap-1.5 flex-wrap">
                          <span className="font-mono text-[11px] font-semibold px-1.5 py-0.5 rounded bg-slate-100 text-slate-700">
                            {loan.assetCode}
                          </span>
                          <span
                            className={`text-[10px] font-semibold px-1.5 py-0.5 rounded ${
                              loan.status === 'Dipinjam'
                                ? 'bg-indigo-50 text-indigo-700'
                                : 'bg-sky-50 text-sky-700'
                            }`}
                          >
                            {loan.status}
                          </span>
                          <span className="text-sm font-semibold text-slate-900 truncate">
                            {loan.assetName}
                          </span>
                        </div>
                        <div className="text-xs text-slate-500 mt-1">
                          {loan.borrowerName} · {loan.unit}
                        </div>
                        <div className="text-[11px] font-mono text-slate-500 mt-0.5">
                          {isAdmin ? `Ref: ${getLoanRefCode(loan.id)} · ` : ''}
                          {loan.borrowDate} → {loan.returnDate}
                          {isOverdue && (
                            <span className="ml-1.5 font-sans font-semibold text-rose-600">
                              (Terlambat)
                            </span>
                          )}
                        </div>
                      </div>
                      {isAdmin ? (
                        <div className="flex items-center gap-1 shrink-0">
                          <button
                            type="button"
                            onClick={() => setPreviewBarcodeLoanId(loan.id)}
                            title="Tampilkan Barcode Peminjaman untuk Discan"
                            className="p-1.5 rounded-lg bg-slate-100 hover:bg-slate-200 text-slate-700 cursor-pointer"
                          >
                            <ScanBarcode className="w-3.5 h-3.5" />
                          </button>
                          <button
                            type="button"
                            onClick={() => processScannedCode(loan.id)}
                            className="px-2.5 py-1.5 rounded-lg bg-blue-50 hover:bg-blue-100 text-blue-700 text-xs font-semibold cursor-pointer"
                          >
                            Pilih
                          </button>
                        </div>
                      ) : (
                        <span className="px-2 py-1 rounded-md bg-amber-50 text-amber-700 text-[10px] font-semibold shrink-0">
                          Scan Admin
                        </span>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
          </div>

          {/* Recent Returned History */}
          <div className="bg-white rounded-2xl border border-slate-200/90 p-5">
            <h3 className="text-sm font-bold text-slate-900 mb-3">
              Riwayat Pengembalian Terbaru
            </h3>
            {returnedLoans.length === 0 ? (
              <p className="text-xs text-slate-500 py-4 text-center">
                Belum ada riwayat pengembalian perangkat.
              </p>
            ) : (
              <div className="divide-y divide-slate-100">
                {returnedLoans.map((loan) => (
                  <div key={loan.id} className="py-2.5 first:pt-0 last:pb-0">
                    <div className="flex items-center justify-between gap-2">
                      <span className="text-xs font-semibold text-slate-800 truncate">
                        [{loan.assetCode}] {loan.assetName}
                      </span>
                      <span className="text-[11px] font-semibold text-emerald-700 shrink-0">
                        Dikembalikan
                      </span>
                    </div>
                    <div className="text-[11px] text-slate-500 mt-0.5">
                      {loan.borrowerName} · {isAdmin ? `Ref: ${getLoanRefCode(loan.id)} · ` : ''}
                      Kembali {loan.returnDate}
                    </div>
                    {loan.notes && (
                      <div className="text-[11px] text-slate-400 truncate mt-0.5">
                        {loan.notes}
                      </div>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Synchronized Loan Barcode Preview Modal (Admin Only) */}
      {isAdmin && previewBarcodeLoan && (
        <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl border border-slate-200 shadow-2xl w-full max-w-md overflow-hidden flex flex-col max-h-[92vh]">
            <div className="flex items-center justify-between px-5 py-4 border-b border-slate-100">
              <div>
                <h3 className="font-bold text-slate-900">Barcode Peminjaman Tersinkron</h3>
                <p className="text-xs text-slate-500">
                  No. Ref: {getLoanRefCode(previewBarcodeLoan.id)} · {previewBarcodeLoan.status}
                </p>
              </div>
              <button
                type="button"
                onClick={() => setPreviewBarcodeLoanId(null)}
                className="p-1.5 rounded-lg text-slate-400 hover:text-slate-600 cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>
            <div className="p-6 overflow-y-auto space-y-4 text-center">
              <div className="inline-flex flex-col items-center p-3.5 bg-white border border-slate-200 rounded-xl">
                <QRCodeSVG
                  value={buildLoanQrPayload(previewBarcodeLoan)}
                  size={156}
                  level="M"
                  includeMargin
                />
              </div>

              <div className="flex flex-col items-center gap-2">
                <div className="px-3 py-2 bg-white border border-slate-200 rounded-xl max-w-full overflow-x-auto">
                  <LoanBarcodeSvg
                    value={previewBarcodeLoan.id}
                    height={54}
                    width={1.6}
                    fontSize={11}
                  />
                </div>
                <div className="inline-flex items-center gap-2 text-xs font-mono text-slate-600 bg-slate-100 px-3 py-1.5 rounded-lg">
                  <span>{previewBarcodeLoan.id}</span>
                  <button
                    type="button"
                    onClick={() => void handleCopyLoanCode(previewBarcodeLoan.id)}
                    className="inline-flex items-center gap-1 text-blue-600 hover:text-blue-700 font-sans font-semibold cursor-pointer"
                  >
                    {copiedCode ? (
                      <>
                        <Check className="w-3.5 h-3.5 text-emerald-600" />
                        <span className="text-emerald-600">Disalin</span>
                      </>
                    ) : (
                      <>
                        <Copy className="w-3.5 h-3.5" />
                        <span>Salin</span>
                      </>
                    )}
                  </button>
                </div>
              </div>

              <div className="text-xs text-slate-600 bg-slate-50 rounded-xl p-3 border border-slate-100 text-left">
                <div className="font-semibold text-slate-900">
                  [{previewBarcodeLoan.assetCode}] {previewBarcodeLoan.assetName}
                </div>
                <div className="mt-0.5">
                  Peminjam: {previewBarcodeLoan.borrowerName} ({previewBarcodeLoan.unit})
                </div>
              </div>
            </div>
            <div className="px-5 py-3.5 bg-slate-50 border-t border-slate-100 flex justify-between gap-2">
              <button
                type="button"
                onClick={() => {
                  processScannedCode(previewBarcodeLoan.id);
                  setPreviewBarcodeLoanId(null);
                }}
                className="px-4 py-2 rounded-xl text-sm font-semibold bg-emerald-600 hover:bg-emerald-700 text-white cursor-pointer"
              >
                Gunakan untuk Pengembalian
              </button>
              <button
                type="button"
                onClick={() => setPreviewBarcodeLoanId(null)}
                className="px-4 py-2 rounded-xl text-sm font-medium text-slate-600 hover:bg-slate-200/70 cursor-pointer"
              >
                Tutup
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
