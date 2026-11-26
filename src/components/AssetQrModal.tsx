import React from 'react';
import { QRCodeSVG } from 'qrcode.react';
import { Printer, X } from 'lucide-react';
import type { Asset } from '../types';

interface AssetQrModalProps {
  asset: Asset | null;
  onClose: () => void;
}

export const AssetQrModal: React.FC<AssetQrModalProps> = ({ asset, onClose }) => {
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
      <div className="bg-white rounded-2xl border border-slate-200 shadow-2xl w-full max-w-sm overflow-hidden">
        <div className="flex items-center justify-between px-5 py-4 border-b border-slate-100">
          <div>
            <h3 className="font-semibold text-slate-900">Label QR Inventaris</h3>
            <p className="text-xs text-slate-500">SIPALAK SMKN 1 Sambeng</p>
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
          <div className="p-4 bg-white border-2 border-slate-200 rounded-2xl mb-4">
            <QRCodeSVG value={qrPayload} size={184} level="M" includeMargin />
          </div>
          <span className="font-mono text-xs font-semibold px-2.5 py-1 rounded-md bg-slate-100 text-slate-800 mb-2">
            {asset.code}
          </span>
          <h4 className="font-bold text-slate-900 text-base">{asset.name}</h4>
          <p className="text-xs text-slate-500 mt-1">
            {asset.brand} • {asset.category}
          </p>
          <p className="text-xs text-slate-600 mt-1">{asset.location}</p>
        </div>

        <div className="px-5 py-3.5 bg-slate-50 border-t border-slate-100 flex items-center justify-end gap-2">
          <button
            type="button"
            onClick={onClose}
            className="px-3.5 py-2 rounded-xl text-sm font-medium text-slate-600 hover:bg-slate-200/70 cursor-pointer"
          >
            Tutup
          </button>
          <button
            type="button"
            onClick={() => window.print()}
            className="px-4 py-2 rounded-xl text-sm font-semibold bg-indigo-600 hover:bg-indigo-700 text-white flex items-center gap-1.5 cursor-pointer"
          >
            <Printer className="w-4 h-4" />
            Cetak Label
          </button>
        </div>
      </div>
    </div>
  );
};
