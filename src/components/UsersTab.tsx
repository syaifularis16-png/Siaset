import React, { useState } from 'react';
import { Eye, EyeOff, Pencil, Trash2, UserPlus, X } from 'lucide-react';
import { apiFetch } from '../lib/api';
import { SYSTEM_ROLES, type SystemRole, type UserInvite, type UserProfile } from '../types';

interface UsersTabProps {
  users: UserProfile[];
  invites?: UserInvite[];
  currentUserId: string;
  onRefresh: () => Promise<void>;
  onNotify: (msg: string, type?: 'success' | 'error') => void;
}

export const UsersTab: React.FC<UsersTabProps> = ({
  users,
  invites = [],
  currentUserId,
  onRefresh,
  onNotify,
}) => {
  const [modalOpen, setModalOpen] = useState(false);
  const [editingKind, setEditingKind] = useState<'user' | 'invite' | null>(null);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [displayName, setDisplayName] = useState('');
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [role, setRole] = useState<SystemRole>('guru');
  const [unit, setUnit] = useState('');
  const [idNumber, setIdNumber] = useState('');
  const [email, setEmail] = useState('');
  const [phone, setPhone] = useState('');
  const [bio, setBio] = useState('');
  const [active, setActive] = useState(true);
  const [saving, setSaving] = useState(false);

  const openCreate = () => {
    setEditingKind(null);
    setEditingId(null);
    setDisplayName('');
    setUsername('');
    setPassword('');
    setShowPassword(false);
    setRole('guru');
    setUnit('');
    setIdNumber('');
    setEmail('');
    setPhone('');
    setBio('');
    setActive(true);
    setModalOpen(true);
  };

  const openEditUser = (u: UserProfile) => {
    setEditingKind('user');
    setEditingId(u.uid);
    setDisplayName(u.displayName);
    setUsername(u.username);
    setPassword('');
    setShowPassword(false);
    setRole(u.role);
    setUnit(u.unit);
    setIdNumber(u.idNumber);
    setEmail('');
    setPhone('');
    setBio(u.bio);
    setActive(u.active);
    setModalOpen(true);
  };

  const openEditInvite = (inv: UserInvite) => {
    setEditingKind('invite');
    setEditingId(inv.id);
    setDisplayName(inv.displayName);
    setUsername(inv.username);
    setPassword('');
    setShowPassword(false);
    setRole(inv.role);
    setUnit(inv.unit);
    setIdNumber(inv.idNumber);
    setEmail(inv.email);
    setPhone(inv.phone);
    setBio(inv.bio);
    setActive(inv.active);
    setModalOpen(true);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    try {
      if (editingKind === 'user' && editingId) {
        await apiFetch(`/api/users/${editingId}`, {
          method: 'PUT',
          body: JSON.stringify({
            displayName,
            username,
            role,
            unit,
            idNumber,
            bio,
            active,
            ...(editingId === currentUserId && password ? { password } : {}),
          }),
        });
        onNotify('Akun pengguna berhasil diperbarui.');
      } else if (editingKind === 'invite' && editingId) {
        await apiFetch(`/api/invites/${editingId}`, {
          method: 'PUT',
          body: JSON.stringify({
            displayName,
            username,
            role,
            unit,
            idNumber,
            phone,
            bio,
            active,
          }),
        });
        onNotify('Undangan akun berhasil diperbarui.');
      } else {
        const res = await apiFetch<{ id: string; createdDirect?: boolean }>('/api/users', {
          method: 'POST',
          body: JSON.stringify({
            displayName,
            username,
            password,
            role,
            unit,
            idNumber,
            email,
            phone,
            bio,
            active,
          }),
        });
        onNotify(
          res.createdDirect
            ? `Akun ${displayName} berhasil dibuat dan langsung dapat masuk menggunakan username & password.`
            : 'Undangan akun berhasil ditambahkan. Pengguna dapat masuk dengan akun Google tersebut.'
        );
      }
      setModalOpen(false);
      await onRefresh();
    } catch (err) {
      onNotify(err instanceof Error ? err.message : 'Gagal menyimpan pengguna.', 'error');
    } finally {
      setSaving(false);
    }
  };

  const handleDeleteUser = async (u: UserProfile) => {
    try {
      await apiFetch(`/api/users/${u.uid}`, { method: 'DELETE' });
      onNotify(`Akun ${u.displayName} dihapus.`);
      await onRefresh();
    } catch (err) {
      onNotify(err instanceof Error ? err.message : 'Gagal menghapus pengguna.', 'error');
    }
  };

  const handleDeleteInvite = async (inv: UserInvite) => {
    try {
      await apiFetch(`/api/invites/${inv.id}`, { method: 'DELETE' });
      onNotify(`Undangan untuk ${inv.email} dihapus.`);
      await onRefresh();
    } catch (err) {
      onNotify(err instanceof Error ? err.message : 'Gagal menghapus undangan.', 'error');
    }
  };

  const isEditingOwnUser = editingKind === 'user' && editingId === currentUserId;
  const isEditingOtherUser = editingKind === 'user' && editingId !== currentUserId;

  return (
    <div className="space-y-5">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div>
          <h2 className="text-lg font-bold text-slate-900">Manajemen Pengguna</h2>
          <p className="text-sm text-slate-500">
            Kelola akun akses guru, siswa, teknisi, dan administrator SIPALAK.
          </p>
        </div>
        <button
          type="button"
          onClick={openCreate}
          className="px-4 py-2 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white text-sm font-semibold inline-flex items-center gap-1.5 cursor-pointer self-start sm:self-auto"
        >
          <UserPlus className="w-4 h-4" />
          Tambah Pengguna
        </button>
      </div>

      <div className="bg-white rounded-2xl border border-slate-200 overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm">
            <thead className="bg-slate-50 border-b border-slate-200 text-xs uppercase text-slate-500">
              <tr>
                <th className="px-4 py-3 font-semibold">Nama & Identitas</th>
                <th className="px-4 py-3 font-semibold">Peran</th>
                <th className="px-4 py-3 font-semibold">Unit / Kelas</th>
                <th className="px-4 py-3 font-semibold">NIP / NIS</th>
                <th className="px-4 py-3 font-semibold">Password</th>
                <th className="px-4 py-3 font-semibold">Status</th>
                <th className="px-4 py-3 font-semibold text-right">Aksi</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {users.map((u) => (
                <tr key={u.uid} className="hover:bg-slate-50/70">
                  <td className="px-4 py-3">
                    <div className="font-semibold text-slate-900">{u.displayName}</div>
                    <div className="font-mono text-xs text-slate-500">
                      {u.username ? `@${u.username}` : u.uid.slice(0, 12)}
                    </div>
                  </td>
                  <td className="px-4 py-3 capitalize font-medium text-slate-700">{u.role}</td>
                  <td className="px-4 py-3 text-slate-600">{u.unit || '—'}</td>
                  <td className="px-4 py-3 font-mono text-xs text-slate-600">
                    {u.idNumber || '—'}
                  </td>
                  <td className="px-4 py-3 text-xs text-slate-600">
                    {u.username ? (
                      <span className="font-mono tracking-wider text-slate-700">••••••</span>
                    ) : (
                      <span className="text-slate-400">Login Google</span>
                    )}
                  </td>
                  <td className="px-4 py-3">
                    <span
                      className={`inline-block px-2.5 py-0.5 rounded-md text-xs font-medium border ${
                        u.active
                          ? 'bg-emerald-50 text-emerald-700 border-emerald-200'
                          : 'bg-slate-100 text-slate-500 border-slate-200'
                      }`}
                    >
                      {u.active ? 'Aktif' : 'Nonaktif'}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-right">
                    <div className="inline-flex items-center gap-1">
                      <button
                        type="button"
                        onClick={() => openEditUser(u)}
                        className="p-1.5 rounded-lg text-slate-500 hover:text-indigo-600 hover:bg-indigo-50 cursor-pointer"
                      >
                        <Pencil className="w-4 h-4" />
                      </button>
                      {u.uid !== currentUserId && (
                        <button
                          type="button"
                          onClick={() => handleDeleteUser(u)}
                          className="p-1.5 rounded-lg text-slate-500 hover:text-rose-600 hover:bg-rose-50 cursor-pointer"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
              {invites.map((inv) => (
                <tr key={`invite-${inv.id}`} className="hover:bg-slate-50/70 bg-amber-50/25">
                  <td className="px-4 py-3">
                    <div className="font-semibold text-slate-900">{inv.displayName}</div>
                    <div className="font-mono text-xs text-slate-500">{inv.email}</div>
                  </td>
                  <td className="px-4 py-3 capitalize font-medium text-slate-700">{inv.role}</td>
                  <td className="px-4 py-3 text-slate-600">{inv.unit || '—'}</td>
                  <td className="px-4 py-3 font-mono text-xs text-slate-600">
                    {inv.idNumber || '—'}
                  </td>
                  <td className="px-4 py-3 text-xs text-slate-400">Belum diatur</td>
                  <td className="px-4 py-3">
                    <span className="inline-block px-2.5 py-0.5 rounded-md text-xs font-medium border bg-amber-50 text-amber-700 border-amber-200">
                      Menunggu Login Google
                    </span>
                  </td>
                  <td className="px-4 py-3 text-right">
                    <div className="inline-flex items-center gap-1">
                      <button
                        type="button"
                        onClick={() => openEditInvite(inv)}
                        className="p-1.5 rounded-lg text-slate-500 hover:text-indigo-600 hover:bg-indigo-50 cursor-pointer"
                      >
                        <Pencil className="w-4 h-4" />
                      </button>
                      <button
                        type="button"
                        onClick={() => handleDeleteInvite(inv)}
                        className="p-1.5 rounded-lg text-slate-500 hover:text-rose-600 hover:bg-rose-50 cursor-pointer"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {modalOpen && (
        <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl border border-slate-200 shadow-2xl w-full max-w-lg overflow-hidden">
            <div className="flex items-center justify-between px-5 py-4 border-b border-slate-100">
              <h3 className="font-bold text-slate-900">
                {editingKind === 'user'
                  ? 'Edit Akun Pengguna'
                  : editingKind === 'invite'
                    ? 'Edit Undangan Akun'
                    : 'Tambah Akun Pengguna'}
              </h3>
              <button
                type="button"
                onClick={() => setModalOpen(false)}
                className="p-1.5 rounded-lg text-slate-400 hover:text-slate-600 cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>
            <form onSubmit={handleSubmit} className="p-5 space-y-3.5 max-h-[82vh] overflow-y-auto">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-medium text-slate-700 mb-1">
                    Nama Lengkap *
                  </label>
                  <input
                    type="text"
                    required
                    value={displayName}
                    onChange={(e) => setDisplayName(e.target.value)}
                    className="w-full px-3 py-2 rounded-xl border border-slate-200 text-sm"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-slate-700 mb-1">
                    Username {!editingKind && password ? '*' : '(Opsional)'}
                  </label>
                  <input
                    type="text"
                    required={!editingKind && Boolean(password)}
                    value={username}
                    onChange={(e) => setUsername(e.target.value)}
                    placeholder="cth. budi.guru"
                    className="w-full px-3 py-2 rounded-xl border border-slate-200 text-sm font-mono"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-slate-700 mb-1">
                    Peran Akses *
                  </label>
                  <select
                    value={role}
                    onChange={(e) => setRole(e.target.value as SystemRole)}
                    className="w-full px-3 py-2 rounded-xl border border-slate-200 text-sm bg-white"
                  >
                    {SYSTEM_ROLES.map((r) => (
                      <option key={r.value} value={r.value}>
                        {r.label}
                      </option>
                    ))}
                  </select>
                </div>
                {!editingKind && (
                  <div>
                    <label className="block text-xs font-medium text-slate-700 mb-1">
                      Email Google {!password ? '*' : '(Opsional)'}
                    </label>
                    <input
                      type="email"
                      required={!password}
                      value={email}
                      onChange={(e) => setEmail(e.target.value)}
                      placeholder="nama@guru.sma.belajar.id"
                      className="w-full px-3 py-2 rounded-xl border border-slate-200 text-sm"
                    />
                  </div>
                )}
                {editingKind === 'invite' && (
                  <div>
                    <label className="block text-xs font-medium text-slate-700 mb-1">
                      Email Google
                    </label>
                    <input
                      type="email"
                      disabled
                      value={email}
                      className="w-full px-3 py-2 rounded-xl border border-slate-200 bg-slate-50 text-sm text-slate-500"
                    />
                  </div>
                )}

                {(!editingKind || isEditingOwnUser) && (
                  <div className="sm:col-span-2">
                    <label className="block text-xs font-medium text-slate-700 mb-1">
                      {isEditingOwnUser
                        ? 'Password Baru (Opsional)'
                        : 'Password (Min. 6 karakter)'}
                    </label>
                    <div className="relative">
                      <input
                        type={showPassword ? 'text' : 'password'}
                        minLength={6}
                        value={password}
                        onChange={(e) => setPassword(e.target.value)}
                        placeholder={
                          isEditingOwnUser
                            ? 'Kosongkan jika tidak ingin mengubah password'
                            : 'Isi agar akun bisa langsung login dengan Username + Password'
                        }
                        className="w-full pl-3 pr-10 py-2 rounded-xl border border-slate-200 text-sm"
                      />
                      <button
                        type="button"
                        onClick={() => setShowPassword((v) => !v)}
                        className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-500 hover:text-slate-800 cursor-pointer"
                        aria-label={showPassword ? 'Sembunyikan password' : 'Lihat password'}
                      >
                        {showPassword ? (
                          <EyeOff className="w-4 h-4" />
                        ) : (
                          <Eye className="w-4 h-4" />
                        )}
                      </button>
                    </div>
                    {!editingKind && (
                      <p className="text-[11px] text-slate-400 mt-1">
                        Jika password diisi, akun langsung aktif tanpa perlu login Google. Jika
                        dikosongkan, pengguna akan masuk memakai Email Google.
                      </p>
                    )}
                  </div>
                )}

                {isEditingOtherUser && (
                  <div className="sm:col-span-2">
                    <label className="block text-xs font-medium text-slate-700 mb-1">
                      Password
                    </label>
                    <input
                      type="password"
                      disabled
                      value="••••••••"
                      className="w-full px-3 py-2 rounded-xl border border-slate-200 bg-slate-50 text-sm text-slate-400"
                    />
                    <p className="text-[11px] text-slate-400 mt-1">
                      Demi keamanan, password akun lain hanya dapat diatur saat pembuatan akun atau
                      diubah oleh pemiliknya di menu Profil Saya.
                    </p>
                  </div>
                )}

                <div>
                  <label className="block text-xs font-medium text-slate-700 mb-1">
                    Unit / Kelas
                  </label>
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
                {editingKind !== 'user' && (
                  <div className="sm:col-span-2">
                    <label className="block text-xs font-medium text-slate-700 mb-1">
                      No. Telepon
                    </label>
                    <input
                      type="text"
                      value={phone}
                      onChange={(e) => setPhone(e.target.value)}
                      className="w-full px-3 py-2 rounded-xl border border-slate-200 text-sm"
                    />
                  </div>
                )}
              </div>

              <div>
                <label className="block text-xs font-medium text-slate-700 mb-1">Bio / Catatan</label>
                <input
                  type="text"
                  value={bio}
                  onChange={(e) => setBio(e.target.value)}
                  className="w-full px-3 py-2 rounded-xl border border-slate-200 text-sm"
                />
              </div>

              <label className="flex items-center gap-2 text-xs text-slate-700 cursor-pointer">
                <input
                  type="checkbox"
                  checked={active}
                  onChange={(e) => setActive(e.target.checked)}
                  className="rounded border-slate-300"
                />
                Akun aktif (dapat masuk ke sistem)
              </label>

              <div className="pt-2 flex justify-end gap-2">
                <button
                  type="button"
                  onClick={() => setModalOpen(false)}
                  className="px-4 py-2 rounded-xl text-sm font-medium text-slate-600 hover:bg-slate-100 cursor-pointer"
                >
                  Batal
                </button>
                <button
                  type="submit"
                  disabled={saving}
                  className="px-4 py-2 rounded-xl text-sm font-semibold bg-indigo-600 hover:bg-indigo-700 disabled:opacity-60 text-white cursor-pointer"
                >
                  {saving ? 'Menyimpan...' : 'Simpan Akun'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
