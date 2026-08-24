/**
 * Platform Users Panel
 *
 * Lets a platform admin create and manage other platform-level staff:
 * additional platform admins, and marketers (who only ever see the tenants
 * assigned to them - see the "Referred by" column on the Tenants tab).
 *
 * Creating another root superadmin is not exposed here on purpose - that
 * account is provisioned once via the create_platform_admin management
 * command, not spawned casually through a web form.
 */

import React, { useEffect, useState } from 'react';
import { Plus, Trash2, Edit2, X, Loader2, AlertCircle, UserCog, Megaphone, ShieldCheck, Copy, Check } from 'lucide-react';
import api from '@/services/api';

interface PlatformUser {
  id: number;
  username: string;
  email: string;
  first_name: string;
  last_name: string;
  full_name: string;
  role: 'superadmin' | 'platform_admin' | 'marketer';
  is_active: boolean;
  date_joined: string;
  referred_tenant_count: number;
  referral_code: string | null;
}

interface FormState {
  id?: number;
  username: string;
  email: string;
  first_name: string;
  last_name: string;
  role: 'platform_admin' | 'marketer';
  password: string;
  is_active: boolean;
}

const EMPTY_FORM: FormState = {
  username: '', email: '', first_name: '', last_name: '',
  role: 'marketer', password: '', is_active: true,
};

const roleBadge = (role: PlatformUser['role']) => {
  if (role === 'superadmin')
    return <span className="inline-flex items-center gap-1 px-2 py-0.5 text-xs font-medium bg-gray-900 text-white rounded-full"><ShieldCheck className="w-3 h-3" />Superadmin</span>;
  if (role === 'platform_admin')
    return <span className="inline-flex items-center gap-1 px-2 py-0.5 text-xs font-medium bg-gray-100 text-gray-700 rounded-full"><UserCog className="w-3 h-3" />Platform Admin</span>;
  return <span className="inline-flex items-center gap-1 px-2 py-0.5 text-xs font-medium border border-gray-300 text-gray-600 rounded-full"><Megaphone className="w-3 h-3" />Marketer</span>;
};

const inputCls = "w-full px-3 py-2 border border-gray-300 rounded-lg text-sm text-gray-900 placeholder:text-gray-400 focus:outline-none focus:ring-2 focus:ring-black focus:border-black";

