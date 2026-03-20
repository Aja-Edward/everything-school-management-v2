import { useState } from 'react';
import {
  Settings,
  Palette,
  MessageSquare,
  Shield,
  FileText,
  CreditCard,
  Lock,
  Zap,
  Calendar,
  GraduationCap,
  Blocks,
  Globe,
} from 'lucide-react';
import GeneralTab from '@/components/dashboards/admin/settingtab/components/tabs/GeneralTab';
import DesignTab from '@/components/dashboards/admin/settingtab/components/tabs/DesignTab';
import CommunicationTab from '@/components/dashboards/admin/settingtab/components/tabs/CommunicationTab';
import RolesPermissionsTab from '@/components/dashboards/admin/settingtab/components/tabs/RolesPermissions';
import ExamsResultTab from '@/components/dashboards/admin/settingtab/components/tabs/ExamsResultTab';
import AcademicTab from '@/components/dashboards/admin/settingtab/components/tabs/AcademicTab';
import AcademicGradeLevelTab from '@/components/dashboards/admin/settingtab/components/tabs/AcademicGradeLevelTab'
import AcademicCalendarTab from '@/components/dashboards/admin/settingtab/components/tabs/AcademicCalendarTab';
import FinanceTab from '@/components/dashboards/admin/settingtab/components/tabs/Finance';
import SecurityTab from '@/components/dashboards/admin/settingtab/components/tabs/Security';
import AdvancedTab from '@/components/dashboards/admin/settingtab/components/tabs/Advanced';
import ServicesTab from '@/components/dashboards/admin/settingtab/components/tabs/ServicesTab';
import DomainTab from '@/components/dashboards/admin/settingtab/components/tabs/DomainTab';
import { useSettings } from '@/contexts/SettingsContext';
import SettingsService from '@/services/SettingsService';

const SettingsDashboard = () => {
  const [activeTab, setActiveTab] = useState('general');
  const [successMessage, setSuccessMessage] = useState<string | null>(null);
  const { settings, loading, error, setError, refreshSettings } = useSettings();

  const handleSettingsUpdate = async (updatedSettings: any) => {
    try {
      console.log('Dashboard: Updating settings:', updatedSettings);
      
      const savedSettings = await SettingsService.updateSettings(updatedSettings);
      
      console.log('Dashboard: Settings updated successfully:', savedSettings);
      setSuccessMessage('Settings saved successfully!');
      setError(null);
      
      setTimeout(() => setSuccessMessage(null), 3000);
      
      // Refresh context to sync across the entire application
      await refreshSettings();
    } catch (err: any) {
      console.error('Dashboard: Error saving settings:', err);
      const errorMessage = err.message || 'Failed to save settings';
      setError(errorMessage);
      setSuccessMessage(null);
    }
  };

  const handleRetry = async () => {
    setError(null);
    await refreshSettings();
  };

  const tabs = [
    { id: 'general',      label: 'General',           icon: Settings      },
    { id: 'services',     label: 'Services',           icon: Blocks        },
    { id: 'domain',       label: 'Domain',             icon: Globe         },
    { id: 'design',       label: 'Design',             icon: Palette       },
    { id: 'communication',label: 'Communication',      icon: MessageSquare },
    { id: 'roles',        label: 'Roles & Permissions',icon: Shield        },
    { id: 'academic',     label: 'Academic',           icon: GraduationCap },
    { id: 'gradelevel',   label: 'GradeLevel',         icon: GraduationCap },
    { id: 'exams',        label: 'Exams & Result',     icon: FileText      },
    { id: 'calendar',     label: 'Academic Calendar',  icon: Calendar      },
    { id: 'finance',      label: 'Finance',            icon: CreditCard    },
    { id: 'security',     label: 'Security',           icon: Lock          },
    { id: 'advanced',     label: 'Advanced',           icon: Zap           },
  ];

  const renderActiveTab = () => {
    const props = { settings, onSettingsUpdate: handleSettingsUpdate };
    switch (activeTab) {
      case 'general':       return <GeneralTab {...props} />;
      case 'services':      return <ServicesTab {...props} />;
      case 'domain':        return <DomainTab {...props} />;
      case 'design':        return <DesignTab {...props} />;
      case 'communication': return <CommunicationTab/>;
      case 'roles':         return <RolesPermissionsTab />;
      case 'academic':      return <AcademicTab />;
      case 'gradelevel':    return <AcademicGradeLevelTab  />;
      case 'exams':         return <ExamsResultTab {...props} />;
      case 'calendar':      return <AcademicCalendarTab />;
      case 'finance':       return <FinanceTab />;
      case 'security':      return <SecurityTab {...props} />;
      case 'advanced':      return <AdvancedTab />;
      default:              return <GeneralTab {...props} />;
    }
  };

  return (
    <div className="min-h-screen bg-gray-50">
      <div className="max-w-7xl mx-auto p-6">
        {/* Success Message */}
        {successMessage && (
          <div className="fixed top-4 right-4 bg-gray-900 text-white px-4 py-2.5 rounded-lg shadow-lg z-50 text-sm font-medium">
            {successMessage}
          </div>
        )}

        {/* Header */}
        <div className="mb-6">
          <h1 className="text-xl font-semibold text-gray-900">Settings</h1>
          <p className="text-sm text-gray-500 mt-1">Manage your application preferences and configurations</p>
        </div>

        {/* Tab Navigation */}
        <div className="bg-white rounded-xl border border-gray-200 p-1.5 mb-5">
          <div className="flex flex-wrap gap-1">
            {tabs.map((tab) => {
              const Icon = tab.icon;
              return (
                <button
                  key={tab.id}
                  onClick={() => setActiveTab(tab.id)}
                  className={`flex items-center gap-2 px-3 py-2 rounded-lg text-sm font-medium transition-colors ${
                    activeTab === tab.id
                      ? 'bg-gray-900 text-white'
                      : 'text-gray-600 hover:bg-gray-100 hover:text-gray-900'
                  }`}
                >
                  <Icon className="w-4 h-4" />
                  <span className="hidden sm:inline">{tab.label}</span>
                </button>
              );
            })}
          </div>
        </div>

        {/* Main Content */}
        <div className="bg-white rounded-xl border border-gray-200">
          {loading ? (
            <div className="p-12 text-center">
              <div className="w-8 h-8 border-2 border-gray-200 border-t-gray-800 rounded-full animate-spin mx-auto"></div>
              <p className="mt-3 text-sm text-gray-500">Loading settings...</p>
            </div>
          ) : error ? (
            <div className="p-8">
              <div className="bg-red-50 border border-red-200 rounded-lg p-4 text-center">
                <p className="text-sm text-red-600 mb-3">{error}</p>
                <div className="flex gap-2 justify-center">
                  <button
                    onClick={() => window.location.reload()}
                    className="px-3 py-1.5 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded-lg hover:bg-gray-50 transition-colors"
                  >
                    Refresh Page
                  </button>
                  <button
                    onClick={handleRetry}
                    className="px-3 py-1.5 text-sm font-medium text-white bg-gray-900 rounded-lg hover:bg-gray-800 transition-colors"
                  >
                    Retry
                  </button>
                </div>
              </div>
            </div>
          ) : (
            renderActiveTab()
          )}
        </div>
      </div>
    </div>
  );
};

export default SettingsDashboard;