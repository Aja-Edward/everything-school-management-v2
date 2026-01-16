import React from 'react';
import { GraduationCap, BookOpen, Users } from 'lucide-react';

interface LoadingScreenProps {
  message?: string;
  subMessage?: string;
  variant?: 'teacher' | 'student' | 'parent' | 'admin' | 'default';
}

export const LoadingScreen: React.FC<LoadingScreenProps> = ({ 
  message = 'Loading Dashboard...', 
  subMessage,
  variant = 'default' 
}) => {
  // Variant-specific configurations
  const variantConfig = {
    teacher: {
      icon: BookOpen,
      gradient: 'from-blue-600 to-indigo-600',
      accentColor: 'bg-blue-500',
      iconColor: 'text-blue-600'
    },
    student: {
      icon: GraduationCap,
      gradient: 'from-green-600 to-emerald-600',
      accentColor: 'bg-green-500',
      iconColor: 'text-green-600'
    },
    parent: {
      icon: Users,
      gradient: 'from-purple-600 to-pink-600',
      accentColor: 'bg-purple-500',
      iconColor: 'text-purple-600'
    },
    admin: {
      icon: Users,
      gradient: 'from-red-600 to-orange-600',
      accentColor: 'bg-red-500',
      iconColor: 'text-red-600'
    },
    default: {
      icon: GraduationCap,
      gradient: 'from-slate-600 to-slate-800',
      accentColor: 'bg-slate-500',
      iconColor: 'text-slate-600'
    }
  };

  const config = variantConfig[variant];
  const Icon = config.icon;

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 to-slate-100 flex items-center justify-center p-4">
      <style>{`
        @keyframes shimmer {
          0% { transform: translateX(-100%); }
          100% { transform: translateX(100%); }
        }
      `}</style>
      <div className="relative">
        {/* Animated background circles */}
        <div className="absolute inset-0 flex items-center justify-center">
          <div className={`absolute w-32 h-32 ${config.accentColor} rounded-full opacity-20 animate-ping`} 
               style={{ animationDuration: '2s' }}></div>
          <div className={`absolute w-24 h-24 ${config.accentColor} rounded-full opacity-30 animate-ping`} 
               style={{ animationDuration: '1.5s', animationDelay: '0.3s' }}></div>
        </div>

        {/* Main content card */}
        <div className="relative bg-white rounded-2xl shadow-2xl p-8 w-80 border border-slate-200">
          {/* Animated icon container with orbiting particles */}
          <div className="flex justify-center mb-6">
            <div className="relative w-24 h-24">
              {/* Orbiting particles */}
              {[...Array(3)].map((_, i) => (
                <div
                  key={i}
                  className="absolute inset-0 animate-spin"
                  style={{ 
                    animationDuration: `${3 + i}s`,
                    animationDelay: `${i * 0.5}s`
                  }}
                >
                  <div 
                    className={`absolute top-0 left-1/2 w-3 h-3 ${config.accentColor} rounded-full -translate-x-1/2 shadow-lg`}
                    style={{
                      opacity: 0.8 - (i * 0.2)
                    }}
                  ></div>
                </div>
              ))}
              
              {/* Pulsing rings */}
              <div className="absolute inset-0 flex items-center justify-center">
                <div className={`absolute w-20 h-20 border-2 border-${config.accentColor.replace('bg-', '')} rounded-full animate-ping`}
                     style={{ animationDuration: '2s', opacity: 0.4 }}></div>
                <div className={`absolute w-16 h-16 border-2 border-${config.accentColor.replace('bg-', '')} rounded-full animate-ping`}
                     style={{ animationDuration: '2s', animationDelay: '0.5s', opacity: 0.3 }}></div>
              </div>
              
              {/* Main icon with floating animation */}
              <div className={`absolute inset-0 bg-gradient-to-br ${config.gradient} rounded-2xl flex items-center justify-center shadow-2xl animate-bounce`}
                   style={{ animationDuration: '2s' }}>
                {/* Shimmer effect */}
                <div className="absolute inset-0 rounded-2xl overflow-hidden">
                  <div className="absolute inset-0 -translate-x-full animate-[shimmer_2s_infinite] bg-gradient-to-r from-transparent via-white/30 to-transparent"></div>
                </div>
                
                <Icon className="text-white relative z-10 animate-pulse" size={40} strokeWidth={2.5} 
                      style={{ animationDuration: '2s' }} />
              </div>
            </div>
          </div>

          {/* Loading bars animation */}
          <div className="mb-6 space-y-2">
            <div className="flex gap-1.5 justify-center">
              {[...Array(5)].map((_, i) => (
                <div
                  key={i}
                  className={`w-2 h-12 ${config.accentColor} rounded-full animate-pulse`}
                  style={{
                    animationDelay: `${i * 0.15}s`,
                    animationDuration: '1s',
                    opacity: 0.6
                  }}
                ></div>
              ))}
            </div>
          </div>

          {/* Text content */}
          <div className="text-center space-y-2">
            <h3 className="text-xl font-semibold text-slate-800">
              {message}
            </h3>
            {subMessage && (
              <p className="text-sm text-slate-500">
                {subMessage}
              </p>
            )}
          </div>

          {/* Progress dots */}
          <div className="flex justify-center gap-2 mt-6">
            {[...Array(3)].map((_, i) => (
              <div
                key={i}
                className={`w-2 h-2 ${config.accentColor} rounded-full animate-bounce`}
                style={{
                  animationDelay: `${i * 0.2}s`,
                  animationDuration: '0.8s'
                }}
              ></div>
            ))}
          </div>
        </div>

        {/* Bottom floating particles effect */}
        <div className="absolute -bottom-4 left-1/2 transform -translate-x-1/2 flex gap-4">
          {[...Array(3)].map((_, i) => (
            <div
              key={i}
              className={`w-3 h-3 ${config.accentColor} rounded-full opacity-40 animate-bounce`}
              style={{
                animationDelay: `${i * 0.3}s`,
                animationDuration: '1.5s'
              }}
            ></div>
          ))}
        </div>
      </div>
    </div>
  );
};

// Demo showing all variants
const LoaderDemo: React.FC = () => {
  const [currentVariant, setCurrentVariant] = React.useState<'teacher' | 'student' | 'parent' | 'admin'>('teacher');

  return (
    <div className="space-y-4">
      {/* Variant selector */}
      <div className="bg-white p-4 rounded-lg shadow-sm border border-slate-200">
        <p className="text-sm font-medium text-slate-700 mb-2">Select Dashboard Type:</p>
        <div className="flex gap-2 flex-wrap">
          {(['teacher', 'student', 'parent', 'admin'] as const).map((variant) => (
            <button
              key={variant}
              onClick={() => setCurrentVariant(variant)}
              className={`px-4 py-2 rounded-lg capitalize transition-all ${
                currentVariant === variant
                  ? 'bg-blue-600 text-white shadow-md'
                  : 'bg-slate-100 text-slate-700 hover:bg-slate-200'
              }`}
            >
              {variant}
            </button>
          ))}
        </div>
      </div>

      {/* Loader display */}
      <LoadingScreen 
        variant={currentVariant}
        message={`Loading ${currentVariant.charAt(0).toUpperCase() + currentVariant.slice(1)} Dashboard...`}
        subMessage="Please wait while we prepare your data"
      />
    </div>
  );
};

export default LoaderDemo;