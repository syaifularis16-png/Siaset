import React, { useState } from 'react';
import { Save } from 'lucide-react';
import { authApi } from '../lib/api';
import type { SystemRole, UserPrivateInfo, UserProfile } from '../types';

interface ProfileTabProps {
  profile: UserProfile;
  privateInfo: UserPrivateInfo;
  onProfileUpdated: (profile: UserProfile, privateInfo: UserPrivateInfo) => void;
  onNotify: (msg: string, type?: 'success' | 'error') => void;
}

const SELF_ROLES: { value: SystemRole; label: string }[] = [
  { value: 'guru', label: 'Guru' },
  { value: 'siswa', label: 'Siswa' },
  { value: 'pengguna', label: 'Pengguna Umum' },
];

export const ProfileTab: React.FC<ProfileTabProps> = ({
  profile,
  privateInfo,
  onProfileUpdated,
  onNotify,
}) => {
  const [displayName, setDisplayName] = useState(profile.displayName);
  const [username, setUsername] = useState(profile.username);
  const [role, setRole] = useState<SystemRole>(profile.role);
  const [unit, setUnit] = useState(profile.unit);
  const [idNumber, setIdNumber] = useState(profile.idNumber);
  const [email, setEmail] = useState(privateInfo.email);
  const [phone, setPhone] = useState(privateInfo.phone);
  const [bio, setBio] = useState(profile.bio);
  const [newPassword, setNewPassword] = useState('');
  const [saving, setSaving] = useState(false);

  const canChangeSelfRole =
    profile.role === 'guru' || profile.role === 'siswa' || profile.role === 'pengguna';

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    try {
      const res = await authApi.updateProfile({
        displayName,
        username,
        unit,
        idNumber,
        email,
        phone,
        bio,
        ...(newPassword ? { newPassword } : {}),
        ...(canChangeSelfRole ? { role } : {}),
      });
      setNewPassword('');
      onProfileUpdated(res.profile, res.privateInfo);
      onNotify(
        res.passwordUpdated
          ? 'Profil dan kata sandi login Anda berhasil diperbarui.'
          : 'Profil Anda berhasil diperbarui.'
      );
    } catch (err) {
      onNotify(err instanceof Error ? err.message : 'Gagal memperbarui profil.', 'error');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="max-w-2xl space-y-5">
      <div>
        <h2 className="text-lg font-bold text-slate-900">Profil Pengguna</h2>
        <p className="text-sm text-slate-500">
          Perbarui identitas operasional dan informasi kontak pribadi Anda.
        </p>
      </div>

      <form
        onSubmit={handleSubmit}
        className="bg-white rounded-2xl border border-slate-200 p-6 space-y-4"
      >
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div>
            <label className="block text-xs font-medium text-slate-700 mb-1">Nama Lengkap *</label>
            <input
              type="text"
              required
              value={displayName}
              onChange={(e) => setDisplayName(e.target.value)}
              className="w-full px-3 py-2 rounded-xl border border-slate-200 text-sm"
            />
          </div>
          <div>
            <label className="block text-xs font-medium text-slate-700 mb-1">Username</label>
            <input
              type="text"
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              className="w-full px-3 py-2 rounded-xl border border-slate-200 text-sm font-mono"
            />
          </div>
          <div>
            <label className="block text-xs font-medium text-slate-700 mb-1">Peran</label>
            {canChangeSelfRole ? (
              <select
                value={role}
                onChange={(e) => setRole(e.target.value as SystemRole)}
                className="w-full px-3 py-2 rounded-xl border border-slate-200 text-sm bg-white"
              >
                {SELF_ROLES.map((r) => (
                  <option key={r.value} value={r.value}>
                    {r.label}
                  </option>
                ))}
              </select>
            ) : (
              <input
                type="text"
                disabled
                value={profile.role}
                className="w-full px-3 py-2 rounded-xl border border-slate-200 bg-slate-50 text-sm capitalize text-slate-500"
              />
            )}
          </div>
          <div>
            <label className="block text-xs font-medium text-slate-700 mb-1">Unit / Kelas</label>
            <input
              type="text"
              value={unit}
              onChange={(e) => setUnit(e.target.value)}
              className="w-full px-3 py-2 rounded-xl border border-slate-200 text-sm"
            />
          </div>
          <div>
            <label className="block text-xs font-medium text-slate-700 mb-1">NIP / NIS</label>
            <input
              type="text"
              value={idNumber}
              onChange={(e) => setIdNumber(e.target.value)}
              className="w-full px-3 py-2 rounded-xl border border-slate-200 text-sm font-mono"
            />
          </div>
          <div>
            <label className="block text-xs font-medium text-slate-700 mb-1">Email</label>
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="w-full px-3 py-2 rounded-xl border border-slate-200 text-sm"
            />
          </div>
          <div className="sm:col-span-2">
            <label className="block text-xs font-medium text-slate-700 mb-1">No. Telepon</label>
            <input
              type="text"
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
              className="w-full px-3 py-2 rounded-xl border border-slate-200 text-sm"
            />
          </div>
        </div>

        <div>
          <label className="block text-xs font-medium text-slate-700 mb-1">Bio Singkat</label>
          <textarea
            rows={2}
            value={bio}
            onChange={(e) => setBio(e.target.value)}
            className="w-full px-3 py-2 rounded-xl border border-slate-200 text-sm"
          />
        </div>

        <div>
          <label className="block text-xs font-medium text-slate-700 mb-1">
            Kata Sandi Login (Opsional)
          </label>
          <input
            type="password"
            minLength={6}
            value={newPassword}
            onChange={(e) => setNewPassword(e.target.value)}
            placeholder="Isi min. 6 karakter untuk mengatur / mengubah kata sandi masuk"
            className="w-full px-3 py-2 rounded-xl border border-slate-200 text-sm"
          />
          <p className="text-[11px] text-slate-400 mt-1">
            Jika diisi, Anda dapat masuk memakai Username ({username || 'username'}) beserta kata sandi ini dari perangkat mana saja.
          </p>
        </div>

        <div className="pt-2 flex justify-end">
          <button
            type="submit"
            disabled={saving}
            className="px-5 py-2.5 rounded-xl bg-indigo-600 hover:bg-indigo-700 disabled:opacity-60 text-white text-sm font-semibold inline-flex items-center gap-2 cursor-pointer"
          >
            <Save className="w-4 h-4" />
            {saving ? 'Menyimpan...' : 'Simpan Perubahan'}
          </button>
        </div>
      </form>
    </div>
  );
};
