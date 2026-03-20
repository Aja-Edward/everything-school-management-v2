import React, { useState } from 'react';
import { 
  Settings, Palette, Shield, GraduationCap, FileText, DollarSign, 
  Lock, MessageSquare, Wrench, Save, Bell, Users, Globe, Database, 
  Zap, Eye, EyeOff, BarChart3, UserCheck, Mail, Smartphone, ChevronRight, 
  Sparkles, Crown, Star, Upload, Check, X, AlertCircle, CreditCard,
  Camera, Monitor, Smartphone as Phone, Tablet, Key, Clock, Shield as ShieldIcon
} from 'lucide-react';

const settingsTabs = [
  'General',
  'Design', 
  'Roles & Permissions',
  'Academic',
  'Exams & Result',
  'Finance',
  'Security',
  'Communication',
  'Advanced',
];

const tabIcons = {
  'General': <Settings className="w-5 h-5" />,
  'Design': <Palette className="w-5 h-5" />,
  'Roles & Permissions': <Shield className="w-5 h-5" />,
  'Academic': <GraduationCap className="w-5 h-5" />,
  'Exams & Result': <FileText className="w-5 h-5" />,
  'Finance': <DollarSign className="w-5 h-5" />,
  'Security': <Lock className="w-5 h-5" />,
  'Communication': <MessageSquare className="w-5 h-5" />,
  'Advanced': <Wrench className="w-5 h-5" />,
};

// Premium Toggle Component
const PremiumToggle = ({ checked, onChange, size = 'default', disabled = false, label, description }: { checked: boolean; onChange: () => void; size?: 'default' | 'large' | 'small'; disabled?: boolean; label?: string; description?: string }) => {
  const sizeClasses = size === 'large' ? 'h-8 w-14' : size === 'small' ? 'h-4 w-8' : 'h-6 w-11';
  const thumbClasses = size === 'large' ? 'h-6 w-6' : size === 'small' ? 'h-2 w-2' : 'h-4 w-4';
  const translateClasses = size === 'large' 
    ? (checked ? 'translate-x-7' : 'translate-x-1') 
    : size === 'small'
    ? (checked ? 'translate-x-5' : 'translate-x-1')
    : (checked ? 'translate-x-6' : 'translate-x-1');
  
  return (
    <div className="flex items-center justify-between">
      <div className="flex-1">
        {label && <div className="text-sm font-semibold text-gray-800 mb-1">{label}</div>}
        {description && <div className="text-xs text-gray-600">{description}</div>}
      </div>
      <button
        onClick={onChange}
        disabled={disabled}
        className={`relative inline-flex ${sizeClasses} items-center rounded-full transition-all duration-300 ease-out transform hover:scale-105 ${
          disabled 
            ? 'opacity-50 cursor-not-allowed bg-gray-300'
            : checked 
            ? 'bg-gradient-to-r from-indigo-500 to-purple-600 shadow-lg shadow-indigo-500/25' 
            : 'bg-gray-300 hover:bg-gray-400'
        }`}
      >
        <span className={`inline-block ${thumbClasses} transform rounded-full bg-white transition-all duration-300 ease-out shadow-lg ${translateClasses} ${
          checked ? 'shadow-indigo-200' : 'shadow-gray-200'
        }`}>
          {checked && size === 'large' && (
            <div className="flex items-center justify-center h-full">
              <Sparkles className="w-3 h-3 text-indigo-500" />
            </div>
          )}
        </span>
        {checked && (
          <div className="absolute inset-0 rounded-full bg-gradient-to-r from-indigo-400 to-purple-500 opacity-20 animate-pulse" />
        )}
      </button>
    </div>
  );
};

