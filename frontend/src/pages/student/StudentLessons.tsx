// import React, { useState, useEffect, useCallback } from 'react';
// import StudentSchedule from '@/components/dashboards/student/StudentSchedule';
// import StudentService, { 
//   StudentService as StudentServiceClass,
//   StudentSchedule as StudentScheduleType, 
//   DaySchedule, 
//   ScheduleItem,
//   WeeklySchedule,
//   ScheduleFilters,
// } from '@/services/StudentService';
// import { Bell, Settings, Download, Calendar, Clock } from 'lucide-react';

// const StudentLessons: React.FC = () => {
//   const [scheduleData, setScheduleData] = useState<StudentScheduleType | null>(null);
//   const [weeklySchedule, setWeeklySchedule] = useState<WeeklySchedule | null>(null);
//   const [currentPeriod, setCurrentPeriod] = useState<any>(null);
//   const [loading, setLoading] = useState(true);
//   const [error, setError] = useState<string | null>(null);
//   const [lastUpdated, setLastUpdated] = useState<Date | null>(null);
//   const [showSettings, setShowSettings] = useState(false);
  
//   // Settings state
//   const [settings, setSettings] = useState({
//     autoRefresh: true,
//     refreshInterval: 5, // minutes
//     showBreaks: true,
//     notifications: true
//   });

//   // Fetch all schedule data
//   const fetchScheduleData = useCallback(async (filters?: ScheduleFilters) => {
//     try {
//       setLoading(true);
//       setError(null);
      
//       
//       // Fetch main schedule data
//       const [schedule, weekly, current] = await Promise.all([
//         StudentService.getStudentSchedule(undefined, filters),
//         StudentService.getWeeklySchedule(),
//         StudentService.getCurrentPeriod().catch(() => ({ current: null, next: null }))
//       ]);

//       setScheduleData(schedule);
//       setWeeklySchedule(weekly);
//       setCurrentPeriod(current);
//       setLastUpdated(new Date());
      
//       console.log('✅ Schedule data loaded:', { schedule, weekly, current });
      
//     } catch (err) {
//       console.error('❌ Error loading schedule:', err);
//       setError(err instanceof Error ? err.message : 'Failed to load schedule');
//     } finally {
//       setLoading(false);
//     }
//   }, []);

//   // Initial load
//   useEffect(() => {
//     fetchScheduleData();
//   }, [fetchScheduleData]);

//   // Auto-refresh functionality
//   useEffect(() => {
//     if (!settings.autoRefresh) return;

//     const interval = setInterval(() => {
//       console.log('🔄 Auto-refreshing schedule...');
//       fetchScheduleData();
//     }, settings.refreshInterval * 60 * 1000);

//     return () => clearInterval(interval);
//   }, [settings.autoRefresh, settings.refreshInterval, fetchScheduleData]);

//   // Refresh current period more frequently
//   useEffect(() => {
//     const interval = setInterval(async () => {
//       try {
//         const current = await StudentService.getCurrentPeriod();
//         setCurrentPeriod(current);
//       } catch (err) {
//         // Silently fail for current period updates
//         console.warn('Failed to update current period:', err);
//       }
//     }, 60000); // Every minute

//     return () => clearInterval(interval);
//   }, []);

//   const handleRefreshSchedule = useCallback(async () => {
//     await fetchScheduleData();
//   }, [fetchScheduleData]);

//   const handleFilterChange = useCallback((filters: ScheduleFilters) => {
//     // fire-and-forget to satisfy (filters) => void signature
//     void fetchScheduleData(filters);
//   }, [fetchScheduleData]);

//   const handleExportSchedule = async () => {
//     if (!scheduleData) return;

//     try {
//       // Create a simple text export of the schedule
//       let exportText = `Schedule for ${scheduleData.student.full_name}\n`;
//       exportText += `Class: ${scheduleData.student.student_class}\n`;
//       exportText += `Generated: ${new Date().toLocaleString()}\n\n`;

//       Object.entries(scheduleData.schedule_by_day).forEach(([day, daySchedule]) => {
//         if (daySchedule.periods.length > 0) {
//           exportText += `${daySchedule.day_display.toUpperCase()}\n`;
//           exportText += '=' + '='.repeat(daySchedule.day_display.length) + '\n';
          
