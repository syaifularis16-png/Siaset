import React from 'react';
import { QRCodeSVG } from 'qrcode.react';
import { Printer, X } from 'lucide-react';
import { DEFAULT_BRANDING, type Asset, type BrandingSettings } from '../types';

interface AssetQrModalProps {
  asset: Asset | null;
  branding?: BrandingSettings;
  onClose: () => void;
}

export const AssetQrModal: React.FC<AssetQrModalProps> = ({
  asset,
  branding = DEFAULT_BRANDING,
  onClose,
}) => {
  if (!asset) return null;

  const qrPayload = JSON.stringify({
    code: asset.code,
    name: asset.name,
    category: asset.category,
    location: asset.location,
    condition: asset.condition,
  });

  return (
    <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl border border-slate-200 shadow-2xl w-full max-w-md overflow-hidden">
        <div className="flex items-center justify-between px-5 py-4 border-b border-slate-100">
          <div>
            <h3 className="font-semibold text-slate-900">Detail & Label QR Aset</h3>
            <p className="text-xs text-slate-500">
              {branding.appName} · {branding.schoolName}
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-1.5 rounded-lg text-slate-400 hover:text-slate-600 hover:bg-slate-100 cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

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

        <div className="px-5 py-3.5 bg-slate-50 border-t border-slate-100 flex items-center justify-end gap-2">
          <button
            type="button"
            onClick={onClose}
            className="px-3.5 py-2 rounded-xl text-sm font-medium text-slate-600 hover:bg-slate-200/70 cursor-pointer whitespace-nowrap"
          >
            Tutup
          </button>
          <button
            type="button"
            onClick={() => window.print()}
            className="px-4 py-2 rounded-xl text-sm font-semibold bg-[#2563eb] hover:bg-[#1d4ed8] text-white flex items-center gap-1.5 cursor-pointer whitespace-nowrap"
          >
            <Printer className="w-4 h-4" />
            Cetak Label
          </button>
        </div>
      </div>
    </div>
  );
};
