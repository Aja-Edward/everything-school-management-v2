import React, { useState, useEffect, useCallback } from 'react';
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
  Layers,
  Loader2,
} from 'lucide-react';
import ToggleSwitch from '@/components/dashboards/admin/settingtab/components/ToggleSwitch';
import { StreamConfigurationProvider } from '@/contexts/StreamConfigurationContext';
import StreamManagement from '@/components/admin/StreamManagement';
import StreamConfigurationManager from '@/components/admin/StreamConfigurationManager';
import SubjectCombinationsManager from '@/components/admin/SubjectCombinationsManager';
import ClassSettingsSection from './ClassSettingsSection';
import academicSettingsService, {
  type AllAcademicSettings,
} from '@/services/AcademicSettingsService';

// ============================================================================
// TYPES
// ============================================================================

type SaveStatus = 'idle' | 'saving' | 'success' | 'error';

// ============================================================================
// CONSTANTS
// ============================================================================

const MONTHS = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
];

// Sections that own their own save logic — hide the global Save button for these
const SELF_SAVING_SECTIONS = ['stream-management', 'stream-config', 'subject-combinations'];

const SECTIONS = [
  {
    id: 'stream-management',
    label: 'Stream Management',
    icon: Layers,
    description: 'Create and manage streams',
  },
  {
    id: 'stream-config',
    label: 'Stream Configuration',
    icon: Target,
    description: 'Configure streams and subjects',
  },
  {
    id: 'subject-combinations',
    label: 'Subject Combinations',
    icon: GitBranch,
    description: 'Define valid combinations',
  },
  {
    id: 'academic-settings',
    label: 'Academic Year',
    icon: Calendar,
    description: 'Calendar and terms',
  },
  {
    id: 'class-settings',
    label: 'Class Management',
    icon: School,
    description: 'Class sizes and options',
  },
  {
    id: 'grading-settings',
    label: 'Grading System',
    icon: GraduationCap,
    description: 'Scales and assessments',
  },
  {
    id: 'attendance-settings',
    label: 'Attendance',
    icon: Users,
    description: 'Tracking and policies',
  },
  {
    id: 'curriculum-settings',
    label: 'Curriculum',
    icon: BookOpen,
    description: 'Prerequisites and credits',
  },
  {
    id: 'teaching-model',
    label: 'Teaching Model',
    icon: Users,
    description: 'Class teacher vs subject teachers',
  },
];

const DEFAULT_SETTINGS: AllAcademicSettings = {
  academic_year_start: 'September',
  academic_year_end: 'July',
  terms_per_year: 3,
  weeks_per_term: 13,
  allow_class_overflow: false,
  enable_streaming: true,
  enable_subject_electives: true,
  grading_system: 'percentage',
  pass_percentage: 40,
  enable_grade_curving: false,
  enable_grade_weighting: true,
  require_attendance: true,
  minimum_attendance_percentage: 75,
  enable_attendance_tracking: true,
  allow_late_arrival: true,
  enable_cross_cutting_subjects: true,
  enable_subject_prerequisites: true,
  allow_subject_changes: true,
  enable_credit_system: true,
  nursery_use_subject_teachers: false,
  primary_use_subject_teachers: false,
  junior_secondary_use_subject_teachers: true,
  senior_secondary_use_subject_teachers: true,
};

// ============================================================================
// SUB-COMPONENTS
// ============================================================================

function SaveBanner({ status }: { status: SaveStatus }) {
  if (status === 'idle' || status === 'saving') return null;
  const isSuccess = status === 'success';
  return (
    <div
      className={`flex items-center gap-2 p-3 rounded-xl mb-4 ${
        isSuccess
          ? 'bg-green-50 text-green-800 border border-green-200'
          : 'bg-red-50 text-red-800 border border-red-200'
      }`}
    >
      {isSuccess ? (
        <CheckCircle className="w-4 h-4 shrink-0" />
      ) : (
        <AlertCircle className="w-4 h-4 shrink-0" />
      )}
      <span className="text-sm font-medium">
        {isSuccess
          ? 'Settings saved successfully!'
          : 'Failed to save settings. Please try again.'}
      </span>
    </div>
  );
}

function SectionLoader() {
  return (
    <div className="flex items-center justify-center py-24">
      <Loader2 className="w-8 h-8 animate-spin text-slate-400" />
      <span className="ml-3 text-slate-500 font-medium">Loading settings…</span>
    </div>
  );
}

