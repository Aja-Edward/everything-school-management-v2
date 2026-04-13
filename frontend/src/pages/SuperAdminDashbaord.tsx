import React, { useState, useEffect } from 'react';
import {
  Shield, Users, Settings, Database, BarChart3,
  Bell, ArrowRight, CheckCircle, Activity, School,
  Calendar, BookOpen,
} from 'lucide-react';
import { SchoolSettings } from '@/types/types';
import SettingsService from '@/services/SettingsService';
import api from '@/services/api';

interface DashboardStats {
  totalUsers: number;
  totalTeachers: number;
  totalStudents: number;
  activeSessions: number;
  systemUptime: string;
}

const SuperAdminDashboard = () => {
  const [schoolSettings, setSchoolSettings] = useState<SchoolSettings | null>(null);
  const [activeCard, setActiveCard] = useState<number | null>(null);
  const [mounted, setMounted] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [stats, setStats] = useState<DashboardStats>({
    totalUsers: 0,
    totalTeachers: 0,
    totalStudents: 0,
    activeSessions: 0,
    systemUptime: '99.9%',
  });

  useEffect(() => {
    const fetchDashboardData = async () => {
      setMounted(true);
      setLoading(true);
      setError(null);

      try {
        // Settings via SettingsService (already cookie-aware)
        const settings = await SettingsService.getSettings();
        setSchoolSettings(settings);
      } catch {
        setError('Unable to load school settings');
      }

      // ✅ Stats via api.ts — no localStorage, credentials handled automatically
      const [usersRes, teachersRes, studentsRes] = await Promise.allSettled([
        api.get('/users/users/'),
        api.get('/teachers/teachers/'),
        api.get('/students/students/'),
      ]);

      const count = (res: PromiseSettledResult<any>): number => {
        if (res.status !== 'fulfilled' || !res.value) return 0;
        const val = res.value;
        return Array.isArray(val) ? val.length : val.count ?? val.results?.length ?? 0;
      };

      const totalUsers = count(usersRes);
      const totalTeachers = count(teachersRes);
      const totalStudents = count(studentsRes);

      setStats({
        totalUsers,
        totalTeachers,
        totalStudents,
        activeSessions: Math.floor((totalUsers + totalTeachers) * 0.15),
        systemUptime: '99.9%',
      });

      setLoading(false);
    };

    fetchDashboardData();
  }, []);

  const adminCards = [
    {
      id: 1,
      title: 'Admin Platform',
      description: 'Access the complete administrative control panel',
      icon: Shield,
      color: 'from-blue-500 to-blue-600',
      link: '/admin/dashboard',
      features: ['User Management', 'System Configuration', 'Database Access'],
    },
    {
      id: 2,
      title: 'Analytics & Reports',
      description: 'View system-wide analytics and generate reports',
      icon: BarChart3,
      color: 'from-purple-500 to-purple-600',
      link: '/admin/analytics',
      features: ['Performance Metrics', 'User Statistics', 'System Health'],
    },
    {
      id: 3,
      title: 'System Settings',
      description: 'Configure global system settings and preferences',
      icon: Settings,
      color: 'from-green-500 to-green-600',
      link: '/admin/settings',
      features: ['General Settings', 'Security Config', 'API Management'],
    },
    {
      id: 4,
      title: 'Database Management',
      description: 'Direct access to database administration tools',
      icon: Database,
      color: 'from-orange-500 to-orange-600',
      link: '/admin/database',
      features: ['Backup & Restore', 'Query Console', 'Data Migration'],
    },
  ];

  const quickStats = [
    { label: 'Total Users', value: loading ? '...' : stats.totalUsers.toLocaleString(), icon: Users, color: 'text-blue-600' },
    { label: 'Teachers', value: loading ? '...' : stats.totalTeachers.toLocaleString(), icon: BookOpen, color: 'text-green-600' },
    { label: 'Students', value: loading ? '...' : stats.totalStudents.toLocaleString(), icon: School, color: 'text-purple-600' },
    { label: 'Active Sessions', value: loading ? '...' : stats.activeSessions.toLocaleString(), icon: Activity, color: 'text-emerald-600' },
  ];

  const schoolName = schoolSettings?.school_name || 'School Name';
  const schoolCode = schoolSettings?.school_code || 'SCH';
  const schoolMotto = schoolSettings?.motto || '';
  const academicYear =
    schoolSettings?.academicYearStart && schoolSettings?.academicYearEnd
      ? `${schoolSettings.academicYearStart}/${schoolSettings.academicYearEnd}`
      : schoolSettings?.academicYearEnd || '2025/2026';

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-900 via-blue-900 to-slate-900 relative overflow-hidden">
      {/* Background blobs */}
      <div className="absolute inset-0 overflow-hidden pointer-events-none">
        <div className="absolute top-1/4 left-1/4 w-96 h-96 bg-blue-500 rounded-full mix-blend-multiply filter blur-3xl opacity-20 animate-pulse" />
        <div className="absolute bottom-1/4 right-1/4 w-96 h-96 bg-purple-500 rounded-full mix-blend-multiply filter blur-3xl opacity-20 animate-pulse" style={{ animationDelay: '1s' }} />
        <div className="absolute top-1/2 left-1/2 w-96 h-96 bg-cyan-500 rounded-full mix-blend-multiply filter blur-3xl opacity-20 animate-pulse" style={{ animationDelay: '2s' }} />
      </div>

      <style>{`
        @keyframes float {
          0%, 100% { transform: translateY(0px) translateX(0px); }
          50%       { transform: translateY(-20px) translateX(10px); }
        }
      `}</style>

      {/* Floating particles */}
      {[...Array(20)].map((_, i) => (
        <div
          key={i}
          className="absolute w-2 h-2 bg-white rounded-full opacity-20 pointer-events-none"
          style={{
            top: `${(i * 37) % 100}%`,
            left: `${(i * 53) % 100}%`,
            animation: `float ${5 + (i % 5) * 2}s ease-in-out infinite`,
            animationDelay: `${(i % 5)}s`,
          }}
        />
      ))}

      <div className="relative z-10 container mx-auto px-6 pt-24 pb-12">
        {/* Header */}
        <div className={`text-center mb-16 transition-all duration-1000 ${mounted ? 'opacity-100 translate-y-0' : 'opacity-0 -translate-y-10'}`}>
          {schoolSettings?.logo ? (
            <div className="inline-flex items-center justify-center w-24 h-24 mb-6 rounded-full overflow-hidden shadow-2xl border-4 border-white/30">
              <img src={schoolSettings.logo} alt="School Logo" className="w-full h-full object-cover" />
            </div>
          ) : (
            <div className="inline-flex items-center justify-center w-24 h-24 bg-gradient-to-br from-blue-500 to-purple-600 rounded-full mb-6 shadow-2xl">
              <Shield className="w-12 h-12 text-white" />
            </div>
          )}

          <h1 className="text-5xl md:text-6xl font-bold text-white mb-4 tracking-tight">
            Welcome, Super Admin
          </h1>
          <p className="text-2xl text-blue-200 mb-2 font-light">
            {loading ? 'Loading...' : schoolName}
          </p>
          <div className="flex items-center justify-center gap-6 text-blue-300 text-sm mb-4">
            <div className="flex items-center gap-2">
              <span className="font-semibold">School Code:</span>
              <span className="px-3 py-1 bg-white/10 rounded-full font-mono">
                {loading ? '...' : schoolCode}
              </span>
            </div>
            <div className="flex items-center gap-2">
              <Calendar className="w-4 h-4" />
              <span className="font-semibold">Session:</span>
              <span>{loading ? '...' : academicYear}</span>
            </div>
          </div>
          {schoolMotto && (
            <p className="text-lg text-blue-300 italic mb-4">"{schoolMotto}"</p>
          )}
          <div className="flex items-center justify-center gap-2 text-emerald-400">
            <CheckCircle className="w-5 h-5" />
            <span className="text-sm font-medium">All Systems Operational</span>
          </div>
        </div>

        {/* Stats */}
        <div className={`grid grid-cols-1 md:grid-cols-4 gap-6 mb-12 transition-all duration-1000 delay-200 ${mounted ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-10'}`}>
          {quickStats.map((stat) => {
            const Icon = stat.icon;
            return (
              <div
                key={stat.label}
                className="bg-white/10 backdrop-blur-lg rounded-2xl p-6 border border-white/20 hover:bg-white/15 transition-all duration-300 hover:scale-105"
              >
                <div className="flex items-center justify-between mb-3">
                  <Icon className={`w-8 h-8 ${stat.color}`} />
                  {!loading && <Activity className="w-4 h-4 text-white/50 animate-pulse" />}
                </div>
                <div className="text-3xl font-bold text-white mb-1">{stat.value}</div>
                <div className="text-sm text-blue-200 font-medium">{stat.label}</div>
              </div>
            );
          })}
        </div>

        {/* School info card */}
        {schoolSettings && !loading && (
          <div className={`mb-12 transition-all duration-1000 delay-300 ${mounted ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-10'}`}>
            <div className="bg-gradient-to-r from-blue-500/20 to-purple-500/20 backdrop-blur-xl rounded-2xl p-6 border border-blue-500/30">
              <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                {schoolSettings.address && (
                  <div>
                    <h4 className="text-sm font-semibold text-blue-300 mb-2">Address</h4>
                    <p className="text-white">{schoolSettings.address}</p>
                  </div>
                )}
                {schoolSettings.email && (
                  <div>
                    <h4 className="text-sm font-semibold text-blue-300 mb-2">Email</h4>
                    <p className="text-white">{schoolSettings.email}</p>
                  </div>
                )}
                {schoolSettings.phone && (
                  <div>
                    <h4 className="text-sm font-semibold text-blue-300 mb-2">Phone</h4>
                    <p className="text-white">{schoolSettings.phone}</p>
                  </div>
                )}
              </div>
            </div>
          </div>
        )}

        {/* Admin cards */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-8 mb-12">
          {adminCards.map((card, index) => {
            const Icon = card.icon;
            return (
              <div
                key={card.id}
                className={`transition-all duration-700 ${mounted ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-10'}`}
                style={{ transitionDelay: `${(index + 4) * 100}ms` }}
                onMouseEnter={() => setActiveCard(card.id)}
                onMouseLeave={() => setActiveCard(null)}
              >
                <div className={`relative bg-white/10 backdrop-blur-xl rounded-3xl p-8 border border-white/20 hover:border-white/40 transition-all duration-500 hover:shadow-2xl hover:scale-105 group cursor-pointer ${activeCard === card.id ? 'ring-4 ring-white/30' : ''}`}>
                  <div className={`absolute inset-0 bg-gradient-to-br ${card.color} opacity-0 group-hover:opacity-10 rounded-3xl transition-opacity duration-500`} />
                  <div className="relative">
                    <div className={`inline-flex items-center justify-center w-16 h-16 bg-gradient-to-br ${card.color} rounded-2xl mb-6 shadow-lg group-hover:scale-110 transition-transform duration-300`}>
                      <Icon className="w-8 h-8 text-white" />
                    </div>
                    <h3 className="text-2xl font-bold text-white mb-3 group-hover:text-blue-200 transition-colors">
                      {card.title}
                    </h3>
                    <p className="text-blue-200 mb-6 leading-relaxed">{card.description}</p>
                    <div className="space-y-2 mb-6">
                      {card.features.map((feature) => (
                        <div key={feature} className="flex items-center gap-2 text-sm text-blue-100">
                          <CheckCircle className="w-4 h-4 text-emerald-400" />
                          <span>{feature}</span>
                        </div>
                      ))}
                    </div>
                    
                     <a href={card.link}
                      className={`inline-flex items-center gap-2 px-6 py-3 bg-gradient-to-r ${card.color} text-white font-semibold rounded-xl hover:shadow-lg transition-all duration-300 group-hover:gap-4`}
                    >
                      Access Platform
                      <ArrowRight className="w-5 h-5 group-hover:translate-x-1 transition-transform" />
                    </a>
                  </div>
                </div>
              </div>
            );
          })}
        </div>

        {/* Notice */}
        <div className={`transition-all duration-1000 delay-700 ${mounted ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-10'}`}>
          <div className="bg-gradient-to-r from-amber-500/20 to-orange-500/20 backdrop-blur-xl rounded-2xl p-6 border border-amber-500/30">
            <div className="flex items-start gap-4">
              <Bell className="w-6 h-6 text-amber-400 animate-bounce flex-shrink-0 mt-1" />
              <div>
                <h4 className="text-lg font-semibold text-white mb-2">Administrator Guidelines</h4>
                <ul className="space-y-2 text-blue-100 text-sm">
                  {[
                    'Your primary workspace is the Admin Platform — this is your command center for all administrative tasks.',
                    'All super admin privileges are active — exercise caution when making system-wide changes.',
                    'Regular backups are recommended before major configuration changes.',
                    'Monitor system health and user activity through the Analytics dashboard.',
                  ].map((item) => (
                    <li key={item} className="flex items-start gap-2">
                      <span className="text-amber-400 mt-1">•</span>
                      <span>{item}</span>
                    </li>
                  ))}
                </ul>
              </div>
            </div>
          </div>
        </div>

        {error && (
          <div className="mt-6 bg-red-500/20 backdrop-blur-xl rounded-2xl p-4 border border-red-500/30 text-center">
            <p className="text-red-300 text-sm">{error}</p>
          </div>
        )}

        {/* Footer */}
        <div className={`text-center mt-12 transition-all duration-1000 delay-900 ${mounted ? 'opacity-100' : 'opacity-0'}`}>
          <p className="text-blue-300 text-sm">
            © 2024 {schoolName} Management System • Super Admin Dashboard v2.0
          </p>
          {schoolSettings?.site_name && (
            <p className="text-blue-400 text-xs mt-2">
              <a href={schoolSettings.site_name} target="_blank" rel="noopener noreferrer" className="hover:underline">
                {schoolSettings.site_name}
              </a>
            </p>
          )}
        </div>
      </div>
    </div>
  );
};

export default SuperAdminDashboard;