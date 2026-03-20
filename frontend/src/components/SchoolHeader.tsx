import React from 'react';
import { useSettings } from '../contexts/SettingsContext';
import { getAbsoluteUrl } from '../utils/urlUtils';

const SchoolHeader: React.FC = () => {
  const { settings, loading } = useSettings();

  if (loading) {
    return (
      <div className="bg-white shadow-sm border-b border-gray-200 px-4 py-3">
        <div className="flex items-center space-x-3">
          <div className="w-8 h-8 bg-gray-200 rounded animate-pulse"></div>
          <div className="h-6 bg-gray-200 rounded w-48 animate-pulse"></div>
        </div>
      </div>
    );
  }

  if (!settings) {
    return null;
  }

  return (
    <div className="bg-white shadow-sm border-b border-gray-200 px-4 py-3">
      <div className="flex items-center justify-between">
        <div className="flex items-center space-x-3">
          {settings.logo && (
            <img 
              src={getAbsoluteUrl(settings.logo)} 
              alt={`${settings.school_name} logo`}
              className="w-8 h-8 object-contain"
            />
          )}
          <div>
            <h1 className="text-lg font-semibold text-gray-900">
              {settings.school_name}
            </h1>
            {settings.motto && (
              <p className="text-sm text-gray-600">{settings.motto}</p>
            )}
          </div>
        </div>
        
        <div className="flex items-center space-x-4 text-sm text-gray-600">
          <div>
            <span className="font-medium">Academic Year:</span> {settings.academicYear}
          </div>
          <div>
            <span className="font-medium">Term:</span> {settings.currentTerm}
          </div>
          {settings.phone && (
            <div>
              <span className="font-medium">Phone:</span> {settings.phone}
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default SchoolHeader; 