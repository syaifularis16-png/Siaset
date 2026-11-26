import React, { useEffect, useState } from 'react';
import { RotateCcw, X } from 'lucide-react';
import { brandingApi } from '../lib/api';
import { DEFAULT_BRANDING, type BrandingSettings } from '../types';

interface BrandingModalProps {
  open: boolean;
  branding: BrandingSettings;
  onClose: () => void;
  onSaved: (next: BrandingSettings) => void;
  onNotify: (msg: string, type?: 'success' | 'error') => void;
}

export const BrandingModal: React.FC<BrandingModalProps> = ({
  open,
  branding,
  onClose,
  onSaved,
  onNotify,
}) => {
  const [appName, setAppName] = useState(branding.appName);
  const [appSubtitle, setAppSubtitle] = useState(branding.appSubtitle);
  const [schoolName, setSchoolName] = useState(branding.schoolName);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (open) {
      setAppName(branding.appName);
      setAppSubtitle(branding.appSubtitle);
      setSchoolName(branding.schoolName);
    }
  }, [open, branding]);

  if (!open) return null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    try {
      const saved = await brandingApi.update({ appName, appSubtitle, schoolName });
      onSaved(saved);
      onNotify('Identitas aplikasi berhasil diperbarui.');
      onClose();
    } catch (err) {
      onNotify(
        err instanceof Error ? err.message : 'Gagal menyimpan identitas aplikasi.',
        'error'
      );
    } finally {
      setSaving(false);
    }
  };

  const handleReset = () => {
    setAppName(DEFAULT_BRANDING.appName);
    setAppSubtitle(DEFAULT_BRANDING.appSubtitle);
    setSchoolName(DEFAULT_BRANDING.schoolName);
  };

  return (
    <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl border border-slate-200 shadow-2xl w-full max-w-md overflow-hidden">
        <div className="flex items-center justify-between px-5 py-4 border-b border-slate-100">
          <div>
            <h3 className="font-bold text-slate-900">Ubah Identitas Aplikasi</h3>
            <p className="text-xs text-slate-500">
              Sesuaikan nama aplikasi, layanan, dan nama sekolah atau instansi.
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-1.5 rounded-lg text-slate-400 hover:text-slate-600 cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="p-5 space-y-4">
          <div>
            <label className="block text-xs font-medium text-slate-700 mb-1">
              Nama Aplikasi *
            </label>
            <input
              type="text"
              required
              maxLength={40}
              value={appName}
              onChange={(e) => setAppName(e.target.value)}
              placeholder="SIPALAK"
              className="w-full px-3 py-2 rounded-xl border border-slate-200 text-sm text-slate-900 focus:outline-none focus:border-[#2563eb]"
            />
          </div>

          <div>
            <label className="block text-xs font-medium text-slate-700 mb-1">
              Subjudul / Nama Layanan *
            </label>
            <input
              type="text"
              required
              maxLength={120}
              value={appSubtitle}
              onChange={(e) => setAppSubtitle(e.target.value)}
              placeholder="Sistem Pelayanan Laboratorium Komputer"
              className="w-full px-3 py-2 rounded-xl border border-slate-200 text-sm text-slate-900 focus:outline-none focus:border-[#2563eb]"
            />
          </div>

          <div>
            <label className="block text-xs font-medium text-slate-700 mb-1">
              Nama Sekolah / Instansi *
            </label>
            <input
              type="text"
              required
              maxLength={100}
              value={schoolName}
              onChange={(e) => setSchoolName(e.target.value)}
              placeholder="SMK Negeri 1 Sambeng"
              className="w-full px-3 py-2 rounded-xl border border-slate-200 text-sm text-slate-900 focus:outline-none focus:border-[#2563eb]"
            />
          </div>

          <div className="pt-2 flex items-center justify-between gap-2">
            <button
              type="button"
              onClick={handleReset}
              className="px-3 py-2 rounded-xl text-xs font-medium text-slate-600 hover:bg-slate-100 inline-flex items-center gap-1.5 cursor-pointer"
            >
              <RotateCcw className="w-3.5 h-3.5" />
              Reset Default
            </button>
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={onClose}
                className="px-4 py-2 rounded-xl text-sm font-medium text-slate-600 hover:bg-slate-100 cursor-pointer"
              >
                Batal
              </button>
              <button
                type="submit"
                disabled={saving}
                className="px-4 py-2 rounded-xl text-sm font-semibold bg-[#2563eb] hover:bg-[#1d4ed8] disabled:opacity-60 text-white cursor-pointer"
              >
                {saving ? 'Menyimpan...' : 'Simpan'}
              </button>
            </div>
          </div>
        </form>
      </div>
    </div>
  );
};