//           daySchedule.periods.forEach(period => {
//             if (!period.is_break) {
//               exportText += `${StudentServiceClass.formatTime(period.start_time)} - ${StudentServiceClass.formatTime(period.end_time)}: `;
//               exportText += `${period.subject?.name || period.subject_name} `;
//               exportText += `(${period.teacher?.full_name || period.teacher_name}) `;
//               exportText += `[${period.classroom?.name || period.classroom_name}]\n`;
//             }
//           });
//           exportText += '\n';
//         }
//       });

//       // Create and download file
//       const blob = new Blob([exportText], { type: 'text/plain' });
//       const url = URL.createObjectURL(blob);
//       const a = document.createElement('a');
//       a.href = url;
//       a.download = `schedule-${scheduleData.student.full_name.replace(/\s+/g, '_')}-${new Date().toISOString().split('T')[0]}.txt`;
//       document.body.appendChild(a);
//       a.click();
//       document.body.removeChild(a);
//       URL.revokeObjectURL(url);
      
//       console.log('✅ Schedule exported successfully');
//     } catch (err) {
//       console.error('❌ Error exporting schedule:', err);
//     }
//   };

//   const renderHeader = () => (
//     <div className="bg-white shadow-sm border-b sticky top-0 z-10">
//       <div className="container mx-auto px-4 py-4">
//         <div className="flex justify-between items-center">
//           <div>
//             <h1 className="text-2xl font-bold text-gray-800">My Class Schedule</h1>
//             <div className="flex items-center space-x-4 mt-1">
//               <p className="text-gray-600">View your weekly timetable and upcoming classes</p>
//               {lastUpdated && (
//                 <span className="text-xs text-gray-500 flex items-center">
//                   <Clock className="h-3 w-3 mr-1" />
//                   Updated {lastUpdated.toLocaleTimeString()}
//                 </span>
//               )}
//             </div>
//           </div>
          
//           <div className="flex items-center space-x-2">
//             {/* Current Period Indicator */}
//             {currentPeriod?.current && (
//               <div className="bg-blue-50 border border-blue-200 rounded-lg px-3 py-2 mr-4">
//                 <div className="text-xs text-blue-600 font-medium">Current Class</div>
//                 <div className="text-sm font-semibold text-blue-800">
//                   {currentPeriod.current.subject?.name || currentPeriod.current.subject_name}
//                 </div>
//               </div>
//             )}

//             {/* Next Period Indicator */}
//             {currentPeriod?.next && (
//               <div className="bg-green-50 border border-green-200 rounded-lg px-3 py-2 mr-4">
//                 <div className="text-xs text-green-600 font-medium">Up Next</div>
//                 <div className="text-sm font-semibold text-green-800">
//                   {currentPeriod.next.subject?.name || currentPeriod.next.subject_name}
//                 </div>
//               </div>
//             )}

//             {/* Action Buttons */}
//             <button
//               onClick={handleExportSchedule}
//               disabled={!scheduleData}
//               className="p-2 text-gray-600 hover:text-blue-600 hover:bg-blue-50 rounded-lg transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
//               title="Export schedule"
//             >
//               <Download className="h-5 w-5" />
//             </button>

//             <button
//               onClick={() => setShowSettings(!showSettings)}
//               className="p-2 text-gray-600 hover:text-blue-600 hover:bg-blue-50 rounded-lg transition-colors"
//               title="Settings"
//             >
//               <Settings className="h-5 w-5" />
//             </button>

//             {settings.notifications && currentPeriod?.next && (
//               <button
//                 className="p-2 text-amber-600 hover:text-amber-700 hover:bg-amber-50 rounded-lg transition-colors"
//                 title="Next class notification"
//               >
//                 <Bell className="h-5 w-5" />
//               </button>
//             )}
//           </div>
//         </div>

//         {/* Settings Panel */}
//         {showSettings && (
//           <div className="mt-4 bg-gray-50 border rounded-lg p-4">
//             <h3 className="font-semibold text-gray-800 mb-3">Schedule Settings</h3>
//             <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
//               <label className="flex items-center space-x-2">
//                 <input
//                   type="checkbox"
//                   checked={settings.autoRefresh}
//                   onChange={(e) => setSettings(prev => ({ ...prev, autoRefresh: e.target.checked }))}
//                   className="rounded"
//                 />
//                 <span className="text-sm text-gray-700">Auto-refresh</span>
//               </label>
              
