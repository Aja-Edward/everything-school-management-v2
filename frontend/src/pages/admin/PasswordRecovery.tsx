import React, { useState } from 'react';
import { toast } from 'react-toastify';
import api from '@/services/api';
import {
  Key,
  Search,
  User,
  Mail,
  Phone,
  Copy,
  Check,
  AlertCircle,
  RefreshCw,
  Shield,
  ChevronRight,
} from 'lucide-react';

const PasswordRecovery: React.FC = () => {
  const [username, setUsername] = useState('');
  const [loading, setLoading] = useState(false);
  const [copied, setCopied] = useState<string | null>(null);
  const [result, setResult] = useState<{
    success: boolean;
    message: string;
    newPassword?: string;
    userDetails?: any;
  } | null>(null);
console.log('teacher result', result?.userDetails)
  const handlePasswordReset = async () => {
    if (!username.trim()) {
      toast.error('Please enter a username');
      return;
    }

    setLoading(true);
    setResult(null);

    try {
      const input = username.trim();
      const prefix = (input.split('/')[0] || '').toUpperCase();

      let resolved: { user_id: number; details: any } | null = null;

      if (prefix === 'ADM') {
        try {
          const usersRes = await api.get('/api/auth/admins/list/', { search: input });
          const usersList = Array.isArray(usersRes) ? usersRes :
                           Array.isArray(usersRes?.results) ? usersRes.results : [];

          const adminMatch = usersList.find((u: any) => u.username === input);

          if (adminMatch) {
            resolved = {
              user_id: adminMatch.id,
              details: {
                username: adminMatch.username,
                full_name: adminMatch.full_name || `${adminMatch.first_name} ${adminMatch.last_name}`.trim() || 'N/A',
                email: adminMatch.email,
                phone: adminMatch.phone || 'N/A',
                role: 'Admin'
              }
            };
          }
        } catch (error) {
          console.error('Error searching for admin:', error);
        }
      } else if (prefix === 'TCH') {
        try {
          const tRes = await api.get('/api/teachers/teachers/', { search: input });
          const tList = Array.isArray(tRes) ? tRes :
                       Array.isArray(tRes?.results) ? tRes.results : [];

          const tMatch = tList.find((t: any) => (t.user?.username || t.username) === input);

          if (tMatch) {
            const uid = Number(tMatch.user?.id || tMatch.id);
            if (uid) {
              resolved = {
                user_id: uid,
                details: {
                  username: input,
                  full_name: tMatch.user?.full_name || tMatch.full_name || 'N/A',
                  email: tMatch.user?.email || tMatch.email,
                  phone: tMatch.user?.phone || tMatch.phone || 'N/A',
                  role: 'Teacher'
                }
              };
            }
          }
        } catch (error) {
          console.error('Error searching for teacher:', error);
        }
      } else if (prefix === 'STU') {
        try {
          const stRes = await api.get('/api/students/students/', { search: input });
          const stList = Array.isArray(stRes) ? stRes :
                        Array.isArray(stRes?.results) ? stRes.results : [];

          const stMatch = stList.find((s: any) => (s.user?.username || s.username) === input);

          if (stMatch) {
            const uid = Number(stMatch.user?.id || stMatch.id);
            if (uid) {
              resolved = {
                user_id: uid,
                details: {
                  username: input,
                  full_name: stMatch.user?.full_name || stMatch.full_name || 'N/A',
                  email: stMatch.user?.email || stMatch.email,
                  phone: stMatch.user?.phone || stMatch.phone || 'N/A',
                  role: 'Student'
                }
              };
            }
          }
        } catch (error) {
          console.error('Error searching for student:', error);
        }
      } else if (prefix === 'PAR') {
        try {
          let pRes = await api.get('/api/parents/search/', { q: input });
          let pList = Array.isArray(pRes) ? pRes :
                     Array.isArray(pRes?.results) ? pRes.results : [];

          if (!Array.isArray(pList) || pList.length === 0) {
            pRes = await api.get('/api/parents/', { search: input });
            pList = Array.isArray(pRes) ? pRes :
                   Array.isArray(pRes?.results) ? pRes.results : [];
          }

          const pMatch = pList.find((p: any) => (p.user?.username || p.username) === input);

          if (pMatch) {
            const uid = Number(pMatch.user?.id || pMatch.id);
            if (uid) {
              resolved = {
                user_id: uid,
                details: {
                  username: input,
                  full_name: pMatch.user?.full_name || pMatch.full_name || 'N/A',
                  email: pMatch.user?.email || pMatch.email,
                  phone: pMatch.user?.phone || pMatch.phone || 'N/A',
                  role: 'Parent'
                }
              };
            }
          }
        } catch (error) {
          console.error('Error searching for parent:', error);
        }
      } else {
        setResult({
          success: false,
          message: 'Invalid username format. Username must start with ADM/, TCH/, STU/, or PAR/'
        });
        toast.error('Invalid username format');
        setLoading(false);
        return;
      }

      if (!resolved) {
        setResult({
          success: false,
          message: 'User not found. Please check the username and try again.'
        });
        toast.error('User not found');
        setLoading(false);
        return;
      }

      const newPassword = generatePassword();

      await api.post(`/api/auth/admin-reset-password/`, {
        user_id: resolved.user_id,
        new_password: newPassword
      });

      setResult({
        success: true,
        message: 'Password reset successful!',
        newPassword,
        userDetails: resolved.details
      });

      toast.success('Password reset successful!');
    } catch (error: any) {
      console.error('Password reset error:', error);

      const errorMessage = error.response?.data?.error ||
                          error.response?.data?.detail ||
                          error.response?.data?.message ||
                          'Failed to reset password. Please try again.';

      setResult({
        success: false,
        message: errorMessage
      });
      toast.error(errorMessage);
    } finally {
      setLoading(false);
    }
  };

  const generatePassword = () => {
    const uppercase = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ';
    const lowercase = 'abcdefghijklmnopqrstuvwxyz';
    const numbers = '0123456789';
    const special = '!@#$%';
    const all = uppercase + lowercase + numbers + special;

    let password = '';
    password += uppercase.charAt(Math.floor(Math.random() * uppercase.length));
    password += lowercase.charAt(Math.floor(Math.random() * lowercase.length));
    password += numbers.charAt(Math.floor(Math.random() * numbers.length));
    password += special.charAt(Math.floor(Math.random() * special.length));

    for (let i = 4; i < 12; i++) {
      password += all.charAt(Math.floor(Math.random() * all.length));
    }

    return password.split('').sort(() => Math.random() - 0.5).join('');
  };

  const copyToClipboard = (text: string, field: string) => {
    navigator.clipboard.writeText(text);
    setCopied(field);
    setTimeout(() => setCopied(null), 2000);
    toast.success('Copied to clipboard!');
  };

  const handleReset = () => {
    setUsername('');
    setResult(null);
    setCopied(null);
  };

  const userTypes = [
    { prefix: 'ADM', label: 'Admin', color: 'bg-purple-50 text-purple-700' },
    { prefix: 'TCH', label: 'Teacher', color: 'bg-blue-50 text-blue-700' },
    { prefix: 'STU', label: 'Student', color: 'bg-green-50 text-green-700' },
    { prefix: 'PAR', label: 'Parent', color: 'bg-amber-50 text-amber-700' },
  ];

  return (
    <div className="min-h-screen bg-gray-50 p-6">
      <div className="max-w-2xl mx-auto">
        {/* Header */}
        <div className="mb-6">
          <h1 className="text-xl font-semibold text-gray-900">Password Recovery</h1>
          <p className="text-sm text-gray-500 mt-0.5">Reset passwords for students, teachers, parents, and admins</p>
        </div>

        {/* Supported User Types */}
        <div className="bg-white rounded-xl border border-gray-200 p-4 mb-5">
          <p className="text-xs font-medium text-gray-500 uppercase tracking-wider mb-3">Supported User Types</p>
          <div className="flex flex-wrap gap-2">
            {userTypes.map((type) => (
              <div
                key={type.prefix}
                className={`flex items-center gap-2 px-3 py-1.5 rounded-lg text-xs font-medium ${type.color}`}
              >
                <span className="font-mono">{type.prefix}/</span>
                <ChevronRight className="w-3 h-3 opacity-50" />
                <span>{type.label}</span>
              </div>
            ))}
          </div>
          <p className="text-xs text-gray-400 mt-3">
            Example: ADM/GTS/OCT/25/001, TCH/GTS/SEP/25/002
          </p>
        </div>

        {/* Search Form */}
        <div className="bg-white rounded-xl border border-gray-200 p-5 mb-5">
          <label className="block text-sm font-medium text-gray-700 mb-2">Username</label>
          <div className="flex gap-2">
            <div className="relative flex-1">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
              <input
                type="text"
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                onKeyPress={(e) => {
                  if (e.key === 'Enter' && !loading) {
                    handlePasswordReset();
                  }
                }}
                className="w-full pl-9 pr-4 py-2.5 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-gray-900 focus:border-transparent"
                placeholder="Enter username (e.g., ADM/GTS/OCT/25/001)"
                disabled={loading}
              />
            </div>
            <button
              onClick={handlePasswordReset}
              disabled={loading || !username.trim()}
              className="flex items-center gap-2 px-4 py-2.5 bg-gray-900 text-white text-sm font-medium rounded-lg hover:bg-gray-800 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {loading ? (
                <RefreshCw className="w-4 h-4 animate-spin" />
              ) : (
                <Key className="w-4 h-4" />
              )}
              {loading ? 'Resetting...' : 'Reset Password'}
            </button>
          </div>
        </div>

        {/* Result */}
        {result && (
          <div className={`bg-white rounded-xl border ${result.success ? 'border-green-200' : 'border-red-200'}`}>
            {/* Result Header */}
            <div className={`px-5 py-4 border-b ${result.success ? 'bg-green-50 border-green-200' : 'bg-red-50 border-red-200'} rounded-t-xl`}>
              <div className="flex items-center gap-3">
                {result.success ? (
                  <div className="w-8 h-8 bg-green-100 rounded-full flex items-center justify-center">
                    <Check className="w-4 h-4 text-green-600" />
                  </div>
                ) : (
                  <div className="w-8 h-8 bg-red-100 rounded-full flex items-center justify-center">
                    <AlertCircle className="w-4 h-4 text-red-600" />
                  </div>
                )}
                <div>
                  <h3 className={`text-sm font-semibold ${result.success ? 'text-green-800' : 'text-red-800'}`}>
                    {result.success ? 'Password Reset Successful' : 'Error'}
                  </h3>
                  <p className={`text-xs ${result.success ? 'text-green-600' : 'text-red-600'}`}>
                    {result.message}
                  </p>
                </div>
              </div>
            </div>

            {result.success && result.newPassword && result.userDetails && (
              <div className="p-5">
                {/* User Details */}
                <div className="mb-5">
                  <p className="text-xs font-medium text-gray-500 uppercase tracking-wider mb-3">User Information</p>
                  <div className="grid grid-cols-2 gap-3">
                    <div className="flex items-center gap-2 text-sm">
                      <Shield className="w-4 h-4 text-gray-400" />
                      <span className="text-gray-500">Role:</span>
                      <span className="font-medium text-gray-900">{result.userDetails.role}</span>
                    </div>
                    <div className="flex items-center gap-2 text-sm">
                      <User className="w-4 h-4 text-gray-400" />
                      <span className="text-gray-500">Name:</span>
                      <span className="font-medium text-gray-900">{result.userDetails.full_name}</span>
                    </div>
                    <div className="flex items-center gap-2 text-sm">
                      <Mail className="w-4 h-4 text-gray-400" />
                      <span className="text-gray-500">Email:</span>
                      <span className="font-medium text-gray-900">{result.userDetails.email}</span>
                    </div>
                    <div className="flex items-center gap-2 text-sm">
                      <Phone className="w-4 h-4 text-gray-400" />
                      <span className="text-gray-500">Phone:</span>
                      <span className="font-medium text-gray-900">{result.userDetails.phone}</span>
                    </div>
                  </div>
                </div>

                {/* Credentials */}
                <div className="bg-gray-50 rounded-lg p-4 mb-5">
                  <p className="text-xs font-medium text-gray-500 uppercase tracking-wider mb-3">New Credentials</p>

                  <div className="space-y-3">
                    <div>
                      <label className="text-xs text-gray-500 mb-1 block">Username</label>
                      <div className="flex items-center gap-2">
                        <code className="flex-1 bg-white px-3 py-2 rounded-lg text-sm font-mono text-gray-900 border border-gray-200">
                          {result.userDetails.username}
                        </code>
                        <button
                          onClick={() => copyToClipboard(result.userDetails.username, 'username')}
                          className="p-2 text-gray-400 hover:text-gray-600 hover:bg-white rounded-lg transition-colors"
                        >
                          {copied === 'username' ? (
                            <Check className="w-4 h-4 text-green-600" />
                          ) : (
                            <Copy className="w-4 h-4" />
                          )}
                        </button>
                      </div>
                    </div>

                    <div>
                      <label className="text-xs text-gray-500 mb-1 block">New Password</label>
                      <div className="flex items-center gap-2">
                        <code className="flex-1 bg-white px-3 py-2 rounded-lg text-sm font-mono text-gray-900 border border-gray-200">
                          {result.newPassword}
                        </code>
                        <button
                          onClick={() => copyToClipboard(result.newPassword || '', 'password')}
                          className="p-2 text-gray-400 hover:text-gray-600 hover:bg-white rounded-lg transition-colors"
                        >
                          {copied === 'password' ? (
                            <Check className="w-4 h-4 text-green-600" />
                          ) : (
                            <Copy className="w-4 h-4" />
                          )}
                        </button>
                      </div>
                    </div>
                  </div>
                </div>

                {/* Warning */}
                <div className="bg-amber-50 border border-amber-200 rounded-lg p-3 mb-5">
                  <p className="text-xs text-amber-800">
                    <strong>Important:</strong> Copy and save these credentials securely. The password will not be shown again.
                    The user should change this password upon their next login.
                  </p>
                </div>

                {/* Reset Another Button */}
                <button
                  onClick={handleReset}
                  className="w-full px-4 py-2.5 text-sm font-medium text-gray-700 bg-gray-100 rounded-lg hover:bg-gray-200 transition-colors"
                >
                  Reset Another Password
                </button>
              </div>
            )}

            {!result.success && (
              <div className="p-5">
                <button
                  onClick={handleReset}
                  className="text-sm font-medium text-gray-900 hover:underline"
                >
                  Try Again
                </button>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
};

export default PasswordRecovery;