const PlatformUsersPanel: React.FC = () => {
  const [users, setUsers] = useState<PlatformUser[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [form, setForm] = useState<FormState | null>(null);
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const [deletingId, setDeletingId] = useState<number | null>(null);
  const [copiedId, setCopiedId] = useState<number | null>(null);

  const handleCopyReferralLink = async (u: PlatformUser) => {
    if (!u.referral_code) return;
    const link = `${window.location.origin}/onboarding/register?ref=${u.referral_code}`;
    try {
      await navigator.clipboard.writeText(link);
      setCopiedId(u.id);
      setTimeout(() => setCopiedId(null), 2000);
    } catch {
      // Clipboard API unavailable - soft failure, nothing else to do here.
    }
  };

  const load = async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await api.get('/api/tenants/platform-users/');
      setUsers(Array.isArray(res) ? res : res?.results ?? []);
    } catch (err: any) {
      setError(err?.message || 'Failed to load platform users.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(); }, []);

  const openCreate = () => { setForm({ ...EMPTY_FORM }); setFormError(null); };
  const openEdit = (u: PlatformUser) => {
    setForm({
      id: u.id, username: u.username, email: u.email,
      first_name: u.first_name, last_name: u.last_name,
      role: u.role === 'superadmin' ? 'platform_admin' : u.role,
      password: '', is_active: u.is_active,
    });
    setFormError(null);
  };
  const closeForm = () => setForm(null);

  const handleSave = async () => {
    if (!form) return;
    if (!form.username.trim() || !form.email.trim()) {
      setFormError('Username and email are required.');
      return;
    }
    if (!form.id && !form.password.trim()) {
      setFormError('Set a password for the new account.');
      return;
    }

    setSaving(true);
    setFormError(null);
    try {
      const payload: any = {
        username: form.username.trim(),
        email: form.email.trim(),
        first_name: form.first_name.trim(),
        last_name: form.last_name.trim(),
        role: form.role,
        is_active: form.is_active,
      };
      if (form.password.trim()) payload.password = form.password.trim();

      if (form.id) {
        await api.patch(`/api/tenants/platform-users/${form.id}/`, payload);
      } else {
        await api.post('/api/tenants/platform-users/', payload);
      }
      setForm(null);
      await load();
    } catch (err: any) {
      const data = err?.response?.data;
      const msg = data
        ? Object.entries(data).map(([k, v]) => `${k}: ${Array.isArray(v) ? v.join(', ') : v}`).join(' — ')
        : err?.message || 'Failed to save. Please try again.';
      setFormError(msg);
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (u: PlatformUser) => {
    if (!window.confirm(`Remove ${u.full_name || u.username} from the platform? This can't be undone.`)) return;
    setDeletingId(u.id);
    try {
      await api.delete(`/api/tenants/platform-users/${u.id}/`);
      await load();
    } catch (err: any) {
      setError(err?.response?.data?.detail || err?.message || 'Failed to remove user.');
    } finally {
      setDeletingId(null);
    }
  };

  return (
    <div className="space-y-4">
      {error && (
        <div className="flex items-start gap-2.5 bg-white border border-gray-200 rounded-xl p-4 text-sm text-gray-800">
          <AlertCircle className="w-4 h-4 mt-0.5 shrink-0 text-gray-500" />
          <p>{error}</p>
        </div>
      )}

      <div className="flex items-center justify-between">
        <h2 className="text-xs font-semibold uppercase tracking-wider text-gray-400">
          Platform Users ({loading ? '…' : users.length})
        </h2>
        <button
          onClick={openCreate}
          className="flex items-center gap-1.5 px-3 py-1.5 bg-black text-white text-xs font-semibold rounded-lg hover:bg-gray-800 transition-colors"
        >
          <Plus className="w-3.5 h-3.5" /> New Platform User
        </button>
      </div>

      <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
        {loading ? (
          <div className="py-16 flex justify-center"><Loader2 className="w-6 h-6 text-gray-400 animate-spin" /></div>
        ) : users.length === 0 ? (
          <div className="py-16 text-center">
            <p className="text-sm text-gray-500">No platform users yet.</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-gray-50 border-b border-gray-100">
                  {['User', 'Role', 'Referred Tenants', 'Status', 'Joined', 'Actions'].map(h => (
                    <th key={h} className="px-5 py-3 text-left text-xs font-semibold uppercase tracking-wider text-gray-500">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {users.map(u => (
                  <tr key={u.id} className="hover:bg-gray-50 transition-colors">
                    <td className="px-5 py-3.5">
                      <p className="text-sm font-semibold text-gray-900">{u.full_name}</p>
                      <p className="text-xs text-gray-500">{u.email || u.username}</p>
                      {u.role === 'marketer' && u.referral_code && (
                        <button
                          onClick={() => handleCopyReferralLink(u)}
                          className="mt-1 inline-flex items-center gap-1 text-xs text-gray-400 hover:text-gray-700 transition-colors"
                          title="Copy this marketer's affiliate link"
                        >
                          {copiedId === u.id ? <Check className="w-3 h-3" /> : <Copy className="w-3 h-3" />}
                          {copiedId === u.id ? 'Link copied' : u.referral_code}
                        </button>
                      )}
                    </td>
                    <td className="px-5 py-3.5">{roleBadge(u.role)}</td>
                    <td className="px-5 py-3.5 text-gray-700">{u.role === 'marketer' ? u.referred_tenant_count : '—'}</td>
                    <td className="px-5 py-3.5">
                      <span className={`inline-flex px-2 py-0.5 text-xs font-medium rounded-full ${u.is_active ? 'bg-gray-900 text-white' : 'bg-gray-100 text-gray-500'}`}>
                        {u.is_active ? 'Active' : 'Inactive'}
                      </span>
                    </td>
                    <td className="px-5 py-3.5 text-gray-500 text-xs">{new Date(u.date_joined).toLocaleDateString()}</td>
                    <td className="px-5 py-3.5">
                      <div className="flex items-center gap-1">
                        <button onClick={() => openEdit(u)} className="p-1.5 text-gray-400 hover:text-gray-800 hover:bg-gray-100 rounded-lg transition-colors" title="Edit">
                          <Edit2 className="w-3.5 h-3.5" />
                        </button>
                        {u.role !== 'superadmin' && (
                          <button
                            onClick={() => handleDelete(u)}
                            disabled={deletingId === u.id}
                            className="p-1.5 text-gray-400 hover:text-gray-800 hover:bg-gray-100 rounded-lg transition-colors disabled:opacity-50"
                            title="Remove"
                          >
                            {deletingId === u.id ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Trash2 className="w-3.5 h-3.5" />}
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Create / edit modal */}
      {form && (
        <div className="fixed inset-0 bg-black/60 flex items-end sm:items-center justify-center z-50 p-0 sm:p-4">
          <div className="bg-white w-full sm:max-w-md sm:rounded-xl rounded-t-2xl shadow-2xl">
            <div className="flex items-center justify-between px-5 py-4 border-b border-gray-100">
              <h3 className="text-base font-bold text-gray-900">{form.id ? 'Edit Platform User' : 'New Platform User'}</h3>
              <button onClick={closeForm} className="p-1.5 text-gray-400 hover:text-gray-700 hover:bg-gray-100 rounded-lg transition-colors">
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="px-5 py-4 space-y-3 max-h-[70vh] overflow-y-auto">
              {formError && (
                <div className="bg-gray-50 border border-gray-200 rounded-lg p-2.5 text-xs text-gray-700">{formError}</div>
              )}

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-semibold uppercase tracking-wide text-gray-500 mb-1.5">First name</label>
                  <input className={inputCls} value={form.first_name} onChange={e => setForm({ ...form, first_name: e.target.value })} />
                </div>
                <div>
                  <label className="block text-xs font-semibold uppercase tracking-wide text-gray-500 mb-1.5">Last name</label>
                  <input className={inputCls} value={form.last_name} onChange={e => setForm({ ...form, last_name: e.target.value })} />
                </div>
              </div>

              <div>
                <label className="block text-xs font-semibold uppercase tracking-wide text-gray-500 mb-1.5">Username</label>
                <input className={inputCls} value={form.username} onChange={e => setForm({ ...form, username: e.target.value })} />
              </div>

              <div>
                <label className="block text-xs font-semibold uppercase tracking-wide text-gray-500 mb-1.5">Email</label>
                <input type="email" className={inputCls} value={form.email} onChange={e => setForm({ ...form, email: e.target.value })} />
              </div>

              <div>
                <label className="block text-xs font-semibold uppercase tracking-wide text-gray-500 mb-1.5">Role</label>
                <div className="grid grid-cols-2 gap-2">
                  {(['platform_admin', 'marketer'] as const).map(r => (
                    <button
                      key={r}
                      type="button"
                      onClick={() => setForm({ ...form, role: r })}
                      className={`py-2 rounded-lg border text-xs font-medium transition-colors ${
                        form.role === r ? 'bg-black text-white border-black' : 'border-gray-300 text-gray-600 hover:bg-gray-50'
                      }`}
                    >
                      {r === 'platform_admin' ? 'Platform Admin' : 'Marketer'}
                    </button>
                  ))}
                </div>
                <p className="text-xs text-gray-400 mt-1">
                  {form.role === 'marketer'
                    ? "Sees only the tenants assigned to them on the Tenants tab - can't manage tenants or edit site content."
                    : 'Full access: manage tenants, edit site content, and create other platform users.'}
                </p>
              </div>

              <div>
                <label className="block text-xs font-semibold uppercase tracking-wide text-gray-500 mb-1.5">
                  Password {form.id && <span className="font-normal text-gray-400 normal-case">(leave blank to keep current)</span>}
                </label>
                <input type="password" className={inputCls} value={form.password} onChange={e => setForm({ ...form, password: e.target.value })}
                  placeholder={form.id ? '••••••••' : 'Set a password'} />
              </div>

              <label className="flex items-center gap-2 text-sm text-gray-700">
                <input type="checkbox" checked={form.is_active} onChange={e => setForm({ ...form, is_active: e.target.checked })} />
                Active (can log in)
              </label>
            </div>

            <div className="flex gap-3 px-5 py-4 border-t border-gray-100">
              <button onClick={closeForm} disabled={saving} className="flex-1 py-2.5 text-sm font-semibold border border-gray-300 text-gray-700 rounded-lg hover:bg-gray-50 transition-colors disabled:opacity-50">
                Cancel
              </button>
              <button
                onClick={handleSave}
                disabled={saving}
                className="flex-1 inline-flex items-center justify-center gap-2 py-2.5 text-sm font-semibold rounded-lg bg-black hover:bg-gray-800 text-white transition-colors disabled:opacity-50"
              >
                {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : null}
                {saving ? 'Saving…' : form.id ? 'Save Changes' : 'Create User'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default PlatformUsersPanel;