//               <div className="flex items-center space-x-2">
//                 <label className="text-sm text-gray-700">Refresh interval:</label>
//                 <select
//                   value={settings.refreshInterval}
//                   onChange={(e) => setSettings(prev => ({ ...prev, refreshInterval: Number(e.target.value) }))}
//                   className="text-sm border rounded px-2 py-1"
//                   disabled={!settings.autoRefresh}
//                 >
//                   <option value={1}>1 min</option>
//                   <option value={5}>5 min</option>
//                   <option value={10}>10 min</option>
//                   <option value={30}>30 min</option>
//                 </select>
//               </div>
              
//               <label className="flex items-center space-x-2">
//                 <input
//                   type="checkbox"
//                   checked={settings.showBreaks}
//                   onChange={(e) => setSettings(prev => ({ ...prev, showBreaks: e.target.checked }))}
//                   className="rounded"
//                 />
//                 <span className="text-sm text-gray-700">Show breaks</span>
//               </label>
              
//               <label className="flex items-center space-x-2">
//                 <input
//                   type="checkbox"
//                   checked={settings.notifications}
//                   onChange={(e) => setSettings(prev => ({ ...prev, notifications: e.target.checked }))}
//                   className="rounded"
//                 />
//                 <span className="text-sm text-gray-700">Notifications</span>
//               </label>
//             </div>
//           </div>
//         )}
//       </div>
//     </div>
//   );

//   const renderQuickStats = () => {
//     if (!scheduleData?.metadata) return null;

//     const { metadata } = scheduleData;
    
//     return (
//       <div className="bg-gradient-to-r from-blue-50 to-indigo-50 border border-blue-200 rounded-lg p-4 mb-6">
//         <div className="grid grid-cols-2 md:grid-cols-5 gap-4 text-center">
//           <div>
//             <div className="text-2xl font-bold text-blue-600">{metadata.total_periods}</div>
//             <div className="text-sm text-blue-800">Total Periods</div>
//           </div>
//           <div>
//             <div className="text-2xl font-bold text-blue-600">{metadata.unique_subjects}</div>
//             <div className="text-sm text-blue-800">Subjects</div>
//           </div>
//           <div>
//             <div className="text-2xl font-bold text-blue-600">{metadata.unique_teachers}</div>
//             <div className="text-sm text-blue-800">Teachers</div>
//           </div>
//           <div>
//             <div className="text-2xl font-bold text-blue-600">
//               {metadata.today_schedule?.periods.length || 0}
//             </div>
//             <div className="text-sm text-blue-800">Today's Classes</div>
//           </div>
//           <div>
//             <div className="text-2xl font-bold text-blue-600">
//               {Math.round((metadata.total_periods * 40) / 60)}h
//             </div>
//             <div className="text-sm text-blue-800">Weekly Hours</div>
//           </div>
//         </div>
//       </div>
//     );
//   };

//   if (loading && !scheduleData) {
//     return (
//       <div className="min-h-screen bg-gray-50">
//         {renderHeader()}
//         <div className="container mx-auto p-4">
//           <div className="flex justify-center items-center min-h-[400px]">
//             <div className="text-center">
//               <div className="animate-spin rounded-full h-16 w-16 border-b-2 border-blue-600 mx-auto mb-4"></div>
//               <p className="text-gray-600">Loading your schedule...</p>
//             </div>
//           </div>
//         </div>
//       </div>
//     );
//   }

//   if (error && !scheduleData) {
//     return (
//       <div className="min-h-screen bg-gray-50">
//         {renderHeader()}
//         <div className="container mx-auto p-4">
//           <div className="flex flex-col justify-center items-center min-h-[400px]">
//             <div className="bg-red-50 border border-red-200 rounded-md p-8 max-w-md text-center">
//               <Calendar className="h-16 w-16 text-red-400 mx-auto mb-4" />
//               <div className="text-red-800 font-medium text-lg mb-2">Error Loading Schedule</div>
//               <div className="text-red-600 mb-4">{error}</div>
//               <button 
//                 onClick={handleRefreshSchedule}
//                 className="bg-red-600 text-white px-6 py-3 rounded-lg hover:bg-red-700 transition-colors font-medium"
//               >
//                 Try Again
//               </button>
//             </div>
//           </div>
//         </div>
//       </div>
//     );
//   }

