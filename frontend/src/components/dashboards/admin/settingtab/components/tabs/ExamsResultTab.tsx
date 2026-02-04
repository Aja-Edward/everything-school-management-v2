import React, { useState, useEffect } from 'react';
import { 
  Plus, 
  Edit, 
  Trash2, 
  Save, 
  X, 
  Settings, 
  Calculator,
  BookOpen,
  FileText,
  Award,
  Users,
  Eye,
  EyeOff,
  CheckCircle,
  AlertCircle,
  Info,
  Star,
  Calendar
} from 'lucide-react';
import { toast } from 'react-hot-toast';
import { 
  GradingSystem, 
  GradeRange, 
  AssessmentType, 
  ExamSession,
  ScoringConfiguration,
  ScoringConfigurationCreateUpdate,
  GradingSystemCreateUpdate,
  AssessmentTypeCreateUpdate,
  GradeCreateUpdate,
  ExamSessionCreateUpdate,
  
} from '@/services/ResultSettingsService';
import resultSettingsService from '@/services/ResultSettingsService';
import { AcademicSession } from '@/types/types';

interface ExamsResultTabProps {
  // Add any props if needed
}

const ExamsResultTab: React.FC<ExamsResultTabProps> = () => {
  // State for active sections
  const [activeSections, setActiveSections] = useState<Set<string>>(new Set(['scoring-configurations']));
  
  // Data states
  const [gradingSystems, setGradingSystems] = useState<GradingSystem[]>([]);
  const [grades, setGrades] = useState<GradeRange[]>([]);
  const [assessmentTypes, setAssessmentTypes] = useState<AssessmentType[]>([]);
  const [examSessions, setExamSessions] = useState<ExamSession[]>([]);
  const [academicSessions, setAcademicSessions] = useState<AcademicSession[]>([]);
  const [scoringConfigurations, setScoringConfigurations] = useState<ScoringConfiguration[]>([]);
  
  const [selectedGradingSystem, setSelectedGradingSystem] = useState<GradingSystem | null>(null);
  

  // Form states
  const [showScoringConfigForm, setShowScoringConfigForm] = useState(false);
  const [showGradingSystemForm, setShowGradingSystemForm] = useState(false);
  const [showAssessmentTypeForm, setShowAssessmentTypeForm] = useState(false);
  const [showExamSessionForm, setShowExamSessionForm] = useState(false);
  const [showGradesManagementModal, setShowGradesManagementModal] = useState(false);
  const [showGradeForm, setShowGradeForm] = useState(false);

  // Form data states

  const [scoringConfigForm, setScoringConfigForm] = useState<ScoringConfigurationCreateUpdate & { id?: string }>({
    name: '',
    education_level: 'SENIOR_SECONDARY',
    result_type: 'TERMLY',
    description: '',
    first_test_max_score: 10,
    second_test_max_score: 10,
    third_test_max_score: 10,
    exam_max_score: 70,
    total_max_score: 100,
    ca_weight_percentage: 30,
    exam_weight_percentage: 70,
    continuous_assessment_max_score: 15,
    take_home_test_max_score: 5,
    appearance_max_score: 5,
    practical_max_score: 5,
    project_max_score: 5,
    note_copying_max_score: 5,
    is_active: true,
    is_default: false
  });

  const [gradingSystemForm, setGradingSystemForm] = useState<GradingSystemCreateUpdate & { id?: string }>({
    name: '',
    grading_type: 'PERCENTAGE',
    description: '',
    min_score: 0,
    max_score: 100,
    pass_mark: 50,
    is_active: true
  });
  const [assessmentTypeForm, setAssessmentTypeForm] = useState<AssessmentTypeCreateUpdate & { id?: string }>({
    name: '',
    code: '',
    description: '',
    education_level: 'ALL',
    max_score: 10,
    weight_percentage: 100,
    is_active: true
  });
  const [examSessionForm, setExamSessionForm] = useState<ExamSessionCreateUpdate & { id?: string }>({
    name: '',
    exam_type: '',
    term: '',
    academic_session: '',
    start_date: '',
    end_date: '',
    result_release_date: '',
    is_published: false,
    is_active: true
  });

//   Grade form state
const [gradeForm, setGradeForm] = useState<GradeCreateUpdate & { id?: string }>({
  grading_system: '',
  grade: '',
  remark: '',
  min_score: 0,
  max_score: 0,
  grade_point: undefined,
  description: '',
  is_passing: true
});

  // Loading states
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    loadData();
  }, []);

  const loadData = async () => {
    try {
      setLoading(true);
      const [
        gradingSystemsData,
        gradesData,
        assessmentTypesData,
        examSessionsData,
        scoringConfigsData,
         academicSessionsData
      ] = await Promise.all([
        resultSettingsService.getGradingSystems(),
        resultSettingsService.getGrades(),
        resultSettingsService.getAssessmentTypes(),
        resultSettingsService.getExamSessions(),
        resultSettingsService.getScoringConfigurations(),
        resultSettingsService.getAcademicSessions()
      ]);

      
      setGradingSystems(gradingSystemsData);
      setGrades(gradesData);
      setAssessmentTypes(assessmentTypesData);
      setExamSessions(examSessionsData);
      setScoringConfigurations(scoringConfigsData);
       setAcademicSessions(academicSessionsData);
      
      console.log('loadData - State updated, scoringConfigurations should now have:', scoringConfigsData?.length, 'items');
    } catch (error) {
      console.error('Error loading data:', error);
      toast.error('Failed to load data');
    } finally {
      setLoading(false);
    }
  };

  const toggleSection = (section: string) => {
    const newSections = new Set(activeSections);
    if (newSections.has(section)) {
      newSections.delete(section);
    } else {
      newSections.add(section);
    }
    setActiveSections(newSections);
  };

   
  const handleManageGrades = (system: GradingSystem) => {
  setSelectedGradingSystem(system);
  console.log("This is System", system)
  setShowGradesManagementModal(true);
};

  const resetGradeForm = () => {
  setGradeForm({
    grading_system: selectedGradingSystem?.id || '',
    grade: '',
    remark: '',
    min_score: 0,
    max_score: 0,
    grade_point: undefined,
    description: '',
    is_passing: true
  });
};

const handleCreateGrade = async () => {
  try {
    setSaving(true);
    
    // Validate required fields
    if (!gradeForm.grade || !gradeForm.remark) {
      toast.error('Grade and remark are required');
      setSaving(false);
      return;
    }
    
    // Validate score range
    if (gradeForm.min_score >= gradeForm.max_score) {
      toast.error('Minimum score must be less than maximum score');
      setSaving(false);
      return;
    }
    
    const { id, ...createData } = gradeForm;
    await resultSettingsService.createGrade(createData);
    toast.success('Grade created successfully');
    setShowGradeForm(false);
    resetGradeForm();
    loadData();
  } catch (error: any) {
    console.error('Error creating grade:', error);
    if (error.response?.data) {
      const errorData = error.response.data;
      if (errorData.non_field_errors) {
        toast.error(errorData.non_field_errors[0]);
      } else if (typeof errorData === 'object') {
        const errorMessages = Object.values(errorData).flat();
        toast.error(errorMessages[0] as string);
      } else {
        toast.error('Failed to create grade');
      }
    } else {
      toast.error('Failed to create grade');
    }
  } finally {
    setSaving(false);
  }
};

const handleUpdateGrade = async (id: string) => {
  try {
    setSaving(true);
    
    // Validate required fields
    if (!gradeForm.grade || !gradeForm.remark) {
      toast.error('Grade and remark are required');
      setSaving(false);
      return;
    }
    
    // Validate score range
    if (gradeForm.min_score >= gradeForm.max_score) {
      toast.error('Minimum score must be less than maximum score');
      setSaving(false);
      return;
    }
    
    const { id: formId, ...updateData } = gradeForm;
    await resultSettingsService.updateGrade(id, updateData);
    toast.success('Grade updated successfully');
    setShowGradeForm(false);
    resetGradeForm();
    loadData();
  } catch (error: any) {
    console.error('Error updating grade:', error);
    if (error.response?.data) {
      const errorData = error.response.data;
      if (errorData.non_field_errors) {
        toast.error(errorData.non_field_errors[0]);
      } else if (typeof errorData === 'object') {
        const errorMessages = Object.values(errorData).flat();
        toast.error(errorMessages[0] as string);
      } else {
        toast.error('Failed to update grade');
      }
    } else {
      toast.error('Failed to update grade');
    }
  } finally {
    setSaving(false);
  }
};

