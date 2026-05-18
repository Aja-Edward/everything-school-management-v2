import React, { useState, useEffect } from 'react';
import {
  CheckCircle, AlertCircle, Loader, Key, Download, Printer,
  Eye, Search, Copy, Check, RefreshCw, Trash2,
  Building2, Info, ShieldOff,
} from 'lucide-react';
import api from '@/services/api';

// ─── Types ────────────────────────────────────────────────────────────────────

interface Tenant {
  id: string;
  name: string;
  slug: string;
  is_active: boolean;
  status: string;
}

interface TermOption {
  id: number;
  name: string;
  term_type: string;
  // Platform-admin endpoint returns an object; tenant /academics/terms/ returns a bare ID
  academic_session: { id: number; name: string } | number | null;
  academic_session_name?: string; // flat string field from TermSerializer
  start_date: string | null;
  end_date: string | null;
  is_current: boolean;
  is_active: boolean;
}

interface GenerationResult {
  success: boolean;
  message: string;
  tenant: string;
  school_term: string;
  academic_session: string;
  tokens_created: number;
  tokens_updated: number;
  total_students: number;
  expires_at: string;
  days_until_expiry: number;
  expiry_date: string;
  errors?: Array<{ student_id: number; username: string; error: string }>;
  error_count?: number;
}

