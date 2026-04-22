import React, { useState } from 'react';
import { Lock, Eye, EyeOff, AlertCircle, CheckCircle, ArrowRight } from 'lucide-react';
import axios from 'axios';
import { API_BASE_URL } from '@/services/api';

interface PortalLoginProps {
  onSuccess: () => void;
}

const PortalLogin: React.FC<PortalLoginProps> = ({ onSuccess }) => {
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError(null);

    try {
      const response = await axios.post(`${API_BASE_URL}/auth/login/`, {
        username,
        password,
      });

      if (response.data && response.data.access) {
        setSuccess(true);
        setTimeout(() => {
          onSuccess();
        }, 500);
      } else {
        setError('Invalid credentials');
      }
    } catch (err: any) {
      setError(err.response?.data?.error || 'Login failed. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="bg-white dark:bg-slate-900 rounded-2xl shadow-xl border border-gray-100 dark:border-slate-800 overflow-hidden max-w-md mx-auto">
      {/* Header */}
      <div className="bg-gradient-to-r from-blue-600 to-indigo-600 px-6 py-6 text-center">
        <div className="inline-flex items-center justify-center w-12 h-12 bg-white/20 backdrop-blur rounded-xl mb-3">
          <Lock className="w-6 h-6 text-white" />
        </div>
        <h2 className="text-xl font-bold text-white">Authentication Required</h2>
        <p className="text-white/80 text-sm mt-1">Please verify your identity to view results</p>
      </div>

      {/* Form */}
      <div className="p-6">
        <form onSubmit={handleSubmit} className="space-y-4">
          {/* Error Message */}
          {error && (
            <div className="flex items-start gap-2 p-3 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg">
              <AlertCircle className="w-4 h-4 text-red-500 mt-0.5 flex-shrink-0" />
              <span className="text-sm text-red-700 dark:text-red-300">{error}</span>
            </div>
          )}

          {/* Success Message */}
          {success && (
            <div className="flex items-start gap-2 p-3 bg-green-50 dark:bg-green-900/20 border border-green-200 dark:border-green-800 rounded-lg">
              <CheckCircle className="w-4 h-4 text-green-500 mt-0.5 flex-shrink-0" />
              <span className="text-sm text-green-700 dark:text-green-300">Verified! Loading results...</span>
            </div>
          )}

          {/* Username Field */}
          <div className="space-y-1.5">
            <label htmlFor="username" className="block text-sm font-medium text-gray-700 dark:text-gray-300">
              Username or Email
            </label>
            <input
              id="username"
              type="text"
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              placeholder="Enter your username"
              className="w-full px-3.5 py-2.5 text-sm rounded-lg border border-gray-200 dark:border-slate-700 bg-gray-50 dark:bg-slate-800 text-gray-900 dark:text-white placeholder-gray-400 dark:placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 transition-colors"
              required
              disabled={loading || success}
            />
          </div>

          {/* Password Field */}
          <div className="space-y-1.5">
            <label htmlFor="password" className="block text-sm font-medium text-gray-700 dark:text-gray-300">
              Password
            </label>
            <div className="relative">
              <input
                id="password"
                type={showPassword ? 'text' : 'password'}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="Enter your password"
                className="w-full px-3.5 py-2.5 pr-10 text-sm rounded-lg border border-gray-200 dark:border-slate-700 bg-gray-50 dark:bg-slate-800 text-gray-900 dark:text-white placeholder-gray-400 dark:placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 transition-colors"
                required
                disabled={loading || success}
              />
              <button
                type="button"
                onClick={() => setShowPassword(!showPassword)}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 transition-colors"
                disabled={loading || success}
              >
                {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
              </button>
            </div>
          </div>

          {/* Submit Button */}
          <button
            type="submit"
            disabled={loading || success}
            className="w-full py-3 rounded-lg bg-gradient-to-r from-blue-600 to-indigo-600 text-white font-semibold text-sm hover:from-blue-700 hover:to-indigo-700 transition-all duration-200 disabled:opacity-70 disabled:cursor-not-allowed flex items-center justify-center gap-2"
          >
            {loading ? (
              <>
                <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                Verifying...
              </>
            ) : success ? (
              <>
                <CheckCircle className="w-4 h-4" />
                Verified
              </>
            ) : (
              <>
                View Results
                <ArrowRight className="w-4 h-4" />
              </>
            )}
          </button>
        </form>
      </div>
    </div>
  );
};

export default PortalLogin;


// import { useState } from 'react';
// import { Lock, Loader2 } from 'lucide-react';

// interface TokenVerificationData {
//   is_valid: boolean;
//   message: string;
//   school_term: string;
//   expires_at: string;
// }

// interface PortalLoginProps {
//   onSuccess: (tokenData: TokenVerificationData) => void;
// }

// const API_BASE_URL = import.meta.env.VITE_API_URL || 'localhost:8000/api';

// const PortalLogin = ({ onSuccess }: PortalLoginProps) => {
//   const [token, setToken] = useState('');
//   const [loading, setLoading] = useState(false);
//   const [error, setError] = useState<string | null>(null);
  



//   const fetchWithTimeout = (url: string, options: RequestInit, timeout = 8000) => {
//   const controller = new AbortController();
//   const id = setTimeout(() => controller.abort(), timeout);

//   return fetch(url, {
//     ...options,
//     signal: controller.signal,
//   }).finally(() => clearTimeout(id));
// };

//   const getAuthToken = () => {
//     const tokenKeys = ['authToken', 'token', 'access_token', 'accessToken', 'jwt'];
//     for (const key of tokenKeys) {
//       const val = localStorage.getItem(key);
//       if (val) return val;
//     }
//     return null;
//   };

//   const handleVerifyToken = async () => {
//     if (!token.trim()) {
//       setError('Please enter a result token');
//       return;
//     }

//     setLoading(true);
//     setError(null);

//     try {
//       const authToken = getAuthToken();
//       if (!authToken) {
//         setError('Authentication required. Please log in again.');
//         setLoading(false);
//         return;
//       }

//       const url = `${API_BASE_URL}/api/students/verify-result-token/`;
//       console.log('🔄 API URL:', url);

//       const response = await fetchWithTimeout(
//   `${API_BASE_URL}/api/students/verify-result-token/`,
//   {
//     method: 'POST',
//     headers: {
//       Authorization: `Bearer ${authToken}`,
//       'Content-Type': 'application/json',
//     },
//     body: JSON.stringify({ token: token.trim() }),
//   },
//   8000 // 8 seconds max
// );
//       const data = await response.json();
//       console.log('✅ Response:', data);

//       if (!response.ok) {
//         throw new Error(data.message || data.error || 'Token verification failed');
//       }

//       // Check if token is valid
//       if (data.is_valid === false) {
//         throw new Error(data.message || 'Invalid token');
//       }

//       // SUCCESS - Pass the entire response data to parent
//       console.log('✅ Calling onSuccess with data:', data);
//       onSuccess(data);

//     } catch (err: any) {
//   if (err.name === 'AbortError') {
//     setError('Request timed out. Please try again.');
//   } else {
//     setError(err.message || 'Failed to verify token.');
//   }
//     } finally {
//       setLoading(false);
//     }
//   };

//   const handleKeyPress = (e: React.KeyboardEvent) => {
//     if (e.key === 'Enter' && !loading && token.trim()) {
//       handleVerifyToken();
//     }
//   };

//   return (
//     <div className="max-w-md mx-auto">
//       <div className="bg-white dark:bg-slate-800 rounded-2xl shadow-xl p-8 border border-gray-200 dark:border-slate-700">
//         <div className="text-center mb-8">
//           <div className="w-20 h-20 bg-gradient-to-br from-blue-500 to-purple-600 rounded-full flex items-center justify-center mx-auto mb-4">
//             <Lock className="text-white" size={32} />
//           </div>
//           <h2 className="text-2xl font-bold text-gray-800 dark:text-slate-100 mb-2">
//             Result Portal Access
//           </h2>
//           <p className="text-gray-600 dark:text-slate-400">
//             Enter your result token to view your academic results
//           </p>
//         </div>

//         <div className="space-y-6">
//           <div>
//             <label 
//               htmlFor="token" 
//               className="block text-sm font-medium text-gray-700 dark:text-slate-300 mb-2"
//             >
//               Result Token
//             </label>
//             <input
//               id="token"
//               type="text"
//               value={token}
//               onChange={(e) => setToken(e.target.value)}
//               onKeyPress={handleKeyPress}
//               placeholder="Enter your result token"
//               className="w-full px-4 py-3 rounded-lg border border-gray-300 dark:border-slate-600 bg-white dark:bg-slate-700 text-gray-900 dark:text-slate-100 focus:ring-2 focus:ring-blue-500 focus:border-transparent transition-colors"
//               disabled={loading}
//             />
//           </div>

//           {error && (
//             <div className="bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 text-red-700 dark:text-red-300 px-4 py-3 rounded-lg">
//               <p className="text-sm">{error}</p>
//             </div>
//           )}

//           <button
//             onClick={handleVerifyToken}
//             disabled={loading || !token.trim()}
//             className={`w-full py-3 px-4 rounded-lg font-semibold transition-all duration-200 flex items-center justify-center space-x-2 ${
//               loading || !token.trim()
//                 ? 'bg-gray-300 dark:bg-slate-600 text-gray-500 dark:text-slate-400 cursor-not-allowed'
//                 : 'bg-gradient-to-r from-blue-600 to-purple-600 text-white hover:from-blue-700 hover:to-purple-700 shadow-lg hover:shadow-xl'
//             }`}
//           >
//             {loading ? (
//               <>
//                 <Loader2 className="w-5 h-5 animate-spin" />
//                 <span>Verifying...</span>
//               </>
//             ) : (
//               <span>Verify Token</span>
//             )}
//           </button>
//         </div>

//         <div className="mt-6 p-4 bg-blue-50 dark:bg-blue-900/20 rounded-lg border border-blue-200 dark:border-blue-800">
//           <p className="text-xs text-blue-700 dark:text-blue-300">
//             <strong>Note:</strong> Your result token is provided by your school administrator. 
//             If you don't have a token, please contact your school office.
//           </p>
//         </div>
//       </div>
//     </div>
//   );
// };

// export default PortalLogin;