//   return (
//     <div className="min-h-screen bg-gray-50">
//       {renderHeader()}
      
//       <div className="container mx-auto p-4">
//         {renderQuickStats()}
        
//         <StudentSchedule 
//           scheduleData={scheduleData}
//           loading={loading}
//           error={error}
//           onRefresh={handleRefreshSchedule}
//           onFilterChange={handleFilterChange}
//         />
        
//         {/* Additional Debug Information in Development */}
//         {process.env.NODE_ENV === 'development' && scheduleData && (
//           <div className="mt-8 bg-white border rounded-lg p-4">
//             <h3 className="font-semibold text-gray-800 mb-2">Debug Information</h3>
//             <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-sm">
//               <div>
//                 <strong>Student ID:</strong> {scheduleData.student.id}
//               </div>
//               <div>
//                 <strong>Academic Year:</strong> {scheduleData.academic_year || 'N/A'}
//               </div>
//               <div>
//                 <strong>Term:</strong> {scheduleData.term || 'N/A'}
//               </div>
//               <div>
//                 <strong>Week Range:</strong> {scheduleData.week_start} to {scheduleData.week_end}
//               </div>
//               <div>
//                 <strong>Last Updated:</strong> {lastUpdated?.toLocaleString()}
//               </div>
//               <div>
//                 <strong>Auto Refresh:</strong> {settings.autoRefresh ? `Every ${settings.refreshInterval}min` : 'Disabled'}
//               </div>
//             </div>
//           </div>
//         )}
//       </div>
//     </div>
//   );
// };

// export default StudentLessons;


import React, { useState, useEffect, useCallback } from 'react';
import StudentSchedule from '@/components/dashboards/student/StudentSchedule';
import StudentService, {
  StudentSchedule as StudentScheduleType,
} from '@/services/StudentService';

const formatTime = (t: string) => {
  if (!t) return '';
  const [h, m] = t.split(':');
  const hour = parseInt(h, 10);
  const ampm = hour >= 12 ? 'PM' : 'AM';
  return `${hour % 12 || 12}:${m} ${ampm}`;
};
import { Bell, Settings, Download, Calendar, Clock } from 'lucide-react';

