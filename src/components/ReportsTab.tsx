import React, { useMemo, useState } from 'react';
import { Download, Printer, X } from 'lucide-react';
import {
  DEFAULT_BRANDING,
  todayIsoDate,
  toLocalIsoDate,
  type AppDataSnapshot,
  type BrandingSettings,
} from '../types';

interface ReportsTabProps {
  data: AppDataSnapshot;
  branding?: BrandingSettings;
}

type ReportCategory = 'assets' | 'loans' | 'schedules' | 'maintenances' | 'attendances';

function downloadCsv(filename: string, headers: string[], rows: Array<Array<string | number>>) {
  const escape = (val: string | number) => {
    const s = String(val ?? '');
    if (/[",\n]/.test(s)) return `"${s.replace(/"/g, '""')}"`;
    return s;
  };
  const csv = [headers.map(escape).join(','), ...rows.map((r) => r.map(escape).join(','))].join(
    '\n'
  );
  const blob = new Blob([`\uFEFF${csv}`], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  link.click();
  URL.revokeObjectURL(url);
}

function inDateRange(dateStr: string, start: string, end: string): boolean {
  if (!dateStr) return !start && !end;
  if (start && dateStr < start) return false;
  if (end && dateStr > end) return false;
  return true;
}

export const ReportsTab: React.FC<ReportsTabProps> = ({
  data,
  branding = DEFAULT_BRANDING,
}) => {
  const today = todayIsoDate();
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');
  const [activeCategory, setActiveCategory] = useState<ReportCategory>('loans');
  const [printOpen, setPrintOpen] = useState(false);

  const applyPreset = (preset: 'ALL' | 'TODAY' | 'WEEK' | 'MONTH') => {
    if (preset === 'ALL') {
      setStartDate('');
      setEndDate('');
      return;
    }
    if (preset === 'TODAY') {
      setStartDate(today);
      setEndDate(today);
      return;
    }
    if (preset === 'WEEK') {
      const d = new Date();
      d.setDate(d.getDate() - 6);
      setStartDate(toLocalIsoDate(d));
      setEndDate(today);
      return;
    }
    setStartDate(`${today.slice(0, 7)}-01`);
    setEndDate(today);
  };

  const filteredData = useMemo(() => {
    return {
      assets: data.assets,
      loans: data.loans.filter((l) => inDateRange(l.borrowDate, startDate, endDate)),
      schedules: data.schedules.filter((s) => inDateRange(s.date, startDate, endDate)),
      maintenances: data.maintenances.filter((m) =>
        inDateRange(m.maintenanceDate, startDate, endDate)
      ),
      attendances: data.attendances.filter((a) => inDateRange(a.date, startDate, endDate)),
    };
  }, [data, startDate, endDate]);

  const goodAssets = filteredData.assets.filter((a) => a.condition === 'Baik').length;
  const needCare = filteredData.assets.filter((a) => a.condition === 'Perlu perawatan').length;
  const broken = filteredData.assets.filter((a) => a.condition === 'Rusak').length;

  const reportDefinitions = useMemo(
    () => [
      {
        key: 'assets' as const,
        title: 'Laporan Inventaris Aset',
        desc: `${filteredData.assets.length} perangkat terdaftar (${goodAssets} baik, ${needCare} perlu perawatan, ${broken} rusak).`,
        headers: [
          'Kode',
          'Nama Aset',
          'Kategori',
          'Merek',
          'Kondisi',
          'Lokasi',
          'Sumber Dana',
          'Tahun',
        ],
        rows: filteredData.assets.map((a) => [
          a.code,
          a.name,
          a.category,
          a.brand,
          a.condition,
          a.location,
          a.fundingSource || '-',
          a.procurementYear,
        ]),
        filename: 'laporan-inventaris.csv',
      },
      {
        key: 'loans' as const,
        title: 'Laporan Peminjaman Perangkat',
        desc: `${filteredData.loans.length} transaksi peminjaman pada periode terpilih.`,
        headers: [
          'Kode Aset',
          'Nama Aset',
          'Peminjam',
          'Peran',
          'Unit',
          'Pinjam',
          'Kembali',
          'Jam ke-',
          'Waktu',
          'Status',
          'Keperluan',
        ],
        rows: filteredData.loans.map((l) => [
          l.assetCode,
          l.assetName,
          l.borrowerName,
          l.borrowerRole,
          l.unit,
          l.borrowDate,
          l.returnDate,
          l.lessonPeriod || '-',
          l.borrowTime && l.returnTime ? `${l.borrowTime} - ${l.returnTime}` : '-',
          l.status,
          l.purpose,
        ]),
        filename: 'laporan-peminjaman.csv',
      },
      {
        key: 'schedules' as const,
        title: 'Laporan Peminjaman Aula & Multimedia',
        desc: `${filteredData.schedules.length} jadwal peminjaman Aula & Multimedia pada periode terpilih.`,
        headers: [
          'Ruangan',
          'Tanggal',
          'Jam',
          'Kegiatan',
          'Jenis & Peserta',
          'Perlengkapan',
          'Penanggung Jawab',
          'Unit',
          'Status',
          'Catatan Admin',
        ],
        rows: filteredData.schedules.map((s) => [
          s.venue,
          s.endDate && s.endDate > s.date ? `${s.date} s/d ${s.endDate}` : s.date,
          `${s.startTime} - ${s.endTime}`,
          s.activity,
          `${s.setupType || '-'}${s.participantCount > 0 ? ` (${s.participantCount} org)` : ''}`,
          s.equipmentNeeds || '-',
          `${s.requesterName} (${s.requesterRole})`,
          s.unit,
          s.status,
          s.adminNotes || '-',
        ]),
        filename: 'laporan-peminjaman-aula-multimedia.csv',
      },
      {
        key: 'maintenances' as const,
        title: 'Laporan Maintenance & Perbaikan',
        desc: `${filteredData.maintenances.length} catatan perawatan pada periode terpilih.`,
        headers: [
          'Tanggal',
          'Kode Aset',
          'Nama Aset',
          'Keluhan',
          'Tindakan',
          'Teknisi',
          'Status',
          'Kondisi Hasil',
        ],
        rows: filteredData.maintenances.map((m) => [
          m.maintenanceDate,
          m.assetCode,
          m.assetName,
          m.issue,
          m.actionTaken || '-',
          m.technicianName,
          m.status,
          m.resultingCondition,
        ]),
        filename: 'laporan-maintenance.csv',
      },
      {
        key: 'attendances' as const,
        title: 'Laporan Absensi Pengunjung Lab',
        desc: `${filteredData.attendances.length} kunjungan tercatat pada periode terpilih.`,
        headers: [
          'Tanggal',
          'Masuk',
          'Keluar',
          'Nama',
          'Peran',
          'Unit',
          'Kegiatan',
          'PC / Meja',
        ],
        rows: filteredData.attendances.map((a) => [
          a.date,
          a.checkInTime,
          a.checkOutTime || '-',
          a.visitorName,
          a.visitorRole,
          a.unit,
          a.activity,
          a.workstation || '-',
        ]),
        filename: 'laporan-absensi.csv',
      },
    ],
    [filteredData, goodAssets, needCare, broken]
  );

  const selectedReport =
    reportDefinitions.find((r) => r.key === activeCategory) ?? reportDefinitions[0];

  const periodLabel =
    startDate || endDate
      ? `${startDate || 'Awal'} s.d. ${endDate || 'Sekarang'}`
      : 'Semua Periode';

  return (
    <div className="space-y-5">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div>
          <h2 className="text-2xl font-bold tracking-tight text-slate-900">Laporan & Rekapitulasi</h2>
          <p className="text-sm text-slate-500 mt-0.5">
            Filter berdasarkan rentang tanggal, tinjau pratinjau data, unduh CSV, atau cetak berita acara resmi.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2 self-start sm:self-auto">
          <button
            type="button"
            onClick={() =>
              downloadCsv(selectedReport.filename, selectedReport.headers, selectedReport.rows)
            }
            className="px-3.5 py-2.5 rounded-xl border border-slate-200 bg-white hover:bg-slate-50 text-slate-700 text-sm font-semibold inline-flex items-center gap-1.5 cursor-pointer"
          >
            <Download className="w-4 h-4 text-blue-600" />
            Unduh CSV Terpilih
          </button>
          <button
            type="button"
            onClick={() => setPrintOpen(true)}
            className="px-4 py-2.5 rounded-xl bg-[#2563eb] hover:bg-[#1d4ed8] text-white text-sm font-semibold inline-flex items-center gap-1.5 cursor-pointer shadow-xs"
          >
            <Printer className="w-4 h-4" />
            Cetak Laporan Resmi
          </button>
        </div>
      </div>

      {/* Date Range Filter */}
      <div className="bg-white rounded-2xl border border-slate-200/90 p-4 flex flex-col lg:flex-row lg:items-center justify-between gap-4">
        <div className="flex flex-wrap items-center gap-3">
          <div>
            <label className="block text-[11px] font-medium text-slate-500 mb-1">
              Dari Tanggal
            </label>
            <input
              type="date"
              value={startDate}
              onChange={(e) => setStartDate(e.target.value)}
              className="px-3 py-1.5 rounded-xl border border-slate-200 text-sm bg-white"
            />
          </div>
          <div>
            <label className="block text-[11px] font-medium text-slate-500 mb-1">
              Sampai Tanggal
            </label>
            <input
              type="date"
              value={endDate}
              onChange={(e) => setEndDate(e.target.value)}
              className="px-3 py-1.5 rounded-xl border border-slate-200 text-sm bg-white"
            />
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-1 p-1 bg-slate-100 rounded-xl w-fit">
          {[
            { key: 'ALL', label: 'Semua' },
            { key: 'TODAY', label: 'Hari Ini' },
            { key: 'WEEK', label: '7 Hari' },
            { key: 'MONTH', label: 'Bulan Ini' },
          ].map((p) => (
            <button
              key={p.key}
              type="button"
              onClick={() => applyPreset(p.key as 'ALL' | 'TODAY' | 'WEEK' | 'MONTH')}
              className="px-3 py-1.5 text-xs font-semibold rounded-lg text-slate-700 hover:bg-white hover:shadow-xs transition-all cursor-pointer"
            >
              {p.label}
            </button>
          ))}
        </div>
      </div>

      {/* Category Switcher */}
      <div className="flex flex-wrap items-center gap-1 p-1 bg-slate-200/60 rounded-xl w-fit max-w-full overflow-x-auto">
        {reportDefinitions.map((rep) => (
          <button
            key={rep.key}
            type="button"
            onClick={() => setActiveCategory(rep.key)}
            className={`px-3.5 py-1.5 text-xs font-semibold rounded-lg transition-colors cursor-pointer whitespace-nowrap ${
              activeCategory === rep.key
                ? 'bg-white text-slate-900 shadow-xs'
                : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            {rep.title.replace('Laporan ', '')} ({rep.rows.length})
          </button>
        ))}
      </div>

      {/* Active Report Table Preview */}
      <div className="bg-white rounded-2xl border border-slate-200/90 overflow-hidden">
        <div className="px-5 py-4 border-b border-slate-100 flex flex-col sm:flex-row sm:items-center justify-between gap-2">
          <div>
            <h3 className="font-semibold text-slate-900">{selectedReport.title}</h3>
            <p className="text-xs text-slate-500 mt-0.5">
              Periode: {periodLabel} · {selectedReport.desc}
            </p>
          </div>
          <button
            type="button"
            onClick={() =>
              downloadCsv(selectedReport.filename, selectedReport.headers, selectedReport.rows)
            }
            className="px-3 py-1.5 rounded-lg bg-blue-50 hover:bg-blue-100 text-blue-700 text-xs font-semibold inline-flex items-center gap-1.5 cursor-pointer self-start sm:self-auto"
          >
            <Download className="w-3.5 h-3.5" />
            Ekspor CSV
          </button>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs">
            <thead className="bg-slate-50 border-b border-slate-200 text-[11px] uppercase tracking-wider text-slate-500">
              <tr>
                {selectedReport.headers.map((h) => (
                  <th key={h} className="px-4 py-3 font-semibold whitespace-nowrap">
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {selectedReport.rows.length === 0 ? (
                <tr>
                  <td
                    colSpan={selectedReport.headers.length}
                    className="px-4 py-10 text-center text-slate-500 text-sm"
                  >
                    Tidak ada data pada rentang tanggal yang dipilih.
                  </td>
                </tr>
              ) : (
                selectedReport.rows.slice(0, 50).map((row, idx) => (
                  <tr key={idx} className="hover:bg-slate-50/70">
                    {row.map((cell, ci) => (
                      <td key={ci} className="px-4 py-2.5 text-slate-700 whitespace-nowrap">
                        {cell}
                      </td>
                    ))}
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
        {selectedReport.rows.length > 50 && (
          <div className="px-5 py-2.5 bg-slate-50 border-t border-slate-100 text-xs text-slate-500">
            Menampilkan 50 baris pertama dari {selectedReport.rows.length} baris. Gunakan Unduh CSV
            atau Cetak Laporan Resmi untuk data lengkap.
          </div>
        )}
      </div>

      {/* Quick Export All List */}
      <div className="bg-white rounded-2xl border border-slate-200/90 divide-y divide-slate-100">
        {reportDefinitions.map((rep) => (
          <div
            key={rep.key}
            className="p-4 sm:p-5 flex flex-col sm:flex-row sm:items-center justify-between gap-3"
          >
            <div>
              <h4 className="font-semibold text-sm text-slate-900">{rep.title}</h4>
              <p className="text-xs text-slate-500 mt-0.5">{rep.desc}</p>
            </div>
            <button
              type="button"
              onClick={() => downloadCsv(rep.filename, rep.headers, rep.rows)}
              className="px-3.5 py-2 rounded-xl bg-blue-50 hover:bg-blue-100 text-blue-700 text-xs font-semibold inline-flex items-center gap-1.5 cursor-pointer self-start sm:self-auto whitespace-nowrap shrink-0"
            >
              <Download className="w-3.5 h-3.5" />
              Unduh CSV ({rep.rows.length})
            </button>
          </div>
        ))}
      </div>

      {/* Official Print Preview Modal */}
      {printOpen && (
        <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl border border-slate-200 shadow-2xl w-full max-w-4xl overflow-hidden flex flex-col max-h-[92vh]">
            <div className="flex items-center justify-between px-5 py-4 border-b border-slate-100">
              <h3 className="font-bold text-slate-900">Pratinjau Cetak {selectedReport.title}</h3>
              <button
                type="button"
                onClick={() => setPrintOpen(false)}
                className="p-1.5 rounded-lg text-slate-400 hover:text-slate-600 cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>
            <div className="p-6 overflow-y-auto bg-slate-50">
              <div data-print-root="true" className="bg-white p-6 rounded-xl text-slate-900 space-y-5">
                {/* Official Letterhead */}
                <div className="flex items-center gap-4 pb-4 border-b-2 border-slate-900">
                  {branding.logoDataUrl && (
                    <img
                      src={branding.logoDataUrl}
                      alt={branding.appName}
                      className="w-16 h-16 object-contain shrink-0"
                    />
                  )}
                  <div>
                    <div className="text-lg font-extrabold uppercase tracking-tight">
                      {branding.appName}
                    </div>
                    <div className="text-xs text-slate-600">{branding.appSubtitle}</div>
                    <div className="text-sm font-bold text-slate-900 mt-0.5">
                      {branding.schoolName}
                    </div>
                  </div>
                </div>

                <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-2">
                  <div>
                    <h4 className="text-base font-bold uppercase">{selectedReport.title}</h4>
                    <p className="text-xs text-slate-600">
                      Periode: {periodLabel} · Total Data: {selectedReport.rows.length} baris
                    </p>
                  </div>
                  <div className="text-xs text-slate-500 font-mono">Dicetak: {today}</div>
                </div>

                <table className="w-full text-left text-[11px] border-collapse border border-slate-300">
                  <thead>
                    <tr className="bg-slate-100">
                      <th className="border border-slate-300 px-2 py-1.5 font-semibold">No</th>
                      {selectedReport.headers.map((h) => (
                        <th key={h} className="border border-slate-300 px-2 py-1.5 font-semibold">
                          {h}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {selectedReport.rows.length === 0 ? (
                      <tr>
                        <td
                          colSpan={selectedReport.headers.length + 1}
                          className="border border-slate-300 px-3 py-6 text-center text-slate-500"
                        >
                          Tidak ada data pada periode ini.
                        </td>
                      </tr>
                    ) : (
                      selectedReport.rows.map((row, idx) => (
                        <tr key={idx}>
                          <td className="border border-slate-300 px-2 py-1.5 font-mono">
                            {idx + 1}
                          </td>
                          {row.map((cell, ci) => (
                            <td key={ci} className="border border-slate-300 px-2 py-1.5">
                              {cell}
                            </td>
                          ))}
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>

                <div className="grid grid-cols-2 gap-8 pt-6 text-center text-xs">
                  <div>
                    <div className="text-slate-600">Mengetahui,</div>
                    <div className="text-slate-600">Waka Sarpras / Kepala Lab</div>
                    <div className="h-16" />
                    <div className="font-semibold underline">( __________________________ )</div>
                  </div>
                  <div>
                    <div className="text-slate-600">Tanggal, {today}</div>
                    <div className="text-slate-600">Administrator / Teknisi Lab</div>
                    <div className="h-16" />
                    <div className="font-semibold underline">( __________________________ )</div>
                  </div>
                </div>
              </div>
            </div>
            <div className="px-5 py-3.5 bg-white border-t border-slate-100 flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setPrintOpen(false)}
                className="px-4 py-2 rounded-xl text-sm font-medium text-slate-600 hover:bg-slate-100 cursor-pointer"
              >
                Tutup
              </button>
              <button
                type="button"
                onClick={() => window.print()}
                className="px-4 py-2 rounded-xl text-sm font-semibold bg-[#2563eb] hover:bg-[#1d4ed8] text-white inline-flex items-center gap-1.5 cursor-pointer"
              >
                <Printer className="w-4 h-4" />
                Cetak / Simpan PDF
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
