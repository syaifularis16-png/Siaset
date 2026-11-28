import React, { useMemo, useState } from 'react';
import { QRCodeSVG } from 'qrcode.react';
import { Printer, X } from 'lucide-react';
import {
  DEFAULT_BRANDING,
  type Asset,
  type AssetLock,
  type BrandingSettings,
  type Loan,
  type Maintenance,
} from '../types';

interface AssetQrModalProps {
  asset: Asset | null;
  branding?: BrandingSettings;
  loans?: Loan[];
  assetLocks?: AssetLock[];
  maintenances?: Maintenance[];
  onClose: () => void;
}

type DetailTab = 'qr' | 'loans' | 'maintenances';

export const AssetQrModal: React.FC<AssetQrModalProps> = ({
  asset,
  branding = DEFAULT_BRANDING,
  loans = [],
  assetLocks = [],
  maintenances = [],
  onClose,
}) => {
  const [tab, setTab] = useState<DetailTab>('qr');

  const assetLoans = useMemo(
    () => (asset ? loans.filter((l) => l.assetId === asset.id) : []),
    [asset, loans]
  );
  const assetMaintenances = useMemo(
    () => (asset ? maintenances.filter((m) => m.assetId === asset.id) : []),
    [asset, maintenances]
  );

  if (!asset) return null;

  const qrPayload = JSON.stringify({
    code: asset.code,
    name: asset.name,
    category: asset.category,
    location: asset.location,
    condition: asset.condition,
  });

  const activeLoan = assetLoans.find(
    (l) => l.status === 'Dipinjam' || l.status === 'Disetujui'
  );
  const activeLock = assetLocks.find((lock) => lock.assetId === asset.id);

  return (
    <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl border border-slate-200 shadow-2xl w-full max-w-lg overflow-hidden flex flex-col max-h-[90vh]">
        <div className="flex items-center justify-between px-5 py-4 border-b border-slate-100">
          <div className="flex items-center gap-2.5 min-w-0">
            {branding.logoDataUrl && (
              <img
                src={branding.logoDataUrl}
                alt={branding.appName}
                className="w-8 h-8 rounded-lg object-contain bg-slate-50 border border-slate-200 p-0.5 shrink-0"
              />
            )}
            <div className="min-w-0">
              <h3 className="font-semibold text-slate-900 truncate">
                Detail Aset — {asset.name}
              </h3>
              <p className="text-xs text-slate-500 truncate">
                {branding.appName} · {branding.schoolName}
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-1.5 rounded-lg text-slate-400 hover:text-slate-600 hover:bg-slate-100 cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Segmented Tabs */}
        <div className="px-5 pt-3 pb-2 border-b border-slate-100 bg-slate-50/70">
          <div className="grid grid-cols-3 gap-1 p-1 bg-slate-200/70 rounded-xl">
            <button
              type="button"
              onClick={() => setTab('qr')}
              className={`px-3 py-1.5 text-xs font-semibold rounded-lg transition-colors cursor-pointer ${
                tab === 'qr'
                  ? 'bg-white text-slate-900 shadow-xs'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              Label QR & Info
            </button>
            <button
              type="button"
              onClick={() => setTab('loans')}
              className={`px-3 py-1.5 text-xs font-semibold rounded-lg transition-colors cursor-pointer ${
                tab === 'loans'
                  ? 'bg-white text-slate-900 shadow-xs'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              Peminjaman ({assetLoans.length})
            </button>
            <button
              type="button"
              onClick={() => setTab('maintenances')}
              className={`px-3 py-1.5 text-xs font-semibold rounded-lg transition-colors cursor-pointer ${
                tab === 'maintenances'
                  ? 'bg-white text-slate-900 shadow-xs'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              Perawatan ({assetMaintenances.length})
            </button>
          </div>
        </div>

        <div className="flex-1 overflow-y-auto">
          {tab === 'qr' && (
            <div id="qr-print-area" className="p-6 flex flex-col items-center text-center">
              <div className="p-4 bg-white border border-slate-200 rounded-xl mb-4">
                <QRCodeSVG value={qrPayload} size={172} level="M" includeMargin />
              </div>
              <span className="font-mono tabular-nums text-xs font-semibold px-2.5 py-1 rounded-md bg-slate-100 text-slate-800 mb-2">
                {asset.code}
              </span>
              <h4 className="font-bold text-slate-900 text-base">{asset.name}</h4>
              <p className="text-xs text-slate-500 mt-1">
                {asset.brand} · {asset.category} · {asset.location}
              </p>

              {(activeLoan || activeLock) && (
                <div className="mt-3 text-xs text-amber-700 font-medium">
                  {activeLoan
                    ? `${activeLoan.status === 'Dipinjam' ? 'Sedang dipinjam' : 'Sudah disetujui'} oleh ${activeLoan.borrowerName} (${activeLoan.unit}) s.d. ${activeLoan.returnDate}`
                    : activeLock?.status === 'Dipinjam'
                      ? 'Sedang dipinjam (tidak tersedia untuk dipinjam)'
                      : 'Sudah disetujui admin (tidak tersedia untuk dipinjam)'}
                </div>
              )}

              <dl className="mt-5 w-full grid grid-cols-2 gap-3 text-left border-t border-slate-100 pt-4 text-xs">
                <div>
                  <dt className="text-slate-400">Kondisi</dt>
                  <dd className="font-medium text-slate-800 mt-0.5">{asset.condition}</dd>
                </div>
                <div>
                  <dt className="text-slate-400">Tahun Pengadaan</dt>
                  <dd className="font-mono tabular-nums font-medium text-slate-800 mt-0.5">
                    {asset.procurementYear}
                  </dd>
                </div>
                <div>
                  <dt className="text-slate-400">Sumber Dana</dt>
                  <dd className="font-medium text-slate-800 mt-0.5">
                    {asset.fundingSource || '—'}
                  </dd>
                </div>
                <div>
                  <dt className="text-slate-400">Perawatan Berikutnya</dt>
                  <dd className="font-mono tabular-nums font-medium text-slate-800 mt-0.5">
                    {asset.nextMaintenanceDate || '—'}
                  </dd>
                </div>
              </dl>
            </div>
          )}

          {tab === 'loans' && (
            <div className="p-5">
              {assetLoans.length === 0 ? (
                <p className="text-sm text-slate-500 py-8 text-center">
                  Belum ada riwayat peminjaman untuk perangkat ini.
                </p>
              ) : (
                <div className="divide-y divide-slate-100">
                  {assetLoans.map((l) => (
                    <div key={l.id} className="py-3 first:pt-0 last:pb-0">
                      <div className="flex items-center justify-between gap-2">
                        <div className="text-sm font-semibold text-slate-900">
                          {l.borrowerName}
                        </div>
                        <span className="text-xs font-semibold text-slate-700">{l.status}</span>
                      </div>
                      <div className="text-xs text-slate-500 mt-0.5">
                        {l.borrowerRole} · {l.unit} · {l.borrowDate} → {l.returnDate}
                        {l.lessonPeriod ? ` · ${l.lessonPeriod}` : ''}
                      </div>
                      <div className="text-xs text-slate-600 mt-1">{l.purpose}</div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          {tab === 'maintenances' && (
            <div className="p-5">
              {assetMaintenances.length === 0 ? (
                <p className="text-sm text-slate-500 py-8 text-center">
                  Belum ada catatan perawatan untuk perangkat ini.
                </p>
              ) : (
                <div className="divide-y divide-slate-100">
                  {assetMaintenances.map((m) => (
                    <div key={m.id} className="py-3 first:pt-0 last:pb-0">
                      <div className="flex items-center justify-between gap-2">
                        <div className="text-sm font-semibold text-slate-900">{m.issue}</div>
                        <span className="text-xs font-semibold text-slate-700">{m.status}</span>
                      </div>
                      <div className="text-xs text-slate-500 mt-0.5">
                        {m.maintenanceDate} · Teknisi: {m.technicianName} · Hasil:{' '}
                        {m.resultingCondition}
                      </div>
                      {m.actionTaken && (
                        <div className="text-xs text-slate-600 mt-1">Tindakan: {m.actionTaken}</div>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>

        <div className="px-5 py-3.5 bg-slate-50 border-t border-slate-100 flex items-center justify-end gap-2">
          <button
            type="button"
            onClick={onClose}
            className="px-3.5 py-2 rounded-xl text-sm font-medium text-slate-600 hover:bg-slate-200/70 cursor-pointer whitespace-nowrap"
          >
            Tutup
          </button>
          {tab === 'qr' && (
            <button
              type="button"
              onClick={() => window.print()}
              className="px-4 py-2 rounded-xl text-sm font-semibold bg-[#2563eb] hover:bg-[#1d4ed8] text-white flex items-center gap-1.5 cursor-pointer whitespace-nowrap"
            >
              <Printer className="w-4 h-4" />
              Cetak Label
            </button>
          )}
        </div>
      </div>
    </div>
  );
};
