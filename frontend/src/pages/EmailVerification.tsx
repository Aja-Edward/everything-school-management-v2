import React, { useState, useEffect } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { useAuth } from '../hooks/useAuth';

const EmailVerification: React.FC = () => {
  const [verificationCode, setVerificationCode] = useState('');
  const [email, setEmail] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const { login } = useAuth();
  const [credentials, setCredentials] = useState<{username?: string, password?: string, parentUsername?: string, parentPassword?: string}>({});

  useEffect(() => {
    // Get email from URL params if available
    const emailParam = searchParams.get('email');
    if (emailParam) {
      setEmail(emailParam);
    }
  }, [searchParams]);

  const handleVerification = async (e: React.FormEvent) => {
    e.preventDefault();
    
    if (!verificationCode || !email) {
      setError('Please enter both email and verification code');
      return;
    }

    setIsLoading(true);
    setError('');

    try {
      const response = await fetch(`${import.meta.env.VITE_API_URL || 'http://localhost:8000/api'}/auth/verify-account/`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          email: email,
          verification_code: verificationCode,
        }),
      });

      const data = await response.json();

      if (response.ok) {
        setSuccess('Account verified successfully! Please save your credentials below.');
        setCredentials({
          username: data.user?.username,
          password: data.user?.password,
          parentUsername: data.user?.parent_username,
          parentPassword: data.user?.parent_password,
        });
        
        // Store tokens
        if (data.access) {
          localStorage.setItem('access_token', data.access);
        }
        if (data.refresh) {
          localStorage.setItem('refresh_token', data.refresh);
        }

        // Store user info
        if (data.user) {
          localStorage.setItem('user', JSON.stringify(data.user));
        }

        // Redirect based on user role
        setTimeout(() => {
          const userRole = data.user?.role;
          if (userRole === 'student') {
            navigate('/student/dashboard');
          } else if (userRole === 'teacher') {
            navigate('/teacher/dashboard');
          } else if (userRole === 'parent') {
            navigate('/parent/dashboard');
          } else if (userRole === 'admin') {
            navigate('/admin/dashboard');
          } else {
            navigate('/dashboard');
          }
        }, 2000);
      } else {
        setError(data.message || data.error || 'Verification failed. Please try again.');
      }
    } catch (error) {
      setError('Network error. Please check your connection and try again.');
    } finally {
      setIsLoading(false);
    }
  };

  const handleResendCode = async () => {
    if (!email) {
      setError('Please enter your email address first');
      return;
    }

    setIsLoading(true);
    setError('');

    try {
      const response = await fetch(`${import.meta.env.VITE_API_URL || 'http://localhost:8000/api'}/auth/resend-verification/`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          email: email,
          verification_method: 'email',
        }),
      });

      const data = await response.json();

      if (response.ok) {
        setSuccess('Verification code sent successfully! Please check your email.');
      } else {
        setError(data.message || data.error || 'Failed to resend verification code.');
      }
    } catch (error) {
      setError('Network error. Please check your connection and try again.');
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-gray-50 flex flex-col justify-center py-12 sm:px-6 lg:px-8">
      <div className="sm:mx-auto sm:w-full sm:max-w-md">
        <h2 className="mt-6 text-center text-3xl font-extrabold text-gray-900">
          Verify Your Email
        </h2>
        <p className="mt-2 text-center text-sm text-gray-600">
          Enter the verification code sent to your email
        </p>
      </div>

      <div className="mt-8 sm:mx-auto sm:w-full sm:max-w-md">
        <div className="bg-white py-8 px-4 shadow sm:rounded-lg sm:px-10">
          <form className="space-y-6" onSubmit={handleVerification}>
            {error && (
              <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded">
                {error}
              </div>
            )}
            
            {success && (
              <div className="bg-green-50 border border-green-200 text-green-700 px-4 py-3 rounded">
                {success}
              </div>
            )}

            <div>
              <label htmlFor="email" className="block text-sm font-medium text-gray-700">
                Email Address
              </label>
              <div className="mt-1">
                <input
                  id="email"
                  name="email"
                  type="email"
                  autoComplete="email"
                  required
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  className="appearance-none block w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm placeholder-gray-400 focus:outline-none focus:ring-blue-500 focus:border-blue-500 sm:text-sm"
                  placeholder="Enter your email address"
                />
              </div>
            </div>

            <div>
              <label htmlFor="verificationCode" className="block text-sm font-medium text-gray-700">
                Verification Code
              </label>
              <div className="mt-1">
                <input
                  id="verificationCode"
                  name="verificationCode"
                  type="text"
                  required
                  value={verificationCode}
                  onChange={(e) => setVerificationCode(e.target.value)}
                  className="appearance-none block w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm placeholder-gray-400 focus:outline-none focus:ring-blue-500 focus:border-blue-500 sm:text-sm text-center text-2xl tracking-widest"
                  placeholder="000000"
                  maxLength={6}
                />
              </div>
            </div>

            <div>
              <button
                type="submit"
                disabled={isLoading}
                className="w-full flex justify-center py-2 px-4 border border-transparent rounded-md shadow-sm text-sm font-medium text-white bg-blue-600 hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {isLoading ? 'Verifying...' : 'Verify Account'}
              </button>
            </div>
          </form>

          {credentials.username && credentials.password && (
            <div className="bg-yellow-50 border border-yellow-200 text-yellow-800 px-4 py-3 rounded mt-4">
              <strong>Your Login Credentials:</strong>
              <div className="mt-2">
                <div>Username: <span className="font-mono">{credentials.username}</span> <button onClick={() => navigator.clipboard.writeText(credentials.username!)}>Copy</button></div>
                <div>Password: <span className="font-mono">{credentials.password}</span> <button onClick={() => navigator.clipboard.writeText(credentials.password!)}>Copy</button></div>
                {credentials.parentUsername && credentials.parentPassword && (
                  <>
                    <div className="mt-2">Parent Username: <span className="font-mono">{credentials.parentUsername}</span> <button onClick={() => navigator.clipboard.writeText(credentials.parentUsername!)}>Copy</button></div>
                    <div>Parent Password: <span className="font-mono">{credentials.parentPassword}</span> <button onClick={() => navigator.clipboard.writeText(credentials.parentPassword!)}>Copy</button></div>
                  </>
                )}
              </div>
              <div className="mt-2 text-xs text-red-600">Please save these credentials securely. You will not be able to see the password again!</div>
            </div>
          )}

          <div className="mt-6">
            <div className="relative">
              <div className="absolute inset-0 flex items-center">
                <div className="w-full border-t border-gray-300" />
              </div>
              <div className="relative flex justify-center text-sm">
                <span className="px-2 bg-white text-gray-500">Need a new code?</span>
              </div>
            </div>

            <div className="mt-6">
              <button
                type="button"
                onClick={handleResendCode}
                disabled={isLoading || !email}
                className="w-full flex justify-center py-2 px-4 border border-gray-300 rounded-md shadow-sm text-sm font-medium text-gray-700 bg-white hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {isLoading ? 'Sending...' : 'Resend Verification Code'}
              </button>
            </div>
          </div>

          <div className="mt-6 text-center">
            <button
              type="button"
              onClick={() => navigate('/')}
              className="text-sm text-blue-600 hover:text-blue-500"
            >
              Back to Login
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};

export default EmailVerification; 