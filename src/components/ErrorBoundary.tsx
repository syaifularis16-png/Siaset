import React from 'react';
import { AlertTriangle, RotateCw } from 'lucide-react';

interface ErrorBoundaryState {
  hasError: boolean;
  message: string;
}

function formatErrorMessage(raw: string): string {
  try {
    const parsed = JSON.parse(raw) as { error?: string; operationType?: string; path?: string };
    if (parsed && typeof parsed.error === 'string') {
      if (parsed.error.toLowerCase().includes('insufficient permissions')) {
        return `Akses ditolak oleh aturan keamanan Firestore (${parsed.operationType ?? 'read'} pada ${parsed.path ?? 'dokumen'}).`;
      }
      return parsed.error;
    }
  } catch {
    // Plain string message
  }
  return raw || 'Terjadi kesalahan tidak terduga pada aplikasi.';
}

export class ErrorBoundary extends React.Component<
  { children: React.ReactNode },
  ErrorBoundaryState
> {
  constructor(props: { children: React.ReactNode }) {
    super(props);
    this.state = { hasError: false, message: '' };
  }

  static getDerivedStateFromError(error: unknown): ErrorBoundaryState {
    const msg = error instanceof Error ? error.message : String(error);
    return { hasError: true, message: formatErrorMessage(msg) };
  }

  render() {
    if (this.state.hasError) {
      return (
        <div className="min-h-screen sipalak-auth-bg text-slate-100 flex items-center justify-center p-4">
          <div className="w-full max-w-md bg-slate-900/90 backdrop-blur-xl border border-white/15 rounded-2xl p-6 text-center space-y-4 shadow-2xl">
            <div className="w-12 h-12 rounded-xl bg-rose-500/20 border border-rose-400/30 text-rose-300 flex items-center justify-center mx-auto">
              <AlertTriangle className="w-6 h-6" />
            </div>
            <h1 className="text-lg font-bold text-white">Terjadi Gangguan Sistem</h1>
            <p className="text-sm text-slate-300 leading-relaxed">{this.state.message}</p>
            <button
              type="button"
              onClick={() => window.location.reload()}
              className="px-4 py-2.5 rounded-xl bg-blue-600 hover:bg-blue-500 text-white text-sm font-semibold inline-flex items-center gap-2 cursor-pointer"
            >
              <RotateCw className="w-4 h-4" />
              Muat Ulang Halaman
            </button>
          </div>
        </div>
      );
    }
    return this.props.children;
  }
}
