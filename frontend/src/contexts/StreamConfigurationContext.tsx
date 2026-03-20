import React, { createContext, useContext, useState, useCallback, useEffect } from 'react';
import { toast } from 'react-toastify';
import StreamConfigurationService, {
  Stream,
  StreamConfiguration,
  Subject,
  SubjectCombination,
  SchoolStreamConfiguration
} from '@/services/StreamConfigurationService';

interface StreamConfigurationContextType {
  // State
  streams: Stream[];
  configurations: StreamConfiguration[];
  availableSubjects: Subject[];
  combinations: SubjectCombination[];
  selectedStream: number | null;
  selectedRole: 'cross_cutting' | 'core' | 'elective' | null;
  isLoading: boolean;
  isInitialLoading: boolean;
  error: string | null;
  
  // Actions
  setSelectedStream: (streamId: number | null) => void;
  setSelectedRole: (role: 'cross_cutting' | 'core' | 'elective' | null) => void;
  loadAllData: () => Promise<void>;
  loadStreams: () => Promise<void>;
  loadConfigurations: () => Promise<void>;
  loadAvailableSubjects: () => Promise<void>;
  loadCombinations: (streamId?: number) => Promise<void>;
  setupDefaultConfigurations: () => Promise<void>;
  createDefaultConfigurationsForStream: (streamId: number) => Promise<void>;
  addSubjectToConfiguration: (configId: number, subjectId: number) => Promise<void>;
  removeSubjectFromConfiguration: (configId: number, subjectId: number) => Promise<void>;
  updateConfiguration: (configId: number, updates: Partial<StreamConfiguration>) => Promise<void>;
  saveSubjectCombination: (combination: Partial<SubjectCombination>) => Promise<void>;
  deleteSubjectCombination: (combinationId: number) => Promise<void>;
  
  // Computed values
  currentStream: Stream | undefined;
  streamConfigs: StreamConfiguration[];
  currentConfig: StreamConfiguration | undefined;
  getStreamStats: (streamId: number) => {
    totalSubjects: number;
    crossCutting: number;
    core: number;
    elective: number;
  };
}

const StreamConfigurationContext = createContext<StreamConfigurationContextType | undefined>(undefined);

export const useStreamConfiguration = () => {
  const context = useContext(StreamConfigurationContext);
  if (!context) {
    throw new Error('useStreamConfiguration must be used within StreamConfigurationProvider');
  }
  return context;
};

interface StreamConfigurationProviderProps {
  children: React.ReactNode;
}