interface StudentToken {
  id: number;
  student_name: string;
  username: string;
  student_class: string;
  token: string;
  expires_at: string;
  is_valid?: boolean;
  status?: string;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

const fmtDate = (d: string | null) =>
  d ? new Date(d).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' }) : '';

/** Safely extract the session name regardless of whether the field is an
 *  object {id, name} (platform-admin endpoint) or a bare integer FK
 *  (tenant /academics/terms/ endpoint which also sends academic_session_name). */
const sessionName = (t: TermOption): string => {
  if (typeof t.academic_session === 'object' && t.academic_session !== null)
    return t.academic_session.name;
  return t.academic_session_name ?? '';
};

const getUserRole = () => {
  try {
    const raw = localStorage.getItem('userData');
    if (!raw) return { isPlatformAdmin: false, isTenantAdmin: false };
    const u = JSON.parse(raw);
    const isPlatformAdmin = !!(u?.is_superuser);
    const isTenantAdmin   = !!(u?.is_staff && !u?.is_superuser);
    return { isPlatformAdmin, isTenantAdmin };
  } catch { return { isPlatformAdmin: false, isTenantAdmin: false }; }
};

const { isPlatformAdmin, isTenantAdmin } = getUserRole();
const canAccessTokens = isPlatformAdmin || isTenantAdmin;

// ─── Select component ─────────────────────────────────────────────────────────

const inputCls =
  'w-full px-3 py-2 border border-gray-300 rounded-lg text-sm text-gray-900 ' +
  'focus:outline-none focus:ring-2 focus:ring-black focus:border-black bg-white ' +
  'disabled:opacity-50 disabled:cursor-not-allowed';

const labelCls = 'block text-xs font-semibold uppercase tracking-wide text-gray-500 mb-1.5';

// ─── Main Component ───────────────────────────────────────────────────────────

const AdminResultTokenGenerator: React.FC = () => {
  // ── School + term selection ──────────────────────────────────────────────
  const [tenants, setTenants]         = useState<Tenant[]>([]);
  const [loadingTenants, setLoadingTenants] = useState(false);
  const [selectedTenantId, setSelectedTenantId] = useState('');

  const [tenantTerms, setTenantTerms] = useState<TermOption[]>([]);
  const [loadingTerms, setLoadingTerms] = useState(false);

  const [generateTermId, setGenerateTermId] = useState('');
  const [viewTermId, setViewTermId]         = useState('');
  const [daysUntilExpiry, setDaysUntilExpiry] = useState('30');

  // ── Operation state ──────────────────────────────────────────────────────
  const [generating, setGenerating]   = useState(false);
  const [result, setResult]           = useState<GenerationResult | null>(null);
  const [error, setError]             = useState<string | null>(null);

  const [tokens, setTokens]           = useState<StudentToken[]>([]);
  const [loadingTokens, setLoadingTokens] = useState(false);
  const [showTokens, setShowTokens]   = useState(false);
  const [tokenStats, setTokenStats]   = useState<any>(null);

  const [searchQuery, setSearchQuery] = useState('');
  const [copiedToken, setCopiedToken] = useState<string | null>(null);
  const [deleting, setDeleting]       = useState(false);

  // ── Load data on mount ────────────────────────────────────────────────────
  useEffect(() => {
    if (!canAccessTokens) return;

    if (isPlatformAdmin) {
      // Platform admin: load all tenant schools to pick from
      setLoadingTenants(true);
      api.get('/api/tenants/list/')
        .then((data: any) => {
          const list: Tenant[] = Array.isArray(data) ? data : data?.results ?? [];
          setTenants(list.filter(t => t.is_active));
        })
        .catch(() => setError('Could not load school list.'))
        .finally(() => setLoadingTenants(false));
    } else {
      // Tenant admin: load their own school's terms directly
      setLoadingTerms(true);
      api.get('/api/academics/terms/')
        .then((data: any) => {
          const list: TermOption[] = Array.isArray(data) ? data : data?.results ?? [];
          setTenantTerms(list);
        })
        .catch(() => setError('Could not load terms.'))
        .finally(() => setLoadingTerms(false));
    }
  }, []);

  // ── Load terms when platform admin selects a tenant ───────────────────────
  useEffect(() => {
    if (!isPlatformAdmin || !selectedTenantId) { setTenantTerms([]); return; }
    setLoadingTerms(true);
    setTenantTerms([]);
    setGenerateTermId('');
    setViewTermId('');
    setResult(null);
    setShowTokens(false);

    api.get('/api/students/admin/terms-for-tenant/', { tenant_id: selectedTenantId })
      .then((data: any) => setTenantTerms(data?.terms ?? []))
      .catch(() => setError('Could not load terms for this school.'))
      .finally(() => setLoadingTerms(false));
  }, [selectedTenantId]);

  // ── Helpers ───────────────────────────────────────────────────────────────

  const termLabel = (t: TermOption) => {
    const sn = sessionName(t);
    return `${t.name}${sn ? ` — ${sn}` : ''}${t.is_current ? ' (current)' : ''}`;
  };

  const selectedTenant = tenants.find(t => t.id === selectedTenantId);

  // ── Generate tokens ───────────────────────────────────────────────────────

  const generateTokens = async () => {
    if (!generateTermId) { setError('Please select a term.'); return; }
    setGenerating(true);
    setError(null);
    setResult(null);

    try {
      const body: any = { school_term_id: parseInt(generateTermId) };
      if (daysUntilExpiry && parseInt(daysUntilExpiry) > 0)
        body.days_until_expiry = parseInt(daysUntilExpiry);

      const data = await api.post('/api/students/admin/generate-result-tokens/', body);
      setResult(data);
      setViewTermId(generateTermId);
      if ((data.total_students ?? 0) > 0) await fetchTokens(generateTermId);
    } catch (err: any) {
      setError(err?.response?.data?.error || err.message || 'Failed to generate tokens.');
    } finally {
      setGenerating(false);
    }
  };

  // ── Fetch tokens ──────────────────────────────────────────────────────────

  const fetchTokens = async (termId?: string) => {
    const id = termId || viewTermId;
    if (!id) { setError('Please select a term first.'); return; }
    setLoadingTokens(true);
    setError(null);
    try {
      const data = await api.get('/api/students/admin/get-all-result-tokens/', { school_term_id: id });
      setTokens(data.tokens || []);
      setTokenStats(data.statistics || null);
      setShowTokens(true);
      setViewTermId(id);
    } catch {
      setError('Failed to fetch tokens.');
    } finally {
      setLoadingTokens(false);
    }
  };

  // ── Delete actions ────────────────────────────────────────────────────────

  const deleteExpiredTokens = async () => {
    if (!confirm('Delete ALL expired tokens across all terms?')) return;
    setDeleting(true);
    try {
      const data = await api.delete('/api/students/admin/delete-expired-tokens/');
      alert(`Deleted ${data.deleted_count} expired tokens`);
      if (viewTermId) await fetchTokens();
    } catch { setError('Failed to delete expired tokens.'); }
    finally { setDeleting(false); }
  };

  const deleteAllTokensForTerm = async () => {
    if (!viewTermId) { setError('View tokens for a term first.'); return; }
    if (!confirm(`Delete ALL tokens for this term? This cannot be undone.`)) return;
    setDeleting(true);
    try {
      const data = await api.delete('/api/students/admin/delete-all-tokens-for-term/', { school_term_id: parseInt(viewTermId) });
      alert(data.message);
      setTokens([]); setShowTokens(false); setTokenStats(null);
    } catch { setError('Failed to delete tokens.'); }
    finally { setDeleting(false); }
  };

  // ── Copy / export / print ─────────────────────────────────────────────────

  const copyToken = (token: string) => {
    navigator.clipboard.writeText(token);
    setCopiedToken(token);
    setTimeout(() => setCopiedToken(null), 2000);
  };

  const filteredTokens = tokens.filter(t =>
    [t.student_name, t.username, t.student_class, t.token]
      .some(f => f?.toLowerCase().includes(searchQuery.toLowerCase()))
  );

  const isExpired = (exp: string) => new Date(exp) < new Date();

  const exportCSV = () => {
    const rows = filteredTokens.map(t => [
      t.student_name, t.username, t.student_class, t.token,
      new Date(t.expires_at).toLocaleDateString(), t.status || 'Active',
    ]);
    const csv = [['Student Name','Username','Class','Token','Expires','Status'], ...rows]
      .map(r => r.join(',')).join('\n');
    const a = Object.assign(document.createElement('a'), {
      href: URL.createObjectURL(new Blob([csv], { type: 'text/csv' })),
      download: `tokens_term_${viewTermId}_${new Date().toISOString().split('T')[0]}.csv`,
    });
    a.click();
  };

  const printTokens = () => {
    const w = window.open('', '_blank');
    if (!w) return;
    const tenantName = selectedTenant?.name || 'School';
    const termName = tenantTerms.find(t => String(t.id) === viewTermId)?.name || `Term ${viewTermId}`;
    const html = `<!DOCTYPE html><html><head><title>Result Tokens</title>
    <style>
      body{font-family:Arial,sans-serif;padding:20px}
      h1{text-align:center}p.sub{text-align:center;color:#666;margin-bottom:24px}
      table{width:100%;border-collapse:collapse}
      th,td{border:1px solid #ddd;padding:10px;text-align:left}
      th{background:#111;color:#fff}.token{font-family:monospace;font-weight:bold}
      .active{color:green}.expired{color:red}
      @media print{button{display:none}}
    </style></head><body>
    <h1>Result Access Tokens</h1>
    <p class="sub">${tenantName} · ${termName} · Generated: ${new Date().toLocaleDateString()}</p>
    <table><thead><tr><th>Student</th><th>Username</th><th>Class</th><th>Token</th><th>Expires</th><th>Status</th></tr></thead>
    <tbody>${filteredTokens.map(t => `
      <tr><td>${t.student_name}</td><td>${t.username}</td><td>${t.student_class}</td>
      <td class="token">${t.token}</td><td>${new Date(t.expires_at).toLocaleDateString()}</td>
      <td class="${isExpired(t.expires_at)?'expired':'active'}">${isExpired(t.expires_at)?'Expired':t.status||'Active'}</td></tr>
    `).join('')}</tbody></table></body></html>`;
    w.document.documentElement.innerHTML = html;
    w.print();
  };

  // ─── Guard ────────────────────────────────────────────────────────────────

  if (!canAccessTokens) {
    return (
      <div className="p-8 flex flex-col items-center justify-center min-h-[300px] text-center">
        <ShieldOff className="text-gray-300 mb-4" size={36} />
        <h2 className="text-sm font-semibold text-gray-700">Access Restricted</h2>
        <p className="text-xs text-gray-400 mt-1 max-w-xs">
          Only school administrators can access the result token system.
        </p>
      </div>
    );
  }

  // ─── Render ───────────────────────────────────────────────────────────────

  return (
    <div className="p-4 sm:p-6 max-w-5xl mx-auto space-y-6">

      {/* Header */}
      <div>
        <h1 className="text-lg font-bold text-gray-900 flex items-center gap-2">
          <Key className="w-5 h-5" /> Result Token Management
        </h1>
        <p className="text-xs text-gray-500 mt-0.5">Platform admin only — generate per-school, per-term result access tokens</p>
      </div>

      {/* Error */}
      {error && (
        <div className="flex items-start gap-2.5 bg-white border border-gray-200 rounded-xl p-4 text-sm text-gray-800">
          <AlertCircle className="w-4 h-4 mt-0.5 shrink-0 text-gray-500" />
          <span>{error}</span>
        </div>
      )}

      {/* ── Step 1: Select School (platform admin only) ───────────────────── */}
      {isPlatformAdmin && (
        <div className="bg-white rounded-xl border border-gray-200 p-5">
          <div className="flex items-center gap-2 mb-4">
            <span className="w-6 h-6 bg-black text-white text-xs font-bold rounded-full flex items-center justify-center shrink-0">1</span>
            <h2 className="text-sm font-bold text-gray-900">Select School</h2>
          </div>

          {loadingTenants ? (
            <div className="flex items-center gap-2 text-xs text-gray-400 py-1">
              <Loader size={12} className="animate-spin" /> Loading schools…
            </div>
          ) : (
            <select
              value={selectedTenantId}
              onChange={e => setSelectedTenantId(e.target.value)}
              className={inputCls}
            >
              <option value="">Choose a school…</option>
              {tenants.map(t => (
                <option key={t.id} value={t.id}>{t.name}</option>
              ))}
            </select>
          )}

          {selectedTenant && (
            <div className="mt-3 flex items-center gap-2 text-xs text-gray-500 bg-gray-50 rounded-lg px-3 py-2 border border-gray-200">
              <Building2 className="w-3.5 h-3.5 shrink-0" />
              <span>Selected: <strong className="text-gray-900">{selectedTenant.name}</strong></span>
            </div>
          )}
        </div>
      )}

      {/* ── Step 2: Terms reference table ────────────────────────────────── */}
      {/* Platform admin: show after school selected. Tenant admin: show always */}
      {(isTenantAdmin || selectedTenantId) && (
        <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
          <div className="px-5 py-4 border-b border-gray-100 flex items-center gap-2">
            <span className="w-6 h-6 bg-black text-white text-xs font-bold rounded-full flex items-center justify-center shrink-0">
              {isPlatformAdmin ? '2' : '1'}
            </span>
            <h2 className="text-sm font-bold text-gray-900">Academic Terms</h2>
            <span className="text-xs text-gray-400 ml-1">— IDs you need to generate tokens</span>
          </div>

          {loadingTerms ? (
            <div className="flex items-center gap-2 text-xs text-gray-400 p-5">
              <Loader size={12} className="animate-spin" /> Loading terms…
            </div>
          ) : tenantTerms.length === 0 ? (
            <div className="p-5 text-sm text-gray-400 flex items-center gap-2">
              <Info size={14} /> No terms found for this school.
            </div>
          ) : (
            <>
              {/* Desktop */}
              <div className="hidden sm:block overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="bg-gray-50 border-b border-gray-100">
                      {['Term ID', 'Term Name', 'Session', 'Start', 'End', 'Status'].map(h => (
                        <th key={h} className="px-5 py-2.5 text-left text-xs font-semibold uppercase tracking-wider text-gray-500">{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-100">
                    {tenantTerms.map(t => (
                      <tr key={t.id} className={`hover:bg-gray-50 ${t.is_current ? 'bg-gray-50' : ''}`}>
                        <td className="px-5 py-3">
                          <span className="font-mono font-bold text-gray-900 bg-gray-100 px-2 py-0.5 rounded text-sm">{t.id}</span>
                        </td>
                        <td className="px-5 py-3 font-medium text-gray-900">
                          {t.name}
                          {t.is_current && (
                            <span className="ml-2 px-1.5 py-0.5 text-[10px] font-semibold bg-gray-900 text-white rounded-full">current</span>
                          )}
                        </td>
                        <td className="px-5 py-3 text-gray-600">{sessionName(t) || '—'}</td>
                        <td className="px-5 py-3 text-gray-500 text-xs">{t.start_date ? fmtDate(t.start_date) : '—'}</td>
                        <td className="px-5 py-3 text-gray-500 text-xs">{t.end_date ? fmtDate(t.end_date) : '—'}</td>
                        <td className="px-5 py-3">
                          {t.is_active
                            ? <span className="text-xs text-gray-700 font-medium">Active</span>
                            : <span className="text-xs text-gray-400">Inactive</span>}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              {/* Mobile */}
              <div className="sm:hidden divide-y divide-gray-100">
                {tenantTerms.map(t => (
                  <div key={t.id} className="px-4 py-3 space-y-1">
                    <div className="flex items-center justify-between">
                      <span className="font-medium text-sm text-gray-900">
                        {t.name}
                        {t.is_current && <span className="ml-2 px-1.5 py-0.5 text-[10px] font-semibold bg-gray-900 text-white rounded-full">current</span>}
                      </span>
                      <span className="font-mono font-bold text-gray-900 bg-gray-100 px-2 py-0.5 rounded text-xs">ID: {t.id}</span>
                    </div>
                    <p className="text-xs text-gray-500">{sessionName(t)}</p>
                    {t.start_date && t.end_date && (
                      <p className="text-xs text-gray-400">{fmtDate(t.start_date)} — {fmtDate(t.end_date)}</p>
                    )}
                  </div>
                ))}
              </div>

              <div className="px-5 py-3 border-t border-gray-100 bg-gray-50">
                <p className="text-xs text-gray-500 flex items-center gap-1.5">
                  <Info className="w-3.5 h-3.5 shrink-0" />
                  Share the <strong>Term ID</strong> with the tenant admin so they can generate tokens themselves, or generate below.
                </p>
              </div>
            </>
          )}
        </div>
      )}

      {/* ── Step 3: Generate + View ───────────────────────────────────────── */}
      {(isTenantAdmin || selectedTenantId) && tenantTerms.length > 0 && (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">

          {/* Generate card */}
          <div className="bg-white rounded-xl border border-gray-200 p-5">
            <div className="flex items-center gap-2 mb-4">
              <span className="w-6 h-6 bg-black text-white text-xs font-bold rounded-full flex items-center justify-center shrink-0">
                {isPlatformAdmin ? '3' : '2'}
              </span>
              <h2 className="text-sm font-bold text-gray-900">Generate Tokens</h2>
            </div>

            {/* Success result */}
            {result && (
              <div className="mb-4 p-3 bg-gray-50 border border-gray-200 rounded-lg space-y-1.5">
                <div className="flex items-center gap-2">
                  <CheckCircle className="text-gray-700" size={14} />
                  <span className="text-xs font-semibold text-gray-900">
                    {result.tokens_created} created · {result.tokens_updated} updated
                  </span>
                </div>
                <p className="text-xs text-gray-500">
                  School: <strong>{result.tenant}</strong> · Term: <strong>{result.school_term}</strong>
                </p>
                <p className="text-xs text-gray-500">Expires: {result.expiry_date}</p>
                {result.error_count && result.error_count > 0 && (
                  <p className="text-xs text-gray-700 font-medium">{result.error_count} errors occurred</p>
                )}
                <button
                  onClick={() => { setResult(null); setGenerateTermId(''); setError(null); }}
                  className="w-full py-1.5 text-xs font-medium border border-gray-200 rounded-lg hover:bg-gray-100 transition-colors mt-1"
                >
                  Generate Again
                </button>
              </div>
            )}

            {!result && (
              <div className="space-y-3">
                <div>
                  <label className={labelCls}>Select Term *</label>
                  <select
                    value={generateTermId}
                    onChange={e => setGenerateTermId(e.target.value)}
                    className={inputCls}
                  >
                    <option value="">Choose a term…</option>
                    {tenantTerms.map(t => (
                      <option key={t.id} value={t.id}>{termLabel(t)}</option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className={labelCls}>Days Until Expiry <span className="font-normal normal-case text-gray-400">(optional)</span></label>
                  <input
                    type="number"
                    value={daysUntilExpiry}
                    onChange={e => setDaysUntilExpiry(e.target.value)}
                    placeholder="Default: term end date"
                    min="1"
                    className={inputCls}
                  />
                  <p className="text-[11px] text-gray-400 mt-1">Leave blank to expire on term end date</p>
                </div>

                <div className="bg-gray-50 border border-gray-200 rounded-lg p-2.5">
                  <p className="text-[11px] text-gray-500">
                    Token format: <code className="bg-white px-1 py-0.5 rounded font-mono text-gray-700">A7B-2C9-X3Y-5Z1</code>
                  </p>
                </div>

                <button
                  onClick={generateTokens}
                  disabled={generating || !generateTermId}
                  className="w-full py-2.5 text-sm font-semibold rounded-lg flex items-center justify-center gap-2 transition-colors bg-black hover:bg-gray-800 text-white disabled:bg-gray-200 disabled:text-gray-400 disabled:cursor-not-allowed"
                >
                  {generating ? (
                    <><Loader size={14} className="animate-spin" />Generating…</>
                  ) : (
                    <><Key size={14} />Generate Tokens</>
                  )}
                </button>
              </div>
            )}
          </div>

          {/* View & manage card */}
          <div className="bg-white rounded-xl border border-gray-200 p-5">
            <div className="flex items-center gap-2 mb-4">
              <Eye size={16} className="text-gray-500" />
              <h2 className="text-sm font-bold text-gray-900">View & Manage</h2>
            </div>

            <div className="space-y-3">
              <div>
                <label className={labelCls}>Select Term *</label>
                <select
                  value={viewTermId}
                  onChange={e => setViewTermId(e.target.value)}
                  className={inputCls}
                >
                  <option value="">Choose a term…</option>
                  {tenantTerms.map(t => (
                    <option key={t.id} value={t.id}>{termLabel(t)}</option>
                  ))}
                </select>
              </div>

              <button
                onClick={() => fetchTokens()}
                disabled={loadingTokens || !viewTermId}
                className="w-full py-2.5 text-sm font-semibold rounded-lg flex items-center justify-center gap-2 transition-colors bg-black hover:bg-gray-800 text-white disabled:bg-gray-200 disabled:text-gray-400 disabled:cursor-not-allowed"
              >
                {loadingTokens ? (
                  <><Loader size={14} className="animate-spin" />Loading…</>
                ) : (
                  <><Eye size={14} />View Tokens</>
                )}
              </button>

              {showTokens && (
                <div className="space-y-2">
                  <button onClick={() => fetchTokens()} disabled={loadingTokens}
                    className="w-full py-2 text-xs font-medium border border-gray-200 text-gray-700 rounded-lg hover:bg-gray-50 flex items-center justify-center gap-2 transition-colors">
                    <RefreshCw size={12} />Refresh
                  </button>
                  <button onClick={deleteAllTokensForTerm} disabled={deleting}
                    className="w-full py-2 text-xs font-medium border border-gray-300 text-gray-700 rounded-lg hover:bg-gray-100 flex items-center justify-center gap-2 transition-colors">
                    {deleting ? <Loader size={12} className="animate-spin" /> : <Trash2 size={12} />}
                    Delete All Tokens for This Term
                  </button>
                  <button onClick={deleteExpiredTokens} disabled={deleting}
                    className="w-full py-2 text-xs font-medium border border-gray-300 text-gray-700 rounded-lg hover:bg-gray-100 flex items-center justify-center gap-2 transition-colors">
                    {deleting ? <Loader size={12} className="animate-spin" /> : <Trash2 size={12} />}
                    Delete All Expired Tokens (Global)
                  </button>
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* ── Token stats ───────────────────────────────────────────────────── */}
      {showTokens && tokenStats && (
        <div className="bg-white rounded-xl border border-gray-200 p-4">
          <p className="text-xs font-semibold uppercase tracking-wider text-gray-400 mb-3">
            Token Statistics — {selectedTenant?.name}
          </p>
          <div className="grid grid-cols-4 gap-3">
            {[
              { label: 'Total', value: tokenStats.total },
              { label: 'Active', value: tokenStats.active },
              { label: 'Expired', value: tokenStats.expired },
              { label: 'Used', value: tokenStats.used },
            ].map(s => (
              <div key={s.label} className="text-center">
                <p className="text-[10px] text-gray-400 uppercase font-medium">{s.label}</p>
                <p className="text-xl font-bold text-gray-900">{s.value}</p>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* ── Tokens table ─────────────────────────────────────────────────── */}
      {showTokens && tokens.length > 0 && (
        <div className="bg-white rounded-xl border border-gray-200">
          <div className="px-5 py-4 border-b border-gray-100 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
            <p className="text-sm font-bold text-gray-900">
              {selectedTenant?.name} — {tenantTerms.find(t => String(t.id) === viewTermId)?.name || `Term ${viewTermId}`}
              <span className="text-gray-400 font-normal ml-2">({filteredTokens.length} tokens)</span>
            </p>
            <div className="flex gap-2">
              <button onClick={exportCSV}
                className="px-3 py-1.5 text-xs font-medium border border-gray-200 rounded-lg hover:bg-gray-50 flex items-center gap-1 transition-colors">
                <Download size={12} />CSV
              </button>
              <button onClick={printTokens}
                className="px-3 py-1.5 text-xs font-medium bg-black text-white rounded-lg hover:bg-gray-800 flex items-center gap-1 transition-colors">
                <Printer size={12} />Print
              </button>
            </div>
          </div>

          <div className="px-5 py-3 border-b border-gray-100">
            <div className="relative">
              <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 text-gray-400" size={13} />
              <input
                value={searchQuery}
                onChange={e => setSearchQuery(e.target.value)}
                placeholder="Search by name, class or token…"
                className="w-full pl-8 pr-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-black"
              />
            </div>
          </div>

          <div className="overflow-x-auto">
            <div className="max-h-[500px] overflow-y-auto">
              <table className="w-full text-sm">
                <thead className="bg-gray-50 sticky top-0">
                  <tr>
                    {['Student','Username','Class','Token','Expires','Status',''].map(h => (
                      <th key={h} className="px-4 py-2.5 text-left text-xs font-medium text-gray-500">{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {filteredTokens.map(token => {
                    const expired = isExpired(token.expires_at);
                    return (
                      <tr key={token.id} className="hover:bg-gray-50">
                        <td className="px-4 py-2.5 text-gray-900 font-medium">{token.student_name}</td>
                        <td className="px-4 py-2.5 text-gray-500 text-xs">{token.username}</td>
                        <td className="px-4 py-2.5 text-gray-500 text-xs">{token.student_class}</td>
                        <td className="px-4 py-2.5">
                          <code className="text-xs font-mono bg-gray-100 px-1.5 py-0.5 rounded text-gray-800">
                            {token.token}
                          </code>
                        </td>
                        <td className="px-4 py-2.5 text-gray-500 text-xs">
                          {new Date(token.expires_at).toLocaleDateString()}
                        </td>
                        <td className="px-4 py-2.5">
                          <span className={`text-xs font-medium px-1.5 py-0.5 rounded-full ${
                            expired ? 'bg-gray-100 text-gray-500' : 'bg-gray-900 text-white'
                          }`}>
                            {expired ? 'Expired' : token.status || 'Active'}
                          </span>
                        </td>
                        <td className="px-4 py-2.5">
                          <button onClick={() => copyToken(token.token)}
                            className="p-1 hover:bg-gray-100 rounded transition-colors" title="Copy">
                            {copiedToken === token.token
                              ? <Check size={13} className="text-gray-700" />
                              : <Copy size={13} className="text-gray-400" />}
                          </button>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>

          {filteredTokens.length === 0 && (
            <div className="py-10 text-center text-sm text-gray-400">
              No tokens matching your search.
            </div>
          )}
        </div>
      )}

      {showTokens && tokens.length === 0 && (
        <div className="bg-white rounded-xl border border-gray-200 p-8 text-center">
          <AlertCircle className="mx-auto text-gray-300 mb-3" size={28} />
          <p className="text-sm font-medium text-gray-700">No tokens found for this term</p>
          <p className="text-xs text-gray-400 mt-1">Generate tokens first using the Generate panel above.</p>
        </div>
      )}
    </div>
  );
};

export default AdminResultTokenGenerator;
