
import React, { useState } from 'react';
import { CheckCircle, AlertCircle, Loader, Key, Download, Printer, Eye, Search, Copy, Check, RefreshCw, Trash2, Calendar, Clock } from 'lucide-react';

interface GenerationResult {
  success: boolean;
  message: string;
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

const AdminResultTokenGenerator = () => {
  const [termId, setTermId] = useState('');
  const [daysUntilExpiry, setDaysUntilExpiry] = useState('30');
  const [viewTermId, setViewTermId] = useState('');
  const [generating, setGenerating] = useState(false);
  const [result, setResult] = useState<GenerationResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);
  const [showTokens, setShowTokens] = useState(false);
  const [tokens, setTokens] = useState<StudentToken[]>([]);
  const [loadingTokens, setLoadingTokens] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [copiedToken, setCopiedToken] = useState<string | null>(null);
  const [deleting, setDeleting] = useState(false);
  const [tokenStats, setTokenStats] = useState<any>(null);

  const API_BASE_URL = import.meta.env.VITE_API_URL || 'https://school-project-with-edward.onrender.com/api';

  const getAuthToken = () => {
    const tokenKeys = ['authToken', 'token', 'access_token', 'accessToken', 'jwt'];
    for (const key of tokenKeys) {
      const val = localStorage.getItem(key);
      if (val) return val;
    }
    return null;
  };

