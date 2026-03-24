import React, { useState } from 'react';
import { 
  GraduationCap, 
  BookOpen, 
  Users, 
  School, 
  Calendar, 
  Save,
  CheckCircle,
  AlertCircle,
  Target,
  GitBranch,
  Layers
} from 'lucide-react';
import ToggleSwitch from '@/components/dashboards/admin/settingtab/components/ToggleSwitch';
import { StreamConfigurationProvider } from '@/contexts/StreamConfigurationContext';
import StreamManagement from '@/components/admin/StreamManagement';
import StreamConfigurationManager from '@/components/admin/StreamConfigurationManager';
import SubjectCombinationsManager from '@/components/admin/SubjectCombinationsManager';
import ClassSettingsSection from './ClassSettingsSection';

const AcademicTabContent: React.FC = () => {
  const [activeSection, setActiveSection] = useState('stream-management');
  const [academicSettings, setAcademicSettings] = useState({
    academicYearStart: 'September',
    academicYearEnd: 'July',
    termsPerYear: 3,
    weeksPerTerm: 13,
    maxClassSize: 30,
    allowClassOverflow: false,
    enableStreaming: true,
    enableSubjectElectives: true,
    gradingSystem: 'percentage',
    passPercentage: 40,
    enableGradeCurving: false,
    enableGradeWeighting: true,
    requireAttendance: true,
    minimumAttendancePercentage: 75,
    enableAttendanceTracking: true,
    allowLateArrival: true,
    enableCrossCuttingSubjects: true,
    enableSubjectPrerequisites: true,
    allowSubjectChanges: true,
    enableCreditSystem: true
  });

  const [isSaving, setIsSaving] = useState(false);
  const [saveStatus, setSaveStatus] = useState<'idle' | 'success' | 'error'>('idle');

  const updateAcademicSetting = (field: string, value: any) => {
    setAcademicSettings(prev => ({ ...prev, [field]: value }));
    setSaveStatus('idle');
  };

  const handleSave = async () => {
    setIsSaving(true);
    setSaveStatus('idle');
    
    try {
      await new Promise(resolve => setTimeout(resolve, 1000));
      setSaveStatus('success');
      setTimeout(() => setSaveStatus('idle'), 3000);
    } catch (error) {
      setSaveStatus('error');
      setTimeout(() => setSaveStatus('idle'), 3000);
    } finally {
      setIsSaving(false);
    }
  };

  const sections = [
    { 
      id: 'stream-management', 
      label: 'Stream Management', 
      icon: Layers, 
      description: 'Create and manage streams',
      color: 'black'
    },
    { 
      id: 'stream-config', 
      label: 'Stream Configuration', 
      icon: Target, 
      description: 'Configure streams and subjects',
      color: 'black'
    },
    { 
      id: 'subject-combinations', 
      label: 'Subject Combinations', 
      icon: GitBranch, 
      description: 'Define valid combinations',
      color: 'black'
    },
    { 
      id: 'academic-settings', 
      label: 'Academic Year', 
      icon: Calendar, 
      description: 'Calendar and terms',
      color: 'black'
    },
    { 
      id: 'class-settings', 
      label: 'Class Management', 
      icon: School, 
      description: 'Class sizes and options',
      color: 'black'
    },
    { 
      id: 'grading-settings', 
      label: 'Grading System', 
      icon: GraduationCap, 
      description: 'Scales and assessments',
      color: 'black'
    },
    { 
      id: 'attendance-settings', 
      label: 'Attendance', 
      icon: Users, 
      description: 'Tracking and policies',
      color: 'black'
    },
    { 
      id: 'curriculum-settings', 
      label: 'Curriculum', 
      icon: BookOpen, 
      description: 'Prerequisites and credits',
      color: 'black'
    }
  ];

  const renderSection = () => {
    switch (activeSection) {
      case 'stream-management':
        return <StreamManagement />;
      
      case 'stream-config':
        return <StreamConfigurationManager />;
      
      case 'subject-combinations':
        return <SubjectCombinationsManager />;
      
      case 'academic-settings':
        return (
          <div className="space-y-6">
            <div className="bg-white rounded-3xl p-8 shadow-sm border border-slate-200">
              <div className="flex items-center justify-between mb-6">
                <h3 className="text-2xl font-bold text-slate-900 flex items-center gap-3">
                  <div className="w-10 h-10 bg-gradient-to-br from-amber-500 to-orange-600 rounded-2xl flex items-center justify-center">
                    <Calendar className="w-5 h-5 text-white" />
                  </div>
                  Academic Year Settings
                </h3>
              </div>
              
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <div className="space-y-2">
                  <label className="block text-sm font-semibold text-slate-700">
                    Academic Year Start
                  </label>
                  <select
                    value={academicSettings.academicYearStart}
                    onChange={(e) => updateAcademicSetting('academicYearStart', e.target.value)}
                    className="w-full px-4 py-3 border border-slate-300 rounded-xl focus:ring-2 focus:ring-amber-500 focus:border-amber-500 transition-all bg-white font-medium"
                  >
                    {['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'].map(month => (
                      <option key={month} value={month}>{month}</option>
                    ))}
                  </select>
                </div>
                
                <div className="space-y-2">
                  <label className="block text-sm font-semibold text-slate-700">
                    Academic Year End
                  </label>
                  <select
                    value={academicSettings.academicYearEnd}
                    onChange={(e) => updateAcademicSetting('academicYearEnd', e.target.value)}
                    className="w-full px-4 py-3 border border-slate-300 rounded-xl focus:ring-2 focus:ring-amber-500 focus:border-amber-500 transition-all bg-white font-medium"
                  >
                    {['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'].map(month => (
                      <option key={month} value={month}>{month}</option>
                    ))}
                  </select>
                </div>
                
                <div className="space-y-2">
                  <label className="block text-sm font-semibold text-slate-700">
                    Terms Per Year
                  </label>
                  <input
                    type="number"
                    min="1"
                    max="6"
                    value={academicSettings.termsPerYear}
                    onChange={(e) => updateAcademicSetting('termsPerYear', parseInt(e.target.value))}
                    className="w-full px-4 py-3 border border-slate-300 rounded-xl focus:ring-2 focus:ring-amber-500 focus:border-amber-500 transition-all bg-white font-medium text-center"
                  />
                </div>
                
                <div className="space-y-2">
                  <label className="block text-sm font-semibold text-slate-700">
                    Weeks Per Term
                  </label>
                  <input
                    type="number"
                    min="8"
                    max="20"
                    value={academicSettings.weeksPerTerm}
                    onChange={(e) => updateAcademicSetting('weeksPerTerm', parseInt(e.target.value))}
                    className="w-full px-4 py-3 border border-slate-300 rounded-xl focus:ring-2 focus:ring-amber-500 focus:border-amber-500 transition-all bg-white font-medium text-center"
                  />
                </div>
              </div>

              <div className="mt-8 p-6 bg-gradient-to-r from-amber-50 to-orange-50 rounded-2xl border border-amber-200">
                <div className="flex items-center gap-3 mb-4">
                  <Target className="w-5 h-5 text-amber-700" />
                  <h4 className="font-semibold text-amber-900">Academic Year Summary</h4>
                </div>
                <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-sm">
                  <div>
                    <p className="text-amber-700 font-medium mb-1">Duration</p>
                    <p className="text-amber-900 font-semibold">{academicSettings.academicYearStart} - {academicSettings.academicYearEnd}</p>
                  </div>
                  <div>
                    <p className="text-amber-700 font-medium mb-1">Total Terms</p>
                    <p className="text-amber-900 font-semibold text-2xl">{academicSettings.termsPerYear}</p>
                  </div>
                  <div>
                    <p className="text-amber-700 font-medium mb-1">Weeks per Term</p>
                    <p className="text-amber-900 font-semibold text-2xl">{academicSettings.weeksPerTerm}</p>
                  </div>
                  <div>
                    <p className="text-amber-700 font-medium mb-1">Total Weeks</p>
                    <p className="text-amber-900 font-semibold text-2xl">{academicSettings.termsPerYear * academicSettings.weeksPerTerm}</p>
                  </div>
                </div>
              </div>
            </div>
          </div>
        );
      
      case 'class-settings':
        return (
          <ClassSettingsSection
      allowClassOverflow={academicSettings.allowClassOverflow}
      enableStreaming={academicSettings.enableStreaming}
      enableSubjectElectives={academicSettings.enableSubjectElectives}
      onSettingChange={updateAcademicSetting}
    />
        );

      case 'grading-settings':
        return (
          <div className="space-y-6">
            <div className="bg-white rounded-3xl p-8 shadow-sm border border-slate-200">
              <div className="flex items-center justify-between mb-6">
                <h3 className="text-2xl font-bold text-slate-900 flex items-center gap-3">
                  <div className="w-10 h-10 bg-black rounded-2xl flex items-center justify-center">
                    <GraduationCap className="w-5 h-5 text-white" />
                  </div>
                  Grading System Settings
                </h3>
              </div>
              
              <div className="space-y-8">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                  <div className="space-y-2">
                    <label className="block text-sm font-semibold text-slate-700">
                      Grading System
                    </label>
                    <select
                      value={academicSettings.gradingSystem}
                      onChange={(e) => updateAcademicSetting('gradingSystem', e.target.value)}
                      className="w-full px-4 py-3 border border-slate-300 rounded-xl focus:ring-2 focus:ring-purple-500 focus:border-purple-500 transition-all bg-white font-medium"
                    >
                      <option value="percentage">Percentage (0-100)</option>
                      <option value="letter">Letter Grades (A-F)</option>
                      <option value="gpa">GPA (0.0-4.0)</option>
                      <option value="points">Points System</option>
                    </select>
                  </div>
                  
                  <div className="space-y-2">
                    <label className="block text-sm font-semibold text-slate-700">
                      Pass Percentage
                    </label>
                    <input
                      type="number"
                      min="0"
                      max="100"
                      value={academicSettings.passPercentage}
                      onChange={(e) => updateAcademicSetting('passPercentage', parseInt(e.target.value))}
                      className="w-full px-4 py-3 border border-slate-300 rounded-xl focus:ring-2 focus:ring-purple-500 focus:border-purple-500 transition-all bg-white font-medium text-center"
                    />
                  </div>
                </div>
                
                <div className="space-y-4">
                  <ToggleSwitch
                    id="enable-grade-curving"
                    checked={academicSettings.enableGradeCurving}
                    onChange={(checked) => updateAcademicSetting('enableGradeCurving', checked)}
                    label="Enable Grade Curving"
                    description="Allow automatic grade adjustments based on class performance"
                  />
                  
                  <ToggleSwitch
                    id="enable-grade-weighting"
                    checked={academicSettings.enableGradeWeighting}
                    onChange={(checked) => updateAcademicSetting('enableGradeWeighting', checked)}
                    label="Enable Grade Weighting"
                    description="Allow different weights for assignments and exams"
                  />
                </div>
              </div>
            </div>
          </div>
        );

      case 'attendance-settings':
        return (
          <div className="space-y-6">
            <div className="bg-white rounded-3xl p-8 shadow-sm border border-slate-200">
              <div className="flex items-center justify-between mb-6">
                <h3 className="text-2xl font-bold text-slate-900 flex items-center gap-3">
                  <div className="w-10 h-10 bg-gradient-to-br from-orange-500 to-red-600 rounded-2xl flex items-center justify-center">
                    <Users className="w-5 h-5 text-white" />
                  </div>
                  Attendance Settings
                </h3>
              </div>
              
              <div className="space-y-8">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                  <div className="space-y-2">
                    <label className="block text-sm font-semibold text-slate-700">
                      Minimum Attendance Percentage
                    </label>
                    <input
                      type="number"
                      min="0"
                      max="100"
                      value={academicSettings.minimumAttendancePercentage}
                      onChange={(e) => updateAcademicSetting('minimumAttendancePercentage', parseInt(e.target.value))}
                      className="w-full px-4 py-3 border border-slate-300 rounded-xl focus:ring-2 focus:ring-orange-500 focus:border-orange-500 transition-all bg-white font-medium text-center"
                    />
                    <p className="text-xs text-slate-500 mt-1">Students must maintain this attendance to pass</p>
                  </div>
                </div>
                
                <div className="space-y-4">
                  <ToggleSwitch
                    id="require-attendance"
                    checked={academicSettings.requireAttendance}
                    onChange={(checked) => updateAcademicSetting('requireAttendance', checked)}
                    label="Require Attendance"
                    description="Make attendance mandatory for students"
                  />
                  
                  <ToggleSwitch
                    id="enable-attendance-tracking"
                    checked={academicSettings.enableAttendanceTracking}
                    onChange={(checked) => updateAcademicSetting('enableAttendanceTracking', checked)}
                    label="Enable Attendance Tracking"
                    description="Track and record student attendance"
                  />
                  
                  <ToggleSwitch
                    id="allow-late-arrival"
                    checked={academicSettings.allowLateArrival}
                    onChange={(checked) => updateAcademicSetting('allowLateArrival', checked)}
                    label="Allow Late Arrival"
                    description="Mark students as late instead of absent"
                  />
                </div>
              </div>
            </div>
          </div>
        );

      case 'curriculum-settings':
        return (
          <div className="space-y-6">
            <div className="bg-white rounded-3xl p-8 shadow-sm border border-slate-200">
              <div className="flex items-center justify-between mb-6">
                <h3 className="text-2xl font-bold text-slate-900 flex items-center gap-3">
                  <div className="w-10 h-10 bg-gradient-to-br from-indigo-500 to-purple-600 rounded-2xl flex items-center justify-center">
                    <BookOpen className="w-5 h-5 text-white" />
                  </div>
                  Curriculum Settings
                </h3>
              </div>
              
              <div className="space-y-4">
                <ToggleSwitch
                  id="enable-cross-cutting-subjects"
                  checked={academicSettings.enableCrossCuttingSubjects}
                  onChange={(checked) => updateAcademicSetting('enableCrossCuttingSubjects', checked)}
                  label="Enable Cross-Cutting Subjects"
                  description="Allow subjects that span multiple streams"
                />
                
                <ToggleSwitch
                  id="enable-subject-prerequisites"
                  checked={academicSettings.enableSubjectPrerequisites}
                  onChange={(checked) => updateAcademicSetting('enableSubjectPrerequisites', checked)}
                  label="Enable Subject Prerequisites"
                  description="Require completion of prerequisite subjects"
                />
                
                <ToggleSwitch
                  id="allow-subject-changes"
                  checked={academicSettings.allowSubjectChanges}
                  onChange={(checked) => updateAcademicSetting('allowSubjectChanges', checked)}
                  label="Allow Subject Changes"
                  description="Let students change their subject selection"
                />
                
                <ToggleSwitch
                  id="enable-credit-system"
                  checked={academicSettings.enableCreditSystem}
                  onChange={(checked) => updateAcademicSetting('enableCreditSystem', checked)}
                  label="Enable Credit System"
                  description="Use credits for course completion"
                />
              </div>
            </div>
          </div>
        );
      
      default:
        return <StreamManagement />;
    }
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="bg-white rounded-3xl p-6 shadow-sm border border-slate-200">
        <div className="flex items-center justify-between mb-6">
          <div className="flex items-center gap-4">
            <div className="w-14 h-14 bg-black rounded-2xl flex items-center justify-center shadow-lg">
              <GraduationCap className="w-7 h-7 text-white" />
            </div>
            <div>
              <h2 className="text-3xl font-bold text-slate-900">Academic Settings</h2>
              <p className="text-slate-600 mt-1">Configure your school's academic structure</p>
            </div>
          </div>
          
          {!['stream-management', 'stream-config', 'subject-combinations'].includes(activeSection) && (
            <button
              onClick={handleSave}
              disabled={isSaving}
              className={`flex items-center gap-2 px-6 py-3 rounded-xl font-medium transition-all shadow-lg ${
                isSaving
                  ? 'bg-slate-300 text-slate-500 cursor-not-allowed'
                  : 'bg-black text-white hover:to-blue-700 hover:shadow-xl transform hover:-translate-y-0.5'
              }`}
            >
              {isSaving ? (
                <>
                  <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin"></div>
                  Saving...
                </>
              ) : (
                <>
                  <Save className="w-4 h-4" />
                  Save Changes
                </>
              )}
            </button>
          )}
        </div>

        {saveStatus !== 'idle' && (
          <div className={`flex items-center gap-2 p-3 rounded-xl mb-4 ${
            saveStatus === 'success' 
              ? 'bg-green-50 text-green-800 border border-green-200' 
              : 'bg-red-50 text-red-800 border border-red-200'
          }`}>
            {saveStatus === 'success' ? (
              <CheckCircle className="w-4 h-4" />
            ) : (
              <AlertCircle className="w-4 h-4" />
            )}
            <span className="text-sm font-medium">
              {saveStatus === 'success' ? 'Settings saved successfully!' : 'Error saving settings'}
            </span>
          </div>
        )}
        
        {/* Navigation */}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
          {sections.map((section) => (
            <button
              key={section.id}
              onClick={() => setActiveSection(section.id)}
              className={`group text-left p-2 rounded-2xl transition-all ${
                activeSection === section.id
                  ? 'bg' + section.color + ' text-black shadow-lg scale-105'
                  : 'black text-slate-600 hover:bg-slate-100 hover:scale-102'
              }`}
            >
              <div className={`w-4 h-4 rounded-xl flex items-center justify-center mb-3 transition-all ${
                activeSection === section.id
                  ? 'bg-black'
                  : 'bg-black ' + section.color
              }`}>
                <section.icon className={`w-3 h-4 ${
                  activeSection === section.id ? 'text-white' : 'text-white'
                }`} />
              </div>
              <div className="font-semibold text-sm mb-1">{section.label}</div>
              <div className={`text-xs ${
                activeSection === section.id ? 'text-black/80' : 'text-slate-500'
              }`}>
                {section.description}
              </div>
            </button>
          ))}
        </div>
      </div>

      {/* Content */}
      <div className="min-h-[600px]">
        {renderSection()}
      </div>
    </div>
  );
};

// Wrap the component with the context provider
const AcademicTab: React.FC = () => {
  return (
    <StreamConfigurationProvider>
      <AcademicTabContent />
    </StreamConfigurationProvider>
  );
};

export default AcademicTab;