const StudentLessons: React.FC = () => {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const [scheduleData, setScheduleData] = useState<any>(null);
  const [currentPeriod, setCurrentPeriod] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null);
  const [showSettings, setShowSettings] = useState(false);
  
  // Settings state
  const [settings, setSettings] = useState({
    autoRefresh: true,
    refreshInterval: 5, // minutes
    showBreaks: true,
    notifications: true
  });

  // Fetch all schedule data
  const fetchScheduleData = useCallback(async (filters?: Record<string, any>) => {
    try {
      setLoading(true);
      setError(null);

      // 404 means the student has no schedule yet — treat as empty, not an error
      const emptyDays = { monday: [], tuesday: [], wednesday: [], thursday: [], friday: [], saturday: [], sunday: [] };
      const emptySchedule: StudentScheduleType = {
        student_info: { id: 0, name: '', class: '' },
        schedule: [],
        schedule_by_day: emptyDays,
        total_periods: 0,
      };
      const [schedule, current] = await Promise.all([
        StudentService.getStudentSchedule().catch((e: any) =>
          e?.response?.status === 404 || e?.status === 404 ? emptySchedule : Promise.reject(e)
        ),
        StudentService.getCurrentPeriod().catch(() => ({ current: null, next: null })),
      ]);

      setScheduleData(schedule);
      setCurrentPeriod(current);
      setLastUpdated(new Date());
      
    } catch (err) {
      console.error('❌ Error loading schedule:', err);
      setError(err instanceof Error ? err.message : 'Failed to load schedule');
    } finally {
      setLoading(false);
    }
  }, []);

  // Initial load
  useEffect(() => {
    fetchScheduleData();
  }, [fetchScheduleData]);

  // Auto-refresh functionality
  useEffect(() => {
    if (!settings.autoRefresh) return;

    const interval = setInterval(() => {
      console.log('🔄 Auto-refreshing schedule...');
      fetchScheduleData();
    }, settings.refreshInterval * 60 * 1000);

    return () => clearInterval(interval);
  }, [settings.autoRefresh, settings.refreshInterval, fetchScheduleData]);

  // Refresh current period more frequently
  useEffect(() => {
    const interval = setInterval(async () => {
      try {
        const current = await StudentService.getCurrentPeriod();
        setCurrentPeriod(current);
      } catch (err) {
        // Silently fail for current period updates
        console.warn('Failed to update current period:', err);
      }
    }, 60000); // Every minute

    return () => clearInterval(interval);
  }, []);

  const handleRefreshSchedule = useCallback(async () => {
    await fetchScheduleData();
  }, [fetchScheduleData]);

  const handleFilterChange = useCallback((filters: Record<string, any>) => {
    void fetchScheduleData(filters);
  }, [fetchScheduleData]);

  const handleExportSchedule = async () => {
    if (!scheduleData || !scheduleData.schedule_by_day) return;

    try {
      // Create a simple text export of the schedule
      let exportText = `Schedule for ${scheduleData.student?.full_name || 'Student'}\n`;
      exportText += `Class: ${scheduleData.student?.student_class || 'N/A'}\n`;
      exportText += `Generated: ${new Date().toLocaleString()}\n\n`;

      // Safe iteration over schedule_by_day
      const scheduleByDay: Record<string, any> = scheduleData.schedule_by_day || {};
      Object.entries(scheduleByDay).forEach(([day, daySchedule]: [string, any]) => {
        if (daySchedule && daySchedule.periods && daySchedule.periods.length > 0) {
          exportText += `${daySchedule.day_display?.toUpperCase() || day.toUpperCase()}\n`;
          exportText += '=' + '='.repeat((daySchedule.day_display || day).length) + '\n';

          daySchedule.periods.forEach((period: any) => {
            if (period && !period.is_break) {
              exportText += `${formatTime(period.start_time)} - ${formatTime(period.end_time)}: `;
              exportText += `${period.subject?.name || period.subject_name || 'N/A'} `;
              exportText += `(${period.teacher?.full_name || period.teacher_name || 'N/A'}) `;
              exportText += `[${period.classroom?.name || period.classroom_name || 'N/A'}]\n`;
            }
          });
          exportText += '\n';
        }
      });

      // Create and download file
      const blob = new Blob([exportText], { type: 'text/plain' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `schedule-${(scheduleData.student?.full_name || 'student').replace(/\s+/g, '_')}-${new Date().toISOString().split('T')[0]}.txt`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
      
      console.log('✅ Schedule exported successfully');
    } catch (err) {
      console.error('❌ Error exporting schedule:', err);
    }
  };

  const renderHeader = () => (
    <div className="bg-white dark:bg-slate-800 shadow-sm border-b dark:border-slate-700 sticky top-0 z-10">
      <div className="container mx-auto px-4 py-4">
        <div className="flex justify-between items-center">
          <div>
            <h1 className="text-2xl font-bold text-gray-800 dark:text-slate-100">My Class Schedule</h1>
            <div className="flex items-center space-x-4 mt-1">
              <p className="text-gray-600 dark:text-slate-400">View your weekly timetable and upcoming classes</p>
              {lastUpdated && (
                <span className="text-xs text-gray-500 dark:text-slate-500 flex items-center">
                  <Clock className="h-3 w-3 mr-1" />
                  Updated {lastUpdated.toLocaleTimeString()}
                </span>
              )}
            </div>
          </div>
          
          <div className="flex items-center space-x-2">
            {/* Current Period Indicator */}
            {currentPeriod?.current && (
              <div className="bg-blue-50 dark:bg-blue-900/30 border border-blue-200 dark:border-blue-800 rounded-lg px-3 py-2 mr-4">
                <div className="text-xs text-blue-600 dark:text-blue-400 font-medium">Current Class</div>
                <div className="text-sm font-semibold text-blue-800 dark:text-blue-300">
                  {currentPeriod.current.subject?.name || currentPeriod.current.subject_name || 'N/A'}
                </div>
              </div>
            )}

            {/* Next Period Indicator */}
            {currentPeriod?.next && (
              <div className="bg-green-50 dark:bg-green-900/30 border border-green-200 dark:border-green-800 rounded-lg px-3 py-2 mr-4">
                <div className="text-xs text-green-600 dark:text-green-400 font-medium">Up Next</div>
                <div className="text-sm font-semibold text-green-800 dark:text-green-300">
                  {currentPeriod.next.subject?.name || currentPeriod.next.subject_name || 'N/A'}
                </div>
              </div>
            )}

            {/* Action Buttons */}
            <button
              onClick={handleExportSchedule}
              disabled={!scheduleData}
              className="p-2 text-gray-600 dark:text-slate-400 hover:text-blue-600 dark:hover:text-blue-400 hover:bg-blue-50 dark:hover:bg-blue-900/30 rounded-lg transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
              title="Export schedule"
            >
              <Download className="h-5 w-5" />
            </button>

            <button
              onClick={() => setShowSettings(!showSettings)}
              className="p-2 text-gray-600 dark:text-slate-400 hover:text-blue-600 dark:hover:text-blue-400 hover:bg-blue-50 dark:hover:bg-blue-900/30 rounded-lg transition-colors"
              title="Settings"
            >
              <Settings className="h-5 w-5" />
            </button>

            {settings.notifications && currentPeriod?.next && (
              <button
                className="p-2 text-amber-600 dark:text-amber-400 hover:text-amber-700 dark:hover:text-amber-500 hover:bg-amber-50 dark:hover:bg-amber-900/30 rounded-lg transition-colors"
                title="Next class notification"
              >
                <Bell className="h-5 w-5" />
              </button>
            )}
          </div>
        </div>

        {/* Settings Panel */}
        {showSettings && (
          <div className="mt-4 bg-gray-50 dark:bg-slate-700/50 border dark:border-slate-600 rounded-lg p-4">
            <h3 className="font-semibold text-gray-800 dark:text-slate-100 mb-3">Schedule Settings</h3>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              <label className="flex items-center space-x-2">
                <input
                  type="checkbox"
                  checked={settings.autoRefresh}
                  onChange={(e) => setSettings(prev => ({ ...prev, autoRefresh: e.target.checked }))}
                  className="rounded"
                />
                <span className="text-sm text-gray-700 dark:text-slate-300">Auto-refresh</span>
              </label>
              
              <div className="flex items-center space-x-2">
                <label className="text-sm text-gray-700 dark:text-slate-300">Refresh interval:</label>
                <select
                  value={settings.refreshInterval}
                  onChange={(e) => setSettings(prev => ({ ...prev, refreshInterval: Number(e.target.value) }))}
                  className="text-sm border dark:border-slate-600 dark:bg-slate-800 dark:text-slate-200 rounded px-2 py-1"
                  disabled={!settings.autoRefresh}
                >
                  <option value={1}>1 min</option>
                  <option value={5}>5 min</option>
                  <option value={10}>10 min</option>
                  <option value={30}>30 min</option>
                </select>
              </div>
              
              <label className="flex items-center space-x-2">
                <input
                  type="checkbox"
                  checked={settings.showBreaks}
                  onChange={(e) => setSettings(prev => ({ ...prev, showBreaks: e.target.checked }))}
                  className="rounded"
                />
                <span className="text-sm text-gray-700 dark:text-slate-300">Show breaks</span>
              </label>
              
              <label className="flex items-center space-x-2">
                <input
                  type="checkbox"
                  checked={settings.notifications}
                  onChange={(e) => setSettings(prev => ({ ...prev, notifications: e.target.checked }))}
                  className="rounded"
                />
                <span className="text-sm text-gray-700 dark:text-slate-300">Notifications</span>
              </label>
            </div>
          </div>
        )}
      </div>
    </div>
  );

  const renderQuickStats = () => {
    if (!scheduleData?.metadata) return null;

    const { metadata } = scheduleData;
    
    return (
      <div className="bg-gradient-to-r from-blue-50 to-indigo-50 dark:from-blue-900/20 dark:to-indigo-900/20 border border-blue-200 dark:border-blue-800 rounded-lg p-4 mb-6">
        <div className="grid grid-cols-2 md:grid-cols-5 gap-4 text-center">
          <div>
            <div className="text-2xl font-bold text-blue-600 dark:text-blue-400">{metadata.total_periods || 0}</div>
            <div className="text-sm text-blue-800 dark:text-blue-300">Total Periods</div>
          </div>
          <div>
            <div className="text-2xl font-bold text-blue-600 dark:text-blue-400">{metadata.unique_subjects || 0}</div>
            <div className="text-sm text-blue-800 dark:text-blue-300">Subjects</div>
          </div>
          <div>
            <div className="text-2xl font-bold text-blue-600 dark:text-blue-400">{metadata.unique_teachers || 0}</div>
            <div className="text-sm text-blue-800 dark:text-blue-300">Teachers</div>
          </div>
          <div>
            <div className="text-2xl font-bold text-blue-600 dark:text-blue-400">
              {metadata.today_schedule?.periods?.length || 0}
            </div>
            <div className="text-sm text-blue-800 dark:text-blue-300">Today's Classes</div>
          </div>
          <div>
            <div className="text-2xl font-bold text-blue-600 dark:text-blue-400">
              {Math.round(((metadata.total_periods || 0) * 40) / 60)}h
            </div>
            <div className="text-sm text-blue-800 dark:text-blue-300">Weekly Hours</div>
          </div>
        </div>
      </div>
    );
  };

  if (loading && !scheduleData) {
    return (
      <div className="min-h-screen bg-gray-50 dark:bg-slate-900">
        {renderHeader()}
        <div className="container mx-auto p-4">
          <div className="flex justify-center items-center min-h-[400px]">
            <div className="text-center">
              <div className="animate-spin rounded-full h-16 w-16 border-b-2 border-blue-600 mx-auto mb-4"></div>
              <p className="text-gray-600 dark:text-slate-400">Loading your schedule...</p>
            </div>
          </div>
        </div>
      </div>
    );
  }

  if (error && !scheduleData) {
    return (
      <div className="min-h-screen bg-gray-50 dark:bg-slate-900">
        {renderHeader()}
        <div className="container mx-auto p-4">
          <div className="flex flex-col justify-center items-center min-h-[400px]">
            <div className="bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-md p-8 max-w-md text-center">
              <Calendar className="h-16 w-16 text-red-400 mx-auto mb-4" />
              <div className="text-red-800 dark:text-red-400 font-medium text-lg mb-2">Error Loading Schedule</div>
              <div className="text-red-600 dark:text-red-400 mb-4">{error}</div>
              <button 
                onClick={handleRefreshSchedule}
                className="bg-red-600 text-white px-6 py-3 rounded-lg hover:bg-red-700 transition-colors font-medium"
              >
                Try Again
              </button>
            </div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-slate-900">
      {renderHeader()}
      
      <div className="container mx-auto p-4">
        {renderQuickStats()}
        
        <StudentSchedule 
          scheduleData={scheduleData}
          loading={loading}
          error={error}
          onRefresh={handleRefreshSchedule}
          onFilterChange={handleFilterChange}
        />
        
        {/* Additional Debug Information in Development */}
        {process.env.NODE_ENV === 'development' && scheduleData && (
          <div className="mt-8 bg-white dark:bg-slate-800 border dark:border-slate-700 rounded-lg p-4">
            <h3 className="font-semibold text-gray-800 dark:text-slate-100 mb-2">Debug Information</h3>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-sm text-gray-700 dark:text-slate-300">
              <div>
                <strong>Student ID:</strong> {scheduleData.student?.id || 'N/A'}
              </div>
              <div>
                <strong>Academic Year:</strong> {scheduleData.academic_year || 'N/A'}
              </div>
              <div>
                <strong>Term:</strong> {scheduleData.term || 'N/A'}
              </div>
              <div>
                <strong>Week Range:</strong> {scheduleData.week_start || 'N/A'} to {scheduleData.week_end || 'N/A'}
              </div>
              <div>
                <strong>Last Updated:</strong> {lastUpdated?.toLocaleString() || 'N/A'}
              </div>
              <div>
                <strong>Auto Refresh:</strong> {settings.autoRefresh ? `Every ${settings.refreshInterval}min` : 'Disabled'}
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

export default StudentLessons;