  const generateTokens = async () => {
    if (!termId) {
      setError('Please enter Term ID');
      return;
    }

    try {
      setGenerating(true);
      setError(null);
      setSuccess(false);
      setResult(null);
      
      const authToken = getAuthToken();
      if (!authToken) {
        setError('No authentication token found. Please log in again.');
        return;
      }

      const requestBody: any = { school_term_id: parseInt(termId) };
      
      if (daysUntilExpiry && parseInt(daysUntilExpiry) > 0) {
        requestBody.days_until_expiry = parseInt(daysUntilExpiry);
      }

      const response = await fetch(`${API_BASE_URL}/students/admin/generate-result-tokens/`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${authToken}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify(requestBody)
      });

      const contentType = response.headers.get('content-type');
      
      if (!response.ok) {
        if (response.status === 401) {
          throw new Error('Authentication failed. Please log in again.');
        } else if (response.status === 403) {
          throw new Error('You do not have admin privileges.');
        } else if (response.status === 404) {
          throw new Error('School term not found. Please check the Term ID.');
        }
        
        if (contentType?.includes('application/json')) {
          const errorData = await response.json();
          throw new Error(errorData.error || errorData.detail || `HTTP ${response.status}`);
        } else {
          throw new Error(`Server error (${response.status}). Please try again.`);
        }
      }

      if (!contentType?.includes('application/json')) {
        throw new Error('Invalid server response. Please contact support.');
      }

      const data = await response.json();
      console.log('Token generation response:', data);
      
      // Log errors if they exist
      if (data.errors && data.errors.length > 0) {
        console.error('Token generation errors:', data.errors);
        console.error('First 5 errors:', data.errors.slice(0, 5));
      }
      
      setResult(data);
      setSuccess(true);
      setViewTermId(termId);
      
      // Only fetch tokens if some were actually created
      if (data.total_students > 0 || data.tokens_created > 0 || data.tokens_updated > 0) {
        await fetchTokens(termId);
      } else if (data.error_count > 0) {
        setError(`Token generation failed for all ${data.error_count} students. Check console for error details.`);
      } else {
        setError('Token generation succeeded but no tokens were created. This term may have no enrolled students.');
      }
    } catch (err: any) {
      setError(err.message || 'Failed to generate tokens. Please try again.');
      setSuccess(false);
    } finally {
      setGenerating(false);
    }
  };

  const fetchTokens = async (termIdToFetch?: string) => {
    const targetTermId = termIdToFetch || viewTermId;
    if (!targetTermId) {
      setError('Please enter a Term ID to view tokens');
      return;
    }
    
    try {
      setLoadingTokens(true);
      setError(null);
      const authToken = getAuthToken();
      
      const response = await fetch(`${API_BASE_URL}/students/admin/get-all-result-tokens/?school_term_id=${targetTermId}`, {
        headers: {
          'Authorization': `Bearer ${authToken}`,
        }
      });

      if (response.ok) {
        const data = await response.json();
        setTokens(data.tokens || []);
        setTokenStats(data.statistics || null);
        setShowTokens(true);
        setViewTermId(targetTermId);
      } else if (response.status === 404) {
        setError('No tokens found for this term. Please generate tokens first.');
        setTokens([]);
        setShowTokens(false);
      } else {
        setError('Failed to fetch tokens. Please try again.');
      }
    } catch (err) {
      setError('Failed to fetch tokens. Please try again.');
    } finally {
      setLoadingTokens(false);
    }
  };

  const deleteExpiredTokens = async () => {
    if (!confirm('Are you sure you want to delete ALL expired tokens across all terms?')) {
      return;
    }

    try {
      setDeleting(true);
      setError(null);
      const authToken = getAuthToken();
      
      const response = await fetch(`${API_BASE_URL}/students/admin/delete-expired-tokens/`, {
        method: 'DELETE',
        headers: {
          'Authorization': `Bearer ${authToken}`,
          'Content-Type': 'application/json'
        }
      });

      if (response.ok) {
        const data = await response.json();
        alert(`Successfully deleted ${data.deleted_count} expired tokens`);
        
        if (viewTermId) {
          await fetchTokens();
        }
      } else {
        setError('Failed to delete expired tokens');
      }
    } catch (err) {
      setError('Failed to delete expired tokens');
    } finally {
      setDeleting(false);
    }
  };

  const deleteAllTokensForTerm = async () => {
    if (!viewTermId) {
      setError('Please view tokens for a term first');
      return;
    }

    if (!confirm(`Are you sure you want to delete ALL tokens for Term ${viewTermId}? This action cannot be undone.`)) {
      return;
    }

    try {
      setDeleting(true);
      setError(null);
      const authToken = getAuthToken();
      
      const response = await fetch(`${API_BASE_URL}/students/admin/delete-all-tokens-for-term/`, {
        method: 'DELETE',
        headers: {
          'Authorization': `Bearer ${authToken}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ school_term_id: parseInt(viewTermId) })
      });

      if (response.ok) {
        const data = await response.json();
        alert(data.message);
        setTokens([]);
        setShowTokens(false);
        setTokenStats(null);
      } else {
        setError('Failed to delete tokens');
      }
    } catch (err) {
      setError('Failed to delete tokens');
    } finally {
      setDeleting(false);
    }
  };

  const copyToken = (token: string) => {
    navigator.clipboard.writeText(token);
    setCopiedToken(token);
    setTimeout(() => setCopiedToken(null), 2000);
  };

  const exportToCSV = () => {
    const headers = ['Student Name', 'Username', 'Class', 'Token', 'Expires At', 'Status'];
    const rows = filteredTokens.map(t => [
      t.student_name,
      t.username,
      t.student_class,
      t.token,
      new Date(t.expires_at).toLocaleDateString(),
      t.status || 'Active'
    ]);
    
    const csv = [headers, ...rows].map(row => row.join(',')).join('\n');
    const blob = new Blob([csv], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `result_tokens_term_${viewTermId}_${new Date().toISOString().split('T')[0]}.csv`;
    a.click();
  };

  const printTokens = () => {
    const printWindow = window.open('', '_blank');
    if (!printWindow) return;
    
    const html = `
      <!DOCTYPE html>
      <html>
        <head>
          <title>Result Tokens - Term ${viewTermId}</title>
          <style>
            body { font-family: Arial, sans-serif; padding: 20px; }
            h1 { text-align: center; margin-bottom: 10px; }
            .subtitle { text-align: center; color: #666; margin-bottom: 30px; }
            table { width: 100%; border-collapse: collapse; margin-top: 20px; }
            th, td { border: 1px solid #ddd; padding: 12px; text-align: left; }
            th { background-color: #4F46E5; color: white; }
            tr:nth-child(even) { background-color: #f9f9f9; }
            .token { font-family: 'Courier New', monospace; font-size: 13px; font-weight: bold; }
            .active { color: green; }
            .expired { color: red; }
            @media print {
              button { display: none; }
            }
          </style>
        </head>
        <body>
          <h1>Result Access Tokens</h1>
          <p class="subtitle">Term ${viewTermId} • Generated: ${new Date().toLocaleDateString()}</p>
          <table>
            <thead>
              <tr>
                <th>Student Name</th>
                <th>Username</th>
                <th>Class</th>
                <th>Token</th>
                <th>Expires</th>
                <th>Status</th>
              </tr>
            </thead>
            <tbody>
              ${filteredTokens.map(t => `
                <tr>
                  <td>${t.student_name}</td>
                  <td>${t.username}</td>
                  <td>${t.student_class}</td>
                  <td class="token">${t.token}</td>
                  <td>${new Date(t.expires_at).toLocaleDateString()}</td>
                  <td class="${t.status === 'Active' ? 'active' : 'expired'}">${t.status || 'Active'}</td>
                </tr>
              `).join('')}
            </tbody>
          </table>
        </body>
      </html>
    `;
    
    printWindow.document.write(html);
    printWindow.document.close();
    printWindow.print();
  };

  const filteredTokens = tokens.filter(t => 
    t.student_name.toLowerCase().includes(searchQuery.toLowerCase()) ||
    t.username.toLowerCase().includes(searchQuery.toLowerCase()) ||
    t.student_class.toLowerCase().includes(searchQuery.toLowerCase()) ||
    t.token.toLowerCase().includes(searchQuery.toLowerCase())
  );

  const isTokenExpired = (expiresAt: string) => {
    return new Date(expiresAt) < new Date();
  };

  return (
    <div className="p-4">
      <div className="max-w-6xl mx-auto">
        <div className="mb-4">
          <h1 className="text-lg font-semibold text-gray-900">Result Token Management</h1>
          <p className="text-xs text-gray-500 mt-0.5">Generate and manage result access tokens</p>
        </div>

        {error && (
          <div className="mb-4 p-3 bg-red-50 border border-red-200 rounded-lg">
            <div className="flex items-start gap-2">
              <AlertCircle className="text-red-600 mt-0.5 flex-shrink-0" size={16} />
              <p className="text-sm text-red-600">{error}</p>
            </div>
          </div>
        )}

        <div className="grid gap-4 lg:grid-cols-2 mb-4">
          {/* Generate New Tokens Card */}
          <div className="bg-white rounded-xl border border-gray-200 p-4">
            <h2 className="text-sm font-semibold text-gray-900 mb-4 flex items-center gap-2">
              <Key size={16} className="text-gray-500" />
              Generate New Tokens
            </h2>

            {success && result && (
              <div className="mb-4 p-3 bg-green-50 border border-green-200 rounded-lg">
                <div className="flex items-center justify-between mb-2">
                  <div className="flex items-center gap-2">
                    <CheckCircle className="text-green-600" size={14} />
                    <span className="text-xs font-medium text-green-800">
                      {result.tokens_created} created, {result.tokens_updated} updated
                    </span>
                  </div>
                  <span className="text-[10px] text-green-600">Expires: {result.expiry_date}</span>
                </div>
                {result.total_students === 0 && (
                  <p className="text-[10px] text-amber-600 mb-2">No students found for this term.</p>
                )}
                {result.errors && result.errors.length > 0 && (
                  <p className="text-[10px] text-red-600 mb-2">{result.error_count} errors occurred</p>
                )}
                <button
                  onClick={() => { setResult(null); setSuccess(false); setError(null); setTermId(''); }}
                  className="w-full py-1.5 bg-white hover:bg-gray-50 text-gray-700 rounded border border-green-200 text-xs font-medium"
                >
                  Generate More
                </button>
              </div>
            )}

            {!success && (
              <div className="space-y-3">
                <div>
                  <label className="block text-xs font-medium text-gray-600 mb-1">Term ID *</label>
                  <input
                    type="number"
                    value={termId}
                    onChange={(e) => setTermId(e.target.value)}
                    placeholder="e.g., 1"
                    className="w-full px-3 py-1.5 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-gray-900 focus:border-transparent"
                  />
                </div>

                <div>
                  <label className="block text-xs font-medium text-gray-600 mb-1">Days Until Expiry</label>
                  <input
                    type="number"
                    value={daysUntilExpiry}
                    onChange={(e) => setDaysUntilExpiry(e.target.value)}
                    placeholder="30"
                    min="1"
                    className="w-full px-3 py-1.5 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-gray-900 focus:border-transparent"
                  />
                  <p className="text-[10px] text-gray-400 mt-0.5">Optional. Default: 30 days</p>
                </div>

                <div className="bg-gray-50 border border-gray-200 rounded-lg p-2">
                  <p className="text-[10px] text-gray-500">
                    Tokens are human-readable: <code className="bg-white px-1 py-0.5 rounded font-mono text-gray-700">A7B-2C9-X3Y</code>
                  </p>
                </div>

                <button
                  onClick={generateTokens}
                  disabled={generating || !termId}
                  className={`w-full py-2 px-4 rounded-lg text-sm font-medium flex items-center justify-center gap-2 transition-colors ${
                    generating || !termId
                      ? 'bg-gray-200 text-gray-400 cursor-not-allowed'
                      : 'bg-gray-900 hover:bg-gray-800 text-white'
                  }`}
                >
                  {generating ? (
                    <>
                      <Loader size={14} className="animate-spin" />
                      Generating...
                    </>
                  ) : (
                    <>
                      <Key size={14} />
                      Generate Tokens
                    </>
                  )}
                </button>
              </div>
            )}
          </div>

          {/* View & Manage Tokens Card */}
          <div className="bg-white rounded-xl border border-gray-200 p-4">
            <h2 className="text-sm font-semibold text-gray-900 mb-4 flex items-center gap-2">
              <Eye size={16} className="text-gray-500" />
              View & Manage Tokens
            </h2>

            <div className="space-y-3">
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">Term ID *</label>
                <input
                  type="number"
                  value={viewTermId}
                  onChange={(e) => setViewTermId(e.target.value)}
                  placeholder="e.g., 1, 2, 3..."
                  className="w-full px-3 py-1.5 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-gray-900 focus:border-transparent"
                />
              </div>

              <button
                onClick={() => fetchTokens()}
                disabled={loadingTokens || !viewTermId}
                className={`w-full py-2.5 px-4 rounded-lg text-sm font-medium flex items-center justify-center gap-2 transition-colors ${
                  loadingTokens || !viewTermId
                    ? 'bg-gray-200 text-gray-400 cursor-not-allowed'
                    : 'bg-gray-900 hover:bg-gray-800 text-white'
                }`}
              >
                {loadingTokens ? (
                  <>
                    <Loader size={16} className="animate-spin" />
                    Loading...
                  </>
                ) : (
                  <>
                    <Eye size={16} />
                    View Tokens
                  </>
                )}
              </button>

              {showTokens && (
                <div className="space-y-2">
                  <button
                    onClick={() => fetchTokens()}
                    disabled={loadingTokens}
                    className="w-full py-2 px-4 bg-gray-100 hover:bg-gray-200 text-gray-700 rounded-lg transition-colors text-sm font-medium flex items-center justify-center gap-2"
                  >
                    <RefreshCw size={14} />
                    Refresh
                  </button>

                  <button
                    onClick={deleteAllTokensForTerm}
                    disabled={deleting}
                    className="w-full py-2 px-4 bg-red-600 hover:bg-red-700 text-white rounded-lg transition-colors text-sm font-medium flex items-center justify-center gap-2"
                  >
                    {deleting ? (
                      <>
                        <Loader size={16} className="animate-spin" />
                        Deleting...
                      </>
                    ) : (
                      <>
                        <Trash2 size={16} />
                        Delete All Tokens for This Term
                      </>
                    )}
                  </button>

                  <button
                    onClick={deleteExpiredTokens}
                    disabled={deleting}
                    className="w-full py-2 px-4 bg-orange-600 hover:bg-orange-700 text-white rounded-lg transition-colors font-medium flex items-center justify-center gap-2"
                  >
                    {deleting ? (
                      <>
                        <Loader size={16} className="animate-spin" />
                        Deleting...
                      </>
                    ) : (
                      <>
                        <Trash2 size={16} />
                        Delete All Expired Tokens
                      </>
                    )}
                  </button>
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Token Statistics */}
        {showTokens && tokenStats && (
          <div className="bg-white rounded-xl border border-gray-200 p-4 mb-4">
            <div className="grid grid-cols-4 gap-3">
              <div className="text-center">
                <p className="text-[10px] text-gray-400 uppercase">Total</p>
                <p className="text-lg font-semibold text-gray-900">{tokenStats.total}</p>
              </div>
              <div className="text-center">
                <p className="text-[10px] text-gray-400 uppercase">Active</p>
                <p className="text-lg font-semibold text-green-600">{tokenStats.active}</p>
              </div>
              <div className="text-center">
                <p className="text-[10px] text-gray-400 uppercase">Expired</p>
                <p className="text-lg font-semibold text-amber-600">{tokenStats.expired}</p>
              </div>
              <div className="text-center">
                <p className="text-[10px] text-gray-400 uppercase">Used</p>
                <p className="text-lg font-semibold text-purple-600">{tokenStats.used}</p>
              </div>
            </div>
          </div>
        )}

        {/* Tokens List */}
        {showTokens && tokens.length > 0 && (
          <div className="bg-white rounded-xl border border-gray-200 p-4">
            <div className="flex items-center justify-between mb-3">
              <h2 className="text-sm font-semibold text-gray-900">
                Term {viewTermId} ({filteredTokens.length} tokens)
              </h2>
              <div className="flex gap-2">
                <button
                  onClick={exportToCSV}
                  className="px-2 py-1 bg-gray-100 hover:bg-gray-200 text-gray-700 rounded flex items-center gap-1 text-xs font-medium transition-colors"
                >
                  <Download size={12} />
                  CSV
                </button>
                <button
                  onClick={printTokens}
                  className="px-2 py-1 bg-gray-900 hover:bg-gray-800 text-white rounded flex items-center gap-1 text-xs font-medium transition-colors"
                >
                  <Printer size={12} />
                  Print
                </button>
              </div>
            </div>

            <div className="mb-3">
              <div className="relative">
                <Search className="absolute left-2.5 top-1/2 transform -translate-y-1/2 text-gray-400" size={14} />
                <input
                  type="text"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  placeholder="Search tokens..."
                  className="w-full pl-8 pr-3 py-1.5 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-gray-900 focus:border-transparent"
                />
              </div>
            </div>

            <div className="overflow-x-auto">
              <div className="max-h-[600px] overflow-y-auto">
                <table className="w-full">
                  <thead className="bg-gray-50 sticky top-0">
                    <tr>
                      <th className="px-3 py-2 text-left text-xs font-medium text-gray-500">Student</th>
                      <th className="px-3 py-2 text-left text-xs font-medium text-gray-500">Username</th>
                      <th className="px-3 py-2 text-left text-xs font-medium text-gray-500">Class</th>
                      <th className="px-3 py-2 text-left text-xs font-medium text-gray-500">Token</th>
                      <th className="px-3 py-2 text-left text-xs font-medium text-gray-500">Expires</th>
                      <th className="px-3 py-2 text-left text-xs font-medium text-gray-500">Status</th>
                      <th className="px-3 py-2 text-left text-xs font-medium text-gray-500"></th>
                    </tr>
                  </thead>
                  <tbody>
                    {filteredTokens.map((token) => {
                      const expired = isTokenExpired(token.expires_at);
                      return (
                        <tr key={token.id} className="border-b border-gray-100 hover:bg-gray-50">
                          <td className="px-3 py-2 text-sm text-gray-900">{token.student_name}</td>
                          <td className="px-3 py-2 text-sm text-gray-600">{token.username}</td>
                          <td className="px-3 py-2 text-sm text-gray-600">{token.student_class}</td>
                          <td className="px-3 py-2">
                            <code className="text-xs font-mono bg-gray-100 px-1.5 py-0.5 rounded text-gray-800">
                              {token.token}
                            </code>
                          </td>
                          <td className="px-3 py-2 text-sm text-gray-600">
                            {new Date(token.expires_at).toLocaleDateString()}
                          </td>
                          <td className="px-3 py-2">
                            <span className={`inline-flex items-center px-1.5 py-0.5 rounded text-xs font-medium ${
                              expired
                                ? 'bg-red-50 text-red-700'
                                : 'bg-green-50 text-green-700'
                            }`}>
                              {expired ? 'Expired' : token.status || 'Active'}
                            </span>
                          </td>
                          <td className="px-3 py-2">
                            <button
                              onClick={() => copyToken(token.token)}
                              className="p-1 hover:bg-gray-100 rounded transition-colors"
                              title="Copy token"
                            >
                              {copiedToken === token.token ? (
                                <Check size={14} className="text-green-600" />
                              ) : (
                                <Copy size={14} className="text-gray-400" />
                              )}
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
              <div className="text-center py-6 text-sm text-gray-500">
                No tokens found matching your search.
              </div>
            )}
          </div>
        )}

        {showTokens && tokens.length === 0 && (
          <div className="bg-white rounded-xl border border-gray-200 p-6 text-center">
            <AlertCircle className="mx-auto text-gray-300 mb-3" size={32} />
            <h3 className="text-sm font-medium text-gray-900 mb-1">No Tokens Found</h3>
            <p className="text-xs text-gray-500">
              Generate tokens for Term {viewTermId} to see them here.
            </p>
          </div>
        )}
      </div>
    </div>
  );
};

export default AdminResultTokenGenerator;