const handleDeleteGrade = async (id: string) => {
  if (window.confirm('Are you sure you want to delete this grade?')) {
    try {
      await resultSettingsService.deleteGrade(id);
      toast.success('Grade deleted successfully');
      loadData();
    } catch (error) {
      console.error('Error deleting grade:', error);
      toast.error('Failed to delete grade');
    }
  }
};

  
  // Scoring Configuration handlers
  const handleCreateScoringConfig = async () => {
    
    try {
      console.log('=== handleCreateScoringConfig START ===');
      setSaving(true);
      
      // Check if data is loaded
      if (loading) {
        console.log('Loading check failed');
        toast.error('Please wait for data to load before creating a configuration');
        setSaving(false);
        return;
      }
      console.log('Loading check passed');
      
      // Validate weight percentages before sending (only for TERMLY)
      if (scoringConfigForm.result_type === 'TERMLY' && !validateWeightPercentages()) {
        console.log('Weight validation failed');
        toast.error('CA weight percentage and exam weight percentage must sum to 100%');
        setSaving(false);
        return;
      }
      console.log('Weight validation passed');

      if (scoringConfigForm.result_type === 'TERMLY' && 
        scoringConfigForm.education_level !== 'NURSERY' && 
        !validateTotalScore()) {
      console.log('Total score validation failed');
      const caTotal = scoringConfigForm.education_level === 'SENIOR_SECONDARY' 
        ? calculateTotalCA() 
        : calculateTotalCAPrimaryJunior();
      const examScore = Number(scoringConfigForm.exam_max_score) || 0;
      const expectedTotal = caTotal + examScore;
      toast.error(`Total max score must equal ${expectedTotal} (CA: ${caTotal} + Exam: ${examScore})`);
      setSaving(false);
      return;
    }
    console.log('Total score validation passed');
     
     // Validate default configuration
     if (!validateDefaultConfiguration()) {
       console.log('Default configuration validation failed');
       toast.error('Only one default configuration is allowed per education level. Please set the existing default configuration to non-default first, or set this configuration as non-default.');
       setSaving(false);
       return;
     }
     console.log('Default configuration validation passed');
     
            // Prepare form data based on education level and result type
       let formData: any = JSON.parse(JSON.stringify(scoringConfigForm));
      
      console.log('Original formData:', formData);
      const level = scoringConfigForm.education_level?.toUpperCase();

              // Remove fields that don't apply based on education level
       if (level === 'SENIOR_SECONDARY') {
         // For Senior Secondary, remove Junior Secondary/Primary fields
         delete formData.continuous_assessment_max_score;
         delete formData.take_home_test_max_score;
         delete formData.appearance_max_score;
         delete formData.practical_max_score;
         delete formData.project_max_score;
         delete formData.note_copying_max_score;
         console.log('After removing Junior/Primary fields for Senior Secondary:', formData);
       } else if (level === 'NURSERY') {
         // For Nursery, remove all other fields except total_max_score
         delete formData.first_test_max_score;
         delete formData.second_test_max_score;
         delete formData.third_test_max_score;
         delete formData.continuous_assessment_max_score;
         delete formData.take_home_test_max_score;
         delete formData.appearance_max_score;
         delete formData.practical_max_score;
         delete formData.project_max_score;
         delete formData.note_copying_max_score;
         delete formData.ca_weight_percentage;
         delete formData.exam_weight_percentage;
         console.log('After removing all fields except total_max_score for Nursery:', formData);
       } else {
         // For Junior Secondary and Primary, remove Senior Secondary fields
         delete formData.first_test_max_score;
         delete formData.second_test_max_score;
         delete formData.third_test_max_score;
         console.log('After removing Senior Secondary fields for Junior/Primary:', formData);
       }
      
      if (scoringConfigForm.result_type === 'SESSION') {
        // Remove fields that don't apply to SESSION result type
        delete formData.exam_max_score;
        delete formData.ca_weight_percentage;
        delete formData.exam_weight_percentage;
        // delete formData.total_max_score;
        console.log('After removing SESSION fields:', formData);
      }
      
      console.log('Final formData being sent:', formData);
     console.log('About to call resultSettingsService.createScoringConfiguration...');

     console.log("Payload actually sent:", formData);
     const response = await resultSettingsService.createScoringConfiguration(formData);
     console.log('API Response:', response);
     toast.success('Scoring configuration created successfully');
     setShowScoringConfigForm(false);
     setScoringConfigForm({
       name: '',
       education_level: 'SENIOR_SECONDARY',
       result_type: 'TERMLY',
       description: '',
       first_test_max_score: 10,
       second_test_max_score: 10,
       third_test_max_score: 10,
       exam_max_score: 70,
       total_max_score: 100,
       ca_weight_percentage: 30,
       exam_weight_percentage: 70,
       continuous_assessment_max_score: 15,
       take_home_test_max_score: 5,
       appearance_max_score: 5,
       practical_max_score: 5,
       project_max_score: 5,
       note_copying_max_score: 5,
       is_active: true,
       is_default: false
     });
     console.log('About to reload data...');
     await loadData();
     console.log('Data reloaded successfully');
   } catch (error: any) {
     console.error('Error creating scoring configuration:', error);
     
     // Show specific validation errors if available
     if (error.response?.data) {
       const errorData = error.response.data;
       if (errorData.non_field_errors) {
         toast.error(errorData.non_field_errors[0]);
       } else if (typeof errorData === 'object') {
         const errorMessages = Object.values(errorData).flat();
         toast.error(errorMessages[0] as string);
       } else {
         toast.error('Failed to create scoring configuration');
       }
     } else {
       toast.error('Failed to create scoring configuration');
     }
   } finally {
     setSaving(false);
   }
 };

    const handleUpdateScoringConfig = async (id: string) => {
    try {
      setSaving(true);
      
      // Check if data is loaded
      if (loading) {
        toast.error('Please wait for data to load before updating a configuration');
        setSaving(false);
        return;
      }
      
      // Validate weight percentages before sending (only for TERMLY)
      if (scoringConfigForm.result_type === 'TERMLY' && !validateWeightPercentages()) {
        toast.error('CA weight percentage and exam weight percentage must sum to 100%');
        setSaving(false);
        return;
      }

      if (scoringConfigForm.result_type === 'TERMLY' && 
        scoringConfigForm.education_level !== 'NURSERY' && 
        !validateTotalScore()) {
      const caTotal = scoringConfigForm.education_level === 'SENIOR_SECONDARY' 
        ? calculateTotalCA() 
        : calculateTotalCAPrimaryJunior();
      const examScore = Number(scoringConfigForm.exam_max_score) || 0;
      const expectedTotal = caTotal + examScore;
      toast.error(`Total max score must equal ${expectedTotal} (CA: ${caTotal} + Exam: ${examScore})`);
      setSaving(false);
      return;
    }
     
     // Validate default configuration
     if (!validateDefaultConfiguration()) {
       toast.error('Only one default configuration is allowed per education level. Please set the existing default configuration to non-default first, or set this configuration as non-default.');
       setSaving(false);
       return;
     }
     
                        // Prepare form data based on education level and result type
      let formData: any = JSON.parse(JSON.stringify(scoringConfigForm));
      
      console.log('Original formData (update):', formData);
      const level = scoringConfigForm.education_level?.toUpperCase();
              // Remove fields that don't apply based on education level
       if (level === 'SENIOR_SECONDARY') {
        formData.first_test_max_score ??= 10;
        formData.second_test_max_score ??= 10;
        formData.third_test_max_score ??= 10;
        formData.exam_max_score ??= 70;
        formData.total_max_score ??= 100;
         // For Senior Secondary, remove Junior Secondary/Primary fields
         delete formData.continuous_assessment_max_score;
         delete formData.take_home_test_max_score;
         delete formData.appearance_max_score;
         delete formData.practical_max_score;
         delete formData.project_max_score;
         delete formData.note_copying_max_score;
         console.log('After removing Junior/Primary fields for Senior Secondary (update):', formData);
       } else if (level === 'NURSERY') {
         // For Nursery, remove all other fields except total_max_score
         delete formData.first_test_max_score;
         delete formData.second_test_max_score;
         delete formData.third_test_max_score;
         delete formData.continuous_assessment_max_score;
         delete formData.take_home_test_max_score;
         delete formData.appearance_max_score;
         delete formData.practical_max_score;
         delete formData.project_max_score;
         delete formData.note_copying_max_score;
         delete formData.ca_weight_percentage;
         delete formData.exam_weight_percentage;
         console.log('After removing all fields except total_max_score for Nursery (update):', formData);
       } else {
         // For Junior Secondary and Primary, remove Senior Secondary fields
         delete formData.first_test_max_score;
         delete formData.second_test_max_score;
         delete formData.third_test_max_score;
         console.log('After removing Senior Secondary fields for Junior/Primary (update):', formData);
       }
      
      if (scoringConfigForm.result_type === 'SESSION') {
        // Remove fields that don't apply to SESSION result type
        delete formData.exam_max_score;
        delete formData.ca_weight_percentage;
        delete formData.exam_weight_percentage;
        // delete formData.total_max_score;
        console.log('After removing SESSION fields (update):', formData);
      }
      
      console.log('Final formData being sent (update):', formData);
     await resultSettingsService.updateScoringConfiguration(id, formData);
     toast.success('Scoring configuration updated successfully');
     setShowScoringConfigForm(false);
     loadData();
   } catch (error: any) {
     console.error('Error updating scoring configuration:', error);
     
     // Show specific validation errors if available
     if (error.response?.data) {
       const errorData = error.response.data;
       if (errorData.non_field_errors) {
         toast.error(errorData.non_field_errors[0]);
       } else if (typeof errorData === 'object') {
         const errorMessages = Object.values(errorData).flat();
         toast.error(errorMessages[0] as string);
       } else {
         toast.error('Failed to update scoring configuration');
       }
     } else {
       toast.error('Failed to update scoring configuration');
     }
   } finally {
     setSaving(false);
   }
 };

  const handleDeleteScoringConfig = async (id: string) => {
    if (window.confirm('Are you sure you want to delete this scoring configuration?')) {
      try {
        console.log('Attempting to delete scoring configuration with ID:', id);
        await resultSettingsService.deleteScoringConfiguration(id);
        console.log('Scoring configuration deleted successfully');
        toast.success('Scoring configuration deleted successfully');
        loadData();
      } catch (error: any) {
        console.error('Error deleting scoring configuration:', error);
        console.error('Error details:', error.response?.data);
        toast.error('Failed to delete scoring configuration');
      }
    }
  };

  const calculateTotalCA = () => {
    const firstTest = Number(scoringConfigForm.first_test_max_score) || 0;
    const secondTest = Number(scoringConfigForm.second_test_max_score) || 0;
    const thirdTest = Number(scoringConfigForm.third_test_max_score) || 0;
    return firstTest + secondTest + thirdTest;
  };

  const calculateTotalCAPrimaryJunior = () => {
    const ca = Number(scoringConfigForm.continuous_assessment_max_score) || 0;
    const takeHomeTest = Number(scoringConfigForm.take_home_test_max_score) || 0;
    const appearance = Number(scoringConfigForm.appearance_max_score) || 0;
    const practical = Number(scoringConfigForm.practical_max_score) || 0;
    const project = Number(scoringConfigForm.project_max_score) || 0;
    const noteCopying = Number(scoringConfigForm.note_copying_max_score) || 0;
    return ca + takeHomeTest + appearance + practical + project + noteCopying;
  };

  const validateWeightPercentages = () => {
    const caWeight = Number(scoringConfigForm.ca_weight_percentage) || 0;
    const examWeight = Number(scoringConfigForm.exam_weight_percentage) || 0;
    const total = caWeight + examWeight;
    const isValid = total === 100;
    console.log('validateWeightPercentages:', {
      ca_weight: scoringConfigForm.ca_weight_percentage,
      exam_weight: scoringConfigForm.exam_weight_percentage,
      total,
      isValid
    });
    return isValid;
  };

  const validateDefaultConfiguration = () => {
    console.log('validateDefaultConfiguration:', {
      is_default: scoringConfigForm.is_default,
      education_level: scoringConfigForm.education_level,
      configs_length: scoringConfigurations?.length,
      existing_configs: scoringConfigurations?.filter(c => c.education_level === scoringConfigForm.education_level)
    });
    
    if (scoringConfigForm.is_default && scoringConfigurations && scoringConfigurations.length > 0) {
      const existingDefault = scoringConfigurations.find(
        config => config.education_level === scoringConfigForm.education_level && 
                  config.is_default && 
                  config.id !== scoringConfigForm.id
      );
      console.log('Existing default found:', existingDefault);
      return !existingDefault;
    }
    return true;
  };

  const validateTotalScore = () => {
    const caTotal = calculateTotalCA();
    const examScore = Number(scoringConfigForm.exam_max_score) || 0;
    const expectedTotal = caTotal + examScore;
    const actualTotal = Number(scoringConfigForm.total_max_score) || 0;
    const isValid = expectedTotal === actualTotal;
    return isValid;
  };

  // Grading System handlers
  const handleDeleteGradingSystem = async (id: string) => {
    if (window.confirm('Are you sure you want to delete this grading system?')) {
      try {
        await resultSettingsService.deleteGradingSystem(id);
        toast.success('Grading system deleted successfully');
        loadData();
      } catch (error) {
        console.error('Error deleting grading system:', error);
        toast.error('Failed to delete grading system');
      }
    }
  };

  // Assessment Type handlers
  const handleDeleteAssessmentType = async (id: string) => {
    if (window.confirm('Are you sure you want to delete this assessment type?')) {
      try {
        await resultSettingsService.deleteAssessmentType(id);
        toast.success('Assessment type deleted successfully');
        loadData();
      } catch (error) {
        console.error('Error deleting assessment type:', error);
        toast.error('Failed to delete assessment type');
      }
    }
  };

  // Exam Session handlers
  const handleDeleteExamSession = async (id: string) => {
    if (window.confirm('Are you sure you want to delete this exam session?')) {
      try {
        await resultSettingsService.deleteExamSession(id);
        toast.success('Exam session deleted successfully');
        loadData();
      } catch (error) {
        console.error('Error deleting exam session:', error);
        toast.error('Failed to delete exam session');
      }
    }
  };

  // Grading System Create/Update handlers
  const handleCreateGradingSystem = async () => {
    try {
      setSaving(true);
      await resultSettingsService.createGradingSystem(gradingSystemForm);
      toast.success('Grading system created successfully');
      setShowGradingSystemForm(false);
      resetGradingSystemForm();
      loadData();
    } catch (error: any) {
      console.error('Error creating grading system:', error);
      if (error.response?.data) {
        const errorData = error.response.data;
        if (errorData.non_field_errors) {
          toast.error(errorData.non_field_errors[0]);
        } else if (typeof errorData === 'object') {
          const errorMessages = Object.values(errorData).flat();
          toast.error(errorMessages[0] as string);
        } else {
          toast.error('Failed to create grading system');
        }
      } else {
        toast.error('Failed to create grading system');
      }
    } finally {
      setSaving(false);
    }
  };

  const handleUpdateGradingSystem = async (id: string) => {
    try {
      setSaving(true);
      await resultSettingsService.updateGradingSystem(id, gradingSystemForm);
      toast.success('Grading system updated successfully');
      setShowGradingSystemForm(false);
      resetGradingSystemForm();
      loadData();
    } catch (error: any) {
      console.error('Error updating grading system:', error);
      if (error.response?.data) {
        const errorData = error.response.data;
        if (errorData.non_field_errors) {
          toast.error(errorData.non_field_errors[0]);
        } else if (typeof errorData === 'object') {
          const errorMessages = Object.values(errorData).flat();
          toast.error(errorMessages[0] as string);
        } else {
          toast.error('Failed to update grading system');
        }
      } else {
        toast.error('Failed to update grading system');
      }
    } finally {
      setSaving(false);
    }
  };

  const resetGradingSystemForm = () => {
    setGradingSystemForm({
      name: '',
      grading_type: 'PERCENTAGE',
      description: '',
      min_score: 0,
      max_score: 100,
      pass_mark: 50,
      is_active: true
    });
  };

  // Assessment Type Create/Update handlers
  const handleCreateAssessmentType = async () => {
    try {
      setSaving(true);
      await resultSettingsService.createAssessmentType(assessmentTypeForm);
      toast.success('Assessment type created successfully');
      setShowAssessmentTypeForm(false);
      resetAssessmentTypeForm();
      loadData();
    } catch (error: any) {
      console.error('Error creating assessment type:', error);
      if (error.response?.data) {
        const errorData = error.response.data;
        if (errorData.non_field_errors) {
          toast.error(errorData.non_field_errors[0]);
        } else if (typeof errorData === 'object') {
          const errorMessages = Object.values(errorData).flat();
          toast.error(errorMessages[0] as string);
        } else {
          toast.error('Failed to create assessment type');
        }
      } else {
        toast.error('Failed to create assessment type');
      }
    } finally {
      setSaving(false);
    }
  };

  const handleUpdateAssessmentType = async (id: string) => {
    try {
      setSaving(true);
      await resultSettingsService.updateAssessmentType(id, assessmentTypeForm);
      toast.success('Assessment type updated successfully');
      setShowAssessmentTypeForm(false);
      resetAssessmentTypeForm();
      loadData();
    } catch (error: any) {
      console.error('Error updating assessment type:', error);
      if (error.response?.data) {
        const errorData = error.response.data;
        if (errorData.non_field_errors) {
          toast.error(errorData.non_field_errors[0]);
        } else if (typeof errorData === 'object') {
          const errorMessages = Object.values(errorData).flat();
          toast.error(errorMessages[0] as string);
        } else {
          toast.error('Failed to update assessment type');
        }
      } else {
        toast.error('Failed to update assessment type');
      }
    } finally {
      setSaving(false);
    }
  };

  const resetAssessmentTypeForm = () => {
    setAssessmentTypeForm({
      name: '',
      code: '',
      description: '',
      education_level: 'ALL',
      max_score: 10,
      weight_percentage: 100,
      is_active: true
    });
  };

