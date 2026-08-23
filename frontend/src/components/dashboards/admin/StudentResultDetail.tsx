import React, { useState, useEffect } from 'react';
import { 
  ArrowLeft, 
  User, 
  BookOpen, 
  Award, 
  CheckCircle, 
  Clock,
  FileText,
  Edit,
  Download,
  Printer,
  RefreshCw,
  AlertCircle,
  TrendingUp,
  TrendingDown,
  Target,
  Trophy,
  Star
} from 'lucide-react';
import EditResultForm from './EditResultForm';
import { useParams, useNavigate } from 'react-router-dom';
import { useGlobalTheme } from '@/contexts/GlobalThemeContext';
import StudentService, { Student } from '@/services/StudentService';
import { ExamSession} from '@/types/types'
import ResultService, { EducationLevelType } from '@/services/ResultService';
import {SubjectInfo} from '@/types/types'
import { toast } from 'react-toastify';
import { Exam } from '@/services/ExamService';


// Updated Result interface in StudentResultDetail.tsx

interface NamedUserRef {
  full_name?: string;
}

type ResultStatus = 'DRAFT' | 'SUBMITTED' | 'APPROVED' | 'PUBLISHED' | string;

interface Result {
  id: string;
  subject?: SubjectInfo | { id: string | number; name?: string };
  exam_session?: ExamSession
  term?: string;
  status: ResultStatus;
  education_level: string;
  student?: string | number | { id: string | number; full_name?: string };

  // Senior secondary fields
  first_test_score?: number | string;
  second_test_score?: number | string;
  third_test_score?: number | string;

  // Common fields
  exam_score?: number | string;
  total_score?: number | string;

  // Primary / Junior secondary fields
  continuous_assessment_score?: number | string;
  practical_score?: number | string;
  take_home_test_score?: number | string;
  appearance_score?: number | string;
  project_score?: number | string;
  note_copying_score?: number | string;
  ca_total?: number | string;

  // Class statistics (handle both string and number formats)
  class_average?: number | string;
  highest_in_class?: number | string;
  lowest_in_class?: number | string;

  // Audit fields with both object and string formats
  entered_by?: NamedUserRef | { full_name?: string };
  entered_by_name?: string;
  created_at?: string;
  approved_by?: NamedUserRef | { full_name?: string };
  approved_by_name?: string;
  approved_date?: string;
  last_edited_by?: NamedUserRef | { full_name?: string };
  last_edited_by_name?: string;
  last_edited_at?: string;
  published_by?: NamedUserRef | { full_name?: string };
  published_by_name?: string;
  published_date?: string;

  // Serializer fields that might be present
  subject_name?: string;
  exam_session_name?: string;
  student_name?: string;

  // Nursery specifics
  grade?: string;
  position?: number | string;

  // ADD THESE NURSERY PHYSICAL DEVELOPMENT FIELDS
  physical_development?: string;
  health?: string;
  cleanliness?: string;
  general_conduct?: string;
  height_beginning?: number | string;
  height_end?: number | string;
  weight_beginning?: number | string;
  weight_end?: number | string;
}

interface StudentResultDetailProps {}

