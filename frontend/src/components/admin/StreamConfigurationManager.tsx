import React, { useState, useEffect } from 'react';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Checkbox } from '@/components/ui/checkbox';
import { toast } from 'react-toastify';
import { 
  BookOpen, 
  Plus, 
  Trash2, 
  Save, 
  Settings, 
  GraduationCap,
  Users,
  BookMarked,
  Download,
  Target,
  AlertCircle,
  CheckCircle,
  Info,
  Search,
  Bookmark,
  Star,
} from 'lucide-react';
import StreamConfigurationService, { 
  Subject, 
  StreamConfiguration, 
  Stream 
} from '@/services/StreamConfigurationService';

const StreamConfigurationManager: React.FC = () => {
  const [streams, setStreams] = useState<Stream[]>([]);
  const [configurations, setConfigurations] = useState<StreamConfiguration[]>([]);
  const [availableSubjects, setAvailableSubjects] = useState<Subject[]>([]);
  const [selectedSchool, setSelectedSchool] = useState<number>(1);
  const [isLoading, setIsLoading] = useState(false);
  const [isInitialLoading, setIsInitialLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedRole, setSelectedRole] = useState<string>('all');
  const [viewMode, setViewMode] = useState<'grid' | 'list'>('grid');

  useEffect(() => {
    const loadAllData = async () => {
      setIsInitialLoading(true);
      try {
        await Promise.all([
          loadStreams(),
          loadConfigurations(),
          loadAvailableSubjects()
        ]);
      } catch (error) {
        console.error('Error loading initial data:', error);
      } finally {
        setIsInitialLoading(false);
      }
    };
    
    loadAllData();
  }, [selectedSchool]);

  const loadStreams = async () => {
    try {
      console.log('🔄 Loading streams...');
      const streams = await StreamConfigurationService.getStreams();
      console.log('✅ Streams loaded successfully:', streams);
      setStreams(streams || []); // Ensure we always set an array
    } catch (error) {
      console.error('❌ Error loading streams:', error);
      toast.error('Failed to load streams');
      setStreams([]); // Set empty array on error
    }
  };

  const loadConfigurations = async () => {
    try {
      console.log('🔄 Loading configurations for current tenant');
      const configs = await StreamConfigurationService.getStreamConfigurations();
      console.log('✅ Configurations loaded successfully:', configs);
      console.log('🔍 Configs type:', typeof configs);
      console.log('🔍 Configs is array:', Array.isArray(configs));
      console.log('🔍 Configs length:', configs ? configs.length : 'undefined');
      setConfigurations(configs || []); // Ensure we always set an array
    } catch (error) {
      console.error('❌ Error loading configurations:', error);
      toast.error('Failed to load configurations');
      setConfigurations([]); // Set empty array on error
    }
  };

  const loadAvailableSubjects = async () => {
    try {
      console.log('🔄 Loading available subjects...');
      const subjects = await StreamConfigurationService.getAvailableSubjects();
      console.log('✅ Subjects loaded successfully:', subjects);
      setAvailableSubjects(subjects || []); // Ensure we always set an array
    } catch (error) {
      console.error('❌ Error loading subjects:', error);
      toast.error('Failed to load subjects');
      setAvailableSubjects([]); // Set empty array on error
    }
  };

  const getStreamIcon = (streamType: string) => {
    switch (streamType) {
      case 'SCIENCE': return <BookOpen className="h-5 w-5" />;
      case 'ARTS': return <GraduationCap className="h-5 w-5" />;
      case 'COMMERCIAL': return <Users className="h-5 w-5" />;
      case 'TECHNICAL': return <Settings className="h-5 w-5" />;
      default: return <BookMarked className="h-5 w-5" />;
    }
  };

  const getStreamColor = (streamType: string) => {
    switch (streamType) {
      case 'SCIENCE': return 'from-blue-500 to-indigo-600';
      case 'ARTS': return 'from-purple-500 to-pink-600';
      case 'COMMERCIAL': return 'from-green-500 to-emerald-600';
      case 'TECHNICAL': return 'from-orange-500 to-red-600';
      default: return 'from-slate-500 to-gray-600';
    }
  };

  const getRoleColor = (role: string) => {
    switch (role) {
      case 'cross_cutting': return 'bg-blue-100 text-blue-800 border-blue-200';
      case 'core': return 'bg-green-100 text-green-800 border-green-200';
      case 'elective': return 'bg-purple-100 text-purple-800 border-purple-200';
      default: return 'bg-gray-100 text-gray-800 border-gray-200';
    }
  };

  const getRoleIcon = (role: string) => {
    switch (role) {
      case 'cross_cutting': return <Target className="h-4 w-4" />;
      case 'core': return <Star className="h-4 w-4" />;
      case 'elective': return <Bookmark className="h-4 w-4" />;
      default: return <Info className="h-4 w-4" />;
    }
  };

  const handleSaveConfiguration = async (configId: number) => {
    try {
      setIsLoading(true);
      const config = configurations.find(c => c.id === configId);
      if (config) {
        await StreamConfigurationService.saveStreamConfiguration({
          id: config.id,
          school: selectedSchool,
          stream: config.stream_id,
          subject_role: config.subject_role,
          min_subjects_required: config.min_subjects_required,
          max_subjects_allowed: config.max_subjects_allowed,
          is_compulsory: config.is_compulsory,
          display_order: 1,
          is_active: true
        });
        toast.success('Configuration saved successfully');
        loadConfigurations();
      }
    } catch (error) {
      toast.error('Failed to save configuration');
    } finally {
      setIsLoading(false);
    }
  };

  const addSubjectToConfiguration = (configId: number, subjectId: number) => {
    const config = configurations.find(c => c.id === configId);
    const subject = availableSubjects.find(s => s.id === subjectId);
    
    if (config && subject) {
      const updatedConfigs = configurations.map(c => 
        c.id === configId 
          ? { ...c, subjects: [...c.subjects, subject] }
          : c
      );
      setConfigurations(updatedConfigs);
      toast.success(`Added ${subject.name} to ${config.stream_name} ${config.subject_role}`);
    }
  };

  const removeSubjectFromConfiguration = (configId: number, subjectId: number) => {
    const updatedConfigs = configurations.map(c => 
      c.id === configId 
        ? { ...c, subjects: c.subjects.filter(s => s.id !== subjectId) }
        : c
    );
    setConfigurations(updatedConfigs);
    toast.success('Subject removed from configuration');
  };

  const updateConfiguration = (configId: number, field: string, value: any) => {
    const updatedConfigs = configurations.map(c => 
      c.id === configId ? { ...c, [field]: value } : c
    );
    setConfigurations(updatedConfigs);
  };

  const filteredSubjects = availableSubjects.filter(subject => {
    const matchesSearch = subject.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
                         subject.code.toLowerCase().includes(searchTerm.toLowerCase());
    return matchesSearch;
  });

  const getStreamStats = (streamId: number) => {
    // Add extra safety checks
    if (!configurations || !Array.isArray(configurations) || configurations.length === 0) {
      return { totalSubjects: 0, crossCutting: 0, core: 0, elective: 0 };
    }
    
    try {
      const streamConfigs = configurations.filter(c => c && c.stream_id === streamId);
      const totalSubjects = streamConfigs.reduce((sum, config) => sum + (config?.subjects?.length || 0), 0);
      const crossCutting = streamConfigs.find(c => c?.subject_role === 'cross_cutting')?.subjects?.length || 0;
      const core = streamConfigs.find(c => c?.subject_role === 'core')?.subjects?.length || 0;
      const elective = streamConfigs.find(c => c?.subject_role === 'elective')?.subjects?.length || 0;
      
      return { totalSubjects, crossCutting, core, elective };
    } catch (error) {
      console.error('Error calculating stream stats:', error);
      return { totalSubjects: 0, crossCutting: 0, core: 0, elective: 0 };
    }
  };

  // Add extra safety checks to prevent rendering with undefined data
  if (isInitialLoading || !streams || !Array.isArray(streams) || !configurations || !Array.isArray(configurations) || !availableSubjects || !Array.isArray(availableSubjects)) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="text-center">
          <div className="w-16 h-16 border-4 border-blue-500 border-t-transparent rounded-full animate-spin mx-auto mb-4"></div>
          <p className="text-lg text-slate-600">Loading Stream Configuration Manager...</p>
          <p className="text-sm text-slate-500 mt-2">
            Streams: {streams ? streams.length : 'loading'} | 
            Configurations: {configurations ? configurations.length : 'loading'} | 
            Subjects: {availableSubjects ? availableSubjects.length : 'loading'}
          </p>
          <div className="mt-4 p-4 bg-yellow-50 border border-yellow-200 rounded-lg max-w-md mx-auto">
            <p className="text-sm text-yellow-800 font-medium">Debug Information:</p>
            <p className="text-xs text-yellow-700 mt-1">
              isInitialLoading: {isInitialLoading.toString()}<br/>
              streams type: {typeof streams}<br/>
              configurations type: {typeof configurations}<br/>
              availableSubjects type: {typeof availableSubjects}<br/>
              selectedSchool: {selectedSchool}
            </p>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-8">
      {/* Enhanced Header */}
      <div className="bg-gradient-to-r from-blue-50 to-indigo-50 rounded-2xl p-8 border border-blue-100">
        <div className="flex items-center justify-between mb-6">
          <div className="flex items-center gap-4">
            <div className="w-16 h-16 bg-gradient-to-br from-blue-500 to-indigo-600 rounded-2xl flex items-center justify-center">
              <BookOpen className="w-8 h-8 text-white" />
            </div>
            <div>
              <h1 className="text-4xl font-bold text-slate-900 mb-2">Stream Configuration Manager</h1>
              <p className="text-lg text-slate-600 max-w-2xl">
                Configure which subjects belong to which streams and categories for your school. 
                Organize your curriculum structure with cross-cutting, core, and elective subjects.
              </p>
            </div>
          </div>
          
          <div className="flex items-center gap-4">
            <Button
              onClick={async () => {
                try {
                  setIsLoading(true);
                  await StreamConfigurationService.setupDefaultConfigurations();
                  toast.success('Default configurations set up successfully!');
                  loadConfigurations();
                } catch (error) {
                  toast.error('Failed to set up default configurations');
                } finally {
                  setIsLoading(false);
                }
              }}
              disabled={isLoading}
              className="bg-gradient-to-r from-green-500 to-emerald-600 text-white hover:from-green-600 hover:to-emerald-700 shadow-lg hover:shadow-xl transform hover:-translate-y-0.5 transition-all duration-200"
            >
              <Download className="h-5 w-5 mr-2" />
              {isLoading ? 'Setting up...' : 'Setup Defaults'}
            </Button>
          </div>
        </div>

        {/* Quick Stats */}
        <div className="grid grid-cols-1 md:grid-cols-4 gap-6">
          <div className="bg-white rounded-xl p-4 border border-blue-200">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 bg-blue-100 rounded-lg flex items-center justify-center">
                <BookOpen className="w-5 h-5 text-blue-600" />
              </div>
              <div>
                <p className="text-sm text-slate-600">Total Streams</p>
                <p className="text-2xl font-bold text-slate-900">{streams.length}</p>
              </div>
            </div>
          </div>
          
          <div className="bg-white rounded-xl p-4 border border-green-200">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 bg-green-100 rounded-lg flex items-center justify-center">
                <Target className="w-5 h-5 text-green-600" />
              </div>
              <div>
                <p className="text-sm text-slate-600">Total Subjects</p>
                <p className="text-2xl font-bold text-slate-900">{availableSubjects.length}</p>
              </div>
            </div>
          </div>
          
          <div className="bg-white rounded-xl p-4 border border-purple-200">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 bg-purple-100 rounded-lg flex items-center justify-center">
                <Settings className="w-5 h-5 text-purple-600" />
              </div>
              <div>
                <p className="text-sm text-slate-600">Configurations</p>
                <p className="text-2xl font-bold text-slate-900">{configurations.length}</p>
              </div>
            </div>
          </div>
          
          <div className="bg-white rounded-xl p-4 border border-orange-200">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 bg-orange-100 rounded-lg flex items-center justify-center">
                <CheckCircle className="w-5 h-5 text-orange-600" />
              </div>
              <div>
                <p className="text-sm text-slate-600">Active</p>
                                 <p className="text-2xl font-bold text-slate-900">{configurations.length}</p>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Controls and Filters */}
      <div className="bg-white rounded-2xl p-6 shadow-sm border border-slate-100">
        <div className="flex flex-col lg:flex-row items-start lg:items-center justify-between gap-4">
          <div className="flex items-center gap-4">
            <Label htmlFor="school-select" className="text-sm font-medium text-slate-700">School:</Label>
            <Select value={selectedSchool.toString()} onValueChange={(value) => setSelectedSchool(Number(value))}>
              <SelectTrigger className="w-48">
                <SelectValue placeholder="Select School" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="1">My School</SelectItem>
              </SelectContent>
            </Select>
          </div>
          
          <div className="flex items-center gap-4">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-slate-400 w-4 h-4" />
              <Input
                placeholder="Search subjects..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="pl-10 w-64"
              />
            </div>
            
            <Select value={selectedRole} onValueChange={setSelectedRole}>
              <SelectTrigger className="w-40">
                <SelectValue placeholder="Filter by role" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Roles</SelectItem>
                <SelectItem value="cross_cutting">Cross-Cutting</SelectItem>
                <SelectItem value="core">Core</SelectItem>
                <SelectItem value="elective">Elective</SelectItem>
              </SelectContent>
            </Select>
            
            <div className="flex items-center bg-slate-100 rounded-lg p-1">
              <button
                onClick={() => setViewMode('grid')}
                className={`p-2 rounded-md transition-colors ${
                  viewMode === 'grid' ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                <div className="grid grid-cols-2 gap-1 w-4 h-4">
                  <div className="w-1.5 h-1.5 bg-current rounded-sm"></div>
                  <div className="w-1.5 h-1.5 bg-current rounded-sm"></div>
                  <div className="w-1.5 h-1.5 bg-current rounded-sm"></div>
                  <div className="w-1.5 h-1.5 bg-current rounded-sm"></div>
                </div>
              </button>
              <button
                onClick={() => setViewMode('list')}
                className={`p-2 rounded-md transition-colors ${
                  viewMode === 'list' ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                <div className="space-y-1 w-4 h-4">
                  <div className="w-full h-1 bg-current rounded-sm"></div>
                  <div className="w-full h-1 bg-current rounded-sm"></div>
                  <div className="w-full h-1 bg-current rounded-sm"></div>
                </div>
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* Stream Tabs */}
      <Tabs defaultValue={streams[0]?.name.toLowerCase() || "science"} className="space-y-6">
        <TabsList className="grid w-full grid-cols-4 h-auto p-2 bg-slate-100 rounded-2xl">
          {streams.map(stream => (
            <TabsTrigger 
              key={stream.id} 
              value={stream.name.toLowerCase()} 
              className="data-[state=active]:bg-white data-[state=active]:shadow-lg data-[state=active]:text-slate-900 rounded-xl py-4 px-6 transition-all duration-200"
            >
              <div className="flex flex-col items-center space-y-2">
                <div className={`w-12 h-12 bg-gradient-to-br ${getStreamColor(stream.stream_type)} rounded-xl flex items-center justify-center`}>
                  {getStreamIcon(stream.stream_type)}
                </div>
                <div className="text-center">
                  <div className="font-semibold text-sm">{stream.name}</div>
                  <div className="text-xs text-slate-500">{getStreamStats(stream.id).totalSubjects} subjects</div>
                </div>
              </div>
            </TabsTrigger>
          ))}
        </TabsList>

        {streams.map(stream => (
          <TabsContent key={stream.id} value={stream.name.toLowerCase()} className="space-y-6">
            <div className="bg-white rounded-2xl shadow-sm border border-slate-100 overflow-hidden">
              <div className="bg-gradient-to-r from-slate-50 to-slate-100 px-8 py-6 border-b border-slate-200">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-4">
                    <div className={`w-16 h-16 bg-gradient-to-br ${getStreamColor(stream.stream_type)} rounded-2xl flex items-center justify-center`}>
                      {getStreamIcon(stream.stream_type)}
                    </div>
                    <div>
                      <h2 className="text-2xl font-bold text-slate-900">{stream.name} Stream</h2>
                      <p className="text-slate-600">Configure subject categories and requirements</p>
                    </div>
                  </div>
                  
                  <div className="flex items-center gap-4">
                    <div className="text-right">
                      <p className="text-sm text-slate-600">Total Subjects</p>
                      <p className="text-2xl font-bold text-slate-900">{getStreamStats(stream.id).totalSubjects}</p>
                    </div>
                    <div className="w-px h-12 bg-slate-300"></div>
                    <div className="text-right">
                      <p className="text-sm text-slate-600">Stream Type</p>
                      <p className="text-lg font-semibold text-slate-900">{stream.stream_type}</p>
                    </div>
                  </div>
                </div>
              </div>

              <div className="p-8">
                <div className="space-y-8">
                                   {['cross_cutting', 'core', 'elective'].map(role => {
                   const config = configurations?.find(c => 
                     c.stream_id === stream.id && c.subject_role === role
                   );
                    
                    if (!config) {
                      return (
                        <div key={role} className="text-center py-12 bg-slate-50 rounded-2xl border-2 border-dashed border-slate-200">
                          <div className="w-16 h-16 bg-slate-200 rounded-full flex items-center justify-center mx-auto mb-4">
                            <AlertCircle className="w-8 h-8 text-slate-400" />
                          </div>
                          <h3 className="text-lg font-semibold text-slate-600 mb-2">
                            No {role.replace('_', ' ')} configuration found
                          </h3>
                          <p className="text-slate-500 mb-4">
                            Click "Setup Defaults" to create initial configurations for {stream.name} stream.
                          </p>
                          <Button
                            onClick={async () => {
                              try {
                                setIsLoading(true);
                                await StreamConfigurationService.setupDefaultConfigurations();
                                toast.success('Default configurations set up successfully!');
                                loadConfigurations();
                              } catch (error) {
                                toast.error('Failed to set up default configurations');
                              } finally {
                                setIsLoading(false);
                              }
                            }}
                            disabled={isLoading}
                            variant="outline"
                            className="flex items-center gap-2"
                          >
                            <Download className="h-4 w-4" />
                            Setup Defaults
                          </Button>
                        </div>
                      );
                    }

                    return (
                      <div key={role} className="space-y-6">
                        {/* Role Header */}
                        <div className="flex items-center justify-between p-6 bg-gradient-to-r from-slate-50 to-slate-100 rounded-2xl border border-slate-200">
                          <div className="flex items-center gap-4">
                            <div className={`w-12 h-12 bg-gradient-to-br ${getRoleColor(role).split(' ')[0]} rounded-xl flex items-center justify-center`}>
                              {getRoleIcon(role)}
                            </div>
                            <div>
                              <div className="flex items-center gap-3 mb-2">
                                <Badge className={`${getRoleColor(role)} border px-3 py-1 text-sm font-medium`}>
                                  {role === 'cross_cutting' ? 'Cross-Cutting' : 
                                   role === 'core' ? 'Core' : 'Elective'}
                                </Badge>
                                <span className="text-lg font-semibold text-slate-900">
                                  {role === 'cross_cutting' ? 'Cross-Cutting' : 
                                   role === 'core' ? 'Core' : 'Elective'} Subjects
                                </span>
                              </div>
                              <p className="text-slate-600">
                                {role === 'cross_cutting' ? 'Subjects that are compulsory across all streams' : 
                                 role === 'core' ? 'Essential subjects for this stream' : 
                                 'Optional subjects students can choose from'}
                              </p>
                            </div>
                          </div>
                          
                          <div className="flex items-center gap-6">
                            <div className="text-center">
                              <Label className="text-sm text-slate-600">Min Required</Label>
                              <Input
                                type="number"
                                value={config.min_subjects_required}
                                onChange={(e) => updateConfiguration(config.id, 'min_subjects_required', Number(e.target.value))}
                                className="w-20 text-center font-semibold"
                              />
                            </div>
                            <div className="text-center">
                              <Label className="text-sm text-slate-600">Max Allowed</Label>
                              <Input
                                type="number"
                                value={config.max_subjects_allowed}
                                onChange={(e) => updateConfiguration(config.id, 'max_subjects_allowed', Number(e.target.value))}
                                className="w-20 text-center font-semibold"
                              />
                            </div>
                            <div className="flex items-center gap-2">
                              <Checkbox
                                id={`compulsory-${config.id}`}
                                checked={config.is_compulsory}
                                onCheckedChange={(checked) => updateConfiguration(config.id, 'is_compulsory', checked)}
                              />
                              <Label htmlFor={`compulsory-${config.id}`} className="text-sm font-medium">Compulsory</Label>
                            </div>
                          </div>
                        </div>

                                                 {/* Subjects Grid/List */}
                         {config.subjects && config.subjects.length > 0 ? (
                          <div className={viewMode === 'grid' ? 'grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4' : 'space-y-3'}>
                            {config.subjects.map(subject => (
                              <Card key={subject.id} className={`${viewMode === 'grid' ? 'p-4' : 'p-4'} hover:shadow-md transition-shadow duration-200 border-slate-200`}>
                                <div className="flex items-center justify-between">
                                  <div className="flex-1">
                                    <div className="flex items-center gap-3 mb-2">
                                      <h4 className="font-semibold text-slate-900">{subject.name}</h4>
                                      <Badge variant="outline" className="text-xs">{subject.code}</Badge>
                                    </div>
                                                                         <div className="flex items-center gap-4 text-sm text-slate-600">
                                       <span className="flex items-center gap-1">
                                         <BookOpen className="w-3 h-3" />
                                         {subject.credit_weight} credits
                                       </span>
                                       <span className="flex items-center gap-1">
                                         <Target className="w-3 h-3" />
                                         {subject.is_compulsory ? 'Compulsory' : 'Optional'}
                                       </span>
                                     </div>
                                  </div>
                                  
                                  <div className="flex items-center gap-2">
                                    <Checkbox
                                      checked={subject.is_compulsory}
                                      onCheckedChange={(checked) => {
                                        const updatedSubjects = config.subjects.map(s =>
                                          s.id === subject.id ? { ...s, is_compulsory: checked } : s
                                        );
                                        updateConfiguration(config.id, 'subjects', updatedSubjects);
                                      }}
                                    />
                                    <Button
                                      variant="ghost"
                                      size="sm"
                                      onClick={() => removeSubjectFromConfiguration(config.id, subject.id)}
                                      className="text-red-600 hover:text-red-700 hover:bg-red-50"
                                    >
                                      <Trash2 className="h-4 w-4" />
                                    </Button>
                                  </div>
                                </div>
                              </Card>
                            ))}
                          </div>
                        ) : (
                          <div className="text-center py-8 bg-slate-50 rounded-xl border border-slate-200">
                            <BookOpen className="w-12 h-12 text-slate-400 mx-auto mb-3" />
                            <p className="text-slate-600 mb-2">No subjects assigned yet</p>
                            <p className="text-sm text-slate-500">Add subjects to get started</p>
                          </div>
                        )}

                        {/* Add Subject Section */}
                        <div className="bg-gradient-to-r from-blue-50 to-indigo-50 rounded-2xl p-6 border border-blue-200">
                          <div className="flex items-center gap-4 mb-4">
                            <div className="w-10 h-10 bg-blue-100 rounded-xl flex items-center justify-center">
                              <Plus className="w-5 h-5 text-blue-600" />
                            </div>
                            <div>
                              <h4 className="font-semibold text-blue-900">Add New Subject</h4>
                              <p className="text-sm text-blue-700">Select a subject to add to this configuration</p>
                            </div>
                          </div>
                          
                          <div className="flex items-center gap-4">
                            <Select onValueChange={(value) => addSubjectToConfiguration(config.id, Number(value))}>
                              <SelectTrigger className="w-80">
                                <SelectValue placeholder="Choose a subject to add..." />
                              </SelectTrigger>
                              <SelectContent>
                                                                 {filteredSubjects
                                   .filter(subject => !config.subjects?.find(s => s.id === subject.id))
                                   .map(subject => (
                                    <SelectItem key={subject.id} value={subject.id.toString()}>
                                      <div className="flex items-center gap-3">
                                        <span className="font-medium">{subject.name}</span>
                                        <Badge variant="outline" className="text-xs">{subject.code}</Badge>
                                                                                 <span className="text-slate-500 text-xs">{subject.credit_weight} credits</span>
                                      </div>
                                    </SelectItem>
                                  ))}
                              </SelectContent>
                            </Select>
                            
                            <Button
                              onClick={() => handleSaveConfiguration(config.id)}
                              disabled={isLoading}
                              className="bg-gradient-to-r from-blue-500 to-indigo-600 text-white hover:from-blue-600 hover:to-indigo-700 shadow-lg hover:shadow-xl transform hover:-translate-y-0.5 transition-all duration-200"
                            >
                              {isLoading ? (
                                <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin mr-2"></div>
                              ) : (
                                <Save className="h-4 w-4 mr-2" />
                              )}
                              Save Configuration
                            </Button>
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            </div>
          </TabsContent>
        ))}
      </Tabs>
    </div>
  );
};

export default StreamConfigurationManager;
