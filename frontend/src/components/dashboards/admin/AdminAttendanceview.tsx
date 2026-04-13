import React, { useState, useEffect } from 'react';
import { Search, Plus, Edit, Trash2, Users, Calendar, Download, Eye } from 'lucide-react';
import {
  getAttendance,
  addAttendance,
  updateAttendance,
  deleteAttendance,
  AttendanceStatusMap,
  AttendanceCodeToStatusMap,
} from '@/services/AttendanceService';
import StudentService, { Student } from '@/services/StudentService';

interface AttendanceRecord {
  id: number;
  name: string;
  type: 'student' | 'teacher' | 'staff';
  level: string;
  class: string;
  section: string;
  results?: any;
  date: string;
  status: 'present' | 'absent' | 'late' | 'excused';
  timeIn: string;
  timeOut: string;
  term: string;
  stream?: string;
  stream_type?: string;
  education_level?: string;
  education_level_display?: string;
  class_display?: string;
}

const AttendanceDashboard = () => {
  const [attendanceRecords, setAttendanceRecords] = useState<AttendanceRecord[]>([]);
  const [filteredRecords, setFilteredRecords] = useState<AttendanceRecord[]>([]);
  const [filters, setFilters] = useState<{
    level: string;
    class: string;
    type: string;
    period: string;
    date: string;
    section: string;
  }>({
    level: 'all',
    class: 'all',
    type: 'all',
    period: 'daily',
    date: new Date().toISOString().slice(0, 10),
    section: 'all',
  });
  const [showModal, setShowModal] = useState(false);
  const [editingRecord, setEditingRecord] = useState<AttendanceRecord | null>(null);
  const [searchTerm, setSearchTerm] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showExportModal, setShowExportModal] = useState(false);
  const [showReportModal, setShowReportModal] = useState(false);

  const levels = ['all', 'nursery', 'primary', 'junior_secondary', 'senior_secondary', 'secondary'];
  const types = ['all', 'student', 'teacher', 'staff'];
  const periods = ['daily', 'weekly', 'termly'];
  const sections = ['all', 'Blue', 'Red', 'Green', 'Staff', 'Support'];
  const statuses = ['present', 'absent', 'late', 'excused'];

  // Function to load attendance data
  const loadAttendanceData = async () => {
    setLoading(true);
    setError(null);
    console.log('🔍 Fetching attendance data...');
    try {
      const data = await getAttendance({});
      console.log('📊 Raw attendance data received:', data);
      console.log('📊 Data type:', typeof data);
      console.log('📊 Is array:', Array.isArray(data));
      
      // Map backend data to AttendanceRecord[]
      const attendanceData = data.results || data;
      console.log('📊 Attendance data to map:', attendanceData);
      
      if (!Array.isArray(attendanceData)) {
        console.error('❌ Attendance data is not an array:', attendanceData);
        setError('Invalid data format received from server');
        return;
      }
      
      const mapped: AttendanceRecord[] = attendanceData.map((rec: AttendanceRecordBackend) => {
        console.log('🔍 Mapping record:', rec);
        return {
          id: rec.id,
          name: rec.student_name || rec.teacher_name || `ID ${rec.student || rec.teacher}` || 'Unknown',
          type: rec.student ? 'student' : rec.teacher ? 'teacher' : 'staff',
          level: rec.student_education_level_display || '',
          class: rec.student_class_display || '',
          section: '',
          date: rec.date,
          status: AttendanceCodeToStatusMap[rec.status],
          timeIn: rec.time_in || '',
          timeOut: rec.time_out || '',
          term: '',
          stream: rec.student_stream_name || '',
          stream_type: rec.student_stream_type || '',
          education_level: rec.student_education_level || '',
          education_level_display: rec.student_education_level_display || '',
          class_display: rec.student_class_display || '',
        };
      });
      
      console.log('✅ Mapped attendance records:', mapped);
      setAttendanceRecords(mapped);
    } catch (err) {
      console.error('❌ Error fetching attendance:', err);
      setError('Failed to load attendance');
    } finally {
      setLoading(false);
    }
  };

  // Fetch attendance from backend
  useEffect(() => {
    loadAttendanceData();
  }, []); // Load once on component mount

  useEffect(() => {
    let filtered = attendanceRecords.filter(record => {
      return (
        (filters.level === 'all' || record.level === filters.level) &&
        (filters.type === 'all' || record.type === filters.type) &&
        (filters.section === 'all' || record.section === filters.section) &&
        record.name.toLowerCase().includes(searchTerm.toLowerCase())
      );
    });
    setFilteredRecords(filtered);
  }, [filters, attendanceRecords, searchTerm]);

  const handleFilterChange = (key: string, value: string) => {
    setFilters(prev => ({ ...prev, [key]: value }));
  };

  const handleAdd = (): void => {
    console.log('Add Record button clicked');
    setEditingRecord(null);
    setShowModal(true);
    console.log('Modal should be visible now, showModal:', true);
  };

  const handleEdit = (record: AttendanceRecord): void => {
    setEditingRecord(record);
    setShowModal(true);
  };

  const handleDelete = async (id: number): Promise<void> => {
    if (window.confirm('Are you sure you want to delete this record?')) {
      setLoading(true);
      try {
        await deleteAttendance(id);
        // Remove from local state immediately
        setAttendanceRecords(prev => prev.filter(record => record.id !== id));
        // Also refresh the data to ensure consistency
        loadAttendanceData();
      } catch (err) {
        console.error('Delete error:', err);
        setError('Failed to delete record');
      } finally {
        setLoading(false);
      }
    }
  };

  const handleSave = async (formData: any): Promise<void> => {
    console.log('handleSave called with formData:', formData);
    setLoading(true);
    setError(null);
    try {
      const { selectedStudent, ...rest } = formData;
      console.log('Extracted selectedStudent:', selectedStudent);
      console.log('Extracted rest:', rest);
      
      if (!selectedStudent) {
        console.log('No selectedStudent found, setting error');
        setError('Please select a student.');
        setLoading(false);
        return;
      }
      
      // Validate required fields
      if (!selectedStudent.section_id) {
        console.log('No section_id found for student:', selectedStudent);
        console.log('Student classroom:', selectedStudent.classroom);
        setError(`Student "${selectedStudent.full_name}" does not have a valid section assignment. Please ensure the student is properly enrolled in a classroom section. You may need to assign the student to a classroom first.`);
        setLoading(false);
        return;
      }
      
      const attendanceData = {
        student: selectedStudent.id,
        section: selectedStudent.section_id,
        date: rest.date || filters.date,
        status: AttendanceStatusMap[rest.status as keyof typeof AttendanceStatusMap],
        time_in: rest.timeIn || null,
        time_out: rest.timeOut || null,
      };
      
      console.log('Prepared attendanceData:', attendanceData);
      
      if (editingRecord) {
        // Update existing record
        console.log('Updating existing record:', editingRecord.id);
        await updateAttendance(editingRecord.id, attendanceData);
        // Refresh the data to ensure consistency
        loadAttendanceData();
      } else {
        // Check if attendance record already exists for this student on this date
        const existingRecords = attendanceRecords.filter(record => 
          record.name.includes(selectedStudent.full_name) && record.date === (rest.date || filters.date)
        );
        
        console.log('Existing records found:', existingRecords.length);
        
        if (existingRecords.length > 0) {
          console.log('Duplicate record found, setting error');
          setError(`Attendance record already exists for ${selectedStudent.full_name} on ${rest.date || filters.date}. Please edit the existing record instead.`);
          setLoading(false);
          return;
        }
        
        // Add new record
        console.log('Calling addAttendance API...');
        const newRec = await addAttendance(attendanceData);
        console.log('API response:', newRec);
        // Refresh the data to ensure consistency
        loadAttendanceData();
      }
      setShowModal(false);
    } catch (err: any) {
      console.error('Attendance creation error:', err);
      if (err.response?.data?.detail) {
        setError(`Failed to save record: ${err.response.data.detail}`);
      } else if (err.message) {
        setError(`Failed to save record: ${err.message}`);
      } else {
        setError('Failed to save record. Attendance record may already exist for this student on this date.');
      }
    } finally {
      setLoading(false);
    }
  };

  const getStatusColor = (status: string): string => {
    const colors: { [key: string]: string } = {
      present: 'bg-green-100 text-green-800',
      absent: 'bg-red-100 text-red-800',
      late: 'bg-yellow-100 text-yellow-800',
      excused: 'bg-blue-100 text-blue-800',
    };
    return colors[status] || 'bg-gray-100 text-gray-800';
  };

  const getAttendanceStats = () => {
    const total = filteredRecords.length;
    const present = filteredRecords.filter(r => r.status === 'present').length;
    const absent = filteredRecords.filter(r => r.status === 'absent').length;
    const late = filteredRecords.filter(r => r.status === 'late').length;
    return { total, present, absent, late, rate: total > 0 ? ((present / total) * 100).toFixed(1) : 0 };
  };

  // Export functionality
  const handleExport = () => {
    setShowExportModal(true);
  };

  // Report view functionality
  const handleViewReport = () => {
    setShowReportModal(true);
  };

  const stats = getAttendanceStats();

  return (
    <div className="bg-gray-50">
      <div className="mb-6">
        <h1 className="text-3xl font-bold text-gray-900 mb-2">Attendance Dashboard</h1>
        <p className="text-gray-600">Manage student, teacher, and staff attendance</p>
      </div>
      {loading && <div className="text-blue-600 mb-2">Loading...</div>}
      {error && <div className="text-red-600 mb-2">{error}</div>}

      {/* Stats Cards */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-6 mb-6">
        <div className="bg-white p-6 rounded-lg shadow-md">
          <div className="flex items-center">
            <Users className="h-8 w-8 text-blue-600 mr-3" />
            <div>
              <p className="text-sm font-medium text-gray-600">Total Records</p>
              <p className="text-2xl font-bold text-gray-900">{stats.total}</p>
            </div>
          </div>
        </div>
        <div className="bg-white p-6 rounded-lg shadow-md">
          <div className="flex items-center">
            <div className="h-8 w-8 bg-green-100 rounded-full flex items-center justify-center mr-3">
              <div className="h-4 w-4 bg-green-600 rounded-full"></div>
            </div>
            <div>
              <p className="text-sm font-medium text-gray-600">Present</p>
              <p className="text-2xl font-bold text-green-600">{stats.present}</p>
            </div>
          </div>
        </div>
        <div className="bg-white p-6 rounded-lg shadow-md">
          <div className="flex items-center">
            <div className="h-8 w-8 bg-red-100 rounded-full flex items-center justify-center mr-3">
              <div className="h-4 w-4 bg-red-600 rounded-full"></div>
            </div>
            <div>
              <p className="text-sm font-medium text-gray-600">Absent</p>
              <p className="text-2xl font-bold text-red-600">{stats.absent}</p>
            </div>
          </div>
        </div>
        <div className="bg-white p-6 rounded-lg shadow-md">
          <div className="flex items-center">
            <Calendar className="h-8 w-8 text-purple-600 mr-3" />
            <div>
              <p className="text-sm font-medium text-gray-600">Attendance Rate</p>
              <p className="text-2xl font-bold text-purple-600">{stats.rate}%</p>
            </div>
          </div>
        </div>
      </div>

      {/* Filters and Controls */}
      <div className="bg-white p-6 rounded-lg shadow-md mb-6">
        <div className="grid grid-cols-1 md:grid-cols-6 gap-4 mb-4">
          <select
            value={filters.type}
            onChange={(e) => handleFilterChange('type', e.target.value)}
            className="px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
          >
            <option value="all">All Types</option>
            {types.slice(1).map(type => (
              <option key={type} value={type}>{type.charAt(0).toUpperCase() + type.slice(1)}</option>
            ))}
          </select>
          
          <select
            value={filters.level}
            onChange={(e) => handleFilterChange('level', e.target.value)}
            className="px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
          >
            <option value="all">All Levels</option>
            {levels.slice(1).map(level => (
              <option key={level} value={level}>{level.charAt(0).toUpperCase() + level.slice(1)}</option>
            ))}
          </select>

          <select
            value={filters.section}
            onChange={(e) => handleFilterChange('section', e.target.value)}
            className="px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
          >
            <option value="all">All Sections</option>
            {sections.slice(1).map(section => (
              <option key={section} value={section}>{section}</option>
            ))}
          </select>

          <select
            value={filters.period}
            onChange={(e) => handleFilterChange('period', e.target.value)}
            className="px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
          >
            {periods.map(period => (
              <option key={period} value={period}>{period.charAt(0).toUpperCase() + period.slice(1)}</option>
            ))}
          </select>

          <input
            type="date"
            value={filters.date}
            onChange={(e) => handleFilterChange('date', e.target.value)}
            className="px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
          />

          <div className="relative">
            <Search className="absolute left-3 top-3 h-4 w-4 text-gray-400" />
            <input
              type="text"
              placeholder="Search by name..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="pl-10 pr-3 py-2 w-full border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>
        </div>

        <div className="flex justify-between items-center">
          <button
            onClick={handleAdd}
            className="bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 rounded-md flex items-center gap-2"
          >
            <Plus className="h-4 w-4" />
            Add Record
          </button>
          
          <div className="flex gap-2">
            <button 
              onClick={handleExport}
              className="bg-gray-600 hover:bg-gray-700 text-white px-4 py-2 rounded-md flex items-center gap-2"
            >
              <Download className="h-4 w-4" />
              Export
            </button>
            <button 
              onClick={handleViewReport}
              className="bg-green-600 hover:bg-green-700 text-white px-4 py-2 rounded-md flex items-center gap-2"
            >
              <Eye className="h-4 w-4" />
              View Report
            </button>
          </div>
        </div>
      </div>

      {/* Attendance Table */}
      <div className="bg-white rounded-lg shadow-md overflow-hidden">
        <div className="overflow-x-auto">
          <table className="min-w-full divide-y divide-gray-200">
            <thead className="bg-gray-50">
              <tr>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Name</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Type</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Level</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Class</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Stream</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Section</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Status</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Time In</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Time Out</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Actions</th>
              </tr>
            </thead>
            <tbody className="bg-white divide-y divide-gray-200">
              {filteredRecords.map((record) => (
                <tr key={record.id} className="hover:bg-gray-50">
                  <td className="px-6 py-4 whitespace-nowrap text-sm font-medium text-gray-900">{record.name}</td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500 capitalize">{record.type}</td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500 capitalize">{record.level}</td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">{record.class}</td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">{record.stream || '-'}</td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">{record.section}</td>
                  <td className="px-6 py-4 whitespace-nowrap">
                    <span className={`inline-flex px-2 py-1 text-xs font-semibold rounded-full ${getStatusColor(record.status)}`}>
                      {record.status}
                    </span>
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">{record.timeIn || '-'}</td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">{record.timeOut || '-'}</td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm font-medium">
                    <button
                      onClick={() => handleEdit(record)}
                      className="text-blue-600 hover:text-blue-900 mr-3"
                    >
                      <Edit className="h-4 w-4" />
                    </button>
                    <button
                      onClick={() => handleDelete(record.id)}
                      className="text-red-600 hover:text-red-900"
                    >
                      <Trash2 className="h-4 w-4" />
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* Modal for Add/Edit */}
      {showModal && (
        <div>
          {console.log('Rendering AttendanceModal, showModal:', showModal)}
          <AttendanceModal
            record={editingRecord}
            onClose={() => {
              console.log('Modal close clicked');
              setShowModal(false);
            }}
            onSave={handleSave}
            levels={levels.slice(1)}
            sections={sections.slice(1)}
            statuses={statuses}
            types={types.slice(1)}
          />
        </div>
      )}

      {/* Export Modal */}
      {showExportModal && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4 z-50">
          <div className="bg-white rounded-lg max-w-md w-full">
            <div className="p-6">
              <h3 className="text-lg font-semibold mb-4">Export Attendance Data</h3>
              <div className="space-y-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">Export Format</label>
                  <select className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500">
                    <option value="csv">CSV</option>
                    <option value="excel">Excel</option>
                    <option value="pdf">PDF</option>
                  </select>
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">Date Range</label>
                  <div className="grid grid-cols-2 gap-2">
                    <input
                      type="date"
                      className="px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                    />
                    <input
                      type="date"
                      className="px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                    />
                  </div>
                </div>
                <div className="flex justify-end space-x-3 pt-4">
                  <button
                    onClick={() => setShowExportModal(false)}
                    className="px-4 py-2 text-gray-600 border border-gray-300 rounded-md hover:bg-gray-50"
                  >
                    Cancel
                  </button>
                  <button
                    onClick={() => {
                      // TODO: Implement export functionality
                      alert('Export functionality will be implemented here');
                      setShowExportModal(false);
                    }}
                    className="px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700"
                  >
                    Export
                  </button>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Report View Modal */}
      {showReportModal && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4 z-50">
          <div className="bg-white rounded-lg max-w-4xl w-full max-h-[90vh] overflow-y-auto">
            <div className="p-6">
              <h3 className="text-lg font-semibold mb-4">Attendance Report</h3>
              <div className="space-y-6">
                {/* Summary Statistics */}
                <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                  <div className="bg-blue-50 p-4 rounded-lg">
                    <h4 className="text-sm font-medium text-blue-600">Total Records</h4>
                    <p className="text-2xl font-bold text-blue-900">{stats.total}</p>
                  </div>
                  <div className="bg-green-50 p-4 rounded-lg">
                    <h4 className="text-sm font-medium text-green-600">Present</h4>
                    <p className="text-2xl font-bold text-green-900">{stats.present}</p>
                  </div>
                  <div className="bg-red-50 p-4 rounded-lg">
                    <h4 className="text-sm font-medium text-red-600">Absent</h4>
                    <p className="text-2xl font-bold text-red-900">{stats.absent}</p>
                  </div>
                  <div className="bg-purple-50 p-4 rounded-lg">
                    <h4 className="text-sm font-medium text-purple-600">Attendance Rate</h4>
                    <p className="text-2xl font-bold text-purple-900">{stats.rate}%</p>
                  </div>
                </div>

                {/* Detailed Report Table */}
                <div className="bg-gray-50 rounded-lg p-4">
                  <h4 className="text-md font-semibold mb-3">Detailed Report</h4>
                  <div className="overflow-x-auto">
                    <table className="min-w-full divide-y divide-gray-200">
                      <thead className="bg-gray-100">
                        <tr>
                          <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase">Name</th>
                          <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase">Type</th>
                          <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase">Status</th>
                          <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase">Date</th>
                        </tr>
                      </thead>
                      <tbody className="bg-white divide-y divide-gray-200">
                        {filteredRecords.slice(0, 10).map((record) => (
                          <tr key={record.id}>
                            <td className="px-4 py-2 text-sm text-gray-900">{record.name}</td>
                            <td className="px-4 py-2 text-sm text-gray-500 capitalize">{record.type}</td>
                            <td className="px-4 py-2 text-sm">
                              <span className={`inline-flex px-2 py-1 text-xs font-semibold rounded-full ${getStatusColor(record.status)}`}>
                                {record.status}
                              </span>
                            </td>
                            <td className="px-4 py-2 text-sm text-gray-500">{record.date}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                  {filteredRecords.length > 10 && (
                    <p className="text-sm text-gray-500 mt-2">Showing first 10 records of {filteredRecords.length} total records</p>
                  )}
                </div>

                <div className="flex justify-end space-x-3 pt-4">
                  <button
                    onClick={() => setShowReportModal(false)}
                    className="px-4 py-2 text-gray-600 border border-gray-300 rounded-md hover:bg-gray-50"
                  >
                    Close
                  </button>
                  <button
                    onClick={() => {
                      // TODO: Implement print functionality
                      window.print();
                    }}
                    className="px-4 py-2 bg-green-600 text-white rounded-md hover:bg-green-700"
                  >
                    Print Report
                  </button>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

interface AttendanceModalProps {
  record: AttendanceRecord | null;
  onClose: () => void;
  onSave: (formData: Omit<AttendanceRecord, 'id' | 'date'> & { date?: string }) => void;
  levels: string[];
  sections: string[];
  statuses: string[];
  types: string[];
}

const AttendanceModal: React.FC<AttendanceModalProps> = ({ record, onClose, onSave, levels, sections, statuses, types }) => {
  console.log('AttendanceModal component rendered');
  console.log('Modal props:', { record, levels, sections, statuses, types });
  
  const [formData, setFormData] = useState<Omit<AttendanceRecord, 'id' | 'date'> & { date?: string }>({
    name: record?.name || '',
    type: (record?.type as 'student' | 'teacher' | 'staff') || 'student',
    level: record?.level || 'primary',
    class: record?.class || '',
    section: record?.section || 'Blue',
    status: (record?.status as 'present' | 'absent' | 'late' | 'excused') || 'present',
    timeIn: record?.timeIn || '',
    timeOut: record?.timeOut || '',
    term: record?.term || 'Second Term',
  });
  const [selectedStudent, setSelectedStudent] = useState<Student | null>(null);
  const [studentQuery, setStudentQuery] = useState('');
  const [studentOptions, setStudentOptions] = useState<Student[]>([]);
  const [studentLoading, setStudentLoading] = useState(false);

  // Autocomplete student search
  useEffect(() => {
    if (studentQuery.length < 2) {
      setStudentOptions([]);
      return;
    }
    setStudentLoading(true);
    StudentService.searchStudents(studentQuery).then((students) => {
      setStudentOptions(students);
      setStudentLoading(false);
    });
  }, [studentQuery]);

  // When a student is selected, auto-populate fields and store the student object
  const handleStudentSelect = (student: Student) => {
    setFormData(prev => ({
      ...prev,
      name: student.full_name,
      type: 'student',
      level: student.education_level_display || '',
      class: student.student_class_display || '',
      section: student.classroom || '',
      stream: student.stream_name || '',
      education_level: student.education_level || '',
    }));
    setSelectedStudent(student);
    setStudentQuery(student.full_name);
    setStudentOptions([]);
  };

  const handleChange = (key: string, value: string) => {
    setFormData(prev => ({ ...prev, [key]: value }));
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    console.log('Form submitted');
    console.log('Form data:', formData);
    console.log('Selected student:', selectedStudent);
    // Pass selectedStudent along with formData
    onSave({ ...formData, selectedStudent });
  };

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4 z-50">
      <div className="bg-white rounded-lg max-w-md w-full max-h-[90vh] overflow-y-auto">
        <div className="p-6">
          <h3 className="text-lg font-semibold mb-4">
            {record ? 'Edit Attendance Record' : 'Add Attendance Record'}
          </h3>
          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Student Username</label>
              <input
                type="text"
                value={studentQuery}
                onChange={e => setStudentQuery(e.target.value)}
                placeholder="Search by username..."
                className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                autoComplete="off"
              />
              {studentLoading && <div className="text-xs text-gray-400">Searching...</div>}
              {studentOptions.length > 0 && (
                <ul className="border rounded bg-white mt-1 max-h-40 overflow-y-auto z-10">
                  {studentOptions.map(student => (
                    <li
                      key={student.id}
                      className="px-3 py-2 hover:bg-blue-100 cursor-pointer"
                      onClick={() => handleStudentSelect(student)}
                    >
                      {student.full_name} ({student.email || student.id})
                    </li>
                  ))}
                </ul>
              )}
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Date</label>
              <input
                type="date"
                value={formData.date || new Date().toISOString().slice(0, 10)}
                onChange={(e) => handleChange('date', e.target.value)}
                className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                required
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Type</label>
              <input
                type="text"
                value={formData.type}
                disabled
                className="w-full px-3 py-2 border border-gray-300 rounded-md bg-gray-100"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Level</label>
              <input
                type="text"
                value={formData.level}
                disabled
                className="w-full px-3 py-2 border border-gray-300 rounded-md bg-gray-100"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Class</label>
              <input
                type="text"
                value={formData.class}
                disabled
                className="w-full px-3 py-2 border border-gray-300 rounded-md bg-gray-100"
              />
            </div>
            {formData.education_level === 'SENIOR_SECONDARY' && (
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Stream</label>
                <input
                  type="text"
                  value={formData.stream || 'Not assigned'}
                  disabled
                  className="w-full px-3 py-2 border border-gray-300 rounded-md bg-gray-100"
                />
              </div>
            )}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Section</label>
              <input
                type="text"
                value={formData.section}
                disabled
                className="w-full px-3 py-2 border border-gray-300 rounded-md bg-gray-100"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Status</label>
              <select
                value={formData.status}
                onChange={(e) => handleChange('status', e.target.value)}
                className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
              >
                {statuses.map(status => (
                  <option key={status} value={status}>{status.charAt(0).toUpperCase() + status.slice(1)}</option>
                ))}
              </select>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Time In</label>
                <input
                  type="time"
                  value={formData.timeIn}
                  onChange={(e) => handleChange('timeIn', e.target.value)}
                  className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Time Out</label>
                <input
                  type="time"
                  value={formData.timeOut}
                  onChange={(e) => handleChange('timeOut', e.target.value)}
                  className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>
            </div>
            <div className="flex gap-3 pt-4">
              <button
                type="submit"
                className="flex-1 bg-blue-600 hover:bg-blue-700 text-white py-2 px-4 rounded-md"
              >
                {record ? 'Update' : 'Add'} Record
              </button>
              <button
                type="button"
                onClick={onClose}
                className="flex-1 bg-gray-300 hover:bg-gray-400 text-gray-700 py-2 px-4 rounded-md"
              >
                Cancel
              </button>
            </div>
          </form>
        </div>
      </div>
    </div>
  );
};

export default AttendanceDashboard;