// Premium Input Component
const PremiumInput = ({ type = 'text', placeholder, value, onChange, icon: Icon, className = '', ...props }: { type?: string; placeholder?: string; value?: string; onChange?: (e: React.ChangeEvent<HTMLInputElement>) => void; icon?: React.ComponentType<{ className: string }>; className?: string; [key: string]: unknown }) => (
  <div className="relative group">
    {Icon && (
      <div className="absolute left-4 top-1/2 transform -translate-y-1/2 text-gray-400 group-focus-within:text-indigo-500 transition-colors duration-200">
        <Icon className="w-5 h-5" />
      </div>
    )}
    <input
      type={type}
      value={value}
      onChange={onChange}
      placeholder={placeholder}
      className={`w-full ${Icon ? 'pl-12' : 'pl-4'} pr-4 py-4 bg-white/80 backdrop-blur-sm border border-gray-200/50 rounded-2xl focus:ring-4 focus:ring-indigo-500/20 focus:border-indigo-500 transition-all duration-300 hover:bg-white/90 hover:border-gray-300/50 text-gray-800 placeholder-gray-400 shadow-sm hover:shadow-md focus:shadow-lg ${className}`}
      {...props}
    />
    <div className="absolute inset-0 rounded-2xl bg-gradient-to-r from-indigo-500/5 to-purple-500/5 opacity-0 group-hover:opacity-100 transition-opacity duration-300 pointer-events-none" />
  </div>
);

// Premium Select Component
const PremiumSelect = ({ value, onChange, options, placeholder, icon: Icon }: { value: string; onChange: (e: React.ChangeEvent<HTMLSelectElement>) => void; options: Array<{ value: string; label: string }>; placeholder?: string; icon?: React.ComponentType<{ className: string }> }) => (
  <div className="relative group">
    {Icon && (
      <div className="absolute left-4 top-1/2 transform -translate-y-1/2 text-gray-400 group-focus-within:text-indigo-500 transition-colors duration-200 z-10">
        <Icon className="w-5 h-5" />
      </div>
    )}
    <select
      value={value}
      onChange={onChange}
      className={`w-full ${Icon ? 'pl-12' : 'pl-4'} pr-4 py-4 bg-white/80 backdrop-blur-sm border border-gray-200/50 rounded-2xl focus:ring-4 focus:ring-indigo-500/20 focus:border-indigo-500 transition-all duration-300 hover:bg-white/90 hover:border-gray-300/50 text-gray-800 shadow-sm hover:shadow-md focus:shadow-lg appearance-none cursor-pointer`}
    >
      {placeholder && (
        <option value="" disabled>{placeholder}</option>
      )}
      {options.map((option) => (
        <option key={option.value} value={option.value}>
          {option.label}
        </option>
      ))}
    </select>
    <div className="absolute right-4 top-1/2 transform -translate-y-1/2 text-gray-400 pointer-events-none">
      <ChevronRight className="w-5 h-5 rotate-90" />
    </div>
    <div className="absolute inset-0 rounded-2xl bg-gradient-to-r from-indigo-500/5 to-purple-500/5 opacity-0 group-hover:opacity-100 transition-opacity duration-300 pointer-events-none" />
  </div>
);

// Premium Card Component
const PremiumCard = ({ children, className = '', gradient = 'from-white/80 to-white/60', border = 'border-white/50' }: { children: React.ReactNode; className?: string; gradient?: string; border?: string }) => (
  <div className={`relative overflow-hidden rounded-3xl bg-gradient-to-br ${gradient} backdrop-blur-xl border ${border} shadow-xl hover:shadow-2xl transition-all duration-500 group ${className}`}>
    <div className="absolute inset-0 bg-gradient-to-br from-indigo-500/5 via-transparent to-purple-500/5 opacity-0 group-hover:opacity-100 transition-opacity duration-500" />
    <div className="relative z-10">
      {children}
    </div>
    <div className="absolute top-0 left-0 w-full h-1 bg-gradient-to-r from-indigo-500 via-purple-500 to-pink-500 opacity-0 group-hover:opacity-100 transition-opacity duration-500" />
  </div>
);





