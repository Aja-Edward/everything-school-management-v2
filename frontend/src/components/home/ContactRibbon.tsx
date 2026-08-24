import React, { useState, useEffect } from 'react';
import { Phone, Mail, MapPin, Clock, Sun, Moon } from 'lucide-react';
import { eventManagementService } from '@/services/eventService';
import { useGlobalTheme } from '@/contexts/GlobalThemeContext';
import { useSettings } from '../../contexts/SettingsContext';
import api from '@/services/api';


interface PhoneNumber {
  number: string;
  label: string;
}

interface SocialLink {
  icon: string;
  url: string;
  label: string;
}

interface HeaderConfig {
  backgroundColor: string;
  phoneNumbers: PhoneNumber[];
  email: string;
  location: string;
  message: string;
  socialLinks: SocialLink[];
  showClock: boolean;
  showLocation: boolean;
  showSocial: boolean;
  announcement: string | null;
}

const PremiumHeaderBar = () => {
  const { isDarkMode } = useGlobalTheme();
  const [isVisible, setIsVisible] = useState(() => {
    const saved = localStorage.getItem('contactRibbonVisible');
    return saved !== null ? JSON.parse(saved) : true;
  });
  const [currentTime, setCurrentTime] = useState(new Date());
  const [currentAnnouncement, setCurrentAnnouncement] = useState<string | null>(null);
  const [userLocation, setUserLocation] = useState<string>('Loading location...');
const { settings } = useSettings();
  // Dynamic content configuration
  const [headerConfig, setHeaderConfig] = useState<HeaderConfig>({
    backgroundColor: 'white',
    phoneNumbers: [
      { number: settings?.phone ||'08106334006', label: 'Admin' },
      { number: '07065636067', label: 'Support' }
      
    ],
    email: settings?.email ||'info@company.com',
    location: 'New York, USA',
    message: 'Committed to Excellence',
    socialLinks: [
      { icon: 'facebook', url: '#', label: 'Facebook' },
      { icon: 'linkedin', url: '#', label: 'LinkedIn' },
      { icon: 'twitter', url: '#', label: 'Twitter' },
      { icon: 'youtube', url: '#', label: 'YouTube' },
      { icon: 'instagram', url: '#', label: 'Instagram' }
    ],
    showClock: true,
    showLocation: true,
    showSocial: true,
    announcement: null
  });

  // Update time every second
  useEffect(() => {
    const timer = setInterval(() => setCurrentTime(new Date()), 1000);
    return () => clearInterval(timer);
  }, []);

  // On the main marketing domain there's no tenant, so `settings` never
  // resolves and this ribbon fell back to hardcoded placeholder contact
  // info ("info@company.com"). Fill in the platform's real details instead
  // - tenant settings (school-specific) still win whenever they're present.
  useEffect(() => {
    if (settings?.email || settings?.phone) return;
    (async () => {
      try {
        const res = await api.get('/api/tenants/platform-content/');
        if (!res.contact_email && !res.contact_phone) return;
        setHeaderConfig(prev => ({
          ...prev,
          email: res.contact_email || prev.email,
          phoneNumbers: res.contact_phone
            ? [{ number: res.contact_phone, label: 'Support' }, ...prev.phoneNumbers.slice(1)]
            : prev.phoneNumbers,
        }));
      } catch {
        // keep the existing fallback - not worth surfacing an error for a footer ribbon
      }
    })();
  }, [settings?.email, settings?.phone]);

  // Get user's real-time location
  useEffect(() => {
    const getUserLocation = () => {
      if (navigator.geolocation) {
        navigator.geolocation.getCurrentPosition(
          (position) => {
            const { latitude, longitude } = position.coords;
            
            // Use reverse geocoding to get location name
            fetch(`https://api.bigdatacloud.net/data/reverse-geocode-client?latitude=${latitude}&longitude=${longitude}&localityLanguage=en`)
              .then(response => response.json())
              .then(data => {
                if (data.city && data.countryName) {
                  setUserLocation(`${data.city}, ${data.countryName}`);
                } else if (data.locality) {
                  setUserLocation(`${data.locality}, ${data.countryName}`);
                } else {
                  setUserLocation(`${data.countryName}`);
                }
              })
              .catch(() => {
                // Fallback to coordinates if API fails
                setUserLocation(`${latitude.toFixed(2)}, ${longitude.toFixed(2)}`);
              });
          },
          (error) => {
            console.log('Location access denied or error:', error);
            setUserLocation('Location unavailable');
          },
          {
            enableHighAccuracy: true,
            timeout: 10000,
            maximumAge: 300000 // 5 minutes
          }
        );
      } else {
        setUserLocation('Location unavailable');
      }
    };

    getUserLocation();
  }, []);

  // Subscribe to event management service
  useEffect(() => {
    const unsubscribe = eventManagementService.subscribe((events, activeEvent) => {
      // Get current announcement from active events
      const announcement = eventManagementService.getCurrentAnnouncement();
      setCurrentAnnouncement(announcement);
      
      // Update header config with current announcement
      setHeaderConfig(prev => ({
        ...prev,
        announcement: announcement
      }));
    });

    return unsubscribe;
  }, []);

  const handleHide = () => {
    setIsVisible(false);
    localStorage.setItem('contactRibbonVisible', 'false');
  };

  const handleShow = () => {
    setIsVisible(true);
    localStorage.setItem('contactRibbonVisible', 'true');
  };

  const getBackgroundStyle = () => {
    return isDarkMode ? 'bg-slate-900' : 'bg-white';
  };

  const getSocialIcon = (iconName: string) => {
    const iconMap: { [key: string]: React.ReactNode } = {
      facebook: <div className="w-4 h-4 bg-blue-600 rounded-sm" />,
      linkedin: <div className="w-4 h-4 bg-blue-700 rounded-sm" />,
      twitter: <div className="w-4 h-4 bg-blue-400 rounded-sm" />,
      youtube: <div className="w-4 h-4 bg-red-600 rounded-sm" />,
      instagram: <div className="w-4 h-4 bg-gradient-to-br from-purple-600 to-pink-600 rounded-sm" />
    };
    return iconMap[iconName] || <div className="w-4 h-4 bg-gray-400 rounded-sm" />;
  };

  const formatTime = (date: Date) => {
    return date.toLocaleTimeString('en-US', {
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
      hour12: false
    });
  };

  if (!isVisible) {
    return (
      <button
        onClick={handleShow}
        className="fixed top-4 right-4 z-50 p-2 bg-blue-600 hover:bg-blue-700 text-white rounded-full shadow-lg transition-all duration-300 hover:scale-110"
        title="Show contact ribbon"
      >
        <Phone className="w-4 h-4" />
      </button>
    );
  }

  return (
    <div className={`fixed top-0 left-0 right-0 z-50 bg-white dark:bg-slate-900 text-slate-900 dark:text-slate-100 transition-all duration-500 ease-in-out shadow-lg border-b border-slate-200 dark:border-slate-700`}>
      {/* Background gradient */}
      <div className={`absolute inset-0 bg-gradient-to-r ${isDarkMode ? 'from-slate-900 via-slate-800 to-slate-900' : 'from-white via-slate-50 to-white'} opacity-90`}></div>
      
      {/* Content */}
      <div className="relative z-10 px-6 py-2">
        {/* Announcement Bar */}
        {/* {currentAnnouncement && (
          <div className={`${isDarkMode ? 'bg-blue-900/50' : 'bg-blue-50'} border-b ${isDarkMode ? 'border-blue-800' : 'border-blue-200'} py-2 px-4 text-center relative z-10 -mx-6 mb-3`}>
            <p className={`text-sm font-medium ${isDarkMode ? 'text-blue-200' : 'text-blue-800'} animate-pulse`}>
              {currentAnnouncement}
            </p>
          </div>
        )} */}

        {/* Single Line Layout */}
        <div className="flex items-center justify-between">
          {/* Left side - Contact info */}
          <div className="flex items-center space-x-6">
            {/* Phone */}
            <div className="flex items-center space-x-2 group">
              <div className={`p-1.5 rounded-full ${isDarkMode ? 'bg-blue-900/50' : 'bg-blue-50'} group-hover:scale-110 transition-transform duration-300`}>
                <Phone className={`w-3.5 h-3.5 ${isDarkMode ? 'text-blue-300' : 'text-blue-600'}`} />
              </div>
              <a
                href="tel:08106334006"
                className={`text-sm font-semibold hover:underline ${isDarkMode ? 'text-slate-100 hover:text-blue-300' : 'text-slate-900 hover:text-blue-600'} transition-colors duration-300`}
              >
                {headerConfig.phoneNumbers[0].number}
              </a>
              <span className={`text-xs ${isDarkMode ? 'text-slate-400' : 'text-slate-500'} ml-1`}>
                {headerConfig.phoneNumbers[0].label}
              </span>
            </div>

            {/* Email */}
            <div className="flex items-center space-x-2 group">
              <div className={`p-1.5 rounded-full ${isDarkMode ? 'bg-green-900/50' : 'bg-green-50'} group-hover:scale-110 transition-transform duration-300`}>
                <Mail className={`w-3.5 h-3.5 ${isDarkMode ? 'text-green-300' : 'text-green-600'}`} />
              </div>
              <a
                href={`mailto:${headerConfig.email}`}
                className={`text-sm font-medium hover:underline ${isDarkMode ? 'text-slate-100 hover:text-green-300' : 'text-slate-900 hover:text-green-600'} transition-colors duration-300`}
              >
                {headerConfig.email}
              </a>
            </div>

            {/* Location */}
            <div className="flex items-center space-x-2 group">
              <div className={`p-1.5 rounded-full ${isDarkMode ? 'bg-purple-900/50' : 'bg-purple-50'} group-hover:scale-110 transition-transform duration-300`}>
                <MapPin className={`w-3.5 h-3.5 ${isDarkMode ? 'text-purple-300' : 'text-purple-600'}`} />
              </div>
              <span className={`text-sm font-medium ${isDarkMode ? 'text-slate-300' : 'text-slate-700'}`}>
                {userLocation}
              </span>
            </div>

            {/* Time */}
            <div className="flex items-center space-x-2 group">
              <div className={`p-1.5 rounded-full ${isDarkMode ? 'bg-amber-900/50' : 'bg-amber-50'} group-hover:scale-110 transition-transform duration-300`}>
                <Clock className={`w-3.5 h-3.5 ${isDarkMode ? 'text-amber-300' : 'text-amber-600'}`} />
              </div>
              <span className={`text-sm font-mono font-semibold ${isDarkMode ? 'text-slate-300' : 'text-slate-700'}`}>
                {formatTime(currentTime)}
              </span>
            </div>
          </div>

          {/* Right side - Hide button */}
          <div className="flex items-center space-x-2">
            <button
              onClick={handleHide}
              className={`p-2 rounded-full ${isDarkMode ? 'bg-slate-800 hover:bg-slate-700' : 'bg-slate-100 hover:bg-slate-200'} transition-all duration-300 hover:scale-110 border border-slate-200 dark:border-slate-600`}
              title="Hide contact ribbon"
            >
              {isDarkMode ? (
                <Moon className="w-3.5 h-3.5 text-slate-300" />
              ) : (
                <Sun className="w-3.5 h-3.5 text-slate-600" />
              )}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};

export default PremiumHeaderBar;