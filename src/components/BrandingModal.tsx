import React, { useEffect, useRef, useState } from 'react';
import { ImagePlus, RotateCcw, Trash2, Upload, X } from 'lucide-react';
import { brandingApi } from '../lib/api';
import { DEFAULT_BRANDING, type BrandingSettings } from '../types';

interface BrandingModalProps {
  open: boolean;
  branding: BrandingSettings;
  onClose: () => void;
  onSaved: (next: BrandingSettings) => void;
  onNotify: (msg: string, type?: 'success' | 'error') => void;
}

async function resizeLogoFileToPngDataUrl(file: File): Promise<string> {
  const objectUrl = URL.createObjectURL(file);
  try {
    const img = await new Promise<HTMLImageElement>((resolve, reject) => {
      const el = new Image();
      el.onload = () => resolve(el);
      el.onerror = () => reject(new Error('File gambar tidak dapat dibaca.'));
      el.src = objectUrl;
    });

    const maxDim = 256;
    const scale = Math.min(1, maxDim / Math.max(img.width || 1, img.height || 1));
    const targetW = Math.max(1, Math.round((img.width || maxDim) * scale));
    const targetH = Math.max(1, Math.round((img.height || maxDim) * scale));

    const canvas = document.createElement('canvas');
    canvas.width = targetW;
    canvas.height = targetH;
    const ctx = canvas.getContext('2d');
    if (!ctx) throw new Error('Gagal memproses gambar logo.');
    ctx.clearRect(0, 0, targetW, targetH);
    ctx.drawImage(img, 0, 0, targetW, targetH);

    const pngUrl = canvas.toDataURL('image/png');
    if (pngUrl.length <= 115000) return pngUrl;

    const webpUrl = canvas.toDataURL('image/webp', 0.85);
    if (webpUrl.length <= 115000) return webpUrl;

    throw new Error('Ukuran logo setelah kompresi masih terlalu besar. Pilih gambar lain.');
  } finally {
    URL.revokeObjectURL(objectUrl);
  }
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
  const [logoDataUrl, setLogoDataUrl] = useState(branding.logoDataUrl ?? '');
  const [saving, setSaving] = useState(false);
  const [processingLogo, setProcessingLogo] = useState(false);
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    if (open) {
      setAppName(branding.appName);
      setAppSubtitle(branding.appSubtitle);
      setSchoolName(branding.schoolName);
      setLogoDataUrl(branding.logoDataUrl ?? '');
    }
  }, [open, branding]);

  if (!open) return null;

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    if (!file.type.startsWith('image/')) {
      onNotify('Silakan pilih file gambar (PNG, JPG, WebP, atau SVG).', 'error');
      return;
    }
    setProcessingLogo(true);
    try {
      const dataUrl = await resizeLogoFileToPngDataUrl(file);
      setLogoDataUrl(dataUrl);
    } catch (err) {
      onNotify(err instanceof Error ? err.message : 'Gagal memproses logo.', 'error');
    } finally {
      setProcessingLogo(false);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    try {
      const saved = await brandingApi.update({
        appName,
        appSubtitle,
        schoolName,
        logoDataUrl,
      });
      onSaved(saved);
      onNotify('Identitas dan logo aplikasi berhasil diperbarui.');
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
    setLogoDataUrl('');
  };

  return (
    <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl border border-slate-200 shadow-2xl w-full max-w-md overflow-hidden">
        <div className="flex items-center justify-between px-5 py-4 border-b border-slate-100">
          <div>
            <h3 className="font-bold text-slate-900">Ubah Identitas Aplikasi</h3>
            <p className="text-xs text-slate-500">
              Sesuaikan logo, nama aplikasi, layanan, dan nama sekolah atau instansi.
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

        <form onSubmit={handleSubmit} className="p-5 space-y-4 max-h-[82vh] overflow-y-auto">
          <div>
            <label className="block text-xs font-medium text-slate-700 mb-1.5">
              Logo Sekolah / Aplikasi
            </label>
            <div className="flex items-center gap-3.5 p-3 rounded-xl border border-slate-200 bg-slate-50/70">
              <div className="w-14 h-14 rounded-xl bg-white border border-slate-200 flex items-center justify-center overflow-hidden shrink-0">
                {logoDataUrl ? (
                  <img
                    src={logoDataUrl}
                    alt="Pratinjau logo"
                    className="w-full h-full object-contain p-1"
                  />
                ) : (
                  <ImagePlus className="w-6 h-6 text-slate-300" />
                )}
              </div>
              <div className="flex-1 min-w-0 space-y-2">
                <div className="flex flex-wrap items-center gap-2">
                  <input
                    ref={fileInputRef}
                    type="file"
                    accept="image/*"
                    onChange={handleFileChange}
                    className="hidden"
                  />
                  <button
                    type="button"
                    disabled={processingLogo}
                    onClick={() => fileInputRef.current?.click()}
                    className="px-3 py-1.5 rounded-lg bg-white hover:bg-slate-100 border border-slate-200 text-xs font-semibold text-slate-700 inline-flex items-center gap-1.5 cursor-pointer"
                  >
                    <Upload className="w-3.5 h-3.5" />
                    {processingLogo ? 'Memproses...' : 'Unggah Logo'}
                  </button>
                  {logoDataUrl && (
                    <button
                      type="button"
                      onClick={() => setLogoDataUrl('')}
                      className="px-2.5 py-1.5 rounded-lg bg-rose-50 hover:bg-rose-100 text-xs font-medium text-rose-600 inline-flex items-center gap-1 cursor-pointer"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                      Hapus
                    </button>
                  )}
                </div>
                <input
                  type="text"
                  value={logoDataUrl.startsWith('data:') ? '' : logoDataUrl}
                  onChange={(e) => setLogoDataUrl(e.target.value)}
                  placeholder="Atau tempel URL logo (https://...)"
                  className="w-full px-2.5 py-1.5 rounded-lg bg-white border border-slate-200 text-xs text-slate-700 placeholder-slate-400 focus:outline-none focus:border-[#2563eb]"
                />
              </div>
            </div>
          </div>

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
                disabled={saving || processingLogo}
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