// goodExam Session Create/Update handlers
const handleCreateExamSession = async () => {
  try {
    setSaving(true);

    // Validate selections
    if (!examSessionForm.academic_session) {
      toast.error("Please select an academic session");
      setSaving(false);
      return;
    }
    if (!examSessionForm.exam_type) {
      toast.error("Please select an exam type");
      setSaving(false);
      return;
    }
    if (!examSessionForm.term) {
      toast.error("Please select a term");
      setSaving(false);
      return;
    }

    // goodConvert academic_session to integer before sending
    const payload = {
      ...examSessionForm,
      academic_session: Number(examSessionForm.academic_session),
    };

    console.log("Creating exam session with payload:", payload);
    await resultSettingsService.createExamSession(payload);

    toast.success("Exam session created successfully");
    setShowExamSessionForm(false);
    resetExamSessionForm();
    loadData();
  } catch (error: any) {
    console.error("Error creating exam session:", error);
    if (error.response?.data) {
      const errorData = error.response.data;
      if (errorData.non_field_errors) {
        toast.error(errorData.non_field_errors[0]);
      } else if (typeof errorData === "object") {
        const errorMessages = Object.values(errorData).flat();
        toast.error(errorMessages[0] as string);
      } else {
        toast.error("Failed to create exam session");
      }
    } else {
      toast.error("Failed to create exam session");
    }
  } finally {
    setSaving(false);
  }
};

