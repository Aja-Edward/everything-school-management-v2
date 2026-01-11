import React, { useState, useEffect, useCallback, useMemo } from 'react';
import {
  Eye, EyeOff, BookOpen, ArrowRight, GraduationCap, 
  Sparkles, ChevronLeft, Brain, Zap, Trophy,
  AlertCircle, CheckCircle, Mail, Lock, Star,
  Target, Globe, Award
} from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import type { LoginCredentials, UserRole } from '@/types/types';


interface LoginProps {
  onLogin: (credentials: LoginCredentials) => Promise<void>;
  onBackToHome: () => void;
  onSocialLogin?: (provider: 'google' | 'facebook') => void;
  onForgotPassword?: () => void;
  onCreateAccount?: () => void;
  isLoading?: boolean;
  errors?: Record<string, string>;
  initialRole?: 'teacher';
  hideRoleSelect?: boolean;
}

interface Particle {
  id: number;
  x: number;
  y: number;
  size: number;
  speed: number;
  opacity: number;
  angle: number;
}

const TeacherLoginForm: React.FC<LoginProps> = ({ 
  onLogin, 
  onBackToHome, 
  onSocialLogin,
  onForgotPassword,
  onCreateAccount,
  isLoading: externalLoading = false,
  errors: externalErrors = {},
  initialRole = 'teacher',

}) => {
  const [showPassword, setShowPassword] = useState(false);
  const [form, setForm] = useState<LoginCredentials>({
    username: '',
    password: '',
    role: (initialRole ?? 'teacher') as UserRole,
    rememberMe: false
  });
  const [internalLoading, setInternalLoading] = useState(false);
  const [internalErrors, setInternalErrors] = useState<Record<string, string>>({});
  const [loginSuccess, setLoginSuccess] = useState(false);
  const [mousePos, setMousePos] = useState({ x: 0, y: 0 });
  const [particles, setParticles] = useState<Particle[]>([]);
  const [mounted, setMounted] = useState(false);
  const [focusedField, setFocusedField] = useState<string>('');

  const isLoading = externalLoading || internalLoading;
  const errors = useMemo(() => ({
    ...internalErrors,
    ...externalErrors
  }), [internalErrors, externalErrors]);

  const navigate = useNavigate();

  // Component mount state
  useEffect(() => {
    setMounted(true);
    return () => setMounted(false);
  }, []);

  // Handle external errors
  useEffect(() => {
    if (Object.keys(externalErrors).length > 0) {
      setInternalErrors({});
    }
  }, [externalErrors]);

  // Mouse tracking for interactive effects
  const handleMouseMove = useCallback((e: MouseEvent) => {
    if (!mounted) return;
    setMousePos({ x: e.clientX, y: e.clientY });
  }, [mounted]);

  useEffect(() => {
    if (!mounted) return;
    
    let rafId: number = 0;
    const throttledMove = (e: MouseEvent) => {
      if (rafId) return;
      rafId = requestAnimationFrame(() => {
        handleMouseMove(e);
        rafId = 0;
      });
    };
    
    window.addEventListener('mousemove', throttledMove, { passive: true });
    return () => {
      window.removeEventListener('mousemove', throttledMove);
      if (rafId) cancelAnimationFrame(rafId);
    };
  }, [handleMouseMove, mounted]);

  // Enhanced particle system for learning theme
  useEffect(() => {
    if (!mounted) return;

    const newParticles = Array.from({ length: 25 }, (_, i) => ({
      id: i,
      x: Math.random() * 100,
      y: Math.random() * 100,
      size: Math.random() * 3 + 1,
      speed: Math.random() * 0.3 + 0.1,
      opacity: Math.random() * 0.4 + 0.1,
      angle: Math.random() * Math.PI * 2
    }));
    setParticles(newParticles);

    const animateParticles = () => {
      if (!mounted) return;
      setParticles(prev => prev.map(particle => ({
        ...particle,
        y: particle.y <= -2 ? 102 : particle.y - particle.speed,
        x: particle.x + Math.sin(particle.angle) * 0.03,
        angle: particle.angle + 0.003
      })));
    };

    const interval = setInterval(animateParticles, 80);
    return () => clearInterval(interval);
  }, [mounted]);

  // Form validation
  const validateForm = useCallback(() => {
    const newErrors: Record<string, string> = {};
    if (!form.username.trim()) {
      newErrors.username = 'Username is required';
    }
    if (!form.password) {
      newErrors.password = 'Password is required';
    } else if (form.password.length < 6) {
      newErrors.password = 'Password must be at least 6 characters';
    }
    setInternalErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  }, [form.username, form.password]);

  // Enhanced login handler
  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    
    if (!validateForm()) return;

    setInternalLoading(true);
    setInternalErrors({});

    try {
      if (form.rememberMe && typeof window !== 'undefined') {
        try {
          const rememberData = {
            username: form.username,
            role: form.role,
            timestamp: Date.now()
          };
          console.log('Remember me data:', rememberData);
        } catch (err) {
          console.warn('Could not save remember me preference:', err);
        }
      }

      setLoginSuccess(true);
  
      await onLogin(form);
      
    } catch (error) {
      console.error('Login error:', error);
      setInternalErrors({ general: 'Login failed. Please check your credentials.' });
    } finally {
      setInternalLoading(false);
    }
  };

  const handleInputChange = (field: keyof LoginCredentials, value: string | boolean) => {
    setForm(prev => ({ ...prev, [field]: value }));
    
    if (internalErrors[field]) {
      setInternalErrors(prev => ({ ...prev, [field]: '' }));
    }
    
    if (internalErrors.general && (field === 'username' || field === 'password')) {
      setInternalErrors(prev => ({ ...prev, general: '' }));
    }
  };

  const handleForgotPassword = () => {
    if (onForgotPassword) {
      onForgotPassword();
    } else {
      console.log('Forgot password clicked');
    }
  };

  const handleCreateAccount = () => {
    if (onCreateAccount) {
      onCreateAccount();
    } else {
      navigate('/signup');
    }
  };

  // Teacher-focused features
  const studentFeatures = useMemo(() => [
    { icon: Brain, title: 'AI Tutoring', desc: 'Personalized learning paths', color: 'from-blue-500 to-cyan-400' },
    { icon: Trophy, title: 'Achievements', desc: 'Track your progress', color: 'from-yellow-500 to-orange-400' },
    { icon: Target, title: 'Smart Goals', desc: 'Reach learning targets', color: 'from-green-500 to-emerald-400' },
    { icon: Zap, title: 'Quick Learning', desc: 'Accelerated comprehension', color: 'from-purple-500 to-pink-400' },
    { icon: Globe, title: 'Global Access', desc: 'Learn from anywhere', color: 'from-indigo-500 to-blue-400' },
    { icon: Award, title: 'Certifications', desc: 'Earn verified badges', color: 'from-red-500 to-rose-400' }
  ], []);

  const studentStats = useMemo(() => [
    { number: '98%', label: 'Success Rate' },
    { number: '45K+', label: 'Active Students' },
    { number: '500+', label: 'Courses Available' }
  ], []);

  return (
    <div className="relative min-h-screen w-full overflow-hidden">
      {/* Enhanced Background with Learning Theme */}
      <div className="absolute inset-0">
        <div className="absolute inset-0 bg-gradient-to-br from-slate-900 via-indigo-900 to-purple-900" />
        
        {/* Dynamic mouse-following gradient */}
        <div 
          className="absolute inset-0 opacity-20 transition-all duration-700"
          style={{
            background: `radial-gradient(800px circle at ${mousePos.x}px ${mousePos.y}px, rgba(99, 102, 241, 0.15), rgba(168, 85, 247, 0.1) 40%, transparent 70%)`
          }}
        />
        
        {/* Floating learning particles */}
        {particles.map(particle => (
          <div
            key={particle.id}
            className="absolute rounded-full bg-gradient-to-r from-indigo-400 via-purple-400 to-pink-400 pointer-events-none"
            style={{
              left: `${particle.x}%`,
              top: `${particle.y}%`,
              width: `${particle.size}px`,
              height: `${particle.size}px`,
              opacity: particle.opacity,
              willChange: 'transform',
              filter: 'blur(0.5px)'
            }}
          />
        ))}

        {/* Subtle geometric patterns */}
        <div className="absolute inset-0 opacity-5">
          <div className="absolute top-1/4 left-1/4 w-64 h-64 border border-white/20 rounded-full"></div>
          <div className="absolute bottom-1/4 right-1/4 w-48 h-48 border border-white/10 rounded-full"></div>
          <div className="absolute top-1/2 right-1/3 w-32 h-32 border border-white/15 rounded-full"></div>
        </div>
      </div>

      {/* Content */}
      <div className="relative z-10 min-h-screen flex items-center justify-center px-4 py-16">
        {/* Elegant Back Button */}
        <button 
          onClick={onBackToHome} 
          className="absolute top-6 left-6 flex items-center space-x-3 text-white/80 hover:text-white transition-all duration-300 group z-20 bg-white/5 backdrop-blur-xl px-5 py-3 rounded-2xl border border-white/10 hover:bg-white/10 hover:border-white/20"
        >
          <ChevronLeft size={18} className="group-hover:-translate-x-1 transition-transform duration-300" />
          <span className="font-medium text-sm">Back to Home</span>
        </button>

        <div className="w-full max-w-7xl grid grid-cols-1 lg:grid-cols-5 gap-12 items-center">
          {/* Left: Teacher-Focused Branding */}
          <div className="lg:col-span-3 text-white space-y-8">
            <div className="space-y-6">
              <div className="space-y-4">
                <div className="inline-flex items-center space-x-2 bg-gradient-to-r from-indigo-500/20 to-purple-500/20 backdrop-blur-xl px-4 py-2 rounded-full border border-white/20">
                  <GraduationCap size={16} className="text-indigo-300" />
                  <span className="text-sm font-semibold text-indigo-200">Teacher Portal</span>
                </div>
                
                <h1 className="text-5xl lg:text-6xl font-black leading-tight">
                  Your Journey to
                  <br />
                  <span className="bg-gradient-to-r from-indigo-400 via-purple-400 to-pink-400 bg-clip-text text-transparent">
                    Academic Excellence
                  </span>
                </h1>
                <p className="text-xl text-white/70 max-w-2xl leading-relaxed">
                  Unlock your potential with AI-powered learning, personalized study paths, and interactive experiences designed just for students.
                </p>
              </div>
            </div>

            {/* Enhanced Feature Grid */}
            <div className="grid grid-cols-2 lg:grid-cols-3 gap-4">
              {studentFeatures.map((feature, idx) => (
                <div 
                  key={idx} 
                  className="bg-white/5 backdrop-blur-xl rounded-2xl p-5 border border-white/10 hover:bg-white/10 transition-all duration-300 hover:scale-105 hover:border-white/20 group cursor-pointer"
                >
                  <div className={`w-12 h-12 bg-gradient-to-br ${feature.color} rounded-xl flex items-center justify-center mb-3 group-hover:scale-110 transition-transform duration-300 shadow-lg`}>
                    <feature.icon size={18} className="text-white" strokeWidth={1.5} />
                  </div>
                  <h4 className="text-white font-bold text-sm mb-1">{feature.title}</h4>
                  <p className="text-white/60 text-xs leading-relaxed">{feature.desc}</p>
                </div>
              ))}
            </div>

            {/* Teacher Statistics */}
            <div className="flex justify-center lg:justify-start space-x-8">
              {studentStats.map((stat, idx) => (
                <div key={idx} className="text-center group">
                  <div className="text-3xl font-black bg-gradient-to-r from-indigo-400 to-purple-400 bg-clip-text text-transparent group-hover:scale-105 transition-transform duration-300">
                    {stat.number}
                  </div>
                  <div className="text-white/60 text-sm font-medium">{stat.label}</div>
                </div>
              ))}
            </div>
          </div>

          {/* Right: Premium Login Form */}
          <div className="lg:col-span-2">
            <div className="bg-white/8 backdrop-blur-2xl rounded-3xl p-8 border border-white/15 shadow-2xl max-w-md w-full mx-auto relative">
              <div className="text-white">
                {/* Premium Header */}
                <div className="text-center mb-8">
                  <div className="inline-flex items-center space-x-2 bg-gradient-to-r from-indigo-500/20 to-purple-500/20 backdrop-blur-xl px-4 py-2 rounded-full border border-white/20 mb-4">
                    {loginSuccess ? (
                      <>
                        <CheckCircle size={16} className="text-green-400" />
                        <span className="text-sm font-semibold">Welcome Back!</span>
                      </>
                    ) : (
                      <>
                        <Sparkles size={16} className="text-yellow-400" />
                        <span className="text-sm font-semibold">Teacher Access</span>
                        <Star size={14} className="text-yellow-400" />
                      </>
                    )}
                  </div>
                  <h2 className="text-3xl font-black mb-2">
                    {loginSuccess ? 'Success!' : 'Teacher Sign In'}
                  </h2>
                  <p className="text-white/70 text-sm">
                    {loginSuccess ? 'Loading your dashboard...' : 'Continue your learning journey'}
                  </p>
                </div>

                <form onSubmit={handleLogin} className="space-y-6">
                  {/* Error Messages */}
                  {(errors.general || errors.google) && (
                    <div className="flex items-center space-x-3 p-4 bg-red-500/15 border border-red-500/25 rounded-2xl backdrop-blur-xl">
                      <AlertCircle size={16} className="text-red-400" />
                      <span className="text-sm text-red-300">
                        {errors.general || errors.google}
                      </span>
                    </div>
                  )}

                  {/* Username Field */}
                  <div className="space-y-2">
                    <label className="block text-sm font-semibold text-white/90 flex items-center space-x-2">
                      <Mail size={14} />
                      <span>Username</span>
                    </label>
                    <input
                      type="text"
                      value={form.username}
                      onChange={(e) => handleInputChange('username', e.target.value)}
                      onFocus={() => setFocusedField('username')}
                      onBlur={() => setFocusedField('')}
                      placeholder="Enter your teacher username"
                      className={`w-full px-4 py-4 rounded-2xl bg-white/5 border text-white placeholder-white/50 focus:outline-none focus:ring-2 transition-all duration-300 backdrop-blur-xl ${
                        errors.username 
                          ? 'border-red-500/50 focus:ring-red-400/30' 
                          : focusedField === 'username'
                          ? 'border-indigo-400/60 focus:ring-indigo-400/30 bg-white/10'
                          : 'border-white/20 focus:ring-indigo-400/30'
                      }`}
                      disabled={isLoading}
                    />
                    {errors.username && (
                      <p className="text-red-300 text-xs flex items-center space-x-1 ml-1">
                        <AlertCircle size={12} />
                        <span>{errors.username}</span>
                      </p>
                    )}
                  </div>

                  {/* Password Field */}
                  <div className="space-y-2">
                    <label className="block text-sm font-semibold text-white/90 flex items-center space-x-2">
                      <Lock size={14} />
                      <span>Password</span>
                    </label>
                    <div className="relative">
                      <input
                        type={showPassword ? "text" : "password"}
                        value={form.password}
                        onChange={(e) => handleInputChange('password', e.target.value)}
                        onFocus={() => setFocusedField('password')}
                        onBlur={() => setFocusedField('')}
                        placeholder="Enter your secure password"
                        className={`w-full px-4 py-4 rounded-2xl bg-white/5 border text-white placeholder-white/50 focus:outline-none focus:ring-2 transition-all duration-300 backdrop-blur-xl pr-12 ${
                          errors.password 
                            ? 'border-red-500/50 focus:ring-red-400/30' 
                            : focusedField === 'password'
                            ? 'border-indigo-400/60 focus:ring-indigo-400/30 bg-white/10'
                            : 'border-white/20 focus:ring-indigo-400/30'
                        }`}
                        disabled={isLoading}
                      />
                      <button
                        type="button"
                        onClick={() => setShowPassword(!showPassword)}
                        className="absolute right-4 top-1/2 transform -translate-y-1/2 text-white/60 hover:text-white transition-colors"
                        disabled={isLoading}
                      >
                        {showPassword ? <EyeOff size={18} /> : <Eye size={18} />}
                      </button>
                    </div>
                    {errors.password && (
                      <p className="text-red-300 text-xs flex items-center space-x-1 ml-1">
                        <AlertCircle size={12} />
                        <span>{errors.password}</span>
                      </p>
                    )}
                  </div>

                  {/* Remember Me & Forgot Password */}
                  <div className="flex items-center justify-between text-sm">
                    <label className="flex items-center space-x-3 cursor-pointer group">
                      <input 
                        type="checkbox" 
                        checked={form.rememberMe}
                        onChange={(e) => handleInputChange('rememberMe', e.target.checked)}
                        className="w-4 h-4 accent-indigo-500 rounded border-white/30 bg-white/10" 
                        disabled={isLoading}
                      />
                      <span className="text-white/70 group-hover:text-white/90 transition-colors">Remember me</span>
                    </label>
                    <button 
                      type="button" 
                      onClick={handleForgotPassword}
                      className="text-indigo-300 hover:text-indigo-200 font-medium hover:underline transition-colors"
                      disabled={isLoading}
                    >
                      Forgot password?
                    </button>
                  </div>

                  {/* Premium Sign In Button */}
                  <button
                    type="submit"
                    disabled={isLoading || loginSuccess}
                    className="w-full py-4 rounded-2xl bg-gradient-to-r from-indigo-500 via-purple-500 to-pink-500 font-bold text-white hover:shadow-2xl hover:shadow-indigo-500/25 transition-all duration-300 hover:scale-[1.02] active:scale-[0.98] disabled:opacity-70 disabled:cursor-not-allowed relative overflow-hidden group"
                  >
                    <span className="relative z-10 flex items-center justify-center gap-2">
                      {isLoading ? (
                        <>
                          <div className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                          Signing you in...
                        </>
                      ) : loginSuccess ? (
                        <>
                          <CheckCircle size={20} />
                          Welcome back!
                        </>
                      ) : (
                        <>
                          <BookOpen size={18} />
                          Start Learning
                          <ArrowRight size={18} className="group-hover:translate-x-1 transition-transform" />
                        </>
                      )}
                    </span>
                    <div className="absolute inset-0 bg-gradient-to-r from-indigo-600 via-purple-600 to-pink-600 opacity-0 group-hover:opacity-100 transition-opacity duration-300"></div>
                  </button>

                  {/* Social Login Divider */}
                  <div className="relative flex items-center justify-center py-4">
                    <div className="absolute inset-0 flex items-center">
                      <div className="w-full border-t border-white/20" />
                    </div>
                    <div className="relative bg-gradient-to-r from-slate-900/95 to-indigo-900/95 px-4 text-xs text-white/60 font-medium">
                      Quick access with
                    </div>
                  </div>

                  {/* Enhanced Social Login */}
                  <div className="grid grid-cols-2 gap-4">
                    <button
                      type="button"
                      onClick={() => onSocialLogin?.('google')}
                      disabled={isLoading}
                      className="flex items-center justify-center space-x-2 py-3 px-4 rounded-2xl bg-white/5 border border-white/20 hover:bg-white/10 hover:border-white/30 transition-all duration-300 group backdrop-blur-xl disabled:opacity-50"
                    >
                      <svg className="w-5 h-5" viewBox="0 0 24 24">
                        <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"/>
                        <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"/>
                        <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"/>
                        <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"/>
                      </svg>
                      <span className="text-sm font-medium">Google</span>
                    </button>
                    
                    <button
                      type="button"
                      onClick={() => onSocialLogin?.('facebook')}
                      disabled={isLoading}
                      className="flex items-center justify-center space-x-2 py-3 px-4 rounded-2xl bg-white/5 border border-white/20 hover:bg-white/10 hover:border-white/30 transition-all duration-300 group backdrop-blur-xl disabled:opacity-50"
                    >
                      <svg className="w-5 h-5 text-[#1877F2]" fill="currentColor" viewBox="0 0 24 24">
                        <path d="M24 12.073c0-6.627-5.373-12-12-12s-12 5.373-12 12c0 5.99 4.388 10.954 10.125 11.854v-8.385H7.078v-3.47h3.047V9.43c0-3.007 1.792-4.669 4.533-4.669 1.312 0 2.686.235 2.686.235v2.953H15.83c-1.491 0-1.956.925-1.956 1.874v2.25h3.328l-.532 3.47h-2.796v8.385C19.612 23.027 24 18.062 24 12.073z"/>
                      </svg>
                      <span className="text-sm font-medium">Facebook</span>
                    </button>
                  </div>
                </form>

                {/* Create Account Link */}
                <p className="mt-8 text-center text-white/70 text-sm">
                  New to our platform?{' '}
                  <button 
                    onClick={handleCreateAccount}
                    className="text-indigo-300 hover:text-indigo-200 font-bold hover:underline transition-all"
                    disabled={isLoading}
                  >
                    Create Teacher Account
                  </button>
                </p>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default TeacherLoginForm;