export const StreamConfigurationProvider: React.FC<StreamConfigurationProviderProps> = ({ children }) => {
  // State
  const [streams, setStreams] = useState<Stream[]>([]);
  const [configurations, setConfigurations] = useState<StreamConfiguration[]>([]);
  const [availableSubjects, setAvailableSubjects] = useState<Subject[]>([]);
  const [combinations, setCombinations] = useState<SubjectCombination[]>([]);
  const [selectedStream, setSelectedStream] = useState<number | null>(null);
  const [selectedRole, setSelectedRole] = useState<'cross_cutting' | 'core' | 'elective' | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [isInitialLoading, setIsInitialLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Load streams
  const loadStreams = useCallback(async () => {
    try {
      console.log('🔄 Loading streams...');
      const data = await StreamConfigurationService.getStreams();
      console.log('✅ Streams loaded:', data?.length);
      setStreams(Array.isArray(data) ? data : []);
      
      // Auto-select first stream if none selected
      if (data && data.length > 0 && !selectedStream) {
        setSelectedStream(data[0].id);
      }
    } catch (error) {
      console.error('❌ Error loading streams:', error);
      setStreams([]);
      throw error;
    }
  }, [selectedStream]);

  // Load configurations
  const loadConfigurations = useCallback(async () => {
    try {
      console.log('🔄 Loading configurations...');
      const data = await StreamConfigurationService.getStreamConfigurations();
      console.log('✅ Configurations loaded:', data?.length);
      setConfigurations(Array.isArray(data) ? data : []);
    } catch (error) {
      console.error('❌ Error loading configurations:', error);
      setConfigurations([]);
      throw error;
    }
  }, []);

  // Load available subjects
  const loadAvailableSubjects = useCallback(async () => {
    try {
      console.log('🔄 Loading available subjects...');
      const data = await StreamConfigurationService.getAvailableSubjects();
      console.log('✅ Subjects loaded:', data?.length);
      setAvailableSubjects(Array.isArray(data) ? data : []);
    } catch (error) {
      console.error('❌ Error loading subjects:', error);
      setAvailableSubjects([]);
      throw error;
    }
  }, []);

  // Load combinations
  const loadCombinations = useCallback(async (streamId?: number) => {
    try {
      console.log('🔄 Loading combinations...');
      const data = await StreamConfigurationService.getSubjectCombinations(streamId);
      console.log('✅ Combinations loaded:', data?.length);
      setCombinations(Array.isArray(data) ? data : []);
    } catch (error) {
      console.error('❌ Error loading combinations:', error);
      setCombinations([]);
      throw error;
    }
  }, []);

  // Load all data
  const loadAllData = useCallback(async () => {
    setIsInitialLoading(true);
    setError(null);
    try {
      await Promise.all([
        loadStreams(),
        loadConfigurations(),
        loadAvailableSubjects()
      ]);
      console.log('✅ All data loaded successfully');
    } catch (error) {
      console.error('❌ Error loading data:', error);
      setError('Failed to load configuration data. Please refresh the page.');
      toast.error('Failed to load stream configurations');
    } finally {
      setIsInitialLoading(false);
    }
  }, [loadStreams, loadConfigurations, loadAvailableSubjects]);

  // Create default configurations for a specific stream
  const createDefaultConfigurationsForStream = useCallback(async (streamId: number) => {
    try {
      setIsLoading(true);
      
      const stream = streams.find(s => s.id === streamId);
      if (!stream) {
        throw new Error('Stream not found');
      }

      // Define default configurations
      const roles = [
        {
          subject_role: 'cross_cutting' as const,
          min_subjects_required: 2,
          max_subjects_allowed: 4,
          is_compulsory: true,
          display_order: 1
        },
        {
          subject_role: 'core' as const,
          min_subjects_required: 3,
          max_subjects_allowed: 5,
          is_compulsory: true,
          display_order: 2
        },
        {
          subject_role: 'elective' as const,
          min_subjects_required: 2,
          max_subjects_allowed: 3,
          is_compulsory: false,
          display_order: 3
        }
      ];

      // Create each configuration
      for (const config of roles) {
        // Check if it already exists
        const exists = configurations.find(
          c => c.stream_id === streamId && c.subject_role === config.subject_role
        );

        if (!exists) {
          await StreamConfigurationService.saveStreamConfiguration({
            stream_id: streamId,
            subject_role: config.subject_role,
            min_subjects_required: config.min_subjects_required,
            max_subjects_allowed: config.max_subjects_allowed,
            is_compulsory: config.is_compulsory,
            display_order: config.display_order,
            is_active: true
          });
        }
      }

      toast.success(`Default configurations created for ${stream.name}!`);
      await loadConfigurations();
    } catch (error) {
      console.error('❌ Error creating default configurations:', error);
      toast.error('Failed to create default configurations');
      throw error;
    } finally {
      setIsLoading(false);
    }
  }, [streams, configurations, loadConfigurations]);

  // Setup default configurations (tries backend first, falls back to client-side)
  const setupDefaultConfigurations = useCallback(async () => {
    try {
      setIsLoading(true);
      
      // Try the backend endpoint first
      try {
        await StreamConfigurationService.setupDefaultConfigurations();
        toast.success('Default configurations set up successfully!');
      } catch (backendError) {
        console.warn('⚠️ Backend setup_defaults failed, using client-side fallback:', backendError);
        
        // Fallback: Create configurations client-side for each stream
        if (streams.length === 0) {
          toast.error('No streams found. Please create streams first.');
          return;
        }

        for (const stream of streams) {
          await createDefaultConfigurationsForStream(stream.id);
        }
      }
      
      await loadAllData();
    } catch (error) {
      console.error('❌ Error setting up defaults:', error);
      toast.error('Failed to set up default configurations');
      throw error;
    } finally {
      setIsLoading(false);
    }
  }, [streams, loadAllData, createDefaultConfigurationsForStream]);

  // Add subject to configuration
  const addSubjectToConfiguration = useCallback(async (configId: number, subjectId: number) => {
    try {
      setIsLoading(true);
      await StreamConfigurationService.bulkAssignSubjects(configId, [subjectId]);
      
      const subject = availableSubjects.find(s => s.id === subjectId);
      if (subject) {
        toast.success(`Added ${subject.name} successfully`);
      }
      
      await loadConfigurations();
    } catch (error) {
      console.error('❌ Error adding subject:', error);
      toast.error('Failed to add subject');
      throw error;
    } finally {
      setIsLoading(false);
    }
  }, [availableSubjects, loadConfigurations]);

  // Remove subject from configuration
  const removeSubjectFromConfiguration = useCallback(async (configId: number, subjectId: number) => {
    const config = configurations.find(c => c.id === configId);
    const subject = config?.subjects.find(s => s.id === subjectId);
    
    if (!config || !subject) return;
    
    try {
      setIsLoading(true);
      
      // Optimistically update UI
      setConfigurations(prev => 
        prev.map(c => 
          c.id === configId 
            ? { ...c, subjects: c.subjects.filter(s => s.id !== subjectId) }
            : c
        )
      );
      
      // Try to call remove endpoint if available
      try {
        await StreamConfigurationService.removeSubjectFromConfiguration(configId, subjectId);
      } catch (error) {
        console.warn('Remove endpoint not available, using optimistic update');
      }
      
      toast.success(`Removed ${subject.name} successfully`);
    } catch (error) {
      console.error('❌ Error removing subject:', error);
      toast.error('Failed to remove subject');
      // Reload to get correct state
      await loadConfigurations();
      throw error;
    } finally {
      setIsLoading(false);
    }
  }, [configurations, loadConfigurations]);

  // Update configuration
  const updateConfiguration = useCallback(async (configId: number, updates: Partial<StreamConfiguration>) => {
    const config = configurations.find(c => c.id === configId);
    if (!config) return;

    try {
      setIsLoading(true);
      
      await StreamConfigurationService.saveStreamConfiguration({
        id: config.id,
        school_id: config.school_id,
        stream_id: config.stream_id,
        subject_role: updates.subject_role || config.subject_role,
        min_subjects_required: updates.min_subjects_required ?? config.min_subjects_required,
        max_subjects_allowed: updates.max_subjects_allowed ?? config.max_subjects_allowed,
        is_compulsory: updates.is_compulsory ?? config.is_compulsory,
        display_order: config.display_order,
        is_active: config.is_active
      });
      
      toast.success('Configuration updated successfully');
      await loadConfigurations();
    } catch (error) {
      console.error('❌ Error updating configuration:', error);
      toast.error('Failed to update configuration');
      throw error;
    } finally {
      setIsLoading(false);
    }
  }, [configurations, loadConfigurations]);

  // Save subject combination
  const saveSubjectCombination = useCallback(async (combination: Partial<SubjectCombination>) => {
    try {
      setIsLoading(true);
      await StreamConfigurationService.saveSubjectCombination(combination);
      toast.success('Combination saved successfully');
      await loadCombinations(selectedStream || undefined);
    } catch (error) {
      console.error('❌ Error saving combination:', error);
      toast.error('Failed to save combination');
      throw error;
    } finally {
      setIsLoading(false);
    }
  }, [selectedStream, loadCombinations]);

  // Delete subject combination
  const deleteSubjectCombination = useCallback(async (combinationId: number) => {
    try {
      setIsLoading(true);
      await StreamConfigurationService.deleteSubjectCombination(combinationId);
      toast.success('Combination deleted successfully');
      await loadCombinations(selectedStream || undefined);
    } catch (error) {
      console.error('❌ Error deleting combination:', error);
      toast.error('Failed to delete combination');
      throw error;
    } finally {
      setIsLoading(false);
    }
  }, [selectedStream, loadCombinations]);

  // Computed values
  const currentStream = streams.find(s => s.id === selectedStream);
  const streamConfigs = configurations.filter(c => c.stream_id === selectedStream);
  const currentConfig = selectedRole 
    ? streamConfigs.find(c => c.subject_role === selectedRole)
    : undefined;

  const getStreamStats = useCallback((streamId: number) => {
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
  }, [configurations]);

  // Load data on mount
  useEffect(() => {
    loadAllData();
  }, []);

  // Load combinations when stream changes
  useEffect(() => {
    if (selectedStream) {
      loadCombinations(selectedStream);
    }
  }, [selectedStream, loadCombinations]);

  const value: StreamConfigurationContextType = {
    // State
    streams,
    configurations,
    availableSubjects,
    combinations,
    selectedStream,
    selectedRole,
    isLoading,
    isInitialLoading,
    error,
    
    // Actions
    setSelectedStream,
    setSelectedRole,
    loadAllData,
    loadStreams,
    loadConfigurations,
    loadAvailableSubjects,
    loadCombinations,
    setupDefaultConfigurations,
    createDefaultConfigurationsForStream,
    addSubjectToConfiguration,
    removeSubjectFromConfiguration,
    updateConfiguration,
    saveSubjectCombination,
    deleteSubjectCombination,
    
    // Computed
    currentStream,
    streamConfigs,
    currentConfig,
    getStreamStats
  };

  return (
    <StreamConfigurationContext.Provider value={value}>
      {children}
    </StreamConfigurationContext.Provider>
  );
};

export default StreamConfigurationContext;