const handleUpdateExamSession = async (id: string) => {
  try {
    setSaving(true);

    if (!examSessionForm.academic_session) {
      toast.error("Please select an academic session");
      setSaving(false);
      return;
    }

    // goodConvert academic_session to integer before sending
    const payload = {
      ...examSessionForm,
      academic_session: Number(examSessionForm.academic_session),
    };

    console.log("Updating exam session with payload:", payload);
    await resultSettingsService.updateExamSession(id, payload);

    toast.success("Exam session updated successfully");
    setShowExamSessionForm(false);
    resetExamSessionForm();
    loadData();
  } catch (error: any) {
    console.error("Error updating exam session:", error);
    if (error.response?.data) {
      const errorData = error.response.data;
      if (errorData.non_field_errors) {
        toast.error(errorData.non_field_errors[0]);
      } else if (typeof errorData === "object") {
        const errorMessages = Object.values(errorData).flat();
        toast.error(errorMessages[0] as string);
      } else {
        toast.error("Failed to update exam session");
      }
    } else {
      toast.error("Failed to update exam session");
    }
  } finally {
    setSaving(false);
  }
};

  const resetExamSessionForm = () => {
    setExamSessionForm({
      name: '',
      exam_type: '',
      term: '',
      academic_session: '',
      start_date: '',
      end_date: '',
      result_release_date: '',
      is_published: false,
      is_active: true
    });
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-blue-50 to-indigo-100 flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-4 border-blue-600 border-t-transparent mx-auto mb-4"></div>
          <p className="text-lg text-gray-700 font-medium">Loading Exams & Results Settings...</p>
          <p className="text-sm text-gray-500 mt-2">Please wait while we fetch your configuration data</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-50 to-indigo-100 p-6">
      <div className="max-w-7xl mx-auto space-y-8">
        {/* Header Section */}
        <div className="bg-white rounded-2xl shadow-lg p-8 border border-gray-100">
          <div className="flex items-center justify-between">
            <div className="flex items-center space-x-4">
              <div className="bg-gradient-to-r from-blue-600 to-indigo-600 p-3 rounded-xl">
                <FileText className="h-8 w-8 text-white" />
              </div>
              <div>
                <h1 className="text-3xl font-bold text-gray-900">Exams & Results Settings</h1>
                <p className="text-gray-600 mt-1">
                  Configure grading systems, assessment types, exam sessions, and result templates
                </p>
              </div>
            </div>
            <div className="flex items-center space-x-3">
              <div className="bg-green-100 text-green-800 px-4 py-2 rounded-full text-sm font-medium">
                <CheckCircle className="h-4 w-4 inline mr-2" />
                System Active
              </div>
            </div>
          </div>
        </div>

        {/* Quick Stats */}
        <div className="grid grid-cols-1 md:grid-cols-4 gap-6">
          <div className="bg-white rounded-xl shadow-lg p-6 border border-gray-100">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-gray-600">Grading Systems</p>
                <p className="text-2xl font-bold text-gray-900">{gradingSystems?.length || 0}</p>
              </div>
              <div className="bg-blue-100 p-3 rounded-lg">
                <Award className="h-6 w-6 text-blue-600" />
              </div>
            </div>
          </div>
          
          <div className="bg-white rounded-xl shadow-lg p-6 border border-gray-100">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-gray-600">Assessment Types</p>
                <p className="text-2xl font-bold text-gray-900">{assessmentTypes?.length || 0}</p>
              </div>
              <div className="bg-green-100 p-3 rounded-lg">
                <BookOpen className="h-6 w-6 text-green-600" />
              </div>
            </div>
          </div>
          
          <div className="bg-white rounded-xl shadow-lg p-6 border border-gray-100">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-gray-600">Exam Sessions</p>
                <p className="text-2xl font-bold text-gray-900">{examSessions?.length || 0}</p>
              </div>
              <div className="bg-purple-100 p-3 rounded-lg">
                <Calendar className="h-6 w-6 text-purple-600" />
              </div>
            </div>
          </div>
          
          <div className="bg-white rounded-xl shadow-lg p-6 border border-gray-100">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-gray-600">Scoring Configs</p>
                <p className="text-2xl font-bold text-gray-900">{scoringConfigurations?.length || 0}</p>
              </div>
              <div className="bg-orange-100 p-3 rounded-lg">
                <Calculator className="h-6 w-6 text-orange-600" />
              </div>
            </div>
          </div>
        </div>

        {/* Scoring Configurations Section */}
        <div className="bg-white rounded-2xl shadow-lg border border-gray-100 overflow-hidden">
          <div className="bg-gradient-to-r from-blue-600 to-indigo-600 px-8 py-6">
            <div className="flex items-center justify-between">
              <div className="flex items-center space-x-4">
                <div className="bg-white/20 p-3 rounded-xl">
                  <Calculator className="h-6 w-6 text-white" />
                </div>
                <div>
                  <h2 className="text-xl font-bold text-white">Scoring Configurations</h2>
                  <p className="text-blue-100 text-sm">Manage test and exam scoring systems</p>
                </div>
              </div>
              <div className="flex items-center space-x-3">
                <span className="bg-white/20 text-white text-sm font-medium px-3 py-1 rounded-full">
                  {scoringConfigurations?.length || 0} Configurations
                </span>
                <button
                  className="bg-white/20 hover:bg-white/30 text-white px-4 py-2 rounded-lg transition-all duration-200 flex items-center space-x-2"
                  onClick={() => toggleSection('scoring-configurations')}
                >
                  {activeSections.has('scoring-configurations') ? (
                    <>
                      <EyeOff className="h-4 w-4" />
                      <span>Hide</span>
                    </>
                  ) : (
                    <>
                      <Eye className="h-4 w-4" />
                      <span>Show</span>
                    </>
                  )}
                </button>
                <button
                  className="bg-white text-blue-600 hover:bg-gray-50 px-4 py-2 rounded-lg transition-all duration-200 flex items-center space-x-2 font-medium"
                  onClick={() => setShowScoringConfigForm(true)}
                >
                  <Plus className="h-4 w-4" />
                  <span>Add New</span>
                </button>
              </div>
            </div>
          </div>
          
          {activeSections.has('scoring-configurations') && scoringConfigurations && (
            <div className="p-8">
              {scoringConfigurations.length === 0 ? (
                <div className="text-center py-12">
                  <div className="bg-gray-100 rounded-full p-6 w-20 h-20 mx-auto mb-4 flex items-center justify-center">
                    <Calculator className="h-10 w-10 text-gray-400" />
                  </div>
                  <h3 className="text-lg font-medium text-gray-900 mb-2">No Scoring Configurations</h3>
                  <p className="text-gray-600 mb-6">Get started by creating your first scoring configuration</p>
                  <button
                    className="bg-blue-600 hover:bg-blue-700 text-white px-6 py-3 rounded-lg transition-all duration-200 flex items-center space-x-2 mx-auto"
                    onClick={() => setShowScoringConfigForm(true)}
                  >
                    <Plus className="h-4 w-4" />
                    <span>Create First Configuration</span>
                  </button>
                </div>
              ) : (
                <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                  {scoringConfigurations.map((config) => (
                    <div key={config.id} className="bg-gradient-to-br from-gray-50 to-white rounded-xl border border-gray-200 p-6 hover:shadow-lg transition-all duration-200">
                      <div className="flex items-start justify-between mb-4">
                        <div className="flex-1">
                          <div className="flex items-center space-x-2 mb-2">
                            <h3 className="text-lg font-semibold text-gray-900">{config.name}</h3>
                            {config.is_default && (
                              <span className="bg-blue-100 text-blue-800 text-xs font-medium px-2 py-1 rounded-full flex items-center">
                                <Star className="h-3 w-3 mr-1" />
                                Default
                              </span>
                            )}
                          </div>
                          <p className="text-gray-600 text-sm mb-3">{config.description}</p>
                          <div className="flex items-center space-x-3">
                            <span className="bg-gray-100 text-gray-800 text-xs font-medium px-3 py-1 rounded-full">
                              {config.education_level_display}
                            </span>
                            {config.is_active ? (
                              <span className="bg-green-100 text-green-800 text-xs font-medium px-3 py-1 rounded-full flex items-center">
                                <CheckCircle className="h-3 w-3 mr-1" />
                                Active
                              </span>
                            ) : (
                              <span className="bg-red-100 text-red-800 text-xs font-medium px-3 py-1 rounded-full flex items-center">
                                <AlertCircle className="h-3 w-3 mr-1" />
                                Inactive
                              </span>
                            )}
                          </div>
                        </div>
                        <div className="flex items-center space-x-2">
                          <button
                            className="p-2 text-gray-600 hover:text-blue-600 hover:bg-blue-50 rounded-lg transition-all duration-200"
                            onClick={() => {
                              setScoringConfigForm({
                                ...config,
                                result_type: config.result_type || 'TERMLY' // Ensure result_type is set
                              });
                              setShowScoringConfigForm(true);
                            }}
                            title="Edit Configuration"
                          >
                            <Edit className="h-4 w-4" />
                          </button>
                          <button
                            className="p-2 text-gray-600 hover:text-red-600 hover:bg-red-50 rounded-lg transition-all duration-200"
                            onClick={() => handleDeleteScoringConfig(config.id)}
                            title="Delete Configuration"
                          >
                            <Trash2 className="h-4 w-4" />
                          </button>
                        </div>
                      </div>
                      
                      <div className="grid grid-cols-2 gap-4 text-sm">
                         {/* Senior Secondary Display */}
                         {config.education_level === 'SENIOR_SECONDARY' && (
                           <div className="bg-blue-50 rounded-lg p-3">
                             <h4 className="font-medium text-blue-900 mb-2">
                               {config.result_type === 'SESSION' ? 'Term Cumulative Scores' : 'Test Scores'}
                             </h4>
                             <div className="space-y-1 text-blue-800">
                               <div className="flex justify-between">
                                 <span>{config.result_type === 'SESSION' ? '1st Term (Tests+Exam):' : '1st Test:'}</span>
                                 <span className="font-medium">{config.first_test_max_score}</span>
                               </div>
                               <div className="flex justify-between">
                                 <span>{config.result_type === 'SESSION' ? '2nd Term (Tests+Exam):' : '2nd Test:'}</span>
                                 <span className="font-medium">{config.second_test_max_score}</span>
                               </div>
                               <div className="flex justify-between">
                                 <span>{config.result_type === 'SESSION' ? '3rd Term (Tests+Exam):' : '3rd Test:'}</span>
                                 <span className="font-medium">{config.third_test_max_score}</span>
                               </div>
                             </div>
                           </div>
                         )}
                         
                         {/* Junior Secondary and Primary Display */}
                         {(config.education_level === 'JUNIOR_SECONDARY' || config.education_level === 'PRIMARY') && (
                           <div className="bg-blue-50 rounded-lg p-3">
                             <h4 className="font-medium text-blue-900 mb-2">Continuous Assessment Scores</h4>
                             <div className="space-y-1 text-blue-800">
                               <div className="flex justify-between">
                                 <span>CA Score:</span>
                                 <span className="font-medium">{config.continuous_assessment_max_score}</span>
                               </div>
                               <div className="flex justify-between">
                                 <span>Take Home Test:</span>
                                 <span className="font-medium">{config.take_home_test_max_score}</span>
                               </div>
                               <div className="flex justify-between">
                                 <span>Appearance:</span>
                                 <span className="font-medium">{config.appearance_max_score}</span>
                               </div>
                               <div className="flex justify-between">
                                 <span>Practical:</span>
                                 <span className="font-medium">{config.practical_max_score}</span>
                               </div>
                               <div className="flex justify-between">
                                 <span>Project:</span>
                                 <span className="font-medium">{config.project_max_score}</span>
                               </div>
                               <div className="flex justify-between">
                                 <span>Note Copying:</span>
                                 <span className="font-medium">{config.note_copying_max_score}</span>
                               </div>
                             </div>
                           </div>
                         )}
                         
                         {/* Nursery Display */}
                         {config.education_level === 'NURSERY' && (
                           <div className="bg-pink-50 rounded-lg p-3">
                             <h4 className="font-medium text-pink-900 mb-2">Nursery Configuration</h4>
                             <div className="space-y-1 text-pink-800">
                               <div className="flex justify-between">
                                 <span>Max Mark Obtainable:</span>
                                 <span className="font-medium">{config.total_max_score}</span>
                               </div>
                             </div>
                           </div>
                         )}
                        
                          {config.result_type === 'SESSION' ? (
                           <div className="bg-green-50 rounded-lg p-3">
                             <h4 className="font-medium text-green-900 mb-2">Session Info</h4>
                             <div className="space-y-1 text-green-800">
                               <div className="flex justify-between">
                                 <span>Average of Year:</span>
                                 <span className="font-medium">{(Number(config.first_test_max_score) + Number(config.second_test_max_score) + Number(config.third_test_max_score)) / 3}</span>
                               </div>
                               <div className="flex justify-between">
                                 <span>Total Year Score:</span>
                                 <span className="font-medium">{Number(config.first_test_max_score) + Number(config.second_test_max_score) + Number(config.third_test_max_score)}</span>
                               </div>
                             </div>
                           </div>
                         ) : (
                           /* Hide Exam & Weights for Nursery */
                           config.education_level !== 'NURSERY' && (
                             <div className="bg-green-50 rounded-lg p-3">
                               <h4 className="font-medium text-green-900 mb-2">Exam & Weights</h4>
                               <div className="space-y-1 text-green-800">
                                 <div className="flex justify-between">
                                   <span>Exam Score:</span>
                                   <span className="font-medium">{config.exam_max_score}</span>
                                 </div>
                                 <div className="flex justify-between">
                                   <span>CA Weight:</span>
                                   <span className="font-medium">{config.ca_weight_percentage}%</span>
                                 </div>
                                 <div className="flex justify-between">
                                   <span>Exam Weight:</span>
                                   <span className="font-medium">{config.exam_weight_percentage}%</span>
                                 </div>
                               </div>
                             </div>
                           )
                         )}
                      </div>
                      
                  {/* Footer - Hide Total CA Score for Nursery */}
                  {config.education_level !== 'NURSERY' && (
                  <div className="mt-4 pt-4 border-t border-gray-200">
                     <div className="flex items-center justify-between text-sm">
                         <span className="text-gray-600">
                         {config.result_type === 'SESSION' ? 'Total Year Score:' : 'Total CA Score:'}
                         </span>
                        <span className="font-semibold text-gray-900">{config.total_ca_max_score}</span>
                        </div>
                         {config.result_type === 'SESSION' && (
                           <p className="text-xs text-gray-500 mt-1">
                               Sum of all three terms (1st + 2nd + 3rd Term cumulative scores)
                           </p>
                        )}
                        </div>
                       )}
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>

        {/* Grading Systems Section */}
        <div className="bg-white rounded-2xl shadow-lg border border-gray-100 overflow-hidden">
          <div className="bg-gradient-to-r from-green-600 to-emerald-600 px-8 py-6">
            <div className="flex items-center justify-between">
              <div className="flex items-center space-x-4">
                <div className="bg-white/20 p-3 rounded-xl">
                  <Award className="h-6 w-6 text-white" />
                </div>
                <div>
                  <h2 className="text-xl font-bold text-white">Grading Systems</h2>
                  <p className="text-green-100 text-sm">Manage grading scales and grade definitions</p>
                </div>
              </div>
              <div className="flex items-center space-x-3">
                <span className="bg-white/20 text-white text-sm font-medium px-3 py-1 rounded-full">
                  {gradingSystems?.length || 0} Systems
                </span>
                <button
                  className="bg-white/20 hover:bg-white/30 text-white px-4 py-2 rounded-lg transition-all duration-200 flex items-center space-x-2"
                  onClick={() => toggleSection('grading-systems')}
                >
                  {activeSections.has('grading-systems') ? (
                    <>
                      <EyeOff className="h-4 w-4" />
                      <span>Hide</span>
                    </>
                  ) : (
                    <>
                      <Eye className="h-4 w-4" />
                      <span>Show</span>
                    </>
                  )}
                </button>
                <button
                  className="bg-white text-green-600 hover:bg-gray-50 px-4 py-2 rounded-lg transition-all duration-200 flex items-center space-x-2 font-medium"
                  onClick={() => setShowGradingSystemForm(true)}
                >
                  <Plus className="h-4 w-4" />
                  <span>Add New</span>
                </button>
              </div>
            </div>
          </div>
          
          {activeSections.has('grading-systems') && gradingSystems && (
            <div className="p-8">
              {gradingSystems.length === 0 ? (
                <div className="text-center py-12">
                  <div className="bg-gray-100 rounded-full p-6 w-20 h-20 mx-auto mb-4 flex items-center justify-center">
                    <Award className="h-10 w-10 text-gray-400" />
                  </div>
                  <h3 className="text-lg font-medium text-gray-900 mb-2">No Grading Systems</h3>
                  <p className="text-gray-600 mb-6">Get started by creating your first grading system</p>
                  <button
                    className="bg-green-600 hover:bg-green-700 text-white px-6 py-3 rounded-lg transition-all duration-200 flex items-center space-x-2 mx-auto"
                    onClick={() => setShowGradingSystemForm(true)}
                  >
                    <Plus className="h-4 w-4" />
                    <span>Create First System</span>
                  </button>
                </div>
              ) : (
                <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                  {gradingSystems.map((system) => (
                    <div key={system.id} className="bg-gradient-to-br from-gray-50 to-white rounded-xl border border-gray-200 p-6 hover:shadow-lg transition-all duration-200">
                      <div className="flex items-start justify-between mb-4">
                        <div className="flex-1">
                          <div className="flex items-center space-x-2 mb-2">
                            <h3 className="text-lg font-semibold text-gray-900">{system.name}</h3>
                            {system.is_active && (
                              <span className="bg-green-100 text-green-800 text-xs font-medium px-2 py-1 rounded-full flex items-center">
                                <CheckCircle className="h-3 w-3 mr-1" />
                                Active
                              </span>
                            )}
                          </div>
                          <p className="text-gray-600 text-sm mb-3">{system.description}</p>
                          <div className="flex items-center space-x-3">
                            <span className="bg-gray-100 text-gray-800 text-xs font-medium px-3 py-1 rounded-full">
                              {system.grading_type}
                            </span>
                            <span className="bg-blue-100 text-blue-800 text-xs font-medium px-3 py-1 rounded-full">
                              Pass: {system.pass_mark}%
                            </span>
                          </div>
                        </div>
                        <div className="flex items-center space-x-2">
                          <button
                            className="p-2 text-gray-600 hover:text-blue-600 hover:bg-blue-50 rounded-lg transition-all duration-200"
                            onClick={(e) => {
                              e.preventDefault();
                              e.stopPropagation();
                              console.log('Manage grades clicked for system:', system);
                              handleManageGrades(system);
                            }}
                            title="Manage Grades"
                          >
                           Manage Grades <Users className="h-4 w-4" />
                          </button>
                          <button
                            className="p-2 text-gray-600 hover:text-green-600 hover:bg-green-50 rounded-lg transition-all duration-200"
                            onClick={() => {
                              setGradingSystemForm({
                                id: system.id,
                                name: system.name,
                                grading_type: system.grading_type,
                                description: system.description,
                                min_score: system.min_score,
                                max_score: system.max_score,
                                pass_mark: system.pass_mark,
                                is_active: system.is_active
                              });
                              setShowGradingSystemForm(true);
                            }}
                            title="Edit System"
                          >
                            <Edit className="h-4 w-4" />
                          </button>
                          <button
                            className="p-2 text-gray-600 hover:text-red-600 hover:bg-red-50 rounded-lg transition-all duration-200"
                            onClick={() => handleDeleteGradingSystem(system.id)}
                            title="Delete System"
                          >
                            <Trash2 className="h-4 w-4" />
                          </button>
                        </div>
                      </div>
                      
                      <div className="grid grid-cols-2 gap-4 text-sm">
                        <div className="bg-green-50 rounded-lg p-3">
                          <h4 className="font-medium text-green-900 mb-2">Score Range</h4>
                          <div className="space-y-1 text-green-800">
                            <div className="flex justify-between">
                              <span>Min Score:</span>
                              <span className="font-medium">{system.min_score}</span>
                            </div>
                            <div className="flex justify-between">
                              <span>Max Score:</span>
                              <span className="font-medium">{system.max_score}</span>
                            </div>
                          </div>
                        </div>
                        
                        <div className="bg-blue-50 rounded-lg p-3">
                          <h4 className="font-medium text-blue-900 mb-2">Grades</h4>
                          <div className="text-blue-800">
                            <span className="font-medium">{grades.filter(g => g.grading_system === system.id).length} grades defined</span>
                          </div>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>

        {/* Assessment Types Section */}
        <div className="bg-white rounded-2xl shadow-lg border border-gray-100 overflow-hidden">
          <div className="bg-gradient-to-r from-purple-600 to-pink-600 px-8 py-6">
            <div className="flex items-center justify-between">
              <div className="flex items-center space-x-4">
                <div className="bg-white/20 p-3 rounded-xl">
                  <BookOpen className="h-6 w-6 text-white" />
                </div>
                <div>
                  <h2 className="text-xl font-bold text-white">Assessment Types</h2>
                  <p className="text-purple-100 text-sm">Define different types of assessments and their weights</p>
                </div>
              </div>
              <div className="flex items-center space-x-3">
                <span className="bg-white/20 text-white text-sm font-medium px-3 py-1 rounded-full">
                  {assessmentTypes?.length || 0} Types
                </span>
                <button
                  className="bg-white/20 hover:bg-white/30 text-white px-4 py-2 rounded-lg transition-all duration-200 flex items-center space-x-2"
                  onClick={() => toggleSection('assessment-types')}
                >
                  {activeSections.has('assessment-types') ? (
                    <>
                      <EyeOff className="h-4 w-4" />
                      <span>Hide</span>
                    </>
                  ) : (
                    <>
                      <Eye className="h-4 w-4" />
                      <span>Show</span>
                    </>
                  )}
                </button>
                <button
                  className="bg-white text-purple-600 hover:bg-gray-50 px-4 py-2 rounded-lg transition-all duration-200 flex items-center space-x-2 font-medium"
                  onClick={() => setShowAssessmentTypeForm(true)}
                >
                  <Plus className="h-4 w-4" />
                  <span>Add New</span>
                </button>
              </div>
            </div>
          </div>
          
          {activeSections.has('assessment-types') && assessmentTypes && (
            <div className="p-8">
              {assessmentTypes.length === 0 ? (
                <div className="text-center py-12">
                  <div className="bg-gray-100 rounded-full p-6 w-20 h-20 mx-auto mb-4 flex items-center justify-center">
                    <BookOpen className="h-10 w-10 text-gray-400" />
                  </div>
                  <h3 className="text-lg font-medium text-gray-900 mb-2">No Assessment Types</h3>
                  <p className="text-gray-600 mb-6">Get started by creating your first assessment type</p>
                  <button
                    className="bg-purple-600 hover:bg-purple-700 text-white px-6 py-3 rounded-lg transition-all duration-200 flex items-center space-x-2 mx-auto"
                    onClick={() => setShowAssessmentTypeForm(true)}
                  >
                    <Plus className="h-4 w-4" />
                    <span>Create First Type</span>
                  </button>
                </div>
              ) : (
                <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                  {assessmentTypes.map((type) => (
                    <div key={type.id} className="bg-gradient-to-br from-gray-50 to-white rounded-xl border border-gray-200 p-6 hover:shadow-lg transition-all duration-200">
                      <div className="flex items-start justify-between mb-4">
                        <div className="flex-1">
                          <div className="flex items-center space-x-2 mb-2">
                            <h3 className="text-lg font-semibold text-gray-900">{type.name}</h3>
                            <span className="bg-purple-100 text-purple-800 text-xs font-medium px-2 py-1 rounded-full">
                              {type.code}
                            </span>
                          </div>
                          <p className="text-gray-600 text-sm mb-3">{type.description}</p>
                          <div className="flex items-center space-x-3">
                            <span className="bg-orange-100 text-orange-800 text-xs font-medium px-3 py-1 rounded-full">
                              Weight: {type.weight_percentage}%
                            </span>
                            {type.is_active && (
                              <span className="bg-green-100 text-green-800 text-xs font-medium px-3 py-1 rounded-full flex items-center">
                                <CheckCircle className="h-3 w-3 mr-1" />
                                Active
                              </span>
                            )}
                          </div>
                        </div>
                        <div className="flex items-center space-x-2">
                          <button
                            className="p-2 text-gray-600 hover:text-purple-600 hover:bg-purple-50 rounded-lg transition-all duration-200"
                           onClick={() => {
                              setAssessmentTypeForm({
                                id: type.id,
                                name: type.name,
                                code: type.code,
                                description: type.description,
                                education_level: type.education_level,
                                max_score: type.max_score,
                                weight_percentage: type.weight_percentage,
                                is_active: type.is_active
                              });
                              setShowAssessmentTypeForm(true);
                            }}
                            title="Edit Type"
                          >
                            <Edit className="h-4 w-4" />
                          </button>
                          <button
                            className="p-2 text-gray-600 hover:text-red-600 hover:bg-red-50 rounded-lg transition-all duration-200"
                            onClick={() => handleDeleteAssessmentType(type.id)}
                            title="Delete Type"
                          >
                            <Trash2 className="h-4 w-4" />
                          </button>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>

        {/* Exam Sessions Section */}
        <div className="bg-white rounded-2xl shadow-lg border border-gray-100 overflow-hidden">
          <div className="bg-gradient-to-r from-indigo-600 to-blue-600 px-8 py-6">
            <div className="flex items-center justify-between">
              <div className="flex items-center space-x-4">
                <div className="bg-white/20 p-3 rounded-xl">
                  <Calendar className="h-6 w-6 text-white" />
                </div>
                <div>
                  <h2 className="text-xl font-bold text-white">Exam Sessions</h2>
                  <p className="text-indigo-100 text-sm">Schedule and manage examination periods</p>
                </div>
              </div>
              <div className="flex items-center space-x-3">
                <span className="bg-white/20 text-white text-sm font-medium px-3 py-1 rounded-full">
                  {examSessions?.length || 0} Sessions
                </span>
                <button
                  className="bg-white/20 hover:bg-white/30 text-white px-4 py-2 rounded-lg transition-all duration-200 flex items-center space-x-2"
                  onClick={() => toggleSection('exam-sessions')}
                >
                  {activeSections.has('exam-sessions') ? (
                    <>
                      <EyeOff className="h-4 w-4" />
                      <span>Hide</span>
                    </>
                  ) : (
                    <>
                      <Eye className="h-4 w-4" />
                      <span>Show</span>
                    </>
                  )}
                </button>
                <button
                  className="bg-white text-indigo-600 hover:bg-gray-50 px-4 py-2 rounded-lg transition-all duration-200 flex items-center space-x-2 font-medium"
                  onClick={() => setShowExamSessionForm(true)}
                >
                  <Plus className="h-4 w-4" />
                  <span>Add New</span>
                </button>
              </div>
            </div>
          </div>
          
          {activeSections.has('exam-sessions') && examSessions && (
            <div className="p-8">
              {examSessions.length === 0 ? (
                <div className="text-center py-12">
                  <div className="bg-gray-100 rounded-full p-6 w-20 h-20 mx-auto mb-4 flex items-center justify-center">
                    <Calendar className="h-10 w-10 text-gray-400" />
                  </div>
                  <h3 className="text-lg font-medium text-gray-900 mb-2">No Exam Sessions</h3>
                  <p className="text-gray-600 mb-6">Get started by creating your first exam session</p>
                  <button
                    className="bg-indigo-600 hover:bg-indigo-700 text-white px-6 py-3 rounded-lg transition-all duration-200 flex items-center space-x-2 mx-auto"
                    onClick={() => setShowExamSessionForm(true)}
                  >
                    <Plus className="h-4 w-4" />
                    <span>Create First Session</span>
                  </button>
                </div>
              ) : (
                <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                  {examSessions.map((session) => (
                    <div key={session.id} className="bg-gradient-to-br from-gray-50 to-white rounded-xl border border-gray-200 p-6 hover:shadow-lg transition-all duration-200">
                      <div className="flex items-start justify-between mb-4">
                        <div className="flex-1">
                            <div className="flex items-center space-x-2 mb-2">
                              <h3 className="text-lg font-semibold text-gray-900">{session.name}</h3>
                              {session.is_published && (
                                <span className="bg-green-100 text-green-800 text-xs font-medium px-2 py-1 rounded-full flex items-center">
                                  <CheckCircle className="h-3 w-3 mr-1" />
                                  Published
                                </span>
                              )}
                            </div>
                            <p className="text-gray-600 text-sm mb-3">
                              {/* {typeof session.academic_session === 'object'
                                ? (session.academic_session as AcademicSession).name ?? 'No session'
                                : (
                                    // try to resolve id/string to a name from loaded academicSessions,
                                    // otherwise show the raw value or fallback to 'No session'
                                    academicSessions.find(s => s.id === session.academic_session)?.name
                                    ?? (session.academic_session !== undefined && session.academic_session !== null ? String(session.academic_session) : 'No session')
                                  )
                              } */}

                              {(() => {
            // If it's an object with name property
            if (typeof session.academic_session === 'object' && session.academic_session?.name) {
              return session.academic_session.name;
            }
            
            // If it's an ID (number or string), look it up
            if (session.academic_session) {
              const foundSession = academicSessions.find(
                s => String(s.id) === String(session.academic_session)
              );
              return foundSession?.name || 'Unknown session';
            }
            
            // Fallback
            return 'No session';
          })()}
                            </p>
                            <div className="flex items-center space-x-3">
                              <span className="bg-indigo-100 text-indigo-800 text-xs font-medium px-3 py-1 rounded-full">
                                {session.exam_type}
                              </span>
                              <span className="bg-blue-100 text-blue-800 text-xs font-medium px-3 py-1 rounded-full">
                                {session.term}
                              </span>
                            </div>
                          </div>
                        <div className="flex items-center space-x-2">
                          <button
                            className="p-2 text-gray-600 hover:text-indigo-600 hover:bg-indigo-50 rounded-lg transition-all duration-200"
                            onClick={() => {
                              setExamSessionForm({
                                id: session.id,
                                name: session.name,
                                exam_type: session.exam_type,
                                term: session.term,
                                academic_session: typeof  session.academic_session === 'object'
                                ? session.academic_session.id
                                : session.academic_session || '',
                                start_date: session.start_date,
                                end_date: session.end_date,
                                result_release_date: session.result_release_date,
                                is_published: session.is_published,
                                is_active: session.is_active
                              });
                              setShowExamSessionForm(true);
                            }}
                            title="Edit Session"
                          >
                            <Edit className="h-4 w-4" />
                          </button>
                          <button
                            className="p-2 text-gray-600 hover:text-red-600 hover:bg-red-50 rounded-lg transition-all duration-200"
                            onClick={() => handleDeleteExamSession(session.id)}
                            title="Delete Session"
                          >
                            <Trash2 className="h-4 w-4" />
                          </button>
                        </div>
                      </div>
                      
                      <div className="grid grid-cols-2 gap-4 text-sm">
                        <div className="bg-indigo-50 rounded-lg p-3">
                          <h4 className="font-medium text-indigo-900 mb-2">Start Date</h4>
                          <div className="text-indigo-800">
                            <span className="font-medium">{new Date(session.start_date).toLocaleDateString()}</span>
                          </div>
                        </div>
                        
                        <div className="bg-blue-50 rounded-lg p-3">
                          <h4 className="font-medium text-blue-900 mb-2">End Date</h4>
                          <div className="text-blue-800">
                            <span className="font-medium">{new Date(session.end_date).toLocaleDateString()}</span>
                          </div>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>
      </div>

      {/* Enhanced Scoring Configuration Form Modal */}
      {showScoringConfigForm && (
        <>
          {loading && (
            <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
              <div className="bg-white rounded-lg p-6 text-center">
                <div className="animate-spin rounded-full h-8 w-8 border-2 border-blue-600 border-t-transparent mx-auto mb-4"></div>
                <p className="text-gray-700">Loading configuration data...</p>
              </div>
            </div>
          )}
          {!loading && (
            <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
              <div className="bg-white rounded-2xl shadow-2xl w-full max-w-4xl max-h-[90vh] overflow-y-auto">
                <div className="bg-gradient-to-r from-blue-600 to-indigo-600 px-8 py-6 rounded-t-2xl">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center space-x-4">
                      <div className="bg-white/20 p-3 rounded-xl">
                        <Calculator className="h-6 w-6 text-white" />
                      </div>
                      <div>
                        <h3 className="text-xl font-bold text-white">
                          {scoringConfigForm.id ? 'Edit' : 'Create'} Scoring Configuration
                        </h3>
                        <p className="text-blue-100 text-sm">Configure test and exam scoring parameters</p>
                      </div>
                    </div>
                    <button
                      className="bg-white/20 hover:bg-white/30 text-white p-2 rounded-lg transition-all duration-200"
                      onClick={() => setShowScoringConfigForm(false)}
                    >
                      <X className="h-5 w-5" />
                    </button>
                  </div>
                </div>

                <div className="p-8">
                  <div className="space-y-6">
                    {/* Basic Information */}
                    <div className="bg-blue-50 rounded-xl p-6">
                      <h4 className="text-lg font-semibold text-blue-900 mb-4 flex items-center">
                        <Info className="h-5 w-5 mr-2" />
                        Basic Information
                      </h4>
                                             <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                         <div>
                           <label className="block text-sm font-medium text-gray-700 mb-2">
                             Configuration Name
                           </label>
                           <input
                             type="text"
                             className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent transition-all duration-200"
                             value={scoringConfigForm.name}
                             onChange={(e) => setScoringConfigForm({
                               ...scoringConfigForm,
                               name: e.target.value
                             })}
                             placeholder="Enter configuration name"
                           />
                         </div>
                         <div>
                           <label className="block text-sm font-medium text-gray-700 mb-2">
                             Education Level
                           </label>
                           <select
                             className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent transition-all duration-200"
                             value={scoringConfigForm.education_level}
                             onChange={(e) => setScoringConfigForm({
                               ...scoringConfigForm,
                               education_level: e.target.value as any
                             })}
                           >
                             <option value="NURSERY">Nursery</option>
                             <option value="PRIMARY">Primary</option>
                             <option value="JUNIOR_SECONDARY">Junior Secondary</option>
                             <option value="SENIOR_SECONDARY">Senior Secondary</option>
                           </select>
                         </div>
                       </div>
                       {scoringConfigForm.education_level === 'SENIOR_SECONDARY' && (
                         <div className="mt-6">
                           <label className="block text-sm font-medium text-gray-700 mb-2">
                             Result Type
                           </label>
                           <select
                             className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent transition-all duration-200"
                             value={scoringConfigForm.result_type || 'TERMLY'}
                             onChange={(e) => setScoringConfigForm({
                               ...scoringConfigForm,
                               result_type: e.target.value as 'TERMLY' | 'SESSION'
                             })}
                           >
                             <option value="TERMLY">Termly Result</option>
                             <option value="SESSION">Session Result</option>
                           </select>
                         </div>
                       )}
                      <div className="mt-6">
                        <label className="block text-sm font-medium text-gray-700 mb-2">
                          Description
                        </label>
                        <textarea
                          className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent transition-all duration-200"
                          rows={3}
                          value={scoringConfigForm.description}
                          onChange={(e) => setScoringConfigForm({
                            ...scoringConfigForm,
                            description: e.target.value
                          })}
                          placeholder="Describe the scoring system and its purpose"
                        />
                      </div>
                    </div>

                                         {/* Score Configuration - Dynamic based on Education Level */}
                     <div className="bg-green-50 rounded-xl p-6">
                       <h4 className="text-lg font-semibold text-green-900 mb-4 flex items-center">
                         <BookOpen className="h-5 w-5 mr-2" />
                         {scoringConfigForm.education_level === 'SENIOR_SECONDARY' && scoringConfigForm.result_type === 'SESSION' 
                           ? 'Term Score Configuration' 
                           : scoringConfigForm.education_level === 'SENIOR_SECONDARY' 
                           ? 'Test Score Configuration'
                           : scoringConfigForm.education_level === 'NURSERY'
                           ? 'Nursery Score Configuration'
                           : 'Continuous Assessment Configuration'}
                       </h4>
                       
                       {/* Senior Secondary Configuration */}
                       {(scoringConfigForm.education_level === 'SENIOR_SECONDARY') && (
                         <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                           <div>
                             <label className="block text-sm font-medium text-gray-700 mb-2">
                               {scoringConfigForm.result_type === 'SESSION' ? '1st Term Cumulative Score' : '1st Test Maximum Score'}
                             </label>
                             <input
                               type="number"
                               className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-green-500 focus:border-transparent transition-all duration-200"
                               value={scoringConfigForm.first_test_max_score}
                               onChange={(e) => setScoringConfigForm({
                                 ...scoringConfigForm,
                                 first_test_max_score: parseFloat(e.target.value) || 0
                               })}
                             />
                             {scoringConfigForm.result_type === 'SESSION' && (
                               <p className="text-xs text-gray-500 mt-1">
                                 Includes: Tests + Exam for 1st Term
                               </p>
                             )}
                           </div>
                           <div>
                             <label className="block text-sm font-medium text-gray-700 mb-2">
                               {scoringConfigForm.result_type === 'SESSION' ? '2nd Term Cumulative Score' : '2nd Test Maximum Score'}
                             </label>
                             <input
                               type="number"
                               className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-green-500 focus:border-transparent transition-all duration-200"
                               value={scoringConfigForm.second_test_max_score}
                               onChange={(e) => setScoringConfigForm({
                                 ...scoringConfigForm,
                                 second_test_max_score: parseFloat(e.target.value) || 0
                               })}
                             />
                             {scoringConfigForm.result_type === 'SESSION' && (
                               <p className="text-xs text-gray-500 mt-1">
                                 Includes: Tests + Exam for 2nd Term
                               </p>
                             )}
                           </div>
                           <div>
                             <label className="block text-sm font-medium text-gray-700 mb-2">
                               {scoringConfigForm.result_type === 'SESSION' ? '3rd Term Cumulative Score' : '3rd Test Maximum Score'}
                             </label>
                             <input
                               type="number"
                               className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-green-500 focus:border-transparent transition-all duration-200"
                               value={scoringConfigForm.third_test_max_score}
                               onChange={(e) => setScoringConfigForm({
                                 ...scoringConfigForm,
                                 third_test_max_score: parseFloat(e.target.value) || 0
                               })}
                             />
                             {scoringConfigForm.result_type === 'SESSION' && (
                               <p className="text-xs text-gray-500 mt-1">
                                 Includes: Tests + Exam for 3rd Term
                               </p>
                             )}
                           </div>
                         </div>
                       )}
                       
                       {/* Nursery Configuration */}
                       {(scoringConfigForm.education_level === 'NURSERY') && (
                         <div className="grid grid-cols-1 gap-6">
                           <div>
                             <label className="block text-sm font-medium text-gray-700 mb-2">
                               Max Mark Obtainable
                             </label>
                             <input
                               type="number"
                               className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-green-500 focus:border-transparent transition-all duration-200"
                               value={scoringConfigForm.total_max_score || 100}
                               onChange={(e) => setScoringConfigForm({
                                 ...scoringConfigForm,
                                 total_max_score: parseFloat(e.target.value) || 0
                               })}
                               placeholder="100"
                             />
                             <p className="text-xs text-gray-500 mt-1">
                               Maximum marks obtainable for nursery activities and assessments
                             </p>
                           </div>
                         </div>
                       )}
                       
                                               {/* Junior Secondary and Primary Configuration */}
                        {(scoringConfigForm.education_level === 'JUNIOR_SECONDARY' || scoringConfigForm.education_level === 'PRIMARY') && (
                          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                            <div>
                              <label className="block text-sm font-medium text-gray-700 mb-2">
                                CA Maximum Score
                              </label>
                              <input
                                type="number"
                                className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-green-500 focus:border-transparent transition-all duration-200"
                                value={scoringConfigForm.continuous_assessment_max_score || 15}
                                onChange={(e) => setScoringConfigForm({
                                  ...scoringConfigForm,
                                  continuous_assessment_max_score: parseFloat(e.target.value) || 0
                                })}
                                placeholder="15"
                              />
                            </div>
                            <div>
                              <label className="block text-sm font-medium text-gray-700 mb-2">
                                Take Home Test Maximum Score
                              </label>
                              <input
                                type="number"
                                className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-green-500 focus:border-transparent transition-all duration-200"
                                value={scoringConfigForm.take_home_test_max_score || 5}
                                onChange={(e) => setScoringConfigForm({
                                  ...scoringConfigForm,
                                  take_home_test_max_score: parseFloat(e.target.value) || 0
                                })}
                                placeholder="5"
                              />
                            </div>
                            <div>
                              <label className="block text-sm font-medium text-gray-700 mb-2">
                                Appearance Maximum Score
                              </label>
                              <input
                                type="number"
                                className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-green-500 focus:border-transparent transition-all duration-200"
                                value={scoringConfigForm.appearance_max_score || 5}
                                onChange={(e) => setScoringConfigForm({
                                  ...scoringConfigForm,
                                  appearance_max_score: parseFloat(e.target.value) || 0
                                })}
                                placeholder="5"
                              />
                            </div>
                            <div>
                              <label className="block text-sm font-medium text-gray-700 mb-2">
                                Practical Maximum Score
                              </label>
                              <input
                                type="number"
                                className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-green-500 focus:border-transparent transition-all duration-200"
                                value={scoringConfigForm.practical_max_score || 5}
                                onChange={(e) => setScoringConfigForm({
                                  ...scoringConfigForm,
                                  practical_max_score: parseFloat(e.target.value) || 0
                                })}
                                placeholder="5"
                              />
                            </div>
                            <div>
                              <label className="block text-sm font-medium text-gray-700 mb-2">
                                Project Maximum Score
                              </label>
                              <input
                                type="number"
                                className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-green-500 focus:border-transparent transition-all duration-200"
                                value={scoringConfigForm.project_max_score || 5}
                                onChange={(e) => setScoringConfigForm({
                                  ...scoringConfigForm,
                                  project_max_score: parseFloat(e.target.value) || 0
                                })}
                                placeholder="5"
                              />
                            </div>
                            <div>
                              <label className="block text-sm font-medium text-gray-700 mb-2">
                                Note Copying Maximum Score
                              </label>
                              <input
                                type="number"
                                className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-green-500 focus:border-transparent transition-all duration-200"
                                value={scoringConfigForm.note_copying_max_score || 5}
                                onChange={(e) => setScoringConfigForm({
                                  ...scoringConfigForm,
                                  note_copying_max_score: parseFloat(e.target.value) || 0
                                })}
                                placeholder="5"
                              />
                            </div>
                          </div>
                        )}
                       
                       {/* Total CA Score Display - Hide for Nursery */}
                       {scoringConfigForm.education_level !== 'NURSERY' && (
                         <div className="mt-4 p-4 bg-green-100 rounded-lg">
                           <div className="flex items-center justify-between text-green-800">
                             <span className="font-medium">
                               {scoringConfigForm.education_level === 'SENIOR_SECONDARY' && scoringConfigForm.result_type === 'SESSION' 
                                 ? 'Total Year Score:' 
                                 : 'Total CA Score:'}
                             </span>
                             <span className="text-xl font-bold">
                               {scoringConfigForm.education_level === 'SENIOR_SECONDARY' 
                                 ? calculateTotalCA() 
                                 : calculateTotalCAPrimaryJunior()}
                             </span>
                           </div>
                           {scoringConfigForm.education_level === 'SENIOR_SECONDARY' && scoringConfigForm.result_type === 'SESSION' && (
                             <p className="text-xs text-green-700 mt-1">
                               Sum of all three terms (1st + 2nd + 3rd Term scores)
                             </p>
                           )}
                           {(scoringConfigForm.education_level === 'JUNIOR_SECONDARY' || scoringConfigForm.education_level === 'PRIMARY') && (
                             <p className="text-xs text-green-700 mt-1">
                               Sum of CA + Take Home Test + Appearance + Practical + Project + Note Copying
                             </p>
                           )}
                         </div>
                       )}
                     </div>

                                         {/* Exam Configuration - Only for TERMLY */}
                     {scoringConfigForm.result_type === 'TERMLY' && (
                       <div className="bg-purple-50 rounded-xl p-6">
                         <h4 className="text-lg font-semibold text-purple-900 mb-4 flex items-center">
                           <Award className="h-5 w-5 mr-2" />
                           Exam Configuration
                         </h4>
                         <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                           <div>
                             <label className="block text-sm font-medium text-gray-700 mb-2">
                               Exam Maximum Score
                             </label>
                             <input
                               type="number"
                               className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-purple-500 focus:border-transparent transition-all duration-200"
                               value={scoringConfigForm.exam_max_score}
                               onChange={(e) => setScoringConfigForm({
                                 ...scoringConfigForm,
                                 exam_max_score: parseFloat(e.target.value) || 0
                               })}
                             />
                           </div>
                           <div>
                             <label className="block text-sm font-medium text-gray-700 mb-2">
                               Total Maximum Score
                             </label>
                             <input
                               type="number"
                               className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-purple-500 focus:border-transparent transition-all duration-200"
                               value={scoringConfigForm.total_max_score}
                               onChange={(e) => setScoringConfigForm({
                                 ...scoringConfigForm,
                                 total_max_score: parseFloat(e.target.value) || 0
                               })}
                             />
                           </div>
                         </div>
                       </div>
                     )}

                                         {/* Weight Configuration - Only for TERMLY and not Nursery */}
                     {scoringConfigForm.result_type === 'TERMLY' && scoringConfigForm.education_level !== 'NURSERY' && (
                       <div className="bg-orange-50 rounded-xl p-6">
                         <h4 className="text-lg font-semibold text-orange-900 mb-4 flex items-center">
                           <Calculator className="h-5 w-5 mr-2" />
                           Weight Configuration
                         </h4>
                         <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                           <div>
                             <label className="block text-sm font-medium text-gray-700 mb-2">
                               CA Weight Percentage
                             </label>
                             <input
                               type="number"
                               className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-orange-500 focus:border-transparent transition-all duration-200"
                               value={scoringConfigForm.ca_weight_percentage}
                               onChange={(e) => setScoringConfigForm({
                                 ...scoringConfigForm,
                                 ca_weight_percentage: parseFloat(e.target.value) || 0
                               })}
                             />
                           </div>
                           <div>
                             <label className="block text-sm font-medium text-gray-700 mb-2">
                               Exam Weight Percentage
                             </label>
                             <input
                               type="number"
                               className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-orange-500 focus:border-transparent transition-all duration-200"
                               value={scoringConfigForm.exam_weight_percentage}
                               onChange={(e) => setScoringConfigForm({
                                 ...scoringConfigForm,
                                 exam_weight_percentage: parseFloat(e.target.value) || 0
                               })}
                             />
                           </div>
                         </div>
                         {!validateWeightPercentages() && (
                           <div className="mt-4 p-4 bg-red-100 rounded-lg">
                             <div className="flex items-center text-red-800">
                               <AlertCircle className="h-5 w-5 mr-2" />
                               <span className="font-medium">Weight percentages must sum to 100%</span>
                             </div>
                           </div>
                         )}
                       </div>
                     )}

                                           {/* Session Configuration - Only for SESSION */}
                      {scoringConfigForm.result_type === 'SESSION' && (
                        <div className="bg-blue-50 rounded-xl p-6">
                          <h4 className="text-lg font-semibold text-blue-900 mb-4 flex items-center">
                            <Calculator className="h-5 w-5 mr-2" />
                            Session Configuration
                          </h4>
                          <div className="p-4 bg-blue-100 rounded-lg">
                            <div className="flex items-start text-blue-800">
                              <Info className="h-5 w-5 mr-2 mt-0.5" />
                              <div>
                                <p className="font-medium">Session Result Structure:</p>
                                <p className="text-sm mt-2 space-y-1">
                                  • <strong>1st Term Score:</strong> Cumulative score for 1st term (Tests + Exam for that term)<br/>
                                  • <strong>2nd Term Score:</strong> Cumulative score for 2nd term (Tests + Exam for that term)<br/>
                                  • <strong>3rd Term Score:</strong> Cumulative score for 3rd term (Tests + Exam for that term)<br/>
                                  • <strong>Average of Year:</strong> (1st Term + 2nd Term + 3rd Term) ÷ 3<br/>
                                  • <strong>No separate exam configuration</strong> - each term is self-contained<br/>
                                  • <strong>No weight percentages</strong> - session is a summary of the academic year
                                </p>
                              </div>
                            </div>
                          </div>
                        </div>
                      )}

                    {/* Status Configuration */}
                    <div className="bg-gray-50 rounded-xl p-6">
                      <h4 className="text-lg font-semibold text-gray-900 mb-4 flex items-center">
                        <Settings className="h-5 w-5 mr-2" />
                        Status Configuration
                      </h4>
                      <div className="flex items-center space-x-8">
                        <div className="flex items-center space-x-3">
                          <input
                            type="checkbox"
                            id="config-active"
                            checked={scoringConfigForm.is_active}
                            onChange={(e) => setScoringConfigForm({
                              ...scoringConfigForm,
                              is_active: e.target.checked
                            })}
                            className="w-5 h-5 text-blue-600 border-gray-300 rounded focus:ring-blue-500"
                          />
                          <label htmlFor="config-active" className="text-sm font-medium text-gray-700">
                            Active Configuration
                          </label>
                        </div>
                        <div className="flex items-center space-x-3">
                          <input
                            type="checkbox"
                            id="config-default"
                            checked={scoringConfigForm.is_default}
                            onChange={(e) => setScoringConfigForm({
                              ...scoringConfigForm,
                              is_default: e.target.checked
                            })}
                            className="w-5 h-5 text-blue-600 border-gray-300 rounded focus:ring-blue-500"
                          />
                          <label htmlFor="config-default" className="text-sm font-medium text-gray-700">
                            Set as Default
                          </label>
                        </div>
                        {scoringConfigForm.is_default && scoringConfigurations && scoringConfigurations.length > 0 && (
                          <div className="mt-2 p-3 bg-yellow-50 border border-yellow-200 rounded-lg">
                            <div className="flex items-start text-yellow-800">
                              <AlertCircle className="h-4 w-4 mr-2 mt-0.5 flex-shrink-0" />
                              <div className="text-sm">
                                <p className="font-medium">Default Configuration Warning</p>
                                <p className="mt-1">
                                  There's already a default configuration for {scoringConfigForm.education_level.replace('_', ' ').toLowerCase()}. 
                                  Setting this as default will automatically unset the existing default configuration.
                                </p>
                              </div>
                            </div>
                          </div>
                        )}
                      </div>
                    </div>

                    {/* Action Buttons */}
                    <div className="flex justify-end space-x-4 pt-6 border-t border-gray-200">
                      <button
                        className="px-6 py-3 border border-gray-300 rounded-lg hover:bg-gray-50 transition-all duration-200 font-medium"
                        onClick={() => setShowScoringConfigForm(false)}
                      >
                        Cancel
                      </button>
                      <button
                        className="px-6 py-3 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed transition-all duration-200 font-medium flex items-center space-x-2"
                        onClick={() => {
                          console.log('Button clicked!', {
                            hasId: !!scoringConfigForm.id,
                            id: scoringConfigForm.id,
                            formData: scoringConfigForm
                          });
                          if (scoringConfigForm.id) {
                            console.log('Calling handleUpdateScoringConfig with id:', scoringConfigForm.id);
                            handleUpdateScoringConfig(scoringConfigForm.id);
                          } else {
                            console.log('Calling handleCreateScoringConfig');
                            handleCreateScoringConfig();
                          }
                        }}
                        disabled={saving || loading}
                      >
                        {saving ? (
                          <>
                            <div className="animate-spin rounded-full h-4 w-4 border-2 border-white border-t-transparent"></div>
                            <span>Saving...</span>
                          </>
                        ) : (
                          <>
                            <Save className="h-4 w-4" />
                            <span>{scoringConfigForm.id ? 'Update' : 'Create'} Configuration</span>
                          </>
                        )}
                      </button>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          )}
        </>
      )}

      {/* Grading System Form Modal */}
      {showGradingSystemForm && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-2xl max-h-[90vh] overflow-y-auto">
            <div className="bg-gradient-to-r from-green-600 to-emerald-600 px-8 py-6 rounded-t-2xl">
              <div className="flex items-center justify-between">
                <div className="flex items-center space-x-4">
                  <div className="bg-white/20 p-3 rounded-xl">
                    <Award className="h-6 w-6 text-white" />
                  </div>
                  <div>
                    <h3 className="text-xl font-bold text-white">
                      {gradingSystemForm.id ? 'Edit' : 'Create'} Grading System
                    </h3>
                    <p className="text-green-100 text-sm">Configure grading parameters and rules</p>
                  </div>
                </div>
                <button
                  className="bg-white/20 hover:bg-white/30 text-white p-2 rounded-lg transition-all duration-200"
                  onClick={() => setShowGradingSystemForm(false)}
                >
                  <X className="h-5 w-5" />
                </button>
              </div>
            </div>

            <div className="p-8 space-y-6">
              {/* Basic Information */}
              <div className="space-y-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">Name</label>
                  <input
                    type="text"
                    value={gradingSystemForm.name}
                    onChange={(e) => setGradingSystemForm({...gradingSystemForm, name: e.target.value})}
                    className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-green-500 focus:border-transparent"
                    placeholder="Enter grading system name"
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">Description</label>
                  <textarea
                    value={gradingSystemForm.description}
                    onChange={(e) => setGradingSystemForm({...gradingSystemForm, description: e.target.value})}
                    className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-green-500 focus:border-transparent"
                    rows={3}
                    placeholder="Enter description"
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">Grading Type</label>
                  <select
                    value={gradingSystemForm.grading_type}
                    onChange={(e) => setGradingSystemForm({...gradingSystemForm, grading_type: e.target.value as any})}
                    className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-green-500 focus:border-transparent"
                  >
                    <option value="PERCENTAGE">Percentage</option>
                    <option value="POINTS">Points</option>
                    <option value="LETTER">Letter Grades</option>
                    <option value="PASS_FAIL">Pass/Fail</option>
                  </select>
                </div>
              </div>

              {/* Score Configuration */}
              <div className="bg-gray-50 rounded-xl p-6">
                <h4 className="text-lg font-semibold text-gray-900 mb-4 flex items-center">
                  <Calculator className="h-5 w-5 mr-2" />
                  Score Configuration
                </h4>
                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">Minimum Score</label>
                    <input
                      type="number"
                      value={gradingSystemForm.min_score}
                      onChange={(e) => setGradingSystemForm({...gradingSystemForm, min_score: Number(e.target.value)})}
                      className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-green-500 focus:border-transparent"
                      min="0"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">Maximum Score</label>
                    <input
                      type="number"
                      value={gradingSystemForm.max_score}
                      onChange={(e) => setGradingSystemForm({...gradingSystemForm, max_score: Number(e.target.value)})}
                      className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-green-500 focus:border-transparent"
                      min="0"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">Pass Mark</label>
                    <input
                      type="number"
                      value={gradingSystemForm.pass_mark}
                      onChange={(e) => setGradingSystemForm({...gradingSystemForm, pass_mark: Number(e.target.value)})}
                      className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-green-500 focus:border-transparent"
                      min="0"
                    />
                  </div>
                </div>
              </div>

              {/* Status */}
              <div className="bg-gray-50 rounded-xl p-6">
                <h4 className="text-lg font-semibold text-gray-900 mb-4 flex items-center">
                  <Settings className="h-5 w-5 mr-2" />
                  Status
                </h4>
                <div className="flex items-center space-x-3">
                  <input
                    type="checkbox"
                    id="grading-active"
                    checked={gradingSystemForm.is_active}
                    onChange={(e) => setGradingSystemForm({...gradingSystemForm, is_active: e.target.checked})}
                    className="w-5 h-5 text-green-600 border-gray-300 rounded focus:ring-green-500"
                  />
                  <label htmlFor="grading-active" className="text-sm font-medium text-gray-700">
                    Active Grading System
                  </label>
                </div>
              </div>

              {/* Action Buttons */}
              <div className="flex justify-end space-x-4 pt-6 border-t border-gray-200">
                <button
                  className="px-6 py-3 border border-gray-300 rounded-lg hover:bg-gray-50 transition-all duration-200 font-medium"
                  onClick={() => setShowGradingSystemForm(false)}
                >
                  Cancel
                </button>
                <button
                  className="px-6 py-3 bg-green-600 text-white rounded-lg hover:bg-green-700 disabled:opacity-50 disabled:cursor-not-allowed transition-all duration-200 font-medium flex items-center space-x-2"
                  onClick={() => {
                    if (gradingSystemForm.id) {
                      handleUpdateGradingSystem(gradingSystemForm.id);
                    } else {
                      handleCreateGradingSystem();
                    }
                  }}
                  disabled={saving}
                >
                  {saving ? (
                    <>
                      <div className="animate-spin rounded-full h-4 w-4 border-2 border-white border-t-transparent"></div>
                      <span>Saving...</span>
                    </>
                  ) : (
                    <>
                      <Save className="h-4 w-4" />
                      <span>{gradingSystemForm.id ? 'Update' : 'Create'} Grading System</span>
                    </>
                  )}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Assessment Type Form Modal */}
      {showAssessmentTypeForm && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-2xl max-h-[90vh] overflow-y-auto">
            <div className="bg-gradient-to-r from-purple-600 to-pink-600 px-8 py-6 rounded-t-2xl">
              <div className="flex items-center justify-between">
                <div className="flex items-center space-x-4">
                  <div className="bg-white/20 p-3 rounded-xl">
                    <BookOpen className="h-6 w-6 text-white" />
                  </div>
                  <div>
                    <h3 className="text-xl font-bold text-white">
                      {assessmentTypeForm.id ? 'Edit' : 'Create'} Assessment Type
                    </h3>
                    <p className="text-purple-100 text-sm">Configure assessment type and weight</p>
                  </div>
                </div>
                <button
                  className="bg-white/20 hover:bg-white/30 text-white p-2 rounded-lg transition-all duration-200"
                  onClick={() => setShowAssessmentTypeForm(false)}
                >
                  <X className="h-5 w-5" />
                </button>
              </div>
            </div>

            <div className="p-8 space-y-6">
              {/* Basic Information */}
              <div className="space-y-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">Name</label>
                  <input
                    type="text"
                    value={assessmentTypeForm.name}
                    onChange={(e) => setAssessmentTypeForm({...assessmentTypeForm, name: e.target.value})}
                    className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-purple-500 focus:border-transparent"
                    placeholder="Enter assessment type name"
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">Code</label>
                  <input
                    type="text"
                    value={assessmentTypeForm.code}
                    onChange={(e) => setAssessmentTypeForm({...assessmentTypeForm, code: e.target.value})}
                    className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-purple-500 focus:border-transparent"
                    placeholder="Enter assessment code"
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">Description</label>
                  <textarea
                    value={assessmentTypeForm.description}
                    onChange={(e) => setAssessmentTypeForm({...assessmentTypeForm, description: e.target.value})}
                    className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-purple-500 focus:border-transparent"
                    rows={3}
                    placeholder="Enter description"
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">Weight Percentage</label>
                  <input
                    type="number"
                    value={assessmentTypeForm.weight_percentage}
                    onChange={(e) => setAssessmentTypeForm({...assessmentTypeForm, weight_percentage: Number(e.target.value)})}
                    className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-purple-500 focus:border-transparent"
                    min="0"
                    max="100"
                    step="0.1"
                  />
                </div>
              </div>

              {/* Status */}
              <div className="bg-gray-50 rounded-xl p-6">
                <h4 className="text-lg font-semibold text-gray-900 mb-4 flex items-center">
                  <Settings className="h-5 w-5 mr-2" />
                  Status
                </h4>
                <div className="flex items-center space-x-3">
                  <input
                    type="checkbox"
                    id="assessment-active"
                    checked={assessmentTypeForm.is_active}
                    onChange={(e) => setAssessmentTypeForm({...assessmentTypeForm, is_active: e.target.checked})}
                    className="w-5 h-5 text-purple-600 border-gray-300 rounded focus:ring-purple-500"
                  />
                  <label htmlFor="assessment-active" className="text-sm font-medium text-gray-700">
                    Active Assessment Type
                  </label>
                </div>
              </div>

              {/* Action Buttons */}
              <div className="flex justify-end space-x-4 pt-6 border-t border-gray-200">
                <button
                  className="px-6 py-3 border border-gray-300 rounded-lg hover:bg-gray-50 transition-all duration-200 font-medium"
                  onClick={() => setShowAssessmentTypeForm(false)}
                >
                  Cancel
                </button>
                <button
                  className="px-6 py-3 bg-purple-600 text-white rounded-lg hover:bg-purple-700 disabled:opacity-50 disabled:cursor-not-allowed transition-all duration-200 font-medium flex items-center space-x-2"
                  onClick={() => {
                    if (assessmentTypeForm.id) {
                      handleUpdateAssessmentType(assessmentTypeForm.id);
                    } else {
                      handleCreateAssessmentType();
                    }
                  }}
                  disabled={saving}
                >
                  {saving ? (
                    <>
                      <div className="animate-spin rounded-full h-4 w-4 border-2 border-white border-t-transparent"></div>
                      <span>Saving...</span>
                    </>
                  ) : (
                    <>
                      <Save className="h-4 w-4" />
                      <span>{assessmentTypeForm.id ? 'Update' : 'Create'} Assessment Type</span>
                    </>
                  )}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Exam Session Form Modal */}
      {showExamSessionForm && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-2xl max-h-[90vh] overflow-y-auto">
            <div className="bg-gradient-to-r from-indigo-600 to-blue-600 px-8 py-6 rounded-t-2xl">
              <div className="flex items-center justify-between">
                <div className="flex items-center space-x-4">
                  <div className="bg-white/20 p-3 rounded-xl">
                    <Calendar className="h-6 w-6 text-white" />
                  </div>
                  <div>
                    <h3 className="text-xl font-bold text-white">
                      {examSessionForm.id ? 'Edit' : 'Create'} Exam Session
                    </h3>
                    <p className="text-indigo-100 text-sm">Schedule examination period</p>
                  </div>
                </div>
                <button
                  className="bg-white/20 hover:bg-white/30 text-white p-2 rounded-lg transition-all duration-200"
                  onClick={() => setShowExamSessionForm(false)}
                >
                  <X className="h-5 w-5" />
                </button>
              </div>
            </div>

            <div className="p-8 space-y-6">
              {/* Basic Information */}
              <div className="space-y-4">
            <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">Name</label>
                    <input
                        type="text"
                        value={examSessionForm.name}
                        onChange={(e) => setExamSessionForm({...examSessionForm, name: e.target.value})}
                        className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-transparent"
                        placeholder="Enter exam session name"
                    />
            </div>

            <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">Exam Type</label>
                    <select
                        value={examSessionForm.exam_type}
                        onChange={(e) => setExamSessionForm({...examSessionForm, exam_type: e.target.value})}
                        className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-transparent"
                    >
                            <option value="">Select Exam Type</option>
                            <option value="FIRST_CA">First Continuous Assessment</option>
                            <option value="SECOND_CA">Second Continuous Assessment</option>
                            <option value="THIRD_CA">Third Continuous Assessment</option>
                            <option value="MID_TERM">Mid-term Examination</option>
                            <option value="FINAL_EXAM">Final Examination</option>
                            <option value="MOCK_EXAM">Mock Examination</option>
                            <option value="PRACTICAL">Practical Examination</option>
                            <option value="PROJECT">Project Assessment</option>
                            <option value="OTHER">Other</option>
                        </select>
                </div>

                <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">Term</label>
                        <select
                            value={examSessionForm.term}
                            onChange={(e) => setExamSessionForm({...examSessionForm, term: e.target.value})}
                            className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-transparent"
                >
                                <option value="">Select Term</option>
                                <option value="FIRST">First Term</option>
                                <option value="SECOND">Second Term</option>
                                <option value="THIRD">Third Term</option>
                        </select>
                </div>

            <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">Academic Session</label>
                        <select
                            className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-transparent"
                            value={examSessionForm.academic_session || ""}
                            onChange={e => setExamSessionForm({ ...examSessionForm, academic_session: (e.target.value) })}
                >
                                <option value="">Select Academic Session</option>
                                {academicSessions?.map(session => (
                                <option key={session.id} value={session.id}>
                                    {session.name}
                                </option>
            ))}
                        </select>
            </div>
        </div>

              {/* Date Configuration */}
              <div className="bg-gray-50 rounded-xl p-6">
                <h4 className="text-lg font-semibold text-gray-900 mb-4 flex items-center">
                  <Calendar className="h-5 w-5 mr-2" />
                  Date Configuration
                </h4>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">Start Date</label>
                    <input
                      type="date"
                      value={examSessionForm.start_date}
                      onChange={(e) => setExamSessionForm({...examSessionForm, start_date: e.target.value})}
                      className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-transparent"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">End Date</label>
                    <input
                      type="date"
                      value={examSessionForm.end_date}
                      onChange={(e) => setExamSessionForm({...examSessionForm, end_date: e.target.value})}
                      className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-transparent"
                    />
                  </div>
                  <div className="md:col-span-2">
                    <label className="block text-sm font-medium text-gray-700 mb-2">Result Release Date</label>
                    <input
                      type="date"
                      value={examSessionForm.result_release_date}
                      onChange={(e) => setExamSessionForm({...examSessionForm, result_release_date: e.target.value})}
                      className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-transparent"
                    />
                  </div>
                </div>
              </div>

              {/* Status Configuration */}
              <div className="bg-gray-50 rounded-xl p-6">
                <h4 className="text-lg font-semibold text-gray-900 mb-4 flex items-center">
                  <Settings className="h-5 w-5 mr-2" />
                  Status Configuration
                </h4>
                <div className="space-y-3">
                  <div className="flex items-center space-x-3">
                    <input
                      type="checkbox"
                      id="session-active"
                      checked={examSessionForm.is_active}
                      onChange={(e) => setExamSessionForm({...examSessionForm, is_active: e.target.checked})}
                      className="w-5 h-5 text-indigo-600 border-gray-300 rounded focus:ring-indigo-500"
                    />
                    <label htmlFor="session-active" className="text-sm font-medium text-gray-700">
                      Active Session
                    </label>
                  </div>
                  <div className="flex items-center space-x-3">
                    <input
                      type="checkbox"
                      id="session-published"
                      checked={examSessionForm.is_published}
                      onChange={(e) => setExamSessionForm({...examSessionForm, is_published: e.target.checked})}
                      className="w-5 h-5 text-indigo-600 border-gray-300 rounded focus:ring-indigo-500"
                    />
                    <label htmlFor="session-published" className="text-sm font-medium text-gray-700">
                      Published Results
                    </label>
                  </div>
                </div>
              </div>

              {/* Action Buttons */}
              <div className="flex justify-end space-x-4 pt-6 border-t border-gray-200">
                <button
                  className="px-6 py-3 border border-gray-300 rounded-lg hover:bg-gray-50 transition-all duration-200 font-medium"
                  onClick={() => setShowExamSessionForm(false)}
                >
                  Cancel
                </button>
                <button
                  className="px-6 py-3 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 disabled:opacity-50 disabled:cursor-not-allowed transition-all duration-200 font-medium flex items-center space-x-2"
                  onClick={() => {
                    if (examSessionForm.id) {
                      handleUpdateExamSession(examSessionForm.id);
                    } else {
                      handleCreateExamSession();
                    }
                  }}
                  disabled={saving}
                >
                  {saving ? (
                    <>
                      <div className="animate-spin rounded-full h-4 w-4 border-2 border-white border-t-transparent"></div>
                      <span>Saving...</span>
                    </>
                  ) : (
                    <>
                      <Save className="h-4 w-4" />
                      <span>{examSessionForm.id ? 'Update' : 'Create'} Exam Session</span>
                    </>
                  )}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
      {/* Grades Management Modal */}
{showGradesManagementModal && selectedGradingSystem && (
  <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
    <div className="bg-white rounded-2xl shadow-2xl w-full max-w-5xl max-h-[90vh] overflow-y-auto">
      <div className="bg-gradient-to-r from-green-600 to-emerald-600 px-8 py-6 rounded-t-2xl">
        <div className="flex items-center justify-between">
          <div className="flex items-center space-x-4">
            <div className="bg-white/20 p-3 rounded-xl">
              <Award className="h-6 w-6 text-white" />
            </div>
            <div>
              <h3 className="text-xl font-bold text-white">
                Manage Grades - {selectedGradingSystem.name}
              </h3>
              <p className="text-green-100 text-sm">Add, edit, or remove grade ranges</p>
            </div>
          </div>
          <button
            className="bg-white/20 hover:bg-white/30 text-white p-2 rounded-lg transition-all duration-200"
            onClick={() => {
              setShowGradesManagementModal(false);
              setSelectedGradingSystem(null);
              setShowGradeForm(false);
            }}
          >
            <X className="h-5 w-5" />
          </button>
        </div>
      </div>

      <div className="p-8">
        {/* Grading System Info */}
        <div className="bg-gray-50 rounded-xl p-6 mb-6">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4 text-sm">
            <div>
              <span className="text-gray-600">Type:</span>
              <span className="ml-2 font-medium text-gray-900">{selectedGradingSystem.grading_type}</span>
            </div>
            <div>
              <span className="text-gray-600">Range:</span>
              <span className="ml-2 font-medium text-gray-900">
                {selectedGradingSystem.min_score} - {selectedGradingSystem.max_score}
              </span>
            </div>
            <div>
              <span className="text-gray-600">Pass Mark:</span>
              <span className="ml-2 font-medium text-gray-900">{selectedGradingSystem.pass_mark}</span>
            </div>
          </div>
        </div>

        {/* Add Grade Button */}
        <div className="mb-6">
          <button
            className="bg-green-600 hover:bg-green-700 text-white px-6 py-3 rounded-lg transition-all duration-200 flex items-center space-x-2 font-medium"
            onClick={() => {
              resetGradeForm();
              setGradeForm({
                ...gradeForm,
                grading_system: selectedGradingSystem.id
              });
              setShowGradeForm(true);
            }}
          >
            <Plus className="h-4 w-4" />
            <span>Add New Grade</span>
          </button>
        </div>

        {/* Grades List */}
        <div className="space-y-4">
          {grades
            .filter(g => g.grading_system === selectedGradingSystem.id)
            .sort((a, b) => b.min_score - a.min_score)
            .map((grade) => (
              <div
                key={grade.id}
                className="bg-gradient-to-br from-gray-50 to-white rounded-xl border border-gray-200 p-6 hover:shadow-lg transition-all duration-200"
              >
                <div className="flex items-start justify-between">
                  <div className="flex-1">
                    <div className="flex items-center space-x-3 mb-3">
                      <div className="bg-green-100 text-green-800 px-4 py-2 rounded-lg font-bold text-lg">
                        {grade.grade}
                      </div>
                      <div className="flex items-center space-x-2">
                        <span className="bg-blue-100 text-blue-800 text-sm font-medium px-3 py-1 rounded-full">
                          {grade.min_score} - {grade.max_score}
                        </span>
                        {grade.grade_point !== undefined && (
                          <span className="bg-purple-100 text-purple-800 text-sm font-medium px-3 py-1 rounded-full">
                            GP: {grade.grade_point}
                          </span>
                        )}
                        {grade.is_passing ? (
                          <span className="bg-green-100 text-green-800 text-sm font-medium px-3 py-1 rounded-full flex items-center">
                            <CheckCircle className="h-3 w-3 mr-1" />
                            Passing
                          </span>
                        ) : (
                          <span className="bg-red-100 text-red-800 text-sm font-medium px-3 py-1 rounded-full flex items-center">
                            <AlertCircle className="h-3 w-3 mr-1" />
                            Failing
                          </span>
                        )}
                      </div>
                    </div>
                    <p className="text-gray-700 font-medium mb-1">{grade.remark}</p>
                    {grade.description && (
                      <p className="text-gray-600 text-sm">{grade.description}</p>
                    )}
                  </div>
                  <div className="flex items-center space-x-2">
                    <button
                      className="p-2 text-gray-600 hover:text-green-600 hover:bg-green-50 rounded-lg transition-all duration-200"
                      onClick={() => {
                        setGradeForm({
                          id: grade.id,
                          grading_system: grade.grading_system,
                          grade: grade.grade,
                          remark: grade.remark,
                          min_score: grade.min_score,
                          max_score: grade.max_score,
                          grade_point: grade.grade_point,
                          description: grade.description,
                          is_passing: grade.is_passing
                        });
                        setShowGradeForm(true);
                      }}
                      title="Edit Grade"
                    >
                      <Edit className="h-4 w-4" />
                    </button>
                    <button
                      className="p-2 text-gray-600 hover:text-red-600 hover:bg-red-50 rounded-lg transition-all duration-200"
                      onClick={() => handleDeleteGrade(grade.id)}
                      title="Delete Grade"
                    >
                      <Trash2 className="h-4 w-4" />
                    </button>
                  </div>
                </div>
              </div>
            ))}

          {grades.filter(g => g.grading_system === selectedGradingSystem.id).length === 0 && (
            <div className="text-center py-12">
              <div className="bg-gray-100 rounded-full p-6 w-20 h-20 mx-auto mb-4 flex items-center justify-center">
                <Award className="h-10 w-10 text-gray-400" />
              </div>
              <h3 className="text-lg font-medium text-gray-900 mb-2">No Grades Defined</h3>
              <p className="text-gray-600 mb-6">Start by adding grade ranges for this grading system</p>
            </div>
          )}
        </div>
      </div>
    </div>
  </div>
)}

{/* Grade Form Modal */}
{showGradeForm && (
  <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-[60] p-4">
    <div className="bg-white rounded-2xl shadow-2xl w-full max-w-2xl max-h-[90vh] overflow-y-auto">
      <div className="bg-gradient-to-r from-green-600 to-emerald-600 px-8 py-6 rounded-t-2xl">
        <div className="flex items-center justify-between">
          <div className="flex items-center space-x-4">
            <div className="bg-white/20 p-3 rounded-xl">
              <Award className="h-6 w-6 text-white" />
            </div>
            <div>
              <h3 className="text-xl font-bold text-white">
                {gradeForm.id ? 'Edit' : 'Create'} Grade
              </h3>
              <p className="text-green-100 text-sm">Define grade range and properties</p>
            </div>
          </div>
          <button
            className="bg-white/20 hover:bg-white/30 text-white p-2 rounded-lg transition-all duration-200"
            onClick={() => {
              setShowGradeForm(false);
              resetGradeForm();
            }}
          >
            <X className="h-5 w-5" />
          </button>
        </div>
      </div>

      <div className="p-8 space-y-6">
        {/* Grade Information */}
        <div className="space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Grade <span className="text-red-500">*</span>
              </label>
              <input
                type="text"
                value={gradeForm.grade}
                onChange={(e) => setGradeForm({...gradeForm, grade: e.target.value})}
                className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-green-500 focus:border-transparent"
                placeholder="e.g., A, B+, Distinction"
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Remark <span className="text-red-500">*</span>
              </label>
              <input
                type="text"
                value={gradeForm.remark}
                onChange={(e) => setGradeForm({...gradeForm, remark: e.target.value})}
                className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-green-500 focus:border-transparent"
                placeholder="e.g., Excellent, Very Good"
              />
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Minimum Score <span className="text-red-500">*</span>
              </label>
              <input
                type="number"
                value={gradeForm.min_score}
                onChange={(e) => setGradeForm({...gradeForm, min_score: Number(e.target.value)})}
                className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-green-500 focus:border-transparent"
                min="0"
                step="0.01"
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Maximum Score <span className="text-red-500">*</span>
              </label>
              <input
                type="number"
                value={gradeForm.max_score}
                onChange={(e) => setGradeForm({...gradeForm, max_score: Number(e.target.value)})}
                className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-green-500 focus:border-transparent"
                min="0"
                step="0.01"
              />
            </div>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Grade Point (Optional)
            </label>
            <input
              type="number"
              value={gradeForm.grade_point || ''}
              onChange={(e) => setGradeForm({
                ...gradeForm, 
                grade_point: e.target.value ? Number(e.target.value) : undefined
              })}
              className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-green-500 focus:border-transparent"
              min="0"
              step="0.1"
              placeholder="e.g., 4.0, 3.5"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Description
            </label>
            <textarea
              value={gradeForm.description}
              onChange={(e) => setGradeForm({...gradeForm, description: e.target.value})}
              className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-green-500 focus:border-transparent"
              rows={3}
              placeholder="Enter description (optional)"
            />
          </div>

          <div className="flex items-center space-x-3">
            <input
              type="checkbox"
              id="grade-passing"
              checked={gradeForm.is_passing}
              onChange={(e) => setGradeForm({...gradeForm, is_passing: e.target.checked})}
              className="w-5 h-5 text-green-600 border-gray-300 rounded focus:ring-green-500"
            />
            <label htmlFor="grade-passing" className="text-sm font-medium text-gray-700">
              This is a passing grade
            </label>
          </div>
        </div>

        {/* Action Buttons */}
        <div className="flex justify-end space-x-4 pt-6 border-t border-gray-200">
          <button
            className="px-6 py-3 border border-gray-300 rounded-lg hover:bg-gray-50 transition-all duration-200 font-medium"
            onClick={() => {
              setShowGradeForm(false);
              resetGradeForm();
            }}
            disabled={saving}
          >
            Cancel
          </button>
          <button
            className="bg-green-600 hover:bg-green-700 text-white px-6 py-3 rounded-lg transition-all duration-200 font-medium flex items-center space-x-2 disabled:opacity-50 disabled:cursor-not-allowed"
            onClick={() => {
              if (gradeForm.id) {
                handleUpdateGrade(gradeForm.id);
              } else {
                handleCreateGrade();
              }
            }}
            disabled={saving || !gradeForm.grade || !gradeForm.remark}
          >
            {saving ? (
              <>
                <div className="animate-spin rounded-full h-4 w-4 border-2 border-white border-t-transparent"></div>
                <span>Saving...</span>
              </>
            ) : (
              <>
                <Save className="h-4 w-4" />
                <span>{gradeForm.id ? 'Update' : 'Create'} Grade</span>
              </>
            )}
          </button>
        </div>
      </div>
    </div>
  </div>
)}
    </div>
  );
};

export default ExamsResultTab;