// ============================================================================
// MAIN COMPONENT
// ============================================================================

const AcademicTabContent: React.FC = () => {
  const [activeSection, setActiveSection] = useState('stream-management');
  const [settings, setSettings] = useState<AllAcademicSettings>(DEFAULT_SETTINGS);
  const [isLoading, setIsLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [saveStatus, setSaveStatus] = useState<SaveStatus>('idle');

  // ── Fetch on mount ──────────────────────────────────────────────────────────
  useEffect(() => {
    let cancelled = false;
    setIsLoading(true);
    setLoadError(null);

    academicSettingsService
      .getAcademicSettings()
      .then((data) => {
        if (!cancelled) setSettings(data);
      })
      .catch((err) => {
        console.error('Failed to load academic settings:', err);
        if (!cancelled) setLoadError('Could not load settings — showing defaults.');
      })
      .finally(() => {
        if (!cancelled) setIsLoading(false);
      });

    return () => { cancelled = true; };
  }, []);

  // ── Field update ────────────────────────────────────────────────────────────
  const updateSetting = useCallback(
    <K extends keyof AllAcademicSettings>(field: K, value: AllAcademicSettings[K]) => {
      setSettings((prev) => ({ ...prev, [field]: value }));
      setSaveStatus('idle');
    },
    []
  );

  // ── Save dispatcher ─────────────────────────────────────────────────────────
  const handleSave = async () => {
    setSaveStatus('saving');
    try {
      let updatedSettings: AllAcademicSettings | undefined;
      
      switch (activeSection) {
        case 'academic-settings':
          updatedSettings = await academicSettingsService.saveAcademicYearSettings({
            academic_year_start: settings.academic_year_start,
            academic_year_end: settings.academic_year_end,
            terms_per_year: settings.terms_per_year,
            weeks_per_term: settings.weeks_per_term,
          });
          break;

        case 'class-settings':
          updatedSettings = await academicSettingsService.saveClassSettings({
            allow_class_overflow: settings.allow_class_overflow,
            enable_streaming: settings.enable_streaming,
            enable_subject_electives: settings.enable_subject_electives,
          });
          break;

        case 'grading-settings':
          updatedSettings = await academicSettingsService.saveGradingSettings({
            grading_system: settings.grading_system,
            pass_percentage: settings.pass_percentage,
            enable_grade_curving: settings.enable_grade_curving,
            enable_grade_weighting: settings.enable_grade_weighting,
          });
          break;

        case 'attendance-settings':
          updatedSettings = await academicSettingsService.saveAttendanceSettings({
            require_attendance: settings.require_attendance,
            minimum_attendance_percentage: settings.minimum_attendance_percentage,
            enable_attendance_tracking: settings.enable_attendance_tracking,
            allow_late_arrival: settings.allow_late_arrival,
          });
          break;

        case 'curriculum-settings':
          updatedSettings = await academicSettingsService.saveCurriculumSettings({
            enable_cross_cutting_subjects: settings.enable_cross_cutting_subjects,
            enable_subject_prerequisites: settings.enable_subject_prerequisites,
            allow_subject_changes: settings.allow_subject_changes,
            enable_credit_system: settings.enable_credit_system,
          });
          break;

        case 'teaching-model':
          updatedSettings = await academicSettingsService.updateAcademicSettings({
            nursery_use_subject_teachers:              settings.nursery_use_subject_teachers,
            primary_use_subject_teachers:              settings.primary_use_subject_teachers,
            junior_secondary_use_subject_teachers:     settings.junior_secondary_use_subject_teachers,
            senior_secondary_use_subject_teachers:     settings.senior_secondary_use_subject_teachers,
          });
          break;
      }
      
      // Update state with returned settings to ensure persistence
      if (updatedSettings) {
        setSettings(updatedSettings);
        console.log('✅ Settings updated and persisted:', updatedSettings);
      }
      
      setSaveStatus('success');
      setTimeout(() => setSaveStatus('idle'), 3000);
    } catch (err) {
      console.error('Save failed:', err);
      setSaveStatus('error');
      setTimeout(() => setSaveStatus('idle'), 4000);
      throw err;
    }
  };

  // ── Section renderer ────────────────────────────────────────────────────────
  const renderSection = () => {
    // Stream panels are self-contained — never show our loader for them
    if (isLoading && !SELF_SAVING_SECTIONS.includes(activeSection)) {
      return <SectionLoader />;
    }

    switch (activeSection) {
      // ── Self-managed panels ───────────────────────────────────────────────
      case 'stream-management':
        return <StreamManagement />;
      case 'stream-config':
        return <StreamConfigurationManager />;
      case 'subject-combinations':
        return <SubjectCombinationsManager />;

      // ── Academic Year ─────────────────────────────────────────────────────
      case 'academic-settings':
        return (
          <div className="space-y-6">
            <div className="bg-white rounded-3xl p-8 shadow-sm border border-slate-200">
              <h3 className="text-2xl font-bold text-slate-900 flex items-center gap-3 mb-6">
                <div className="w-10 h-10 bg-gradient-to-br from-amber-500 to-orange-600 rounded-2xl flex items-center justify-center">
                  <Calendar className="w-5 h-5 text-white" />
                </div>
                Academic Year Settings
              </h3>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <div className="space-y-2">
                  <label className="block text-sm font-semibold text-slate-700">
                    Academic Year Start
                  </label>
                  <select
                    value={settings.academic_year_start}
                    onChange={(e) => updateSetting('academic_year_start', e.target.value)}
                    className="w-full px-4 py-3 border border-slate-300 rounded-xl focus:ring-2 focus:ring-amber-500 focus:border-amber-500 transition-all bg-white font-medium"
                  >
                    {MONTHS.map((m) => (
                      <option key={m} value={m}>{m}</option>
                    ))}
                  </select>
                </div>

                <div className="space-y-2">
                  <label className="block text-sm font-semibold text-slate-700">
                    Academic Year End
                  </label>
                  <select
                    value={settings.academic_year_end}
                    onChange={(e) => updateSetting('academic_year_end', e.target.value)}
                    className="w-full px-4 py-3 border border-slate-300 rounded-xl focus:ring-2 focus:ring-amber-500 focus:border-amber-500 transition-all bg-white font-medium"
                  >
                    {MONTHS.map((m) => (
                      <option key={m} value={m}>{m}</option>
                    ))}
                  </select>
                </div>

                <div className="space-y-2">
                  <label className="block text-sm font-semibold text-slate-700">
                    Terms Per Year
                  </label>
                  <input
                    type="number"
                    min={1}
                    max={6}
                    value={settings.terms_per_year}
                    onChange={(e) =>
                      updateSetting('terms_per_year', parseInt(e.target.value) || 1)
                    }
                    className="w-full px-4 py-3 border border-slate-300 rounded-xl focus:ring-2 focus:ring-amber-500 focus:border-amber-500 transition-all bg-white font-medium text-center"
                  />
                </div>

                <div className="space-y-2">
                  <label className="block text-sm font-semibold text-slate-700">
                    Weeks Per Term
                  </label>
                  <input
                    type="number"
                    min={8}
                    max={20}
                    value={settings.weeks_per_term}
                    onChange={(e) =>
                      updateSetting('weeks_per_term', parseInt(e.target.value) || 8)
                    }
                    className="w-full px-4 py-3 border border-slate-300 rounded-xl focus:ring-2 focus:ring-amber-500 focus:border-amber-500 transition-all bg-white font-medium text-center"
                  />
                </div>
              </div>

              {/* Summary */}
              <div className="mt-8 p-6 bg-gradient-to-r from-amber-50 to-orange-50 rounded-2xl border border-amber-200">
                <div className="flex items-center gap-3 mb-4">
                  <Target className="w-5 h-5 text-amber-700" />
                  <h4 className="font-semibold text-amber-900">Academic Year Summary</h4>
                </div>
                <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-sm">
                  <div>
                    <p className="text-amber-700 font-medium mb-1">Duration</p>
                    <p className="text-amber-900 font-semibold">
                      {settings.academic_year_start} – {settings.academic_year_end}
                    </p>
                  </div>
                  <div>
                    <p className="text-amber-700 font-medium mb-1">Total Terms</p>
                    <p className="text-amber-900 font-semibold text-2xl">
                      {settings.terms_per_year}
                    </p>
                  </div>
                  <div>
                    <p className="text-amber-700 font-medium mb-1">Weeks per Term</p>
                    <p className="text-amber-900 font-semibold text-2xl">
                      {settings.weeks_per_term}
                    </p>
                  </div>
                  <div>
                    <p className="text-amber-700 font-medium mb-1">Total Weeks</p>
                    <p className="text-amber-900 font-semibold text-2xl">
                      {settings.terms_per_year * settings.weeks_per_term}
                    </p>
                  </div>
                </div>
              </div>
            </div>
          </div>
        );

      // ── Class Settings ────────────────────────────────────────────────────
      case 'class-settings':
        return (
          <ClassSettingsSection
            allowClassOverflow={settings.allow_class_overflow}
            enableStreaming={settings.enable_streaming}
            enableSubjectElectives={settings.enable_subject_electives}
            onSettingChange={(field, value) => {
              // ClassSettingsSection uses camelCase — map to snake_case
              const keyMap: Record<string, keyof AllAcademicSettings> = {
                allowClassOverflow: 'allow_class_overflow',
                enableStreaming: 'enable_streaming',
                enableSubjectElectives: 'enable_subject_electives',
              };
              const snakeKey = keyMap[field] ?? (field as keyof AllAcademicSettings);
              updateSetting(snakeKey, value);
            }}
          />
        );

      // ── Grading ───────────────────────────────────────────────────────────
      case 'grading-settings':
        return (
          <div className="space-y-6">
            <div className="bg-white rounded-3xl p-8 shadow-sm border border-slate-200">
              <h3 className="text-2xl font-bold text-slate-900 flex items-center gap-3 mb-6">
                <div className="w-10 h-10 bg-black rounded-2xl flex items-center justify-center">
                  <GraduationCap className="w-5 h-5 text-white" />
                </div>
                Grading System Settings
              </h3>

              <div className="space-y-8">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                  <div className="space-y-2">
                    <label className="block text-sm font-semibold text-slate-700">
                      Grading System
                    </label>
                    <select
                      value={settings.grading_system}
                      onChange={(e) =>
                        updateSetting(
                          'grading_system',
                          e.target.value as AllAcademicSettings['grading_system']
                        )
                      }
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
                      min={0}
                      max={100}
                      value={settings.pass_percentage}
                      onChange={(e) =>
                        updateSetting('pass_percentage', parseInt(e.target.value) || 0)
                      }
                      className="w-full px-4 py-3 border border-slate-300 rounded-xl focus:ring-2 focus:ring-purple-500 focus:border-purple-500 transition-all bg-white font-medium text-center"
                    />
                  </div>
                </div>

                <div className="space-y-4">
                  <ToggleSwitch
                    id="enable-grade-curving"
                    checked={settings.enable_grade_curving}
                    onChange={(checked) => updateSetting('enable_grade_curving', checked)}
                    label="Enable Grade Curving"
                    description="Allow automatic grade adjustments based on class performance"
                  />
                  <ToggleSwitch
                    id="enable-grade-weighting"
                    checked={settings.enable_grade_weighting}
                    onChange={(checked) => updateSetting('enable_grade_weighting', checked)}
                    label="Enable Grade Weighting"
                    description="Allow different weights for assignments and exams"
                  />
                </div>
              </div>
            </div>
          </div>
        );

      // ── Attendance ────────────────────────────────────────────────────────
      case 'attendance-settings':
        return (
          <div className="space-y-6">
            <div className="bg-white rounded-3xl p-8 shadow-sm border border-slate-200">
              <h3 className="text-2xl font-bold text-slate-900 flex items-center gap-3 mb-6">
                <div className="w-10 h-10 bg-gradient-to-br from-orange-500 to-red-600 rounded-2xl flex items-center justify-center">
                  <Users className="w-5 h-5 text-white" />
                </div>
                Attendance Settings
              </h3>

              <div className="space-y-8">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                  <div className="space-y-2">
                    <label className="block text-sm font-semibold text-slate-700">
                      Minimum Attendance Percentage
                    </label>
                    <input
                      type="number"
                      min={0}
                      max={100}
                      value={settings.minimum_attendance_percentage}
                      onChange={(e) =>
                        updateSetting(
                          'minimum_attendance_percentage',
                          parseInt(e.target.value) || 0
                        )
                      }
                      className="w-full px-4 py-3 border border-slate-300 rounded-xl focus:ring-2 focus:ring-orange-500 focus:border-orange-500 transition-all bg-white font-medium text-center"
                    />
                    <p className="text-xs text-slate-500 mt-1">
                      Students must maintain this attendance to pass
                    </p>
                  </div>
                </div>

                <div className="space-y-4">
                  <ToggleSwitch
                    id="require-attendance"
                    checked={settings.require_attendance}
                    onChange={(checked) => updateSetting('require_attendance', checked)}
                    label="Require Attendance"
                    description="Make attendance mandatory for students"
                  />
                  <ToggleSwitch
                    id="enable-attendance-tracking"
                    checked={settings.enable_attendance_tracking}
                    onChange={(checked) => updateSetting('enable_attendance_tracking', checked)}
                    label="Enable Attendance Tracking"
                    description="Track and record student attendance"
                  />
                  <ToggleSwitch
                    id="allow-late-arrival"
                    checked={settings.allow_late_arrival}
                    onChange={(checked) => updateSetting('allow_late_arrival', checked)}
                    label="Allow Late Arrival"
                    description="Mark students as late instead of absent"
                  />
                </div>
              </div>
            </div>
          </div>
        );

      // ── Curriculum ────────────────────────────────────────────────────────
      case 'curriculum-settings':
        return (
          <div className="space-y-6">
            <div className="bg-white rounded-3xl p-8 shadow-sm border border-slate-200">
              <h3 className="text-2xl font-bold text-slate-900 flex items-center gap-3 mb-6">
                <div className="w-10 h-10 bg-gradient-to-br from-indigo-500 to-purple-600 rounded-2xl flex items-center justify-center">
                  <BookOpen className="w-5 h-5 text-white" />
                </div>
                Curriculum Settings
              </h3>

              <div className="space-y-4">
                <ToggleSwitch
                  id="enable-cross-cutting-subjects"
                  checked={settings.enable_cross_cutting_subjects}
                  onChange={(checked) =>
                    updateSetting('enable_cross_cutting_subjects', checked)
                  }
                  label="Enable Cross-Cutting Subjects"
                  description="Allow subjects that span multiple streams"
                />
                <ToggleSwitch
                  id="enable-subject-prerequisites"
                  checked={settings.enable_subject_prerequisites}
                  onChange={(checked) =>
                    updateSetting('enable_subject_prerequisites', checked)
                  }
                  label="Enable Subject Prerequisites"
                  description="Require completion of prerequisite subjects"
                />
                <ToggleSwitch
                  id="allow-subject-changes"
                  checked={settings.allow_subject_changes}
                  onChange={(checked) => updateSetting('allow_subject_changes', checked)}
                  label="Allow Subject Changes"
                  description="Let students change their subject selection"
                />
                <ToggleSwitch
                  id="enable-credit-system"
                  checked={settings.enable_credit_system}
                  onChange={(checked) => updateSetting('enable_credit_system', checked)}
                  label="Enable Credit System"
                  description="Use credits for course completion"
                />
              </div>
            </div>
          </div>
        );

      // ── Teaching Model ────────────────────────────────────────────────────
      case 'teaching-model':
        return (
          <div className="space-y-6">
            <div className="bg-white rounded-3xl p-8 shadow-sm border border-slate-200">
              <h3 className="text-2xl font-bold text-slate-900 flex items-center gap-3 mb-2">
                <div className="w-10 h-10 bg-gradient-to-br from-blue-500 to-indigo-600 rounded-2xl flex items-center justify-center">
                  <Users className="w-5 h-5 text-white" />
                </div>
                Teaching Model
              </h3>
              <p className="text-slate-500 text-sm mb-6">
                Choose how teachers are assigned in each education level.{' '}
                <strong>Class-teacher model</strong> — one teacher handles all subjects.{' '}
                <strong>Subject-teacher model</strong> — each subject has its own teacher.
                Regardless of the model, a <strong>form teacher</strong> is always assigned per classroom.
              </p>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-5">
                {[
                  {
                    level: 'Nursery',
                    field: 'nursery_use_subject_teachers' as const,
                    description: 'Nursery classes normally have one class teacher. Enable this only if your nursery level uses separate subject teachers.',
                  },
                  {
                    level: 'Primary',
                    field: 'primary_use_subject_teachers' as const,
                    description: 'Primary classes normally have one class teacher. Enable if your primary level uses separate teachers per subject.',
                  },
                  {
                    level: 'Junior Secondary',
                    field: 'junior_secondary_use_subject_teachers' as const,
                    description: 'Junior Secondary normally uses subject teachers. Disable only if you want a single class teacher model.',
                  },
                  {
                    level: 'Senior Secondary',
                    field: 'senior_secondary_use_subject_teachers' as const,
                    description: 'Senior Secondary normally uses subject teachers. Disable only if you want a single class teacher model.',
                  },
                ].map(({ level, field, description }) => (
                  <div
                    key={field}
                    className={`rounded-2xl border p-5 transition-all ${
                      settings[field]
                        ? 'border-blue-200 bg-blue-50'
                        : 'border-slate-200 bg-slate-50'
                    }`}
                  >
                    <div className="flex items-start justify-between gap-4 mb-3">
                      <div>
                        <p className="font-semibold text-slate-900">{level}</p>
                        <span
                          className={`inline-block mt-1 text-xs font-medium px-2 py-0.5 rounded-full ${
                            settings[field]
                              ? 'bg-blue-100 text-blue-700'
                              : 'bg-slate-200 text-slate-600'
                          }`}
                        >
                          {settings[field] ? 'Subject Teachers' : 'Class Teacher'}
                        </span>
                      </div>
                      <ToggleSwitch
                        id={`toggle-${field}`}
                        checked={settings[field]}
                        onChange={(checked) => updateSetting(field, checked)}
                        label=""
                        description=""
                      />
                    </div>
                    <p className="text-xs text-slate-500 leading-relaxed">{description}</p>
                  </div>
                ))}
              </div>

              <div className="mt-6 p-4 bg-amber-50 border border-amber-200 rounded-2xl text-sm text-amber-800 leading-relaxed">
                <strong>Note:</strong> Changing the teaching model only affects new teacher assignments going forward.
                Existing classroom assignments are not automatically changed.
                Each classroom also retains a designated <strong>form teacher</strong> regardless of which model is active.
              </div>
            </div>
          </div>
        );

      default:
        return <StreamManagement />;
    }
  };

  // ── Render ──────────────────────────────────────────────────────────────────
  const showSaveButton = !SELF_SAVING_SECTIONS.includes(activeSection);

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

          {showSaveButton && (
            <button
              onClick={handleSave}
              disabled={saveStatus === 'saving' || isLoading}
              className={`flex items-center gap-2 px-6 py-3 rounded-xl font-medium transition-all shadow-lg ${
                saveStatus === 'saving' || isLoading
                  ? 'bg-slate-300 text-slate-500 cursor-not-allowed'
                  : 'bg-black text-white hover:shadow-xl transform hover:-translate-y-0.5'
              }`}
            >
              {saveStatus === 'saving' ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin" />
                  Saving…
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

        {/* Load error notice */}
        {loadError && (
          <div className="flex items-center gap-2 p-3 rounded-xl mb-4 bg-yellow-50 text-yellow-800 border border-yellow-200">
            <AlertCircle className="w-4 h-4 shrink-0" />
            <span className="text-sm font-medium">{loadError}</span>
          </div>
        )}

        {/* Save status */}
        <SaveBanner status={saveStatus} />

        {/* Section navigation */}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
          {SECTIONS.map((section) => {
            const Icon = section.icon;
            const isActive = activeSection === section.id;
            return (
              <button
                key={section.id}
                onClick={() => {
                  setActiveSection(section.id);
                  setSaveStatus('idle');
                }}
                className={`group text-left p-3 rounded-2xl transition-all ${
                  isActive
                    ? 'bg-slate-900 text-white shadow-lg scale-105'
                    : 'text-slate-600 hover:bg-slate-100 hover:scale-[1.02]'
                }`}
              >
                <div
                  className={`w-8 h-8 rounded-xl flex items-center justify-center mb-3 transition-all ${
                    isActive ? 'bg-white/20' : 'bg-slate-900'
                  }`}
                >
                  <Icon className="w-4 h-4 text-white" />
                </div>
                <div className="font-semibold text-sm mb-1">{section.label}</div>
                <div className={`text-xs ${isActive ? 'text-white/70' : 'text-slate-500'}`}>
                  {section.description}
                </div>
              </button>
            );
          })}
        </div>
      </div>

      {/* Section content */}
      <div className="min-h-[600px]">{renderSection()}</div>
    </div>
  );
};

// Wrap with stream context provider
const AcademicTab: React.FC = () => (
  <StreamConfigurationProvider>
    <AcademicTabContent />
  </StreamConfigurationProvider>
);

export default AcademicTab;