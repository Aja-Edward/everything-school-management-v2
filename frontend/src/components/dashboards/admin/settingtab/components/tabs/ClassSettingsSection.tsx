import React, { useState } from 'react';
import {
  School,
  AlertTriangle,
  AlertCircle,
  CheckCircle,
  Users,
  Save,
  RefreshCw,
  Edit3,
  X,
  Check,
  LayoutGrid,
  Gauge,
} from 'lucide-react';
import ToggleSwitch from '@/components/dashboards/admin/settingtab/components/ToggleSwitch';
import { useClassroomCapacity } from '@/contexts/ClassroomContext';
import classroomService from '@/services/ClassroomService';

// ── Props ─────────────────────────────────────────────────────────────────────

interface ClassSettingsSectionProps {
  allowClassOverflow: boolean;
  enableStreaming: boolean;
  enableSubjectElectives: boolean;
  onSettingChange: (field: string, value: any) => void;
}

// ── Component ─────────────────────────────────────────────────────────────────

const ClassSettingsSection: React.FC<ClassSettingsSectionProps> = ({
  allowClassOverflow,
  enableStreaming,
  enableSubjectElectives,
  onSettingChange,
}) => {
  const {
    classrooms,
    loading,
    capacitySaving,
    error,
    fetchClassrooms,
    setClassroomCapacity,
    bulkSetClassroomCapacity,
  } = useClassroomCapacity();

  // ── Bulk update state ──────────────────────────────────────────────────────
  const [bulkCapacity, setBulkCapacity] = useState<number | ''>('');
  const [isBulkSaving, setIsBulkSaving] = useState(false);
  const [bulkStatus, setBulkStatus] = useState<'idle' | 'success' | 'error'>('idle');
  const [bulkMessage, setBulkMessage] = useState('');

  // ── Per-row edit state ─────────────────────────────────────────────────────
  const [editingId, setEditingId] = useState<number | null>(null);
  const [editValue, setEditValue] = useState<number>(30);
  const [savingId, setSavingId] = useState<number | null>(null);
  const [perSaveStatus, setPerSaveStatus] = useState<Record<number, 'success' | 'error'>>({});

  // ── Handlers ───────────────────────────────────────────────────────────────

  const handleSaveOne = async (classroomId: number, newCapacity: number) => {
    setSavingId(classroomId);
    try {
      await setClassroomCapacity(classroomId, newCapacity);
      setPerSaveStatus(prev => ({ ...prev, [classroomId]: 'success' }));
      setTimeout(() => {
        setPerSaveStatus(prev => { const n = { ...prev }; delete n[classroomId]; return n; });
      }, 3000);
      setEditingId(null);
    } catch (err: any) {
      setPerSaveStatus(prev => ({ ...prev, [classroomId]: 'error' }));
      setBulkMessage(err.message || 'Failed to update classroom');
      setBulkStatus('error');
      setTimeout(() => {
        setPerSaveStatus(prev => { const n = { ...prev }; delete n[classroomId]; return n; });
        setBulkStatus('idle');
      }, 5000);
    } finally {
      setSavingId(null);
    }
  };

  const handleBulkSave = async () => {
    if (bulkCapacity === '' || isNaN(Number(bulkCapacity)) || Number(bulkCapacity) < 1) return;
    const capacity = Number(bulkCapacity);
    setIsBulkSaving(true);
    setBulkStatus('idle');
    setBulkMessage('');
    try {
      const { succeeded, failed } = await bulkSetClassroomCapacity(capacity);
      if (failed.length > 0) {
        setBulkStatus('error');
        setBulkMessage(`${failed.length} classroom(s) failed — ${failed[0].error}`);
      } else {
        setBulkStatus('success');
        setBulkMessage(`All ${succeeded} classrooms updated to ${capacity} students max`);
      }
      setTimeout(() => setBulkStatus('idle'), 5000);
    } catch (err: any) {
      setBulkStatus('error');
      setBulkMessage(err.message || 'Bulk update failed');
      setTimeout(() => setBulkStatus('idle'), 5000);
    } finally {
      setIsBulkSaving(false);
    }
  };

  // ── Derived stats ──────────────────────────────────────────────────────────
  const overCapacityCount = classrooms.filter(c => classroomService.getEnrollment(c) > c.max_capacity).length;
  const atCapacityCount   = classrooms.filter(c => classroomService.getIsFull(c)).length;
  const availableCount    = classrooms.length - atCapacityCount - overCapacityCount;
  const bulkValid         = bulkCapacity !== '' && !isNaN(Number(bulkCapacity)) && Number(bulkCapacity) >= 1;
  const isBusy            = loading || capacitySaving;

  // ── Render ─────────────────────────────────────────────────────────────────
  return (
    <div className="space-y-6">

      {/* ── Section header card ── */}
      <div className="bg-white rounded-3xl p-8 shadow-sm border border-slate-200">
        <div className="flex items-center gap-4 mb-8">
          <div className="w-10 h-10 bg-black rounded-2xl flex items-center justify-center shadow-lg">
            <School className="w-5 h-5 text-white" />
          </div>
          <div>
            <h3 className="text-2xl font-bold text-slate-900">Class Management</h3>
            <p className="text-slate-500 text-sm mt-0.5">Configure classroom sizes, capacity rules, and organisation</p>
          </div>
        </div>

        {/* ── Stats row ── */}
        <div className="grid grid-cols-3 gap-4">
          {[
            {
              label: 'Total Classrooms',
              value: classrooms.length,
              icon: LayoutGrid,
              note: 'registered',
            },
            {
              label: 'At or Over Capacity',
              value: atCapacityCount + overCapacityCount,
              icon: Gauge,
              note: overCapacityCount > 0 ? `${overCapacityCount} over limit` : 'none critical',
              warn: overCapacityCount > 0,
            },
            {
              label: 'Available',
              value: availableCount,
              icon: Users,
              note: 'with open spots',
            },
          ].map(stat => (
            <div
              key={stat.label}
              className={`p-5 rounded-2xl border ${
                stat.warn
                  ? 'bg-slate-50 border-slate-300'
                  : 'bg-slate-50 border-slate-200'
              }`}
            >
              <div className="flex items-center justify-between mb-3">
                <p className="text-xs font-semibold text-slate-500 uppercase tracking-wider">{stat.label}</p>
                <div className={`w-7 h-7 rounded-lg flex items-center justify-center ${stat.warn ? 'bg-black' : 'bg-black'}`}>
                  <stat.icon className="w-3.5 h-3.5 text-white" />
                </div>
              </div>
              {loading ? (
                <div className="h-8 w-12 bg-slate-200 rounded-lg animate-pulse" />
              ) : (
                <p className="text-3xl font-bold text-slate-900">{stat.value}</p>
              )}
              <p className="text-xs text-slate-400 mt-1">{stat.note}</p>
            </div>
          ))}
        </div>
      </div>

      {/* ── Over-capacity alert ── */}
      {!loading && overCapacityCount > 0 && (
        <div className="flex items-start gap-4 p-5 bg-white rounded-2xl border border-slate-200 shadow-sm">
          <div className="w-9 h-9 bg-black rounded-xl flex items-center justify-center flex-shrink-0 mt-0.5">
            <AlertCircle className="w-4 h-4 text-white" />
          </div>
          <div>
            <p className="text-sm font-bold text-slate-900">
              {overCapacityCount} classroom{overCapacityCount > 1 ? 's are' : ' is'} over capacity
            </p>
            <p className="text-xs text-slate-500 mt-1">
              Raise the per-classroom limit below, or turn on <span className="font-semibold text-slate-700">Allow Class Overflow</span> to suppress this warning.
            </p>
          </div>
        </div>
      )}

      {/* ── Bulk capacity update ── */}
      <div className="bg-white rounded-3xl p-8 shadow-sm border border-slate-200">
        <div className="flex items-center gap-3 mb-2">
          <div className="w-8 h-8 bg-black rounded-xl flex items-center justify-center">
            <Save className="w-4 h-4 text-white" />
          </div>
          <h4 className="text-lg font-bold text-slate-900">Bulk Capacity Update</h4>
        </div>
        <p className="text-sm text-slate-500 mb-6 ml-11">
          Apply one maximum capacity value to every classroom in a single action.
        </p>

        <div className="flex items-end gap-4 flex-wrap">
          <div className="flex-1 min-w-[200px] max-w-xs">
            <label className="block text-xs font-semibold text-slate-600 uppercase tracking-wider mb-2">
              New Max Capacity
            </label>
            <div className="relative">
              <input
                type="number"
                min="1"
                max="200"
                placeholder="e.g. 40"
                value={bulkCapacity}
                onChange={e => {
                  const val = e.target.value;
                  setBulkCapacity(val === '' ? '' : parseInt(val));
                  setBulkStatus('idle');
                }}
                className="w-full px-4 py-3 pr-20 border border-slate-300 rounded-xl text-slate-900 font-medium
                           focus:outline-none focus:ring-2 focus:ring-black focus:border-black
                           transition-all duration-200 bg-white placeholder:text-slate-300"
              />
              <span className="absolute right-4 top-1/2 -translate-y-1/2 text-slate-400 text-sm font-medium pointer-events-none">
                students
              </span>
            </div>
            {bulkCapacity !== '' && Number(bulkCapacity) > 50 && (
              <p className="flex items-center gap-1.5 text-xs text-slate-500 mt-2">
                <AlertTriangle className="w-3 h-3" />
                Above the recommended maximum of 50
              </p>
            )}
          </div>

          <button
            onClick={handleBulkSave}
            disabled={!bulkValid || isBulkSaving || isBusy || classrooms.length === 0}
            className={`flex items-center gap-2 px-6 py-3 rounded-xl font-semibold text-sm transition-all duration-200 shadow-sm ${
              !bulkValid || isBulkSaving || isBusy || classrooms.length === 0
                ? 'bg-slate-100 text-slate-400 cursor-not-allowed shadow-none'
                : 'bg-black text-white hover:bg-slate-800 hover:shadow-md'
            }`}
          >
            {isBulkSaving ? (
              <>
                <div className="w-4 h-4 border-2 border-white/40 border-t-white rounded-full animate-spin" />
                Applying…
              </>
            ) : (
              <>
                <Save className="w-4 h-4" />
                Apply to All
              </>
            )}
          </button>
        </div>

        {bulkStatus !== 'idle' && (
          <div className={`flex items-start gap-3 mt-5 p-4 rounded-xl border text-sm ${
            bulkStatus === 'success'
              ? 'bg-slate-50 border-slate-200 text-slate-700'
              : 'bg-slate-50 border-slate-300 text-slate-800'
          }`}>
            {bulkStatus === 'success'
              ? <CheckCircle className="w-4 h-4 flex-shrink-0 mt-0.5 text-slate-600" />
              : <AlertCircle className="w-4 h-4 flex-shrink-0 mt-0.5 text-slate-700" />}
            <span>{bulkMessage}</span>
          </div>
        )}
      </div>

      {/* ── Per-classroom capacity table ── */}
      <div className="bg-white rounded-3xl p-8 shadow-sm border border-slate-200">
        <div className="flex items-center justify-between mb-6">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 bg-black rounded-xl flex items-center justify-center">
              <Users className="w-4 h-4 text-white" />
            </div>
            <div>
              <h4 className="text-lg font-bold text-slate-900">Individual Classroom Capacities</h4>
              <p className="text-xs text-slate-400 mt-0.5">Click the edit icon on any row to adjust its limit</p>
            </div>
          </div>
          <button
            onClick={fetchClassrooms}
            disabled={loading}
            className="flex items-center gap-1.5 text-xs font-semibold text-slate-500 hover:text-slate-900
                       border border-slate-200 hover:border-slate-400 px-3 py-2 rounded-xl
                       transition-all duration-200 disabled:opacity-40"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} />
            Refresh
          </button>
        </div>

        {loading ? (
          <div className="space-y-3">
            {[...Array(4)].map((_, i) => (
              <div key={i} className="h-14 bg-slate-50 rounded-xl animate-pulse border border-slate-100" />
            ))}
          </div>
        ) : error ? (
          <div className="flex items-center gap-3 p-5 bg-slate-50 border border-slate-200 rounded-2xl">
            <div className="w-8 h-8 bg-black rounded-xl flex items-center justify-center flex-shrink-0">
              <AlertCircle className="w-4 h-4 text-white" />
            </div>
            <div className="flex-1">
              <p className="text-sm font-semibold text-slate-800">Failed to load classrooms</p>
              <p className="text-xs text-slate-500 mt-0.5">{error}</p>
            </div>
            <button
              onClick={fetchClassrooms}
              className="text-xs font-semibold text-slate-700 border border-slate-300 hover:border-slate-600 px-3 py-2 rounded-lg transition-colors"
            >
              Retry
            </button>
          </div>
        ) : classrooms.length === 0 ? (
          <div className="text-center py-14">
            <div className="w-12 h-12 bg-slate-100 rounded-2xl flex items-center justify-center mx-auto mb-3">
              <School className="w-6 h-6 text-slate-400" />
            </div>
            <p className="text-sm font-semibold text-slate-500">No classrooms found</p>
            <p className="text-xs text-slate-400 mt-1">Classrooms will appear here once created</p>
          </div>
        ) : (
          <div className="overflow-x-auto -mx-1">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-slate-100">
                  <th className="text-left px-4 py-3 text-xs font-semibold text-slate-400 uppercase tracking-wider">Classroom</th>
                  <th className="text-center px-4 py-3 text-xs font-semibold text-slate-400 uppercase tracking-wider">Enrolled</th>
                  <th className="text-center px-4 py-3 text-xs font-semibold text-slate-400 uppercase tracking-wider">Max Capacity</th>
                  <th className="text-center px-4 py-3 text-xs font-semibold text-slate-400 uppercase tracking-wider">Status</th>
                  <th className="text-center px-4 py-3 text-xs font-semibold text-slate-400 uppercase tracking-wider w-20">Edit</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-50">
                {classrooms.map(classroom => {
                  const enrollment   = classroomService.getEnrollment(classroom);
                  const isOver       = enrollment > classroom.max_capacity;
                  const isFull       = classroomService.getIsFull(classroom);
                  const spots        = classroomService.getAvailableSpots(classroom);
                  const isEditing    = editingId === classroom.id;
                  const isSavingThis = savingId === classroom.id;
                  const rowStatus    = perSaveStatus[classroom.id];

                  return (
                    <tr
                      key={classroom.id}
                      className="group hover:bg-slate-50/70 transition-colors duration-150"
                    >
                      {/* Name */}
                      <td className="px-4 py-4">
                        <div className="flex items-center gap-3">
                          <div className={`w-2 h-2 rounded-full flex-shrink-0 ${
                            isOver ? 'bg-slate-800' : isFull ? 'bg-slate-400' : 'bg-slate-300'
                          }`} />
                          <span className="font-semibold text-slate-800">{classroom.name}</span>
                        </div>
                      </td>

                      {/* Enrolled */}
                      <td className="px-4 py-4 text-center">
                        <span className={`text-sm font-bold ${isOver ? 'text-slate-900' : 'text-slate-600'}`}>
                          {enrollment}
                        </span>
                      </td>

                      {/* Max capacity — inline edit */}
                      <td className="px-4 py-4 text-center">
                        {isEditing ? (
                          <input
                            type="number"
                            min="1"
                            max="200"
                            value={editValue}
                            onChange={e => setEditValue(parseInt(e.target.value) || 1)}
                            className="w-20 px-2 py-1.5 border border-black rounded-lg text-center
                                       focus:outline-none focus:ring-2 focus:ring-black text-sm font-semibold text-slate-900"
                            autoFocus
                            onKeyDown={e => {
                              if (e.key === 'Enter')  handleSaveOne(classroom.id, editValue);
                              if (e.key === 'Escape') setEditingId(null);
                            }}
                          />
                        ) : (
                          <span className="text-sm font-semibold text-slate-700">{classroom.max_capacity}</span>
                        )}
                      </td>

                      {/* Status badge */}
                      <td className="px-4 py-4 text-center">
                        {rowStatus === 'success' ? (
                          <span className="inline-flex items-center gap-1.5 text-xs font-semibold text-slate-700 bg-slate-100 border border-slate-200 px-2.5 py-1 rounded-full">
                            <CheckCircle className="w-3 h-3" /> Saved
                          </span>
                        ) : rowStatus === 'error' ? (
                          <span className="inline-flex items-center gap-1.5 text-xs font-semibold text-slate-800 bg-slate-100 border border-slate-300 px-2.5 py-1 rounded-full">
                            <AlertCircle className="w-3 h-3" /> Failed
                          </span>
                        ) : isOver ? (
                          <span className="inline-flex items-center gap-1.5 text-xs font-semibold text-white bg-black px-2.5 py-1 rounded-full">
                            <AlertCircle className="w-3 h-3" /> Over limit
                          </span>
                        ) : isFull ? (
                          <span className="inline-flex items-center gap-1.5 text-xs font-semibold text-slate-700 bg-slate-200 px-2.5 py-1 rounded-full">
                            <AlertTriangle className="w-3 h-3" /> Full
                          </span>
                        ) : (
                          <span className="inline-flex items-center gap-1.5 text-xs font-semibold text-slate-600 bg-slate-100 border border-slate-200 px-2.5 py-1 rounded-full">
                            <CheckCircle className="w-3 h-3" /> {spots} open
                          </span>
                        )}
                      </td>

                      {/* Actions */}
                      <td className="px-4 py-4 text-center">
                        {isEditing ? (
                          <div className="flex items-center justify-center gap-1.5">
                            <button
                              onClick={() => handleSaveOne(classroom.id, editValue)}
                              disabled={isSavingThis}
                              className="w-7 h-7 bg-black text-white rounded-lg flex items-center justify-center
                                         hover:bg-slate-800 disabled:opacity-50 transition-colors"
                              title="Save"
                            >
                              {isSavingThis
                                ? <div className="w-3 h-3 border-2 border-white/40 border-t-white rounded-full animate-spin" />
                                : <Check className="w-3.5 h-3.5" />}
                            </button>
                            <button
                              onClick={() => setEditingId(null)}
                              className="w-7 h-7 bg-slate-100 text-slate-600 rounded-lg flex items-center justify-center
                                         hover:bg-slate-200 transition-colors"
                              title="Cancel"
                            >
                              <X className="w-3.5 h-3.5" />
                            </button>
                          </div>
                        ) : (
                          <button
                            onClick={() => {
                              setEditingId(classroom.id);
                              setEditValue(classroom.max_capacity);
                            }}
                            className="w-7 h-7 text-slate-300 hover:text-slate-700 hover:bg-slate-100 rounded-lg
                                       flex items-center justify-center mx-auto transition-all duration-150
                                       opacity-0 group-hover:opacity-100"
                            title="Edit capacity"
                          >
                            <Edit3 className="w-3.5 h-3.5" />
                          </button>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* ── Class management feature toggles ── */}
      <div className="bg-white rounded-3xl p-8 shadow-sm border border-slate-200">
        <div className="flex items-center gap-3 mb-6">
          <div className="w-8 h-8 bg-black rounded-xl flex items-center justify-center">
            <School className="w-4 h-4 text-white" />
          </div>
          <div>
            <h4 className="text-lg font-bold text-slate-900">Class Behaviour</h4>
            <p className="text-xs text-slate-400 mt-0.5">Control how classrooms accept and organise students</p>
          </div>
        </div>

        <div className="divide-y divide-slate-100">
          <div className="py-4 first:pt-0 last:pb-0">
            <ToggleSwitch
              id="allow-class-overflow"
              checked={allowClassOverflow}
              onChange={checked => onSettingChange('allowClassOverflow', checked)}
              label="Allow Class Overflow"
              description="Permit enrolment beyond the classroom's maximum capacity when necessary"
            />
          </div>
          <div className="py-4 first:pt-0 last:pb-0">
            <ToggleSwitch
              id="enable-streaming"
              checked={enableStreaming}
              onChange={checked => onSettingChange('enableStreaming', checked)}
              label="Enable Stream-based Classes"
              description="Organise classrooms by academic streams — Science, Arts, Commercial, Technical"
            />
          </div>
          <div className="py-4 first:pt-0 last:pb-0">
            <ToggleSwitch
              id="enable-subject-electives"
              checked={enableSubjectElectives}
              onChange={checked => onSettingChange('enableSubjectElectives', checked)}
              label="Enable Subject Electives"
              description="Allow students to select optional subjects within their assigned stream"
            />
          </div>
        </div>
      </div>

    </div>
  );
};

export default ClassSettingsSection;