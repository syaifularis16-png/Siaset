import React from 'react';
import { Download } from 'lucide-react';
import type { AppDataSnapshot } from '../types';

interface ReportsTabProps {
  data: AppDataSnapshot;
}

function downloadCsv(filename: string, headers: string[], rows: Array<Array<string | number>>) {
  const escape = (val: string | number) => {
    const s = String(val ?? '');
    if (/[",\n]/.test(s)) return `"${s.replace(/"/g, '""')}"`;
    return s;
  };
  const csv = [headers.map(escape).join(','), ...rows.map((r) => r.map(escape).join(','))].join(
    '\n'
  );
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  link.click();
  URL.revokeObjectURL(url);
}

export const ReportsTab: React.FC<ReportsTabProps> = ({ data }) => {
  const goodAssets = data.assets.filter((a) => a.condition === 'Baik').length;
  const needCare = data.assets.filter((a) => a.condition === 'Perlu perawatan').length;
  const broken = data.assets.filter((a) => a.condition === 'Rusak').length;

  const reports = [
    {
      title: 'Laporan Inventaris Aset',
      desc: `${data.assets.length} perangkat terdaftar (${goodAssets} baik, ${needCare} perlu perawatan, ${broken} rusak).`,
      filename: 'laporan-inventaris-sipalak.csv',
      onExport: () =>
        downloadCsv(
          'laporan-inventaris-sipalak.csv',
          ['Kode', 'Nama Aset', 'Kategori', 'Merek', 'Kondisi', 'Lokasi', 'Sumber Dana', 'Tahun'],
          data.assets.map((a) => [
            a.code,
            a.name,
            a.category,
            a.brand,
            a.condition,
            a.location,
            a.fundingSource,
            a.procurementYear,
          ])
        ),
    },
    {
      title: 'Laporan Peminjaman Perangkat',
      desc: `${data.loans.length} total transaksi peminjaman tercatat.`,
      filename: 'laporan-peminjaman-sipalak.csv',
      onExport: () =>
        downloadCsv(
          'laporan-peminjaman-sipalak.csv',
          ['Kode Aset', 'Nama Aset', 'Peminjam', 'Peran', 'Unit', 'Pinjam', 'Kembali', 'Jam ke-', 'Waktu', 'Status', 'Keperluan'],
          data.loans.map((l) => [
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
          ])
        ),
    },
    {
      title: 'Laporan Jadwal Penggunaan Lab',
      desc: `${data.schedules.length} total jadwal praktik laboratorium.`,
      filename: 'laporan-jadwal-sipalak.csv',
      onExport: () =>
        downloadCsv(
          'laporan-jadwal-sipalak.csv',
          ['Tanggal', 'Mulai', 'Selesai', 'Kegiatan', 'Penanggung Jawab', 'Peran', 'Unit', 'Status'],
          data.schedules.map((s) => [
            s.date,
            s.startTime,
            s.endTime,
            s.activity,
            s.requesterName,
            s.requesterRole,
            s.unit,
            s.status,
          ])
        ),
    },
    {
      title: 'Laporan Maintenance & Perbaikan',
      desc: `${data.maintenances.length} total catatan perawatan perangkat.`,
      filename: 'laporan-maintenance-sipalak.csv',
      onExport: () =>
        downloadCsv(
          'laporan-maintenance-sipalak.csv',
          ['Tanggal', 'Kode Aset', 'Nama Aset', 'Keluhan', 'Tindakan', 'Teknisi', 'Status', 'Kondisi Hasil'],
          data.maintenances.map((m) => [
            m.maintenanceDate,
            m.assetCode,
            m.assetName,
            m.issue,
            m.actionTaken,
            m.technicianName,
            m.status,
            m.resultingCondition,
          ])
        ),
    },
    {
      title: 'Laporan Absensi Pengunjung Lab',
      desc: `${data.attendances.length} total catatan kehadiran pengunjung lab.`,
      filename: 'laporan-absensi-sipalak.csv',
      onExport: () =>
        downloadCsv(
          'laporan-absensi-sipalak.csv',
          ['Tanggal', 'Masuk', 'Keluar', 'Nama', 'Peran', 'Unit', 'Kegiatan', 'PC / Meja'],
          data.attendances.map((a) => [
            a.date,
            a.checkInTime,
            a.checkOutTime || '-',
            a.visitorName,
            a.visitorRole,
            a.unit,
            a.activity,
            a.workstation || '-',
          ])
        ),
    },
  ];

  return (
    <div className="space-y-5">
      <div>
        <h2 className="text-2xl font-bold tracking-tight text-slate-900">Laporan</h2>
        <p className="text-sm text-slate-500 mt-0.5">
          Rekapitulasi operasional laboratorium dan ekspor data ke format CSV.
        </p>
      </div>

      <div className="bg-white rounded-2xl border border-slate-200/90 divide-y divide-slate-100">
        {reports.map((rep) => (
          <div
            key={rep.title}
            className="p-5 flex flex-col sm:flex-row sm:items-center justify-between gap-4"
          >
            <div>
              <h3 className="font-semibold text-slate-900">{rep.title}</h3>
              <p className="text-sm text-slate-500 mt-0.5">{rep.desc}</p>
            </div>
            <button
              type="button"
              onClick={rep.onExport}
              className="px-4 py-2 rounded-xl bg-blue-50 hover:bg-blue-100 text-blue-700 text-xs font-semibold inline-flex items-center gap-1.5 cursor-pointer self-start sm:self-auto whitespace-nowrap shrink-0"
            >
              <Download className="w-4 h-4" />
              Unduh CSV
            </button>
          </div>
        ))}
      </div>
    </div>
  );
};
