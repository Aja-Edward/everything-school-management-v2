import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { LogIn, X, Clock } from 'lucide-react';
import { useDesign } from '@/contexts/DesignContext';
import { useSettings } from '@/contexts/SettingsContext';
import { useTenant } from '@/contexts/TenantContext';
import { getAbsoluteUrl } from '@/utils/urlUtils';

interface AuthLostModalProps {
  isOpen: boolean;
  onClose?: () => void;
  message?: string;
}

const PLATFORM_LOGO = '/nuventa-favicon.png';
const PLATFORM_NAME = 'Nuventa Cloud';
const DEFAULT_COLOR = '#3B82F6';

/** Darken a hex colour by the given percentage (0–100). */
function darkenHex(hex: string, amount: number): string {
  const n = parseInt(hex.replace('#', ''), 16);
  const r = Math.max(0, (n >> 16) - Math.round(2.55 * amount));
  const g = Math.max(0, ((n >> 8) & 0xff) - Math.round(2.55 * amount));
  const b = Math.max(0, (n & 0xff) - Math.round(2.55 * amount));
  return `#${[r, g, b].map(v => v.toString(16).padStart(2, '0')).join('')}`;
}

const AuthLostModal: React.FC<AuthLostModalProps> = ({
  isOpen,
  onClose,
  message = 'Your session has expired. Please log in again to continue.',
}) => {
  const navigate = useNavigate();
  const { settings: design } = useDesign();
  const { settings } = useSettings();
  const { tenant } = useTenant();

  const [hovered, setHovered] = useState(false);

  const primaryColor = design?.primary_color || DEFAULT_COLOR;
  const hoverColor   = darkenHex(primaryColor, 12);

  // Tenant-aware branding — falls back to platform defaults when no tenant
  const logoUrl  = getAbsoluteUrl(settings?.logo) || PLATFORM_LOGO;
  const orgName  = settings?.school_name || (tenant?.name) || PLATFORM_NAME;

  const handleReLogin = () => {
    if (onClose) onClose();
    navigate('/login', { replace: true });
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      {/* Backdrop */}
      <div
        className="absolute inset-0 bg-black/50 backdrop-blur-sm"
        onClick={onClose}
      />

      {/* Modal card */}
      <div className="relative bg-white dark:bg-gray-900 rounded-2xl shadow-2xl max-w-sm w-full mx-4 overflow-hidden animate-in slide-in-from-bottom-4 duration-300">

        {/* Coloured top bar */}
        <div
          className="h-1.5 w-full"
          style={{ backgroundColor: primaryColor }}
        />

        <div className="p-6">
          {/* Close button */}
          {onClose && (
            <button
              onClick={onClose}
              className="absolute top-4 right-4 p-1.5 text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 transition-colors rounded-lg hover:bg-gray-100 dark:hover:bg-gray-800"
            >
              <X className="w-4 h-4" />
            </button>
          )}

          {/* Tenant logo + name */}
          <div className="flex flex-col items-center mb-5">
            <img
              src={logoUrl}
              alt={orgName}
              className="w-14 h-14 object-contain rounded-xl mb-2"
              onError={e => { (e.target as HTMLImageElement).src = PLATFORM_LOGO; }}
            />
            <span className="text-sm font-semibold text-gray-700 dark:text-gray-300 text-center">
              {orgName}
            </span>
          </div>

          {/* Session expired icon */}
          <div className="flex justify-center mb-4">
            <div
              className="p-3 rounded-full"
              style={{ backgroundColor: `${primaryColor}18` }}
            >
              <Clock
                className="w-8 h-8"
                style={{ color: primaryColor }}
              />
            </div>
          </div>

          {/* Title */}
          <h2 className="text-lg font-semibold text-gray-900 dark:text-white text-center mb-2">
            Session Expired
          </h2>

          {/* Message */}
          <p className="text-sm text-gray-500 dark:text-gray-400 text-center mb-6 leading-relaxed">
            {message}
          </p>

          {/* Actions */}
          <div className="flex flex-col gap-2.5">
            <button
              onClick={handleReLogin}
              onMouseEnter={() => setHovered(true)}
              onMouseLeave={() => setHovered(false)}
              style={{ backgroundColor: hovered ? hoverColor : primaryColor }}
              className="w-full text-white font-medium py-2.5 px-4 rounded-xl transition-colors duration-150 flex items-center justify-center gap-2 text-sm"
            >
              <LogIn className="w-4 h-4" />
              Log In Again
            </button>

            {onClose && (
              <button
                onClick={onClose}
                className="w-full bg-gray-100 hover:bg-gray-200 dark:bg-gray-800 dark:hover:bg-gray-700 text-gray-700 dark:text-gray-300 font-medium py-2.5 px-4 rounded-xl transition-colors duration-150 text-sm"
              >
                Dismiss
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};

export default AuthLostModal;