const StudentResultDetail: React.FC<StudentResultDetailProps> = () => {
  const { studentId } = useParams<{ studentId: string }>();
  const navigate = useNavigate();
  const { isDarkMode } = useGlobalTheme();
  
  // Data State
  const [student, setStudent] = useState<Student | null>(null);
  const [results, setResults] = useState<Result[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [updatingStatus, setUpdatingStatus] = useState<string | null>(null);
  const [editingResult, setEditingResult] = useState<any>(null);

  const themeClasses = {
    bgPrimary: isDarkMode ? 'bg-gray-900' : 'bg-white',
    bgSecondary: isDarkMode ? 'bg-gray-800' : 'bg-gray-50',
    bgCard: isDarkMode ? 'bg-gray-800' : 'bg-white',
    textPrimary: isDarkMode ? 'text-white' : 'text-gray-900',
    textSecondary: isDarkMode ? 'text-gray-300' : 'text-gray-600',
    textTertiary: isDarkMode ? 'text-gray-400' : 'text-gray-500',
    border: isDarkMode ? 'border-gray-700' : 'border-gray-200',
    borderHover: isDarkMode ? 'border-gray-600' : 'border-gray-300',
    iconPrimary: isDarkMode ? 'text-blue-400' : 'text-blue-600',
    iconSecondary: isDarkMode ? 'text-gray-400' : 'text-gray-500',
    buttonPrimary: isDarkMode ? 'bg-blue-600 hover:bg-blue-700 text-white' : 'bg-blue-600 hover:bg-blue-700 text-white',
    buttonSecondary: isDarkMode ? 'bg-gray-700 hover:bg-gray-600 text-white' : 'bg-gray-200 hover:bg-gray-300 text-gray-700',
    buttonSuccess: isDarkMode ? 'bg-green-600 hover:bg-green-700 text-white' : 'bg-green-600 hover:bg-green-700 text-white',
    buttonWarning: isDarkMode ? 'bg-yellow-600 hover:bg-yellow-700 text-white' : 'bg-yellow-600 hover:bg-yellow-700 text-white',
    buttonDanger: isDarkMode ? 'bg-red-600 hover:bg-red-700 text-white' : 'bg-red-600 hover:bg-red-700 text-white',
  };

  // Load data on component mount
 useEffect(() => {
  if (studentId) {
    loadData();
  } else {
    setError('Student ID is required');
    setLoading(false);
  }
}, [studentId]);


  // Education level normalization function
  const normalizeEducationLevel = (level: string | undefined | null): string => {
    if (!level) return 'UNKNOWN';
    const normalized = String(level).toUpperCase().replace(/\s+/g, '_').trim();
    if (normalized === 'SECONDARY') return 'SENIOR_SECONDARY';
    return normalized;
  };

    // Fixed loadData function in StudentResultDetail.tsx
const loadData = async () => {
  if (!studentId) {
    setError('Student ID is required');
    setLoading(false);
    return;
  }

  try {
    setLoading(true);
    setError(null);
    
    console.log('Loading data for student ID:', studentId);

    // Parse studentId to number with validation
    const parsedStudentId = parseInt(studentId, 10);
    if (isNaN(parsedStudentId)) {
      throw new Error('Invalid student ID format');
    }

    // Load student data first
    const studentData = await StudentService.getStudent(parsedStudentId);
    console.log('Loaded student data:', studentData);
    setStudent(studentData);

    let finalResults: Result[] = [];

    // Results are stored per education level, so the level selects the
    // endpoint. The old getStudentResults/getResultsByStudent pair both hit
    // this same one — the second was a retry of the first, not a fallback.
    const level = studentData.education_level as EducationLevelType;

    try {
      const specificResults = await ResultService.getSubjectResults(level, {
        student: studentId,
      });
      if (Array.isArray(specificResults)) {
        finalResults = specificResults as unknown as Result[];
      }
    } catch (error) {
      console.error('Failed to load results for this student:', error);
    }

    console.log('Final results for student:', finalResults);
    setResults(finalResults);
    
  } catch (error) {
    console.error('Error loading data:', error);
    setError('Failed to load student data');
    toast.error('Failed to load student data');
  } finally {
    setLoading(false);
  }
};

  // Handle edit result
  const handleEditResult = (result: any) => {
    console.log('Editing result:', result);
    setEditingResult(result);
  };


 const handleStatusChange = async (resultId: string, newStatus: ResultStatus, educationLevel: string) => {
  try {
    setUpdatingStatus(resultId);
    
    if (newStatus === 'APPROVED') {
      await ResultService.approveSubjectResult(
        educationLevel as EducationLevelType,
        resultId,
      );
    } else if (newStatus === 'PUBLISHED') {
      await ResultService.publishSubjectResult(
        educationLevel as EducationLevelType,
        resultId,
      );
    } else {
      throw new Error(`Unsupported status change: ${newStatus}`);
    }
    
    toast.success(`Result ${newStatus.toLowerCase()} successfully`);

    // Update the result in state
    setResults(prev =>
      prev.map(r => r.id === resultId ? { ...r, status: newStatus } : r)
    );
  } catch (error) {
    console.error('Error changing status:', error);
    toast.error(`Failed to ${newStatus.toLowerCase()} result`);
  } finally {
    setUpdatingStatus(null);
  }
};

  // Get status badge component
  const getStatusBadge = (status: string) => {
    const statusConfig = {
      DRAFT: { color: 'bg-gray-500', icon: Clock, label: 'Draft' },
      SUBMITTED: { color: 'bg-blue-500', icon: FileText, label: 'Submitted' },
      APPROVED: { color: 'bg-green-500', icon: CheckCircle, label: 'Approved' },
      PUBLISHED: { color: 'bg-purple-500', icon: Award, label: 'Published' }
    };

    const config = statusConfig[status as keyof typeof statusConfig] || statusConfig.DRAFT;
    const IconComponent = config.icon;

    return (
      <span className={`inline-flex items-center px-3 py-1 rounded-full text-sm font-medium text-white ${config.color}`}>
        <IconComponent className="w-4 h-4 mr-2" />
        {config.label}
      </span>
    );
  };

  // Safe value extraction helpers
const getSubjectName = (result: Result): string => {
  if (typeof result.subject === 'object' && result.subject?.name) {
    return result.subject.name;
  }
  return result.subject_name || 'Unknown Subject';
};

const getExamSessionName = (result: Result): string => {
  if (typeof result.exam_session === 'object' && result.exam_session?.academic_session) {
    // <option key={session.id} value={session.id}>
    //{session.name} - {typeof session.academic_session === 'object' && session.academic_session.name !== null ? (session.academic_session as AcademicSession).name : (session.academic_session ? String(session.academic_session) : 'No Session')}
    //</option>
    return result.exam_session.name;
  }
  return result.exam_session_name || 'N/A';
};

const getTermName = (result: Result): string => {
  if (typeof result.exam_session === 'object' && result.exam_session?.term) {
    return result.exam_session.term;
  }
  return result.term || 'N/A';
};

  // Safe number conversion helper
const safeNumber = (value: string | number | undefined | null, defaultValue: number = 0): number => {
  if (value === null || value === undefined) return defaultValue;
  const num = typeof value === 'string' ? parseFloat(value) : value;
  return isNaN(num) ? defaultValue : num;
};

  // Get detailed result information based on education level
  const getResultDetails = (result: Result, educationLevel: string) => {
    const levelKey = normalizeEducationLevel(educationLevel);
    
    switch (levelKey) {
      case 'SENIOR_SECONDARY':
        return (
          <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
            <div className={`p-4 rounded-lg ${themeClasses.bgSecondary} border ${themeClasses.border}`}>
              <div className="flex items-center mb-2">
                <Target className="w-4 h-4 mr-2 text-blue-500" />
                <span className="text-sm font-medium">Test 1</span>
              </div>
              <div className="text-2xl font-bold">{safeNumber(result.first_test_score).toFixed(2)}</div>
            </div>
            <div className={`p-4 rounded-lg ${themeClasses.bgSecondary} border ${themeClasses.border}`}>
              <div className="flex items-center mb-2">
                <Target className="w-4 h-4 mr-2 text-blue-500" />
                <span className="text-sm font-medium">Test 2</span>
              </div>
              <div className="text-2xl font-bold">{safeNumber(result.second_test_score).toFixed(2)}</div>
            </div>
            <div className={`p-4 rounded-lg ${themeClasses.bgSecondary} border ${themeClasses.border}`}>
              <div className="flex items-center mb-2">
                <Target className="w-4 h-4 mr-2 text-blue-500" />
                <span className="text-sm font-medium">Test 3</span>
              </div>
              <div className="text-2xl font-bold">{safeNumber(result.third_test_score).toFixed(2)}</div>
            </div>
            <div className={`p-4 rounded-lg ${themeClasses.bgSecondary} border ${themeClasses.border}`}>
              <div className="flex items-center mb-2">
                <Star className="w-4 h-4 mr-2 text-orange-500" />
                <span className="text-sm font-medium">CA Total</span>
              </div>
              <div className="text-2xl font-bold">
              {(safeNumber(result.first_test_score) + 
                safeNumber(result.second_test_score) + 
                safeNumber(result.third_test_score)).toFixed(2)}
            </div>
            </div>
            <div className={`p-4 rounded-lg ${themeClasses.bgSecondary} border ${themeClasses.border}`}>
              <div className="flex items-center mb-2">
                <Award className="w-4 h-4 mr-2 text-green-500" />
                <span className="text-sm font-medium">Exam Score</span>
              </div>
              <div className="text-2xl font-bold">{safeNumber(result.exam_score).toFixed(2)}</div>
            </div>
            <div className={`p-4 rounded-lg ${themeClasses.bgSecondary} border ${themeClasses.border}`}>
              <div className="flex items-center mb-2">
                <Target className="w-4 h-4 mr-2 text-blue-500" />
                <span className="text-sm font-medium">Overall Total</span>
              </div>
              <div className="text-2xl font-bold">
              {safeNumber(result.total_score, (
                safeNumber(result.first_test_score) + 
                safeNumber(result.second_test_score) + 
                safeNumber(result.third_test_score) + 
                safeNumber(result.exam_score)
              )).toFixed(2)}
            </div>
            </div>
            <div className={`p-4 rounded-lg ${themeClasses.bgSecondary} border ${themeClasses.border}`}>
              <div className="flex items-center mb-2">
                <TrendingUp className="w-4 h-4 mr-2 text-purple-500" />
                <span className="text-sm font-medium">Class Average</span>
              </div>
              <div className="text-2xl font-bold">
              {safeNumber(result.class_average) > 0 ? 
                safeNumber(result.class_average).toFixed(2) : 
                <span className="text-gray-500 text-sm">Not Available</span>
              }
            </div>
              
            </div>
            <div className={`p-4 rounded-lg ${themeClasses.bgSecondary} border ${themeClasses.border}`}>
              <div className="flex items-center mb-2">
                <Trophy className="w-4 h-4 mr-2 text-yellow-500" />
                <span className="text-sm font-medium">Highest in Class</span>
   
              </div>
              <div className="text-2xl font-bold">
              {safeNumber(result.highest_in_class) > 0 ? 
                safeNumber(result.highest_in_class).toFixed(2) : 
                <span className="text-gray-500 text-sm">Not Available</span>
              }
            </div>
            </div>
            <div className={`p-4 rounded-lg ${themeClasses.bgSecondary} border ${themeClasses.border}`}>
              <div className="flex items-center mb-2">
                <TrendingDown className="w-4 h-4 mr-2 text-red-500" />
                <span className="text-sm font-medium">Lowest in Class</span>
              
              </div>
              <div className="text-2xl font-bold">
              {safeNumber(result.lowest_in_class) > 0 ? 
                safeNumber(result.lowest_in_class).toFixed(2) : 
                <span className="text-gray-500 text-sm">Not Available</span>
              }
            </div>
            </div>
          </div>
        );
      
      case 'PRIMARY':
case 'JUNIOR_SECONDARY':
  return (
    <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
      <div className={`p-4 rounded-lg ${themeClasses.bgSecondary} border ${themeClasses.border}`}>
        <div className="flex items-center mb-2">
          <BookOpen className="w-4 h-4 mr-2 text-blue-500" />
          <span className="text-sm font-medium">CA Score</span>
        </div>
        <div className="text-2xl font-bold">{safeNumber(result.continuous_assessment_score).toFixed(2)}</div>
      </div>
      
      <div className={`p-4 rounded-lg ${themeClasses.bgSecondary} border ${themeClasses.border}`}>
        <div className="flex items-center mb-2">
          <User className="w-4 h-4 mr-2 text-green-500" />
          <span className="text-sm font-medium">Appearance</span>
        </div>
        <div className="text-2xl font-bold">{safeNumber(result.appearance_score).toFixed(2)}</div>
      </div>
      
      <div className={`p-4 rounded-lg ${themeClasses.bgSecondary} border ${themeClasses.border}`}>
        <div className="flex items-center mb-2">
          <User className="w-4 h-4 mr-2 text-green-500" />
          <span className="text-sm font-medium">Practical</span>
        </div>
        <div className="text-2xl font-bold">{safeNumber(result.practical_score).toFixed(2)}</div>
      </div>
      
      <div className={`p-4 rounded-lg ${themeClasses.bgSecondary} border ${themeClasses.border}`}>
        <div className="flex items-center mb-2">
          <BookOpen className="w-4 h-4 mr-2 text-purple-500" />
          <span className="text-sm font-medium">Take Home Test</span>
        </div>
        <div className="text-2xl font-bold">{safeNumber(result.take_home_test_score).toFixed(2)}</div>
      </div>
      
      <div className={`p-4 rounded-lg ${themeClasses.bgSecondary} border ${themeClasses.border}`}>
        <div className="flex items-center mb-2">
          <Award className="w-4 h-4 mr-2 text-orange-500" />
          <span className="text-sm font-medium">Project</span>
        </div>
        <div className="text-2xl font-bold">{safeNumber(result.project_score).toFixed(2)}</div>
      </div>
      
      <div className={`p-4 rounded-lg ${themeClasses.bgSecondary} border ${themeClasses.border}`}>
        <div className="flex items-center mb-2">
          <FileText className="w-4 h-4 mr-2 text-indigo-500" />
          <span className="text-sm font-medium">Note Copying</span>
        </div>
        <div className="text-2xl font-bold">{safeNumber(result.note_copying_score).toFixed(2)}</div>
      </div>
      
      <div className={`p-4 rounded-lg ${themeClasses.bgSecondary} border ${themeClasses.border}`}>
        <div className="flex items-center mb-2">
          <Award className="w-4 h-4 mr-2 text-green-500" />
          <span className="text-sm font-medium">Exam Score</span>
        </div>
        <div className="text-2xl font-bold">{safeNumber(result.exam_score).toFixed(2)}</div>
      </div>
      
      <div className={`p-4 rounded-lg ${themeClasses.bgSecondary} border ${themeClasses.border}`}>
        <div className="flex items-center mb-2">
          <Star className="w-4 h-4 mr-2 text-orange-500" />
          <span className="text-sm font-medium">CA Total</span>
        </div>
        <div className="text-2xl font-bold">
          {(
            safeNumber(result.continuous_assessment_score) + 
            safeNumber(result.take_home_test_score) + 
            safeNumber(result.appearance_score) + 
            safeNumber(result.practical_score) + 
            safeNumber(result.project_score) + 
            safeNumber(result.note_copying_score)
          ).toFixed(2)}
        </div>
      </div>
      
      <div className={`p-4 rounded-lg ${themeClasses.bgSecondary} border ${themeClasses.border}`}>
        <div className="flex items-center mb-2">
          <Target className="w-4 h-4 mr-2 text-blue-500" />
          <span className="text-sm font-medium">Overall Total</span>
        </div>
        <div className="text-2xl font-bold">
          {safeNumber(result.total_score, (
            safeNumber(result.continuous_assessment_score) + 
            safeNumber(result.take_home_test_score) + 
            safeNumber(result.appearance_score) + 
            safeNumber(result.practical_score) + 
            safeNumber(result.project_score) + 
            safeNumber(result.note_copying_score) + 
            safeNumber(result.exam_score)
          )).toFixed(2)}
        </div>
      </div>
      
      <div className={`p-4 rounded-lg ${themeClasses.bgSecondary} border ${themeClasses.border}`}>
        <div className="flex items-center mb-2">
          <TrendingUp className="w-4 h-4 mr-2 text-purple-500" />
          <span className="text-sm font-medium">Class Average</span>
        </div>
        <div className="text-2xl font-bold">
          {safeNumber(result.class_average) > 0 ? 
            safeNumber(result.class_average).toFixed(2) : 
            <span className="text-gray-500 text-sm">Not Available</span>
          }
        </div>
      </div>
      
      <div className={`p-4 rounded-lg ${themeClasses.bgSecondary} border ${themeClasses.border}`}>
        <div className="flex items-center mb-2">
          <Trophy className="w-4 h-4 mr-2 text-yellow-500" />
          <span className="text-sm font-medium">Highest in Class</span>
        </div>
        <div className="text-2xl font-bold">
          {safeNumber(result.highest_in_class) > 0 ? 
            safeNumber(result.highest_in_class).toFixed(2) : 
            <span className="text-gray-500 text-sm">Not Available</span>
          }
        </div>
      </div>
      
      <div className={`p-4 rounded-lg ${themeClasses.bgSecondary} border ${themeClasses.border}`}>
        <div className="flex items-center mb-2">
          <TrendingDown className="w-4 h-4 mr-2 text-red-500" />
          <span className="text-sm font-medium">Lowest in Class</span>
        </div>
        <div className="text-2xl font-bold">
          {safeNumber(result.lowest_in_class) > 0 ? 
            safeNumber(result.lowest_in_class).toFixed(2) : 
            <span className="text-gray-500 text-sm">Not Available</span>
          }
        </div>
      </div>
    </div>
  );
       
      
      case 'NURSERY':
  return (
    <>
    <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
      <div className={`p-4 rounded-lg ${themeClasses.bgSecondary} border ${themeClasses.border}`}>
        <div className="flex items-center mb-2">
          <Award className="w-4 h-4 mr-2 text-green-500" />
          <span className="text-sm font-medium">Exam Score</span>
        </div>
        <div className="text-2xl font-bold">{safeNumber(result.exam_score).toFixed(2)}</div>
      </div>
      <div className={`p-4 rounded-lg ${themeClasses.bgSecondary} border ${themeClasses.border}`}>
        <div className="flex items-center mb-2">
          <Star className="w-4 h-4 mr-2 text-blue-500" />
          <span className="text-sm font-medium">Total Score</span>
        </div>
        <div className="text-2xl font-bold">{safeNumber(result.total_score).toFixed(2)}</div>
      </div>
      <div className={`p-4 rounded-lg ${themeClasses.bgSecondary} border ${themeClasses.border}`}>
        <div className="flex items-center mb-2">
          <Trophy className="w-4 h-4 mr-2 text-yellow-500" />
          <span className="text-sm font-medium">Grade</span>
        </div>
        <div className="text-2xl font-bold">{result.grade || 'N/A'}</div>
      </div>
      <div className={`p-4 rounded-lg ${themeClasses.bgSecondary} border ${themeClasses.border}`}>
        <div className="flex items-center mb-2">
          <TrendingUp className="w-4 h-4 mr-2 text-purple-500" />
          <span className="text-sm font-medium">Position</span>
        </div>
        <div className="text-2xl font-bold">{result.position || 'N/A'}</div>
      </div>
      <div className={`p-4 rounded-lg ${themeClasses.bgSecondary} border ${themeClasses.border}`}>
        <div className="flex items-center mb-2">
          <TrendingUp className="w-4 h-4 mr-2 text-purple-500" />
          <span className="text-sm font-medium">Class Average</span>
        </div>
        <div className="text-2xl font-bold">
          {safeNumber(result.class_average) > 0 ? 
            safeNumber(result.class_average).toFixed(2) : 
            <span className="text-gray-500 text-sm">Not Available</span>
          }
        </div>
      </div>
      <div className={`p-4 rounded-lg ${themeClasses.bgSecondary} border ${themeClasses.border}`}>
        <div className="flex items-center mb-2">
          <Trophy className="w-4 h-4 mr-2 text-yellow-500" />
          <span className="text-sm font-medium">Highest in Class</span>
        </div>
        <div className="text-2xl font-bold">
          {safeNumber(result.highest_in_class) > 0 ? 
            safeNumber(result.highest_in_class).toFixed(2) : 
            <span className="text-gray-500 text-sm">Not Available</span>
          }
        </div>
      </div>
      <div className={`p-4 rounded-lg ${themeClasses.bgSecondary} border ${themeClasses.border}`}>
        <div className="flex items-center mb-2">
          <TrendingDown className="w-4 h-4 mr-2 text-red-500" />
          <span className="text-sm font-medium">Lowest in Class</span>
        </div>
        <div className="text-2xl font-bold">
          {safeNumber(result.lowest_in_class) > 0 ? 
            safeNumber(result.lowest_in_class).toFixed(2) : 
            <span className="text-gray-500 text-sm">Not Available</span>
          }
        </div>
      </div>
    </div>
{/* ADD THIS: Physical Development Section */}
      {(result.physical_development || result.health || result.cleanliness || result.general_conduct) && (
        <div className="mt-6">
          <h4 className={`text-lg font-semibold mb-4 ${themeClasses.textPrimary}`}>
            Physical Development & Health
          </h4>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            {result.physical_development && (
              <div className={`p-4 rounded-lg ${themeClasses.bgSecondary} border ${themeClasses.border}`}>
                <div className="flex items-center mb-2">
                  <User className="w-4 h-4 mr-2 text-green-500" />
                  <span className="text-sm font-medium">Physical Development</span>
                </div>
                <div className="text-lg font-bold">{result.physical_development}</div>
              </div>
            )}
            
            {result.health && (
              <div className={`p-4 rounded-lg ${themeClasses.bgSecondary} border ${themeClasses.border}`}>
                <div className="flex items-center mb-2">
                  <Star className="w-4 h-4 mr-2 text-red-500" />
                  <span className="text-sm font-medium">Health</span>
                </div>
                <div className="text-lg font-bold">{result.health}</div>
              </div>
            )}
            
            {result.cleanliness && (
              <div className={`p-4 rounded-lg ${themeClasses.bgSecondary} border ${themeClasses.border}`}>
                <div className="flex items-center mb-2">
                  <Star className="w-4 h-4 mr-2 text-blue-500" />
                  <span className="text-sm font-medium">Cleanliness</span>
                </div>
                <div className="text-lg font-bold">{result.cleanliness}</div>
              </div>
            )}
            
            {result.general_conduct && (
              <div className={`p-4 rounded-lg ${themeClasses.bgSecondary} border ${themeClasses.border}`}>
                <div className="flex items-center mb-2">
                  <Trophy className="w-4 h-4 mr-2 text-purple-500" />
                  <span className="text-sm font-medium">General Conduct</span>
                </div>
                <div className="text-lg font-bold">{result.general_conduct}</div>
              </div>
            )}
          </div>
          
          {/* Physical Measurements */}
          {(result.height_beginning || result.weight_beginning) && (
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mt-4">
              {result.height_beginning && (
                <div className={`p-4 rounded-lg ${themeClasses.bgSecondary} border ${themeClasses.border}`}>
                  <span className="text-sm font-medium">Height (Start)</span>
                  <div className="text-lg font-bold">{result.height_beginning} cm</div>
                </div>
              )}
              {result.height_end && (
                <div className={`p-4 rounded-lg ${themeClasses.bgSecondary} border ${themeClasses.border}`}>
                  <span className="text-sm font-medium">Height (End)</span>
                  <div className="text-lg font-bold">{result.height_end} cm</div>
                </div>
              )}
              {result.weight_beginning && (
                <div className={`p-4 rounded-lg ${themeClasses.bgSecondary} border ${themeClasses.border}`}>
                  <span className="text-sm font-medium">Weight (Start)</span>
                  <div className="text-lg font-bold">{result.weight_beginning} kg</div>
                </div>
              )}
              {result.weight_end && (
                <div className={`p-4 rounded-lg ${themeClasses.bgSecondary} border ${themeClasses.border}`}>
                  <span className="text-sm font-medium">Weight (End)</span>
                  <div className="text-lg font-bold">{result.weight_end} kg</div>
                </div>
              )}
            </div>
          )}
        </div>
      )}
</>
  
  );
      
      default:
        return (
          <div className="text-center py-8">
            <AlertCircle className="w-12 h-12 text-gray-400 mx-auto mb-2" />
            <div className="text-sm text-gray-500">No details available for this education level</div>
          </div>
        );
    }
  };

  if (loading) {
    return (
      <div className={`min-h-screen ${themeClasses.bgPrimary} ${themeClasses.textPrimary}`}>
        <div className="flex items-center justify-center h-64">
          <div className="text-center">
            <div className="animate-spin rounded-full h-32 w-32 border-b-2 border-blue-500 mx-auto mb-4"></div>
            <p className="text-lg">Loading student data...</p>
          </div>
        </div>
      </div>
    );
  }

  if (error || !student) {
    return (
      <div className={`min-h-screen ${themeClasses.bgPrimary} ${themeClasses.textPrimary}`}>
        <div className="flex items-center justify-center h-64">
          <div className="text-center">
            <AlertCircle className="w-16 h-16 text-red-500 mx-auto mb-4" />
            <h2 className="text-xl font-semibold mb-2">Error Loading Data</h2>
            <p className="text-gray-500 mb-4">{error || 'Student not found'}</p>
            <div className="flex gap-2 justify-center">
              <button
                onClick={loadData}
                className={`px-4 py-2 rounded-lg ${themeClasses.buttonPrimary} flex items-center`}
              >
                <RefreshCw className="w-4 h-4 mr-2" />
                Retry
              </button>
              <button
                onClick={() => navigate('/admin/results')}
                className={`px-4 py-2 rounded-lg ${themeClasses.buttonSecondary} flex items-center`}
              >
                <ArrowLeft className="w-4 h-4 mr-2" />
                Back to Results
              </button>
            </div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className={`min-h-screen bg-gradient-to-b from-slate-50 to-white dark:from-gray-950 dark:to-gray-900 ${themeClasses.textPrimary}`}>
      {/* Header */}
      <div className={`sticky top-0 z-10 backdrop-blur supports-[backdrop-filter]:bg-white/70 dark:supports-[backdrop-filter]:bg-gray-800/60 border-b ${themeClasses.border}`}>
        <div className="max-w-7xl mx-auto px-6 py-6">
          <div className="flex items-center justify-between gap-4 mb-2">
            <div className="flex items-center">
              <button
                onClick={() => navigate('/admin/results')}
                className={`p-2 rounded-lg mr-4 ${themeClasses.buttonSecondary} transition-all duration-200 active:scale-[.98] ring-1 ring-inset ${isDarkMode ? 'ring-gray-700' : 'ring-gray-200'}`}
              >
                <ArrowLeft className="w-5 h-5" />
              </button>
              <div>
                <h1 className="text-3xl font-bold tracking-tight">Student Results</h1>
                <p className={`text-sm ${themeClasses.textSecondary}`}>
                  Detailed results for {student.full_name}
                </p>
              </div>
            </div>
            
            <div className="flex gap-2">
              <button
                onClick={loadData}
                className={`px-4 py-2 rounded-lg flex items-center ${themeClasses.buttonSecondary} transition-all duration-200 active:scale-[.98] ring-1 ring-inset ${isDarkMode ? 'ring-gray-700' : 'ring-gray-200'}`}
              >
                <RefreshCw className="w-4 h-4 mr-2" />
                Refresh
              </button>
              <button
                className={`px-4 py-2 rounded-lg flex items-center ${themeClasses.buttonSecondary} transition-all duration-200 active:scale-[.98] ring-1 ring-inset ${isDarkMode ? 'ring-gray-700' : 'ring-gray-200'}`}
              >
                <Download className="w-4 h-4 mr-2" />
                Export
              </button>
              <button
                className={`px-4 py-2 rounded-lg flex items-center ${themeClasses.buttonSecondary} transition-all duration-200 active:scale-[.98] ring-1 ring-inset ${isDarkMode ? 'ring-gray-700' : 'ring-gray-200'}`}
              >
                <Printer className="w-4 h-4 mr-2" />
                Print
              </button>
            </div>
          </div>

          {/* Student Info */}
          <div className={`p-6 rounded-2xl shadow-sm ring-1 ring-inset ${isDarkMode ? 'ring-gray-700' : 'ring-gray-200'} ${themeClasses.bgSecondary}`}>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
              <div className="flex items-center">
                <div className={`w-16 h-16 rounded-full ${themeClasses.bgCard} flex items-center justify-center mr-4 shadow-inner ring-1 ring-inset ${isDarkMode ? 'ring-gray-700' : 'ring-gray-200'}`}>
                  <User className="w-8 h-8" />
                </div>
                <div>
                  <h3 className="text-xl font-semibold">{student.full_name}</h3>
                  <p className={`text-sm ${themeClasses.textSecondary}`}>ID: {student.id}</p>
                </div>
              </div>
              
              <div className="flex items-center">
                <BookOpen className="w-5 h-5 mr-3 text-blue-500" />
                <div>
                  <p className={`text-sm ${themeClasses.textSecondary}`}>Class</p>
                  <p className="font-semibold">{student.student_class}</p>
                </div>
              </div>
              
              <div className="flex items-center">
                <Award className="w-5 h-5 mr-3 text-green-500" />
                <div>
                  <p className={`text-sm ${themeClasses.textSecondary}`}>Education Level</p>
                  <p className="font-semibold">{student.education_level}</p>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Content */}
      <div className="px-6 py-8 max-w-7xl mx-auto">
        {results.length === 0 ? (
          <div className="text-center py-16">
            <BookOpen className="w-16 h-16 text-gray-400 mx-auto mb-4" />
            <h3 className="text-xl font-semibold mb-2">No results found</h3>
            <p className={`text-sm ${themeClasses.textSecondary} mb-4`}>
              This student doesn't have any recorded results yet.
            </p>
            <button
              onClick={loadData}
              className={`px-4 py-2 rounded-lg ${themeClasses.buttonPrimary} flex items-center mx-auto`}
            >
              <RefreshCw className="w-4 h-4 mr-2" />
              Try Again
            </button>
          </div>
        ) : (
          <div className="space-y-6">
            {results.map((result) => (
              <div key={result.id} className={`p-6 rounded-2xl ${themeClasses.bgCard} border ${themeClasses.border} shadow-sm ring-1 ring-inset ${isDarkMode ? 'ring-gray-700' : 'ring-gray-200'} transition-transform duration-200 hover:shadow-md hover:-translate-y-[1px]`}>
                {/* Result Header */}
                <div className="flex items-center justify-between mb-6">
                  <div>
                    <h3 className="text-xl font-semibold mb-2">
                      {getSubjectName(result)}
                      </h3>
                    <div className="flex items-center gap-4 text-sm">
                     <span className={`${themeClasses.textSecondary}`}>
                      Session: {getExamSessionName(result)}
                      </span>
                      <span className={`${themeClasses.textSecondary}`}>
                      Term: {getTermName(result)}
                      </span>
                    </div>
                  </div>
                  
                  <div className="flex items-center gap-3">
                    {getStatusBadge(result.status)}
                    
                    {/* Status Management Buttons */}
                    {result.status === 'DRAFT' && (
                      <button
                        onClick={() => handleStatusChange(result.id, 'APPROVED', student.education_level)}
                        disabled={updatingStatus === result.id}
                        className={`px-4 py-2 rounded-lg flex items-center ${themeClasses.buttonSuccess} disabled:opacity-50 transition-all duration-200 active:scale-[.98] shadow-sm`}
                      >
                        {updatingStatus === result.id ? (
                          <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white mr-2"></div>
                        ) : (
                          <CheckCircle className="w-4 h-4 mr-2" />
                        )}
                        Approve
                      </button>
                    )}
                    
                    {result.status === 'APPROVED' && (
                      <button
                        onClick={() => handleStatusChange(result.id, 'PUBLISHED', student.education_level)}
                        disabled={updatingStatus === result.id}
                        className={`px-4 py-2 rounded-lg flex items-center ${themeClasses.buttonPrimary} disabled:opacity-50 transition-all duration-200 active:scale-[.98] shadow-sm`}
                      >
                        {updatingStatus === result.id ? (
                          <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white mr-2"></div>
                        ) : (
                          <Award className="w-4 h-4 mr-2" />
                        )}
                        Publish
                      </button>
                    )}
                    
                    {result.status === 'PUBLISHED' && (
                      <span className="text-green-600 font-medium flex items-center">
                        <CheckCircle className="w-4 h-4 mr-2" />
                        Published
                      </span>
                    )}
                    
                    {/* Edit Button */}
                    <button
                      onClick={() => handleEditResult(result)}
                      className={`px-4 py-2 rounded-lg flex items-center ${themeClasses.buttonSecondary} transition-all duration-200 active:scale-[.98] ring-1 ring-inset ${isDarkMode ? 'ring-gray-700' : 'ring-gray-200'}`}
                    >
                      <Edit className="w-4 h-4 mr-2" />
                      Edit
                    </button>
                  </div>
                </div>

                {/* Result Details */}
                <div className="mb-6">
                  {getResultDetails(result, student.education_level)}
                </div>

                {/* Additional Info */}
                <div className={`p-6 rounded-xl ${themeClasses.bgSecondary} border ${themeClasses.border} ring-1 ring-inset ${isDarkMode ? 'ring-gray-700' : 'ring-gray-200'}`}>
                  <h4 className="font-semibold mb-3">Additional Information</h4>
                  <div className="grid grid-cols-2 md:grid-cols-4 gap-6 text-sm">
                    <div>
                      <span className={`${themeClasses.textSecondary}`}>Entered By:</span>
                      <p className="font-medium">{result.entered_by?.full_name || result.entered_by_name || 'N/A'}</p>
                    </div>
                    <div>
                      <span className={`${themeClasses.textSecondary}`}>Date Entered:</span>
                      <p className="font-medium">
                        {result.created_at ? new Date(result.created_at).toLocaleDateString() : 'N/A'}
                      </p>
                    </div>
                    {(result.approved_by || result.approved_by_name) && (
                      <div>
                        <span className={`${themeClasses.textSecondary}`}>Approved By:</span>
                        <p className="font-medium">{result.approved_by?.full_name || result.approved_by_name}</p>
                      </div>
                    )}
                    {result.approved_date && (
                      <div>
                        <span className={`${themeClasses.textSecondary}`}>Approved Date:</span>
                        <p className="font-medium">
                          {new Date(result.approved_date).toLocaleDateString()}
                        </p>
                      </div>
                    )}
                    {(result.last_edited_by_name || result.last_edited_by) && (
                      <div>
                        <span className={`${themeClasses.textSecondary}`}>Last Edited By:</span>
                        <p className="font-medium">{result.last_edited_by?.full_name || result.last_edited_by_name}</p>
                      </div>
                    )}
                    {result.last_edited_at && (
                      <div>
                        <span className={`${themeClasses.textSecondary}`}>Last Edited At:</span>
                        <p className="font-medium">{new Date(result.last_edited_at).toLocaleDateString()}</p>
                      </div>
                    )}
                    {(result.published_by_name || result.published_by) && (
                      <div>
                        <span className={`${themeClasses.textSecondary}`}>Published By:</span>
                        <p className="font-medium">{result.published_by?.full_name || result.published_by_name}</p>
                      </div>
                    )}
                    {result.published_date && (
                      <div>
                        <span className={`${themeClasses.textSecondary}`}>Published Date:</span>
                        <p className="font-medium">{new Date(result.published_date).toLocaleDateString()}</p>
                      </div>
                    )}
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Edit Result Form Modal */}
      {editingResult && (
        <EditResultForm
          result={editingResult}
          student={student}
          onClose={() => setEditingResult(null)}
          onSuccess={loadData}
        />
      )}
    </div>
  );
};

export default StudentResultDetail;