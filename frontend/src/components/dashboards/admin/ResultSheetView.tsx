import React, { useState, useEffect } from 'react';
import { 
  Download, 
  X, 
  Search, 
  Filter,
  FileText,
  Users, 
  Printer,
  ChevronDown,
  ChevronUp,
  SortAsc,
  SortDesc,
  Loader2
} from 'lucide-react';
import ResultService, {
  AnySubjectResult,
  AnyTermReport,
  EducationLevelType,
  SubjectResultParams,
} from '@/services/ResultService';
import { toast } from 'react-toastify';

interface GroupedStudentResults {
  student_id: string;
  student_name: string;
  student_username?: string;
  registration_number: string;
  student_class: string;
  education_level: string;
  subjects: AnySubjectResult[];
  total_score: number;
  average_score: number;
  position: number;
  remarks?: string;
  status: string;
  term: string;
  academic_session: string;
}

interface ResultSheetViewProps {
  isOpen: boolean;
  onClose: () => void;
  selectedClass?: string;
  selectedTerm?: string;
  selectedAcademicSession?: string;
  selectedEducationLevel?: string;
  selectedResultType?: 'termly' | 'session';
}

const ResultSheetView: React.FC<ResultSheetViewProps> = ({
  isOpen,
  onClose,
  selectedClass,
  selectedTerm,
  selectedAcademicSession,
  selectedEducationLevel,
  selectedResultType = 'termly'
}) => {
  const [resultSheetData, setResultSheetData] = useState<GroupedStudentResults[]>([]);
  const [termResults, setTermResults] = useState<AnyTermReport[]>([]);
  const [filteredResults, setFilteredResults] = useState<GroupedStudentResults[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [searchTerm, setSearchTerm] = useState('');
  const [sortBy, setSortBy] = useState<'position' | 'average' | 'name'>('position');
  const [sortOrder, setSortOrder] = useState<'asc' | 'desc'>('asc');
  const [showFilters, setShowFilters] = useState(false);
  const [classFilter, setClassFilter] = useState(selectedClass || '');
  const [termFilter, setTermFilter] = useState(selectedTerm || '');
  const [academicSessionFilter, setAcademicSessionFilter] = useState(selectedAcademicSession || '');
  const [educationLevelFilter, setEducationLevelFilter] = useState(selectedEducationLevel || '');
  const [expandedStudents, setExpandedStudents] = useState<Set<string>>(new Set());

  // Fetch real result data from the API
  const fetchResultData = async () => {
    if (!educationLevelFilter) {
      setError('Education level is required to load results');
      return;
    }

    try {
      setLoading(true);
      setError(null);

      // The education level selects the endpoint rather than being a filter.
      const level = educationLevelFilter as EducationLevelType;
      const params: SubjectResultParams = {};

      // Add filters if provided
      if (termFilter) params.term = termFilter;
      if (academicSessionFilter) params.academic_session = academicSessionFilter;
      if (searchTerm) params.search = searchTerm;

      // Fetch both individual results and term results
      const [individualResults, termReportPage] = await Promise.all([
        ResultService.getSubjectResults<AnySubjectResult>(level, params),
        ResultService.getAllTermReports({ ...params, level }),
      ]);
      // getAllTermReports returns a paginated envelope, not a bare array.
      const termResultsData = termReportPage.results;

      if (import.meta.env.DEV) {
        console.log('Individual results:', individualResults);
        console.log('Term results:', termResultsData);
      }

      // Group individual results by student
      const groupedResults = groupResultsByStudent(individualResults);
      
      setResultSheetData(groupedResults);
      setTermResults(termResultsData);
      setFilteredResults(groupedResults);

      if (groupedResults.length === 0) {
        setError('No results found for the selected criteria');
      }
    } catch (err) {
      console.error('Error fetching result data:', err);
      setError('Failed to load result sheet data');
      toast.error('Failed to load result sheet data');
    } finally {
      setLoading(false);
    }
  };

  // Group individual subject results by student
  const groupResultsByStudent = (results: AnySubjectResult[]): GroupedStudentResults[] => {
    const studentMap = new Map<string, AnySubjectResult[]>();
    
    // Group results by student ID
    results.forEach(result => {
      const studentId = result.student.id;
      if (!studentMap.has(studentId)) {
        studentMap.set(studentId, []);
      }
      studentMap.get(studentId)!.push(result);
    });

    // Convert to grouped format with calculated totals
    const groupedResults: GroupedStudentResults[] = [];
    let position = 1;

    studentMap.forEach((subjectResults, studentId) => {
      if (subjectResults.length === 0) return;

      const firstResult = subjectResults[0];
      const totalScore = subjectResults.reduce((sum, result) => sum + result.total_score, 0);
      const averageScore = totalScore / subjectResults.length;

      groupedResults.push({
        student_id: studentId,
        student_name: firstResult.student.full_name,
        student_username: firstResult.student.username,
        registration_number: firstResult.student.id, // Using ID as registration number fallback
        student_class: firstResult.student.student_class,
        education_level: firstResult.student.education_level,
        subjects: subjectResults,
        total_score: totalScore,
        average_score: averageScore,
        position: position++,
        remarks: firstResult.remarks || generateRemarks(averageScore),
        status: firstResult.status,
        term: firstResult.exam_session?.term || 'N/A',
        academic_session: firstResult.exam_session?.academic_session?.name || firstResult.academic_session?.name || 'N/A'
      });
    });

    // Sort by average score (descending) and assign positions
    groupedResults.sort((a, b) => b.average_score - a.average_score);
    groupedResults.forEach((result, index) => {
      result.position = index + 1;
    });

    return groupedResults;
  };

  // Generate remarks based on average score
  const generateRemarks = (averageScore: number): string => {
    if (averageScore >= 80) return 'Excellent performance. Keep it up!';
    if (averageScore >= 70) return 'Good performance. Continue working hard.';
    if (averageScore >= 60) return 'Fair performance. Need more effort.';
    return 'Poor performance. Requires immediate attention.';
  };

  // Load data when component opens or filters change
  useEffect(() => {
    if (isOpen && educationLevelFilter) {
      fetchResultData();
    }
  }, [isOpen, educationLevelFilter, termFilter, academicSessionFilter, selectedResultType]);

  // Filter and sort results based on search and filters
  useEffect(() => {
    let filtered = resultSheetData;

    // Search filter
    if (searchTerm) {
      filtered = filtered.filter(result =>
        result.student_name.toLowerCase().includes(searchTerm.toLowerCase()) ||
        result.registration_number.toLowerCase().includes(searchTerm.toLowerCase()) ||
        (result.student_username && result.student_username.toLowerCase().includes(searchTerm.toLowerCase()))
      );
    }

    // Class filter
    if (classFilter) {
      filtered = filtered.filter(result => result.student_class === classFilter);
    }

    // Sort results
    filtered.sort((a, b) => {
      let aValue: any, bValue: any;
      
      switch (sortBy) {
        case 'position':
          aValue = a.position;
          bValue = b.position;
          break;
        case 'average':
          aValue = a.average_score;
          bValue = b.average_score;
          break;
        case 'name':
          aValue = a.student_name;
          bValue = b.student_name;
          break;
        default:
          aValue = a.position;
          bValue = b.position;
      }

      if (sortOrder === 'asc') {
        return aValue > bValue ? 1 : -1;
      } else {
        return aValue < bValue ? 1 : -1;
      }
    });

    setFilteredResults(filtered);
  }, [resultSheetData, searchTerm, classFilter, sortBy, sortOrder]);

  // Toggle student expansion
  const toggleStudentExpansion = (studentId: string) => {
    const newExpanded = new Set(expandedStudents);
    if (newExpanded.has(studentId)) {
      newExpanded.delete(studentId);
    } else {
      newExpanded.add(studentId);
    }
    setExpandedStudents(newExpanded);
  };

  // Handle sort
  const handleSort = (field: 'position' | 'average' | 'name') => {
    if (sortBy === field) {
      setSortOrder(sortOrder === 'asc' ? 'desc' : 'asc');
    } else {
      setSortBy(field);
      setSortOrder('asc');
    }
  };

  // Export to PDF
  const exportToPDF = () => {
    toast.info('PDF export functionality will be implemented soon');
  };

  // Print result sheet
  const printResultSheet = () => {
    window.print();
  };

  // Get grade color
  const getGradeColor = (grade: string) => {
    switch (grade) {
      case 'A': case 'A+': return 'bg-green-100 text-green-800';
      case 'B': case 'B+': return 'bg-blue-100 text-blue-800';
      case 'C': case 'C+': return 'bg-yellow-100 text-yellow-800';
      case 'D': case 'D+': return 'bg-orange-100 text-orange-800';
      case 'F': return 'bg-red-100 text-red-800';
      default: return 'bg-gray-100 text-gray-800';
    }
  };

  // Get education level display name
  const getEducationLevelDisplay = (level: string) => {
    const levels = {
      'NURSERY': 'Nursery',
      'PRIMARY': 'Primary',
      'JUNIOR_SECONDARY': 'Junior Secondary',
      'SENIOR_SECONDARY': 'Senior Secondary'
    };
    return levels[level as keyof typeof levels] || level;
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-lg shadow-xl max-w-7xl w-full max-h-[95vh] overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between p-6 border-b bg-gray-50">
          <div>
            <h2 className="text-2xl font-bold text-gray-900">Result Sheet</h2>
            <p className="text-gray-600 mt-1">
              {filteredResults.length} students • {getEducationLevelDisplay(educationLevelFilter)} • {classFilter || 'All Classes'} • {termFilter || 'All Terms'}
            </p>
          </div>
          <div className="flex items-center space-x-3">
            <button
              onClick={printResultSheet}
              className="flex items-center space-x-2 bg-blue-600 text-white px-3 py-2 rounded-lg hover:bg-blue-700 transition-colors"
            >
              <Printer className="w-4 h-4" />
              <span>Print</span>
            </button>
            <button
              onClick={exportToPDF}
              className="flex items-center space-x-2 bg-green-600 text-white px-3 py-2 rounded-lg hover:bg-green-700 transition-colors"
            >
              <Download className="w-4 h-4" />
              <span>Export PDF</span>
            </button>
            <button
              onClick={onClose}
              className="text-gray-400 hover:text-gray-600 transition-colors"
            >
              <X className="w-6 h-6" />
            </button>
          </div>
        </div>

        {/* Search and Filters */}
        <div className="p-6 border-b">
          <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between space-y-4 lg:space-y-0">
            <div className="flex flex-col sm:flex-row sm:items-center space-y-3 sm:space-y-0 sm:space-x-4">
              <div className="relative flex-1 max-w-md">
                <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 w-5 h-5 text-gray-400" />
                <input
                  type="text"
                  placeholder="Search students..."
                  className="w-full pl-10 pr-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                />
              </div>
              <button
                onClick={() => setShowFilters(!showFilters)}
                className={`flex items-center space-x-2 px-4 py-2 rounded-lg transition-colors ${
                  showFilters || classFilter
                    ? 'bg-blue-600 text-white hover:bg-blue-700'
                    : 'text-gray-600 bg-gray-100 hover:bg-gray-200'
                }`}
              >
                <Filter className="w-4 h-4" />
                <span>Filter</span>
              </button>
            </div>
            
            <div className="flex items-center space-x-2">
              <button
                onClick={() => handleSort('position')}
                className={`flex items-center space-x-1 px-3 py-2 rounded-lg transition-colors ${
                  sortBy === 'position' ? 'bg-blue-600 text-white' : 'text-gray-600 bg-gray-100 hover:bg-gray-200'
                }`}
              >
                <span>Position</span>
                {sortBy === 'position' && (
                  sortOrder === 'asc' ? <SortAsc className="w-4 h-4" /> : <SortDesc className="w-4 h-4" />
                )}
              </button>
              <button
                onClick={() => handleSort('average')}
                className={`flex items-center space-x-1 px-3 py-2 rounded-lg transition-colors ${
                  sortBy === 'average' ? 'bg-blue-600 text-white' : 'text-gray-600 bg-gray-100 hover:bg-gray-200'
                }`}
              >
                <span>Average</span>
                {sortBy === 'average' && (
                  sortOrder === 'asc' ? <SortAsc className="w-4 h-4" /> : <SortDesc className="w-4 h-4" />
                )}
              </button>
              <button
                onClick={() => handleSort('name')}
                className={`flex items-center space-x-1 px-3 py-2 rounded-lg transition-colors ${
                  sortBy === 'name' ? 'bg-blue-600 text-white' : 'text-gray-600 bg-gray-100 hover:bg-gray-200'
                }`}
              >
                <span>Name</span>
                {sortBy === 'name' && (
                  sortOrder === 'asc' ? <SortAsc className="w-4 h-4" /> : <SortDesc className="w-4 h-4" />
                )}
              </button>
            </div>
          </div>

          {/* Filters Panel */}
          {showFilters && (
            <div className="mt-4 p-4 bg-gray-50 rounded-lg">
              <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Education Level</label>
                  <select
                    value={educationLevelFilter}
                    onChange={(e) => setEducationLevelFilter(e.target.value)}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                  >
                    <option value="">Select Level</option>
                    <option value="NURSERY">Nursery</option>
                    <option value="PRIMARY">Primary</option>
                    <option value="JUNIOR_SECONDARY">Junior Secondary</option>
                    <option value="SENIOR_SECONDARY">Senior Secondary</option>
                  </select>
                </div>
                
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Class</label>
                  <input
                    type="text"
                    placeholder="e.g., PRIMARY_1, JSS_1"
                    value={classFilter}
                    onChange={(e) => setClassFilter(e.target.value)}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                  />
                </div>
                
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Term</label>
                  <select
                    value={termFilter}
                    onChange={(e) => setTermFilter(e.target.value)}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                  >
                    <option value="">All Terms</option>
                    <option value="FIRST">First Term</option>
                    <option value="SECOND">Second Term</option>
                    <option value="THIRD">Third Term</option>
                  </select>
                </div>
                
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Academic Session</label>
                  <input
                    type="text"
                    placeholder="e.g., 2024/2025"
                    value={academicSessionFilter}
                    onChange={(e) => setAcademicSessionFilter(e.target.value)}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                  />
                </div>
              </div>
              
              <div className="mt-4 flex justify-end">
                <button
                  onClick={() => {
                    setClassFilter('');
                    setTermFilter('');
                    setAcademicSessionFilter('');
                  }}
                  className="text-gray-600 hover:text-gray-800 text-sm font-medium transition-colors"
                >
                  Clear Filters
                </button>
              </div>
            </div>
          )}
        </div>

        {/* Results Content */}
        <div className="overflow-y-auto max-h-[calc(95vh-300px)]">
          {loading ? (
            <div className="flex items-center justify-center py-12">
              <Loader2 className="w-8 h-8 animate-spin text-blue-600" />
              <span className="ml-2 text-gray-600">Loading results...</span>
            </div>
          ) : error ? (
            <div className="text-center py-12">
              <FileText className="mx-auto h-12 w-12 text-red-400" />
              <h3 className="mt-2 text-sm font-medium text-gray-900">Error Loading Results</h3>
              <p className="mt-1 text-sm text-gray-500">{error}</p>
              <button 
                onClick={fetchResultData}
                className="mt-4 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors"
              >
                Retry
              </button>
            </div>
          ) : filteredResults.length === 0 ? (
            <div className="text-center py-12">
              <FileText className="mx-auto h-12 w-12 text-gray-400" />
              <h3 className="mt-2 text-sm font-medium text-gray-900">No results found</h3>
              <p className="mt-1 text-sm text-gray-500">
                {!educationLevelFilter 
                  ? 'Please select an education level to load results.' 
                  : 'Try adjusting your search or filters.'
                }
              </p>
            </div>
          ) : (
            <div className="p-6 space-y-6">
              {filteredResults.map((studentResult) => (
                <div key={studentResult.student_id} className="border rounded-lg overflow-hidden shadow-sm">
                  {/* Student Header */}
                  <div 
                    className="bg-gray-50 p-4 cursor-pointer hover:bg-gray-100 transition-colors"
                    onClick={() => toggleStudentExpansion(studentResult.student_id)}
                  >
                    <div className="flex items-center justify-between">
                      <div className="flex items-center space-x-4">
                        <div className="flex items-center space-x-2">
                          <span className="text-lg font-bold text-blue-600">
                            #{studentResult.position}
                          </span>
                          <div className="w-12 h-12 bg-blue-100 rounded-full flex items-center justify-center">
                            <Users className="w-6 h-6 text-blue-600" />
                          </div>
                        </div>
                        <div>
                          <h3 className="text-lg font-semibold text-gray-900">
                            {studentResult.student_name}
                          </h3>
                          <p className="text-sm text-gray-600">
                            ID: {studentResult.student_id} | Class: {studentResult.student_class} | {getEducationLevelDisplay(studentResult.education_level)}
                          </p>
                        </div>
                      </div>
                      
                      <div className="flex items-center space-x-6">
                        <div className="text-right">
                          <div className="text-2xl font-bold text-blue-600">
                            {studentResult.average_score && typeof studentResult.average_score === 'number' ? studentResult.average_score.toFixed(1) + '%' : 'N/A'}
                          </div>
                          <div className="text-sm text-gray-600">
                            Average
                          </div>
                        </div>
                        <div className="text-right">
                          <div className="text-lg font-semibold text-gray-900">
                            {studentResult.total_score && typeof studentResult.total_score === 'number' ? studentResult.total_score.toFixed(1) : 'N/A'}
                          </div>
                          <div className="text-sm text-gray-600">
                            Total Score
                          </div>
                        </div>
                        <div className="text-right">
                          <div className="text-sm font-medium text-gray-700">
                            {studentResult.subjects.length} subjects
                          </div>
                          <div className="text-sm text-gray-600">
                            Subjects
                          </div>
                        </div>
                        <div className="flex items-center space-x-2">
                          {expandedStudents.has(studentResult.student_id) ? (
                            <ChevronUp className="w-5 h-5 text-gray-500" />
                          ) : (
                            <ChevronDown className="w-5 h-5 text-gray-500" />
                          )}
                        </div>
                      </div>
                    </div>
                  </div>

                  {/* Expanded Content */}
                  {expandedStudents.has(studentResult.student_id) && (
                    <div className="p-6">
                      {/* Subjects Table */}
                      <div className="mb-6">
                        <h4 className="text-lg font-semibold text-gray-900 mb-4">Subject Results</h4>
                        <div className="overflow-x-auto">
                          <table className="min-w-full divide-y divide-gray-200">
                            <thead className="bg-gray-50">
                              <tr>
                                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                                  Subject
                                </th>
                                {educationLevelFilter === 'SENIOR_SECONDARY' && (
                                  <>
                                    <th className="px-4 py-3 text-center text-xs font-medium text-gray-500 uppercase tracking-wider">
                                      Test 1
                                    </th>
                                    <th className="px-4 py-3 text-center text-xs font-medium text-gray-500 uppercase tracking-wider">
                                      Test 2
                                    </th>
                                    <th className="px-4 py-3 text-center text-xs font-medium text-gray-500 uppercase tracking-wider">
                                      Test 3
                                    </th>
                                  </>
                                )}
                                {(educationLevelFilter === 'PRIMARY' || educationLevelFilter === 'JUNIOR_SECONDARY') && (
                                  <th className="px-4 py-3 text-center text-xs font-medium text-gray-500 uppercase tracking-wider">
                                    CA Total
                                  </th>
                                )}
                                {educationLevelFilter !== 'NURSERY' && (
                                  <th className="px-4 py-3 text-center text-xs font-medium text-gray-500 uppercase tracking-wider">
                                    Exam
                                  </th>
                                )}
                                <th className="px-4 py-3 text-center text-xs font-medium text-gray-500 uppercase tracking-wider">
                                  Total
                                </th>
                                <th className="px-4 py-3 text-center text-xs font-medium text-gray-500 uppercase tracking-wider">
                                  %
                                </th>
                                <th className="px-4 py-3 text-center text-xs font-medium text-gray-500 uppercase tracking-wider">
                                  Grade
                                </th>
                                <th className="px-4 py-3 text-center text-xs font-medium text-gray-500 uppercase tracking-wider">
                                  Position
                                </th>
                              </tr>
                            </thead>
                            <tbody className="bg-white divide-y divide-gray-200">
                              {studentResult.subjects.map((subject, index) => (
                                <tr key={index} className="hover:bg-gray-50">
                                  <td className="px-4 py-3 text-sm font-medium text-gray-900">
                                    <div>
                                      <div className="font-medium">{subject.subject.name}</div>
                                      <div className="text-xs text-gray-500">{subject.subject.code}</div>
                                    </div>
                                  </td>
                                  
                                  {/* Senior Secondary Test Scores */}
                                  {educationLevelFilter === 'SENIOR_SECONDARY' && (
                                    <>
                                      <td className="px-4 py-3 text-sm text-center text-gray-900">
                                        {subject.breakdown?.first_test_score ?? '-'}
                                      </td>
                                      <td className="px-4 py-3 text-sm text-center text-gray-900">
                                        {subject.breakdown?.second_test_score ?? '-'}
                                      </td>
                                      <td className="px-4 py-3 text-sm text-center text-gray-900">
                                        {subject.breakdown?.third_test_score ?? '-'}
                                      </td>
                                    </>
                                  )}
                                  
                                  {/* Primary/Junior Secondary CA Total */}
                                  {(educationLevelFilter === 'PRIMARY' || educationLevelFilter === 'JUNIOR_SECONDARY') && (
                                    <td className="px-4 py-3 text-sm text-center text-gray-900">
                                      {subject.breakdown?.ca_total ?? '-'}
                                    </td>
                                  )}
                                  
                                  {/* Exam Score (not for Nursery) */}
                                  {educationLevelFilter !== 'NURSERY' && (
                                    <td className="px-4 py-3 text-sm text-center text-gray-900">
                                      {subject.breakdown?.exam_score ?? '-'}
                                    </td>
                                  )}
                                  
                                  <td className="px-4 py-3 text-sm text-center font-medium text-gray-900">
                                    {subject.total_score && typeof subject.total_score === 'number' ? subject.total_score.toFixed(1) : 'N/A'}
                                  </td>
                                  <td className="px-4 py-3 text-sm text-center text-gray-900">
                                    {subject.percentage && typeof subject.percentage === 'number' ? subject.percentage.toFixed(1) + '%' : 'N/A'}
                                  </td>
                                  <td className="px-4 py-3 text-sm text-center">
                                    <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${getGradeColor(subject.grade)}`}>
                                      {subject.grade}
                                    </span>
                                  </td>
                                  <td className="px-4 py-3 text-sm text-center text-gray-900">
                                    {subject.position || '-'}
                                  </td>
                                </tr>
                              ))}
                            </tbody>
                          </table>
                        </div>
                      </div>

                      {/* Summary and Remarks */}
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                        <div className="bg-blue-50 p-4 rounded-lg">
                          <h5 className="font-semibold text-blue-900 mb-2">Performance Summary</h5>
                          <div className="space-y-2 text-sm">
                            <div className="flex justify-between">
                              <span className="text-gray-600">Total Score:</span>
                              <span className="font-medium">{studentResult.total_score && typeof studentResult.total_score === 'number' ? studentResult.total_score.toFixed(1) : 'N/A'}</span>
                            </div>
                            <div className="flex justify-between">
                              <span className="text-gray-600">Average:</span>
                              <span className="font-medium">{studentResult.average_score && typeof studentResult.average_score === 'number' ? studentResult.average_score.toFixed(1) + '%' : 'N/A'}</span>
                            </div>
                            <div className="flex justify-between">
                              <span className="text-gray-600">Position:</span>
                              <span className="font-medium">{studentResult.position}</span>
                            </div>
                            <div className="flex justify-between">
                              <span className="text-gray-600">Subjects:</span>
                              <span className="font-medium">{studentResult.subjects.length}</span>
                            </div>
                            <div className="flex justify-between">
                              <span className="text-gray-600">Status:</span>
                              <span className={`font-medium ${
                                studentResult.status === 'PUBLISHED' ? 'text-green-600' :
                                studentResult.status === 'APPROVED' ? 'text-blue-600' :
                                'text-yellow-600'
                              }`}>
                                {studentResult.status}
                              </span>
                            </div>
                          </div>
                        </div>

                        <div className="bg-green-50 p-4 rounded-lg">
                          <h5 className="font-semibold text-green-900 mb-2">Remarks</h5>
                          <div className="space-y-2 text-sm">
                            <div>
                              <span className="text-gray-600 font-medium">General:</span>
                              <p className="text-gray-800 mt-1">{studentResult.remarks}</p>
                            </div>
                            {studentResult.subjects.some(s => s.remarks) && (
                              <div>
                                <span className="text-gray-600 font-medium">Subject Remarks:</span>
                                <ul className="text-gray-800 mt-1 space-y-1">
                                  {studentResult.subjects
                                    .filter(s => s.remarks)
                                    .map((subject, idx) => (
                                      <li key={idx} className="text-xs">
                                        <strong>{subject.subject.name}:</strong> {subject.remarks}
                                      </li>
                                    ))}
                                </ul>
                              </div>
                            )}
                          </div>
                        </div>
                      </div>
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default ResultSheetView;