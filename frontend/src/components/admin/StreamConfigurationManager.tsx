import React, { useState } from 'react';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Checkbox } from '@/components/ui/checkbox';
import { 
  BookOpen, 
  Plus, 
  Settings, 
  GraduationCap,
  AlertCircle,
  Search,
  X,
  ChevronRight,
  Layers,
  ListChecks,
  Sparkles
} from 'lucide-react';
import { useStreamConfiguration } from '@/contexts/StreamConfigurationContext';

const StreamConfigurationManager: React.FC = () => {
  const {
    // State
    streams,
    availableSubjects,
    selectedStream,
    selectedRole,
    isLoading,
    isInitialLoading,
    error,
    currentStream,
    currentConfig,
    streamConfigs,
    getStreamStats,
    
    // Actions
    setSelectedStream,
    setSelectedRole,
    setupDefaultConfigurations,
    addSubjectToConfiguration,
    removeSubjectFromConfiguration,
    updateConfiguration,
    loadAllData
  } = useStreamConfiguration();

  const [searchTerm, setSearchTerm] = useState('');

  const getStreamColor = (streamType: string) => {
    switch (streamType) {
      case 'SCIENCE': return 'from-cyan-500 to-blue-600';
      case 'ARTS': return 'from-amber-500 to-orange-600';
      case 'COMMERCIAL': return 'from-emerald-500 to-teal-600';
      case 'TECHNICAL': return 'from-violet-500 to-purple-600';
      default: return 'from-slate-500 to-gray-600';
    }
  };

  const getRoleColor = (role: string) => {
    switch (role) {
      case 'cross_cutting': return 'bg-blue-50 text-blue-700 border-blue-200';
      case 'core': return 'bg-emerald-50 text-emerald-700 border-emerald-200';
      case 'elective': return 'bg-amber-50 text-amber-700 border-amber-200';
      default: return 'bg-slate-50 text-slate-700 border-slate-200';
    }
  };

  const filteredSubjects = availableSubjects.filter(subject => {
    const matchesSearch = subject.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
                         subject.code.toLowerCase().includes(searchTerm.toLowerCase());
    return matchesSearch;
  });

  if (isInitialLoading) {
    return (
      <div className="flex items-center justify-center min-h-[600px]">
        <div className="text-center">
          <div className="w-16 h-16 border-4 border-cyan-500 border-t-transparent rounded-full animate-spin mx-auto mb-4"></div>
          <p className="text-lg font-medium text-slate-700">Loading Stream Configuration...</p>
          <p className="text-sm text-slate-500 mt-2">Setting up your academic streams</p>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex items-center justify-center min-h-[600px]">
        <div className="text-center max-w-md">
          <div className="w-16 h-16 bg-red-100 rounded-full flex items-center justify-center mx-auto mb-4">
            <AlertCircle className="w-8 h-8 text-red-600" />
          </div>
          <h3 className="text-lg font-semibold text-slate-900 mb-2">Failed to Load Configuration</h3>
          <p className="text-slate-600 mb-6">{error}</p>
          <Button onClick={loadAllData} className="bg-gradient-to-r from-cyan-500 to-blue-600">
            Try Again
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="bg-gradient-to-br from-slate-900 via-slate-800 to-slate-900 rounded-3xl p-8 text-white shadow-2xl">
        <div className="flex items-start justify-between">
          <div>
            <div className="flex items-center gap-3 mb-3">
              <div className="w-12 h-12 bg-white/10 backdrop-blur-sm rounded-2xl flex items-center justify-center border border-white/20">
                <Layers className="w-6 h-6 text-cyan-400" />
              </div>
              <div>
                <h1 className="text-3xl font-bold tracking-tight">Stream Configuration</h1>
                <p className="text-slate-300 text-sm mt-1">Manage academic streams and subject assignments</p>
              </div>
            </div>
          </div>
          
          <Button
            onClick={setupDefaultConfigurations}
            disabled={isLoading}
            className="bg-gradient-to-r from-cyan-500 to-blue-600 hover:from-cyan-600 hover:to-blue-700 text-white shadow-lg"
          >
            <Sparkles className="w-4 h-4 mr-2" />
            Setup Defaults
          </Button>
        </div>

        {/* Stats */}
        <div className="grid grid-cols-3 gap-4 mt-6">
          <div className="bg-white/5 backdrop-blur-sm rounded-xl p-4 border border-white/10">
            <p className="text-slate-400 text-sm">Total Streams</p>
            <p className="text-2xl font-bold mt-1">{streams.length}</p>
          </div>
          <div className="bg-white/5 backdrop-blur-sm rounded-xl p-4 border border-white/10">
            <p className="text-slate-400 text-sm">Configurations</p>
            <p className="text-2xl font-bold mt-1">{streamConfigs.length}</p>
          </div>
          <div className="bg-white/5 backdrop-blur-sm rounded-xl p-4 border border-white/10">
            <p className="text-slate-400 text-sm">Available Subjects</p>
            <p className="text-2xl font-bold mt-1">{availableSubjects.length}</p>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-12 gap-6">
        {/* Stream Selection Sidebar */}
        <div className="col-span-3 space-y-4">
          <Card className="p-4 border-slate-200">
            <h3 className="font-semibold text-slate-900 mb-3 flex items-center gap-2">
              <GraduationCap className="w-4 h-4 text-cyan-600" />
              Select Stream
            </h3>
            <div className="space-y-2">
              {streams.map(stream => {
                const stats = getStreamStats(stream.id);
                
                return (
                  <button
                    key={stream.id}
                    onClick={() => {
                      setSelectedStream(stream.id);
                      setSelectedRole(null);
                    }}
                    className={`w-full text-left p-3 rounded-xl transition-all ${
                      selectedStream === stream.id
                        ? 'bg-gradient-to-r ' + getStreamColor(stream.stream_type) + ' text-white shadow-md'
                        : 'bg-slate-50 hover:bg-slate-100 text-slate-700'
                    }`}
                  >
                    <div className="font-medium">{stream.name}</div>
                    <div className={`text-xs mt-1 ${
                      selectedStream === stream.id ? 'text-white/80' : 'text-slate-500'
                    }`}>
                      {stats.totalSubjects} subjects
                    </div>
                  </button>
                );
              })}
            </div>
          </Card>

          {selectedStream && (
            <Card className="p-4 border-slate-200">
              <h3 className="font-semibold text-slate-900 mb-3 flex items-center gap-2">
                <ListChecks className="w-4 h-4 text-cyan-600" />
                Subject Roles
              </h3>
              <div className="space-y-2">
                {['cross_cutting', 'core', 'elective'].map(role => {
                  const config = streamConfigs.find(c => c.subject_role === role);
                  const subjectCount = config?.subjects?.length || 0;
                  
                  return (
                    <button
                      key={role}
                      onClick={() => setSelectedRole(role as any)}
                      className={`w-full text-left p-3 rounded-xl transition-all ${
                        selectedRole === role
                          ? getRoleColor(role) + ' border'
                          : 'bg-slate-50 hover:bg-slate-100 text-slate-700 border border-transparent'
                      }`}
                    >
                      <div className="font-medium capitalize">
                        {role === 'cross_cutting' ? 'Cross-Cutting' : role}
                      </div>
                      <div className="text-xs mt-1 opacity-70">
                        {subjectCount} subject{subjectCount !== 1 ? 's' : ''}
                      </div>
                    </button>
                  );
                })}
              </div>
            </Card>
          )}
        </div>

        {/* Main Configuration Area */}
        <div className="col-span-9">
          {!selectedStream ? (
            <Card className="p-12 text-center border-slate-200">
              <div className="w-20 h-20 bg-slate-100 rounded-full flex items-center justify-center mx-auto mb-4">
                <BookOpen className="w-10 h-10 text-slate-400" />
              </div>
              <h3 className="text-xl font-semibold text-slate-900 mb-2">Select a Stream</h3>
              <p className="text-slate-600">Choose a stream from the sidebar to configure its subjects</p>
            </Card>
          ) : !selectedRole ? (
            <Card className="p-12 text-center border-slate-200">
              <div className="w-20 h-20 bg-slate-100 rounded-full flex items-center justify-center mx-auto mb-4">
                <Settings className="w-10 h-10 text-slate-400" />
              </div>
              <h3 className="text-xl font-semibold text-slate-900 mb-2">Select a Subject Role</h3>
              <p className="text-slate-600">Choose cross-cutting, core, or elective to manage subjects</p>
            </Card>
          ) : !currentConfig ? (
            <Card className="p-12 text-center border-slate-200">
              <div className="w-20 h-20 bg-amber-100 rounded-full flex items-center justify-center mx-auto mb-4">
                <AlertCircle className="w-10 h-10 text-amber-600" />
              </div>
              <h3 className="text-xl font-semibold text-slate-900 mb-2">No Configuration Found</h3>
              <p className="text-slate-600 mb-6">
                This {currentStream?.name} stream doesn't have a {selectedRole} configuration yet.
              </p>
              <Button onClick={setupDefaultConfigurations} className="bg-gradient-to-r from-cyan-500 to-blue-600">
                <Sparkles className="w-4 h-4 mr-2" />
                Setup Defaults
              </Button>
            </Card>
          ) : (
            <div className="space-y-6">
              {/* Configuration Header */}
              <Card className="p-6 border-slate-200">
                <div className="flex items-start justify-between mb-6">
                  <div>
                    <div className="flex items-center gap-3 mb-2">
                      <Badge className={getRoleColor(selectedRole) + ' border text-sm font-medium px-3 py-1'}>
                        {selectedRole === 'cross_cutting' ? 'Cross-Cutting' : 
                         selectedRole === 'core' ? 'Core' : 'Elective'}
                      </Badge>
                      <ChevronRight className="w-4 h-4 text-slate-400" />
                      <span className="font-semibold text-slate-900">{currentStream?.name} Stream</span>
                    </div>
                    <p className="text-slate-600 text-sm">
                      {selectedRole === 'cross_cutting' ? 'Compulsory subjects across all streams' :
                       selectedRole === 'core' ? 'Essential subjects for this stream' :
                       'Optional subjects students can choose'}
                    </p>
                  </div>
                </div>

                <div className="grid grid-cols-3 gap-4">
                  <div>
                    <Label className="text-xs text-slate-600 mb-2 block">Minimum Required</Label>
                    <Input
                      type="number"
                      min="0"
                      value={currentConfig.min_subjects_required}
                      onChange={(e) => updateConfiguration(currentConfig.id, {
                        min_subjects_required: parseInt(e.target.value) || 0
                      })}
                      className="text-center font-semibold"
                      disabled={isLoading}
                    />
                  </div>
                  <div>
                    <Label className="text-xs text-slate-600 mb-2 block">Maximum Allowed</Label>
                    <Input
                      type="number"
                      min="0"
                      value={currentConfig.max_subjects_allowed}
                      onChange={(e) => updateConfiguration(currentConfig.id, {
                        max_subjects_allowed: parseInt(e.target.value) || 0
                      })}
                      className="text-center font-semibold"
                      disabled={isLoading}
                    />
                  </div>
                  <div className="flex items-end">
                    <label className="flex items-center gap-2 p-3 bg-slate-50 rounded-lg cursor-pointer hover:bg-slate-100 transition-colors w-full">
                      <Checkbox
                        checked={currentConfig.is_compulsory}
                        onCheckedChange={(checked) => updateConfiguration(currentConfig.id, {
                          is_compulsory: checked as boolean
                        })}
                        disabled={isLoading}
                      />
                      <span className="text-sm font-medium text-slate-700">Compulsory</span>
                    </label>
                  </div>
                </div>
              </Card>

              {/* Assigned Subjects */}
              <Card className="p-6 border-slate-200">
                <h3 className="font-semibold text-slate-900 mb-4 flex items-center gap-2">
                  <BookOpen className="w-4 h-4 text-cyan-600" />
                  Assigned Subjects ({currentConfig.subjects?.length || 0})
                </h3>
                
                {currentConfig.subjects && currentConfig.subjects.length > 0 ? (
                  <div className="grid grid-cols-2 gap-3">
                    {currentConfig.subjects.map(subject => (
                      <div
                        key={subject.id}
                        className="flex items-center justify-between p-4 bg-slate-50 rounded-xl hover:bg-slate-100 transition-colors border border-slate-200"
                      >
                        <div className="flex-1">
                          <div className="font-medium text-slate-900">{subject.name}</div>
                          <div className="flex items-center gap-3 mt-1">
                            <Badge variant="outline" className="text-xs">{subject.code}</Badge>
                            <span className="text-xs text-slate-500">{subject.credit_weight} credits</span>
                          </div>
                        </div>
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => removeSubjectFromConfiguration(currentConfig.id, subject.id)}
                          disabled={isLoading}
                          className="text-red-600 hover:text-red-700 hover:bg-red-50"
                        >
                          <X className="w-4 h-4" />
                        </Button>
                      </div>
                    ))}
                  </div>
                ) : (
                  <div className="text-center py-8 bg-slate-50 rounded-xl border-2 border-dashed border-slate-200">
                    <BookOpen className="w-12 h-12 text-slate-300 mx-auto mb-3" />
                    <p className="text-slate-600 font-medium">No subjects assigned yet</p>
                    <p className="text-sm text-slate-500 mt-1">Add subjects from the list below</p>
                  </div>
                )}
              </Card>

              {/* Add Subjects */}
              <Card className="p-6 border-slate-200">
                <h3 className="font-semibold text-slate-900 mb-4 flex items-center gap-2">
                  <Plus className="w-4 h-4 text-cyan-600" />
                  Add Subjects
                </h3>
                
                <div className="mb-4">
                  <div className="relative">
                    <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-slate-400 w-4 h-4" />
                    <Input
                      placeholder="Search available subjects..."
                      value={searchTerm}
                      onChange={(e) => setSearchTerm(e.target.value)}
                      className="pl-10"
                    />
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-3 max-h-96 overflow-y-auto">
                  {filteredSubjects
                    .filter(subject => !currentConfig.subjects?.find(s => s.id === subject.id))
                    .map(subject => (
                      <button
                        key={subject.id}
                        onClick={() => addSubjectToConfiguration(currentConfig.id, subject.id)}
                        disabled={isLoading}
                        className="flex items-center justify-between p-4 bg-white rounded-xl hover:bg-cyan-50 transition-colors border border-slate-200 hover:border-cyan-300 text-left disabled:opacity-50 disabled:cursor-not-allowed"
                      >
                        <div className="flex-1">
                          <div className="font-medium text-slate-900">{subject.name}</div>
                          <div className="flex items-center gap-3 mt-1">
                            <Badge variant="outline" className="text-xs">{subject.code}</Badge>
                            <span className="text-xs text-slate-500">{subject.credit_weight} credits</span>
                          </div>
                        </div>
                        <Plus className="w-5 h-5 text-cyan-600" />
                      </button>
                    ))}
                </div>
              </Card>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default StreamConfigurationManager;