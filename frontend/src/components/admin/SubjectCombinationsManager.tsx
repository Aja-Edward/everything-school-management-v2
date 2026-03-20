import React, { useState } from 'react';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Checkbox } from '@/components/ui/checkbox';
import { 
  BookOpen, 
  Plus, 
  Trash2, 
  Save, 
  Layers,
  GitBranch,
  ListChecks,
  Edit,
  X,
  Star,
  Sparkles,
  Target
} from 'lucide-react';
import { useStreamConfiguration } from '@/contexts/StreamConfigurationContext';
import { SubjectCombination } from '@/services/StreamConfigurationService';

const SubjectCombinationsManager: React.FC = () => {
  const {
    streams,
    availableSubjects,
    combinations,
    selectedStream,
    isLoading,
    setSelectedStream,
    saveSubjectCombination,
    deleteSubjectCombination,
    streamConfigs
  } = useStreamConfiguration();

  const [editingCombination, setEditingCombination] = useState<Partial<SubjectCombination> | null>(null);

  const handleCreateCombination = () => {
    if (!selectedStream) return;
    
    setEditingCombination({
      name: '',
      code: '',
      description: '',
      stream_id: selectedStream,
      core_subjects: [],
      elective_subjects: [],
      cross_cutting_subjects: [],
      is_active: true,
      display_order: combinations.length + 1
    });
  };

  const handleSaveCombination = async () => {
    if (!editingCombination) return;
    
    // Validation
    if (!editingCombination.name?.trim()) {
      alert('Please enter a combination name');
      return;
    }
    if (!editingCombination.code?.trim()) {
      alert('Please enter a combination code');
      return;
    }

    await saveSubjectCombination(editingCombination);
    setEditingCombination(null);
  };

  const handleDeleteCombination = async (id: number) => {
    if (!confirm('Are you sure you want to delete this combination?')) return;
    await deleteSubjectCombination(id);
  };

  const toggleSubject = (subjectId: number, category: 'core_subjects' | 'elective_subjects' | 'cross_cutting_subjects') => {
    if (!editingCombination) return;
    
    const subjects = editingCombination[category] || [];
    const newSubjects = subjects.includes(subjectId)
      ? subjects.filter(id => id !== subjectId)
      : [...subjects, subjectId];
    
    setEditingCombination({
      ...editingCombination,
      [category]: newSubjects
    });
  };

  const getSubjectsByRole = (role: 'cross_cutting' | 'core' | 'elective') => {
    const config = streamConfigs.find(c => c.subject_role === role);
    return config?.subjects || [];
  };

  const currentStream = streams.find(s => s.id === selectedStream);
  const crossCuttingSubjects = getSubjectsByRole('cross_cutting');
  const coreSubjects = getSubjectsByRole('core');
  const electiveSubjects = getSubjectsByRole('elective');

  // Get configuration rules
  const crossCuttingConfig = streamConfigs.find(c => c.subject_role === 'cross_cutting');
  const coreConfig = streamConfigs.find(c => c.subject_role === 'core');
  const electiveConfig = streamConfigs.find(c => c.subject_role === 'elective');

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="bg-gradient-to-br from-slate-900 via-slate-800 to-slate-900 rounded-3xl p-8 text-white shadow-2xl">
        <div className="flex items-start justify-between">
          <div>
            <div className="flex items-center gap-3 mb-3">
              <div className="w-12 h-12 bg-white/10 backdrop-blur-sm rounded-2xl flex items-center justify-center border border-white/20">
                <GitBranch className="w-6 h-6 text-cyan-400" />
              </div>
              <div>
                <h1 className="text-3xl font-bold tracking-tight">Subject Combinations</h1>
                <p className="text-slate-300 text-sm mt-1">Define valid subject combinations for each stream</p>
              </div>
            </div>
          </div>
          
          <Button
            onClick={handleCreateCombination}
            disabled={!selectedStream || isLoading}
            className="bg-gradient-to-r from-cyan-500 to-blue-600 hover:from-cyan-600 hover:to-blue-700 text-white shadow-lg"
          >
            <Plus className="w-4 h-4 mr-2" />
            New Combination
          </Button>
        </div>

        {/* Stream Selection */}
        <div className="flex gap-3 mt-6 flex-wrap">
          {streams.map(stream => (
            <button
              key={stream.id}
              onClick={() => setSelectedStream(stream.id)}
              className={`px-4 py-2 rounded-xl font-medium transition-all ${
                selectedStream === stream.id
                  ? 'bg-white text-slate-900'
                  : 'bg-white/10 text-white hover:bg-white/20'
              }`}
            >
              {stream.name}
            </button>
          ))}
        </div>

        {/* Info Banner */}
        {selectedStream && (
          <div className="mt-4 p-4 bg-white/5 backdrop-blur-sm rounded-xl border border-white/10">
            <div className="flex items-center gap-2 text-sm">
              <span className="text-white/60">Requirements:</span>
              {crossCuttingConfig && (
                <span className="text-cyan-300">
                  {crossCuttingConfig.min_subjects_required}-{crossCuttingConfig.max_subjects_allowed} Cross-cutting
                </span>
              )}
              <span className="text-white/40">•</span>
              {coreConfig && (
                <span className="text-emerald-300">
                  {coreConfig.min_subjects_required}-{coreConfig.max_subjects_allowed} Core
                </span>
              )}
              <span className="text-white/40">•</span>
              {electiveConfig && (
                <span className="text-purple-300">
                  {electiveConfig.min_subjects_required}-{electiveConfig.max_subjects_allowed} Elective
                </span>
              )}
            </div>
          </div>
        )}
      </div>

      <div className="grid grid-cols-12 gap-6">
        {/* Combinations List */}
        <div className="col-span-5">
          <Card className="p-6 border-slate-200">
            <h3 className="font-semibold text-slate-900 mb-4 flex items-center gap-2">
              <ListChecks className="w-4 h-4 text-cyan-600" />
              Existing Combinations ({combinations.length})
            </h3>
            
            {combinations.length === 0 ? (
              <div className="text-center py-12 bg-slate-50 rounded-xl border-2 border-dashed border-slate-200">
                <GitBranch className="w-12 h-12 text-slate-300 mx-auto mb-3" />
                <p className="text-slate-600 font-medium">No combinations yet</p>
                <p className="text-sm text-slate-500 mt-1">Create your first subject combination</p>
              </div>
            ) : (
              <div className="space-y-3">
                {combinations.map(combo => (
                  <div
                    key={combo.id}
                    className="p-4 bg-slate-50 rounded-xl border border-slate-200 hover:border-cyan-300 transition-colors cursor-pointer"
                    onClick={() => setEditingCombination(combo)}
                  >
                    <div className="flex items-start justify-between mb-2">
                      <div className="flex-1">
                        <div className="flex items-center gap-2 mb-1">
                          <h4 className="font-medium text-slate-900">{combo.name}</h4>
                          <span className="px-2 py-0.5 bg-slate-200 text-slate-700 rounded text-xs font-semibold">
                            {combo.code}
                          </span>
                        </div>
                        {combo.description && (
                          <p className="text-xs text-slate-600 mt-1">{combo.description}</p>
                        )}
                      </div>
                      <div className="flex gap-1">
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={(e) => {
                            e.stopPropagation();
                            setEditingCombination(combo);
                          }}
                          className="text-cyan-600 hover:text-cyan-700 hover:bg-cyan-50"
                        >
                          <Edit className="w-4 h-4" />
                        </Button>
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={(e) => {
                            e.stopPropagation();
                            handleDeleteCombination(combo.id!);
                          }}
                          disabled={isLoading}
                          className="text-red-600 hover:text-red-700 hover:bg-red-50"
                        >
                          <Trash2 className="w-4 h-4" />
                        </Button>
                      </div>
                    </div>
                    
                    <div className="grid grid-cols-3 gap-2 text-xs text-slate-500 mt-3">
                      <span className="flex items-center gap-1 bg-cyan-50 text-cyan-700 px-2 py-1 rounded">
                        <Sparkles className="w-3 h-3" />
                        {combo.cross_cutting_subjects?.length || 0} CC
                      </span>
                      <span className="flex items-center gap-1 bg-emerald-50 text-emerald-700 px-2 py-1 rounded">
                        <Star className="w-3 h-3" />
                        {combo.core_subjects?.length || 0} Core
                      </span>
                      <span className="flex items-center gap-1 bg-purple-50 text-purple-700 px-2 py-1 rounded">
                        <Target className="w-3 h-3" />
                        {combo.elective_subjects?.length || 0} Elect
                      </span>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </Card>
        </div>

        {/* Editor */}
        <div className="col-span-7">
          {!editingCombination ? (
            <Card className="p-12 text-center border-slate-200">
              <div className="w-20 h-20 bg-slate-100 rounded-full flex items-center justify-center mx-auto mb-4">
                <GitBranch className="w-10 h-10 text-slate-400" />
              </div>
              <h3 className="text-xl font-semibold text-slate-900 mb-2">No Combination Selected</h3>
              <p className="text-slate-600">Select or create a combination to edit</p>
            </Card>
          ) : (
            <Card className="p-6 border-slate-200">
              <div className="flex items-center justify-between mb-6">
                <h3 className="font-semibold text-slate-900 flex items-center gap-2">
                  <Edit className="w-4 h-4 text-cyan-600" />
                  {editingCombination.id ? 'Edit' : 'Create'} Combination
                </h3>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => setEditingCombination(null)}
                >
                  <X className="w-4 h-4" />
                </Button>
              </div>

              <div className="space-y-6">
                {/* Basic Info */}
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <Label>Combination Name *</Label>
                    <Input
                      value={editingCombination.name}
                      onChange={(e) => setEditingCombination({
                        ...editingCombination,
                        name: e.target.value
                      })}
                      placeholder="e.g., Physics, Chemistry, Biology"
                    />
                  </div>
                  
                  <div>
                    <Label>Code *</Label>
                    <Input
                      value={editingCombination.code}
                      onChange={(e) => setEditingCombination({
                        ...editingCombination,
                        code: e.target.value.toUpperCase()
                      })}
                      placeholder="e.g., PCB"
                      className="uppercase"
                      maxLength={10}
                    />
                  </div>
                </div>

                <div>
                  <Label>Description</Label>
                  <Input
                    value={editingCombination.description}
                    onChange={(e) => setEditingCombination({
                      ...editingCombination,
                      description: e.target.value
                    })}
                    placeholder="Brief description of this combination"
                  />
                </div>

                {/* Cross-Cutting Subjects */}
                <div>
                  <Label className="mb-3 flex items-center gap-2">
                    <Sparkles className="w-4 h-4 text-cyan-600" />
                    Cross-Cutting Subjects
                    {crossCuttingConfig && (
                      <span className="text-xs text-slate-500 font-normal">
                        (Select {crossCuttingConfig.min_subjects_required}-{crossCuttingConfig.max_subjects_allowed})
                      </span>
                    )}
                  </Label>
                  <div className="grid grid-cols-2 gap-2 max-h-40 overflow-y-auto p-3 bg-cyan-50 rounded-xl border border-cyan-200">
                    {crossCuttingSubjects.length > 0 ? (
                      crossCuttingSubjects.map(subject => (
                        <label
                          key={subject.id}
                          className="flex items-center gap-2 p-2 rounded-lg hover:bg-white cursor-pointer transition-colors"
                        >
                          <Checkbox
                            checked={editingCombination.cross_cutting_subjects?.includes(subject.id)}
                            onCheckedChange={() => toggleSubject(subject.id, 'cross_cutting_subjects')}
                          />
                          <div className="flex-1">
                            <div className="text-sm font-medium text-slate-900">{subject.name}</div>
                            <div className="text-xs text-slate-500">{subject.code}</div>
                          </div>
                        </label>
                      ))
                    ) : (
                      <div className="col-span-2 text-center py-4 text-sm text-slate-500">
                        No cross-cutting subjects configured
                      </div>
                    )}
                  </div>
                </div>

                {/* Core Subjects */}
                <div>
                  <Label className="mb-3 flex items-center gap-2">
                    <Star className="w-4 h-4 text-emerald-600" />
                    Core Subjects
                    {coreConfig && (
                      <span className="text-xs text-slate-500 font-normal">
                        (Select {coreConfig.min_subjects_required}-{coreConfig.max_subjects_allowed})
                      </span>
                    )}
                  </Label>
                  <div className="grid grid-cols-2 gap-2 max-h-48 overflow-y-auto p-3 bg-emerald-50 rounded-xl border border-emerald-200">
                    {coreSubjects.length > 0 ? (
                      coreSubjects.map(subject => (
                        <label
                          key={subject.id}
                          className="flex items-center gap-2 p-2 rounded-lg hover:bg-white cursor-pointer transition-colors"
                        >
                          <Checkbox
                            checked={editingCombination.core_subjects?.includes(subject.id)}
                            onCheckedChange={() => toggleSubject(subject.id, 'core_subjects')}
                          />
                          <div className="flex-1">
                            <div className="text-sm font-medium text-slate-900">{subject.name}</div>
                            <div className="text-xs text-slate-500">{subject.code}</div>
                          </div>
                        </label>
                      ))
                    ) : (
                      <div className="col-span-2 text-center py-4 text-sm text-slate-500">
                        No core subjects configured
                      </div>
                    )}
                  </div>
                </div>

                {/* Elective Subjects */}
                <div>
                  <Label className="mb-3 flex items-center gap-2">
                    <Target className="w-4 h-4 text-purple-600" />
                    Elective Subjects
                    {electiveConfig && (
                      <span className="text-xs text-slate-500 font-normal">
                        (Select {electiveConfig.min_subjects_required}-{electiveConfig.max_subjects_allowed})
                      </span>
                    )}
                  </Label>
                  <div className="grid grid-cols-2 gap-2 max-h-48 overflow-y-auto p-3 bg-purple-50 rounded-xl border border-purple-200">
                    {electiveSubjects.length > 0 ? (
                      electiveSubjects.map(subject => (
                        <label
                          key={subject.id}
                          className="flex items-center gap-2 p-2 rounded-lg hover:bg-white cursor-pointer transition-colors"
                        >
                          <Checkbox
                            checked={editingCombination.elective_subjects?.includes(subject.id)}
                            onCheckedChange={() => toggleSubject(subject.id, 'elective_subjects')}
                          />
                          <div className="flex-1">
                            <div className="text-sm font-medium text-slate-900">{subject.name}</div>
                            <div className="text-xs text-slate-500">{subject.code}</div>
                          </div>
                        </label>
                      ))
                    ) : (
                      <div className="col-span-2 text-center py-4 text-sm text-slate-500">
                        No elective subjects configured
                      </div>
                    )}
                  </div>
                </div>

                {/* Status */}
                <div className="flex items-center gap-3 p-4 bg-slate-50 rounded-xl">
                  <Checkbox
                    id="is_active"
                    checked={editingCombination.is_active ?? true}
                    onCheckedChange={(checked) => setEditingCombination({
                      ...editingCombination,
                      is_active: checked as boolean
                    })}
                  />
                  <div>
                    <Label htmlFor="is_active" className="cursor-pointer">Active Combination</Label>
                    <p className="text-xs text-slate-500 mt-0.5">
                      This combination will be available for student selection
                    </p>
                  </div>
                </div>

                {/* Actions */}
                <div className="flex justify-end gap-3 pt-4 border-t border-slate-200">
                  <Button
                    variant="outline"
                    onClick={() => setEditingCombination(null)}
                  >
                    Cancel
                  </Button>
                  <Button
                    onClick={handleSaveCombination}
                    disabled={isLoading || !editingCombination.name || !editingCombination.code}
                    className="bg-gradient-to-r from-cyan-500 to-blue-600"
                  >
                    <Save className="w-4 h-4 mr-2" />
                    Save Combination
                  </Button>
                </div>
              </div>
            </Card>
          )}
        </div>
      </div>
    </div>
  );
};

export default SubjectCombinationsManager;