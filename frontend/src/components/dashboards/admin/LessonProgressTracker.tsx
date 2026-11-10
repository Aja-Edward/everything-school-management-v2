import React, { useState, useEffect, useRef } from 'react';
import { Play, Pause, CheckCircle, Clock, AlertCircle } from 'lucide-react';
import { useGlobalTheme } from '../../../contexts/GlobalThemeContext';
import { LessonService, Lesson } from '../../../services/LessonService';

interface LessonProgressTrackerProps {
  lesson: Lesson;
  onProgressUpdate: (lesson: Lesson) => void;
  onStatusChange: (lesson: Lesson) => void;
}

const LessonProgressTracker: React.FC<LessonProgressTrackerProps> = ({
  lesson,
  onProgressUpdate,
  onStatusChange
}) => {
  const { isDarkMode } = useGlobalTheme();
  const [currentProgress, setCurrentProgress] = useState(lesson.completion_percentage);
  const [isTracking, setIsTracking] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const progressIntervalRef = useRef<NodeJS.Timeout | null>(null);

  const themeClasses = {
    bgPrimary: isDarkMode ? 'bg-gray-900' : 'bg-white',
    bgSecondary: isDarkMode ? 'bg-gray-800' : 'bg-gray-50',
    textPrimary: isDarkMode ? 'text-white' : 'text-gray-900',
    textSecondary: isDarkMode ? 'text-gray-300' : 'text-gray-600',
    border: isDarkMode ? 'border-gray-700' : 'border-gray-200',
    buttonPrimary: isDarkMode ? 'bg-blue-600 hover:bg-blue-700 text-white' : 'bg-blue-600 hover:bg-blue-700 text-white',
    buttonSuccess: isDarkMode ? 'bg-green-600 hover:bg-green-700 text-white' : 'bg-green-600 hover:bg-green-700 text-white',
    buttonWarning: isDarkMode ? 'bg-orange-600 hover:bg-orange-700 text-white' : 'bg-orange-600 hover:bg-orange-700 text-white',
  };

  // Start automatic progress tracking
  const startTracking = async () => {
    if (lesson.status !== 'in_progress') {
      try {
        setLoading(true);
        setError(null);
        
        const response = await LessonService.startLesson(lesson.id);
        onStatusChange(response);
        setIsTracking(true);
        startProgressInterval();
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Failed to start lesson');
      } finally {
        setLoading(false);
      }
    } else {
      setIsTracking(true);
      startProgressInterval();
    }
  };

  // Stop tracking and complete lesson
  const completeLesson = async () => {
    try {
      setLoading(true);
      setError(null);
      
      const response = await LessonService.completeLesson(lesson.id);
      setIsTracking(false);
      stopProgressInterval();
      setCurrentProgress(100);
      onStatusChange(response);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to complete lesson');
    } finally {
      setLoading(false);
    }
  };

  // Pause tracking
  const pauseTracking = () => {
    setIsTracking(false);
    stopProgressInterval();
  };

  // Start progress interval
  const startProgressInterval = () => {
    if (progressIntervalRef.current) {
      clearInterval(progressIntervalRef.current);
    }
    
    progressIntervalRef.current = setInterval(async () => {
      try {
        const response = await LessonService.updateLessonProgress(lesson.id);
        setCurrentProgress(response.progress);
        onProgressUpdate(response.lesson);
        
        // Auto-complete if progress reaches 100%
        if (response.progress >= 100) {
          await completeLesson();
        }
      } catch (err) {
        console.error('Error updating progress:', err);
      }
    }, 30000); // Every 30s: progress moves by the minute, and each poll reads and saves the lesson
  };

  // Stop progress interval
  const stopProgressInterval = () => {
    if (progressIntervalRef.current) {
      clearInterval(progressIntervalRef.current);
      progressIntervalRef.current = null;
    }
  };

  // Manual progress update
  const updateProgress = async () => {
    try {
      const response = await LessonService.updateLessonProgress(lesson.id);
      setCurrentProgress(response.progress);
      onProgressUpdate(response.lesson);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to update progress');
    }
  };

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      stopProgressInterval();
    };
  }, []);

  // Auto-start tracking if lesson is in progress
  useEffect(() => {
    if (lesson.status === 'in_progress' && !isTracking) {
      setIsTracking(true);
      startProgressInterval();
    }
  }, [lesson.status]);

  // Update current progress when lesson changes
  useEffect(() => {
    setCurrentProgress(lesson.completion_percentage);
  }, [lesson.completion_percentage]);

  const getProgressColor = (progress: number) => {
    if (progress < 30) return 'bg-red-500';
    if (progress < 70) return 'bg-orange-500';
    if (progress < 100) return 'bg-blue-500';
    return 'bg-green-500';
  };

  const getStatusText = () => {
    switch (lesson.status) {
      case 'scheduled':
        return 'Ready to Start';
      case 'in_progress':
        return 'In Progress';
      case 'completed':
        return 'Completed';
      case 'cancelled':
        return 'Cancelled';
      default:
        return 'Unknown';
    }
  };

  return (
    <div className={`${themeClasses.bgSecondary} rounded-lg p-4 border ${themeClasses.border}`}>
      <div className="flex items-center justify-between mb-4">
        <h3 className={`text-lg font-semibold ${themeClasses.textPrimary}`}>
          Lesson Progress
        </h3>
        <div className="flex items-center space-x-2">
          <span className={`text-sm ${themeClasses.textSecondary}`}>
            {getStatusText()}
          </span>
          <div className={`w-2 h-2 rounded-full ${
            lesson.status === 'in_progress' ? 'bg-orange-500 animate-pulse' :
            lesson.status === 'completed' ? 'bg-green-500' :
            lesson.status === 'cancelled' ? 'bg-red-500' : 'bg-gray-500'
          }`} />
        </div>
      </div>

      {error && (
        <div className="mb-4 p-3 rounded-lg bg-red-100 border border-red-300">
          <div className="flex items-center space-x-2">
            <AlertCircle size={16} className="text-red-600" />
            <span className="text-red-700 text-sm">{error}</span>
          </div>
        </div>
      )}

      {/* Progress Bar */}
      <div className="mb-4">
        <div className="flex justify-between items-center mb-2">
          <span className={`text-sm font-medium ${themeClasses.textSecondary}`}>
            Progress
          </span>
          <span className={`text-sm font-bold ${themeClasses.textPrimary}`}>
            {currentProgress}%
          </span>
        </div>
        <div className="w-full bg-gray-200 rounded-full h-3">
          <div 
            className={`h-3 rounded-full transition-all duration-500 ${getProgressColor(currentProgress)}`}
            style={{ width: `${currentProgress}%` }}
          />
        </div>
      </div>

      {/* Time Information */}
      <div className="grid grid-cols-2 gap-4 mb-4">
        <div>
          <span className={`text-xs ${themeClasses.textSecondary}`}>Start Time</span>
          <p className={`text-sm font-medium ${themeClasses.textPrimary}`}>
            {lesson.actual_start_time ? 
              new Date(`2000-01-01T${lesson.actual_start_time}`).toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'}) :
              lesson.start_time
            }
          </p>
        </div>
        <div>
          <span className={`text-xs ${themeClasses.textSecondary}`}>End Time</span>
          <p className={`text-sm font-medium ${themeClasses.textPrimary}`}>
            {lesson.actual_end_time ? 
              new Date(`2000-01-01T${lesson.actual_end_time}`).toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'}) :
              lesson.end_time
            }
          </p>
        </div>
      </div>

      {/* Action Buttons */}
      <div className="flex items-center space-x-3">
        {lesson.status === 'scheduled' && (
          <button
            onClick={startTracking}
            disabled={loading}
            className={`flex items-center space-x-2 px-4 py-2 rounded-lg ${themeClasses.buttonPrimary} transition-colors disabled:opacity-50`}
          >
            <Play size={16} />
            <span>Start Lesson</span>
          </button>
        )}

        {lesson.status === 'in_progress' && (
          <>
            {isTracking ? (
              <button
                onClick={pauseTracking}
                className={`flex items-center space-x-2 px-4 py-2 rounded-lg ${themeClasses.buttonWarning} transition-colors`}
              >
                <Pause size={16} />
                <span>Pause</span>
              </button>
            ) : (
              <button
                onClick={startTracking}
                className={`flex items-center space-x-2 px-4 py-2 rounded-lg ${themeClasses.buttonPrimary} transition-colors`}
              >
                <Play size={16} />
                <span>Resume</span>
              </button>
            )}
            
            <button
              onClick={completeLesson}
              disabled={loading}
              className={`flex items-center space-x-2 px-4 py-2 rounded-lg ${themeClasses.buttonSuccess} transition-colors disabled:opacity-50`}
            >
              <CheckCircle size={16} />
              <span>Complete</span>
            </button>

            <button
              onClick={updateProgress}
              className={`flex items-center space-x-2 px-3 py-2 rounded-lg ${themeClasses.bgPrimary} border ${themeClasses.border} transition-colors`}
            >
              <Clock size={16} />
              <span>Update</span>
            </button>
          </>
        )}

        {lesson.status === 'completed' && (
          <div className="flex items-center space-x-2 text-green-600">
            <CheckCircle size={20} />
            <span className="font-medium">Lesson Completed</span>
          </div>
        )}
      </div>

      {/* Auto-update indicator */}
      {isTracking && (
        <div className="mt-3 flex items-center space-x-2">
          <div className="w-2 h-2 bg-orange-500 rounded-full animate-pulse" />
          <span className={`text-xs ${themeClasses.textSecondary}`}>
            Auto-updating progress every 5 seconds
          </span>
        </div>
      )}
    </div>
  );
};

export default LessonProgressTracker;




