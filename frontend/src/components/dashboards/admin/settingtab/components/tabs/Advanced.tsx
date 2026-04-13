
import React, { useState, useEffect } from 'react';
import { 
  Megaphone, 
  Users, 
  Shield, 
  Plus, 
  Edit3, 
  Trash2, 
  Eye, 
  EyeOff,
  Settings,
  Save,
  X,
  Upload,
  School,
  Trophy,
  BookOpen,
  Lightbulb,
  Star,
  Sparkles,
  ChevronRight,
  Globe,
  Loader2,
  CheckCircle,
  AlertCircle,
  Info,
  Calendar,
  Target,
  Clock,
  Image as ImageIcon
} from 'lucide-react';
import api from '@/services/api';

// ==================== TYPE DEFINITIONS ====================
type EventType = 'achievement' | 'admission' | 'exam' | 'holiday' | 'announcement' | 'custom';
type DisplayType = 'banner' | 'carousel' | 'ribbon';
type ThemeType = 'default' | 'celebration' | 'urgent' | 'academic' | 'sports';
type RibbonSpeed = 'slow' | 'medium' | 'fast';

interface EnhancedEvent {
  id: string;
  title: string;
  description: string;
  eventType: EventType;
  displayType: DisplayType;
  isActive: boolean;
  startDate?: string;
  endDate?: string;
  theme?: ThemeType;
  ribbonSpeed?: RibbonSpeed;
  imageUrl?: string;
  priority?: number;
}

interface Announcement {
  id: string;
  title: string;
  content: string;
  target_audience: string[];
  is_active: boolean;
  created_at: string;
  expires_at?: string;
  priority: 'low' | 'medium' | 'high';
}


// ==================== TOGGLE SWITCH ====================
const ToggleSwitch: React.FC<{
  id: string;
  checked: boolean;
  onChange: (checked: boolean) => void;
  label: string;
  description?: string;
  disabled?: boolean;
}> = ({ id, checked, onChange, label, description, disabled = false }) => (
  <div className="flex items-center justify-between py-2">
    <div className="flex-1">
      <label htmlFor={id} className={`text-sm font-medium ${disabled ? 'text-slate-400' : 'text-slate-700'} cursor-pointer`}>
        {label}
      </label>
      {description && <p className="text-xs text-slate-500 mt-1">{description}</p>}
    </div>
    <button
      type="button"
      id={id}
      onClick={() => !disabled && onChange(!checked)}
      disabled={disabled}
      className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 ${
        disabled ? 'opacity-50 cursor-not-allowed' : 'cursor-pointer'
      } ${checked ? 'bg-blue-600' : 'bg-gray-300'}`}
    >
      <span className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform shadow-sm ${
        checked ? 'translate-x-6' : 'translate-x-1'
      }`} />
    </button>
  </div>
);

// ==================== PORTAL SETTINGS ====================
const PortalSettings: React.FC<{
  settings: any;
  onUpdate: (settings: any) => void;
  hasChanges: boolean;
}> = ({ settings, onUpdate, hasChanges }) => {
  const handleChange = (field: string, value: boolean) => {
    onUpdate({ ...settings, [field]: value });
  };

  const getPortalStatus = (enabled: boolean) => (
    enabled ? (
      <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-green-100 text-green-800">
        <CheckCircle className="w-3 h-3 mr-1" />Active
      </span>
    ) : (
      <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-red-100 text-red-800">
        <X className="w-3 h-3 mr-1" />Disabled
      </span>
    )
  );

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-3 pb-3 border-b border-slate-200">
        <div className="w-6 h-6 bg-gradient-to-br from-green-500 to-emerald-600 rounded flex items-center justify-center">
          <Users className="w-3 h-3 text-white" />
        </div>
        <h4 className="text-lg font-semibold text-slate-800">Portal Access Control</h4>
        {hasChanges && (
          <span className="ml-auto text-xs bg-yellow-100 text-yellow-800 px-2 py-1 rounded-full font-medium">
            Unsaved Changes
          </span>
        )}
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        <div className="bg-gradient-to-br from-blue-50 to-indigo-50 rounded-lg p-6 border border-blue-200 transition-all hover:shadow-md">
          <div className="flex items-center justify-between mb-4">
            <h5 className="font-semibold text-slate-800 flex items-center gap-2">
              <Users className="w-5 h-5 text-blue-600" />Student Portal
            </h5>
            {getPortalStatus(settings.student_portal_enabled)}
          </div>
          <ToggleSwitch
            id="student-portal"
            checked={settings.student_portal_enabled}
            onChange={(checked) => handleChange('student_portal_enabled', checked)}
            label="Enable Student Portal"
            description="Students can view grades, attendance & pay fees"
          />
        </div>

        <div className="bg-gradient-to-br from-purple-50 to-pink-50 rounded-lg p-6 border border-purple-200 transition-all hover:shadow-md">
          <div className="flex items-center justify-between mb-4">
            <h5 className="font-semibold text-slate-800 flex items-center gap-2">
              <Shield className="w-5 h-5 text-purple-600" />Teacher Portal
            </h5>
            {getPortalStatus(settings.teacher_portal_enabled)}
          </div>
          <ToggleSwitch
            id="teacher-portal"
            checked={settings.teacher_portal_enabled}
            onChange={(checked) => handleChange('teacher_portal_enabled', checked)}
            label="Enable Teacher Portal"
            description="Teachers can manage classes & enter grades"
          />
        </div>

        <div className="bg-gradient-to-br from-green-50 to-emerald-50 rounded-lg p-6 border border-green-200 transition-all hover:shadow-md">
          <div className="flex items-center justify-between mb-4">
            <h5 className="font-semibold text-slate-800 flex items-center gap-2">
              <Users className="w-5 h-5 text-green-600" />Parent Portal
            </h5>
            {getPortalStatus(settings.parent_portal_enabled)}
          </div>
          <ToggleSwitch
            id="parent-portal"
            checked={settings.parent_portal_enabled}
            onChange={(checked) => handleChange('parent_portal_enabled', checked)}
            label="Enable Parent Portal"
            description="Parents can monitor child progress & pay fees"
          />
        </div>
      </div>

      <div className="bg-amber-50 border border-amber-200 rounded-lg p-4">
        <div className="flex items-start gap-3">
          <Info className="w-5 h-5 text-amber-600 mt-0.5 flex-shrink-0" />
          <div>
            <h6 className="font-semibold text-amber-900 mb-1">Security Notice</h6>
            <p className="text-sm text-amber-800">
              Changes take effect immediately after saving. Disabled portals will prevent user access and terminate existing sessions.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
};

// ==================== CAROUSEL MANAGER ====================
const CarouselManager: React.FC = () => {
  const [images, setImages] = useState<string[]>([]);
  const [uploading, setUploading] = useState(false);

  const handleUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files) return;

    setUploading(true);
    // Simulate upload
    setTimeout(() => {
      const newImages = Array.from(files).map(file => URL.createObjectURL(file));
      setImages([...images, ...newImages]);
      setUploading(false);
    }, 1000);
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <p className="text-sm text-slate-600">Manage homepage carousel images (max 5 images)</p>
        <label className="cursor-pointer px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors inline-flex items-center gap-2">
          <Upload className="w-4 h-4" />
          Upload Image
          <input type="file" accept="image/*" multiple onChange={handleUpload} className="hidden" />
        </label>
      </div>

      {uploading && (
        <div className="flex items-center justify-center py-8">
          <Loader2 className="w-6 h-6 animate-spin text-blue-600" />
        </div>
      )}

      {images.length > 0 ? (
        <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
          {images.map((img, idx) => (
            <div key={idx} className="relative group">
              <img src={img} alt={`Carousel ${idx + 1}`} className="w-full h-40 object-cover rounded-lg" />
              <button
                onClick={() => setImages(images.filter((_, i) => i !== idx))}
                className="absolute top-2 right-2 p-1.5 bg-red-500 text-white rounded-lg opacity-0 group-hover:opacity-100 transition-opacity"
              >
                <Trash2 className="w-4 h-4" />
              </button>
            </div>
          ))}
        </div>
      ) : (
        <div className="bg-slate-50 rounded-lg p-12 border-2 border-dashed border-slate-200 text-center">
          <ImageIcon className="w-12 h-12 text-slate-400 mx-auto mb-3" />
          <p className="text-slate-600 mb-2">No carousel images yet</p>
          <p className="text-sm text-slate-500">Upload images to display on the homepage</p>
        </div>
      )}
    </div>
  );
};

// ==================== EVENT MANAGEMENT ====================
const EventManagement: React.FC = () => {
  const [events, setEvents] = useState<EnhancedEvent[]>([]);

  const eventTypeIcons = {
    achievement: Trophy,
    admission: School,
    exam: BookOpen,
    holiday: Calendar,
    announcement: Megaphone,
    custom: Star
  };

  const handleCreateEvent = () => {
    const newEvent: EnhancedEvent = {
      id: Date.now().toString(),
      title: 'New Event',
      description: 'Event description',
      eventType: 'announcement',
      displayType: 'banner',
      isActive: true,
      theme: 'default',
      priority: 1
    };
    setEvents([...events, newEvent]);
  };

  const handleToggleActive = (id: string) => {
    setEvents(events.map(e => e.id === id ? { ...e, isActive: !e.isActive } : e));
  };

  const handleDelete = (id: string) => {
    setEvents(events.filter(e => e.id !== id));
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <p className="text-sm text-slate-600">Create and manage events, banners, and special announcements</p>
        <button
          onClick={handleCreateEvent}
          className="px-4 py-2 bg-violet-600 text-white rounded-lg hover:bg-violet-700 transition-colors inline-flex items-center gap-2"
        >
          <Plus className="w-4 h-4" />
          Create Event
        </button>
      </div>

      {events.length > 0 ? (
        <div className="space-y-3">
          {events.map(event => {
            const Icon = eventTypeIcons[event.eventType];
            return (
              <div key={event.id} className="bg-white border border-slate-200 rounded-lg p-4 hover:shadow-md transition-shadow">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <div className={`w-10 h-10 rounded-lg flex items-center justify-center ${
                      event.isActive ? 'bg-violet-100' : 'bg-slate-100'
                    }`}>
                      <Icon className={`w-5 h-5 ${event.isActive ? 'text-violet-600' : 'text-slate-400'}`} />
                    </div>
                    <div>
                      <h5 className="font-semibold text-slate-800">{event.title}</h5>
                      <p className="text-sm text-slate-600">{event.description}</p>
                      <div className="flex items-center gap-2 mt-1">
                        <span className="text-xs px-2 py-0.5 bg-blue-100 text-blue-700 rounded-full">
                          {event.displayType}
                        </span>
                        <span className="text-xs px-2 py-0.5 bg-purple-100 text-purple-700 rounded-full">
                          {event.eventType}
                        </span>
                      </div>
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <button
                      onClick={() => handleToggleActive(event.id)}
                      className={`p-2 rounded-lg transition-colors ${
                        event.isActive ? 'bg-green-100 text-green-600' : 'bg-slate-100 text-slate-400'
                      }`}
                    >
                      {event.isActive ? <Eye className="w-4 h-4" /> : <EyeOff className="w-4 h-4" />}
                    </button>
                    <button className="p-2 bg-blue-100 text-blue-600 rounded-lg hover:bg-blue-200">
                      <Edit3 className="w-4 h-4" />
                    </button>
                    <button
                      onClick={() => handleDelete(event.id)}
                      className="p-2 bg-red-100 text-red-600 rounded-lg hover:bg-red-200"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      ) : (
        <div className="bg-slate-50 rounded-lg p-12 border-2 border-dashed border-slate-200 text-center">
          <Sparkles className="w-12 h-12 text-slate-400 mx-auto mb-3" />
          <p className="text-slate-600 mb-2">No events created yet</p>
          <p className="text-sm text-slate-500">Create your first event to display on the homepage</p>
          <button
            onClick={handleCreateEvent}
            className="mt-4 px-4 py-2 bg-violet-600 text-white rounded-lg hover:bg-violet-700 transition-colors inline-flex items-center gap-2"
          >
            <Plus className="w-4 h-4" />
            Create Your First Event
          </button>
        </div>
      )}
    </div>
  );
};

// ==================== ANNOUNCEMENTS ====================
const AnnouncementsManager: React.FC = () => {
  const [announcements, setAnnouncements] = useState<Announcement[]>([]);

  const priorityColors = {
    low: 'bg-blue-100 text-blue-700',
    medium: 'bg-yellow-100 text-yellow-700',
    high: 'bg-red-100 text-red-700'
  };

  const handleCreate = () => {
    const newAnnouncement: Announcement = {
      id: Date.now().toString(),
      title: 'New Announcement',
      content: 'Announcement content',
      target_audience: ['all'],
      is_active: true,
      created_at: new Date().toISOString(),
      priority: 'medium'
    };
    setAnnouncements([...announcements, newAnnouncement]);
  };

  const handleToggle = (id: string) => {
    setAnnouncements(announcements.map(a => a.id === id ? { ...a, is_active: !a.is_active } : a));
  };

  const handleDelete = (id: string) => {
    setAnnouncements(announcements.filter(a => a.id !== id));
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <p className="text-sm text-slate-600">Manage system-wide announcements and notices</p>
        <button
          onClick={handleCreate}
          className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors inline-flex items-center gap-2"
        >
          <Plus className="w-4 h-4" />
          New Announcement
        </button>
      </div>

      {announcements.length > 0 ? (
        <div className="space-y-3">
          {announcements.map(announcement => (
            <div key={announcement.id} className="bg-white border border-slate-200 rounded-lg p-4 hover:shadow-md transition-shadow">
              <div className="flex items-start justify-between">
                <div className="flex-1">
                  <div className="flex items-center gap-2 mb-2">
                    <h5 className="font-semibold text-slate-800">{announcement.title}</h5>
                    <span className={`text-xs px-2 py-0.5 rounded-full ${priorityColors[announcement.priority]}`}>
                      {announcement.priority}
                    </span>
                  </div>
                  <p className="text-sm text-slate-600 mb-2">{announcement.content}</p>
                  <div className="flex items-center gap-3 text-xs text-slate-500">
                    <span className="flex items-center gap-1">
                      <Target className="w-3 h-3" />
                      {announcement.target_audience.join(', ')}
                    </span>
                    <span className="flex items-center gap-1">
                      <Clock className="w-3 h-3" />
                      {new Date(announcement.created_at).toLocaleDateString()}
                    </span>
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <button
                    onClick={() => handleToggle(announcement.id)}
                    className={`p-2 rounded-lg transition-colors ${
                      announcement.is_active ? 'bg-green-100 text-green-600' : 'bg-slate-100 text-slate-400'
                    }`}
                  >
                    {announcement.is_active ? <Eye className="w-4 h-4" /> : <EyeOff className="w-4 h-4" />}
                  </button>
                  <button className="p-2 bg-blue-100 text-blue-600 rounded-lg hover:bg-blue-200">
                    <Edit3 className="w-4 h-4" />
                  </button>
                  <button
                    onClick={() => handleDelete(announcement.id)}
                    className="p-2 bg-red-100 text-red-600 rounded-lg hover:bg-red-200"
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                </div>
              </div>
            </div>
          ))}
        </div>
      ) : (
        <div className="bg-slate-50 rounded-lg p-12 border-2 border-dashed border-slate-200 text-center">
          <Megaphone className="w-12 h-12 text-slate-400 mx-auto mb-3" />
          <p className="text-slate-600 mb-2">No announcements yet</p>
          <p className="text-sm text-slate-500">Create announcements to notify users about important updates</p>
          <button
            onClick={handleCreate}
            className="mt-4 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors inline-flex items-center gap-2"
          >
            <Plus className="w-4 h-4" />
            Create Your First Announcement
          </button>
        </div>
      )}
    </div>
  );
};

// ==================== MAIN COMPONENT ====================
const Advanced: React.FC = () => {
  const [originalPortalSettings, setOriginalPortalSettings] = useState({
    student_portal_enabled: true,
    teacher_portal_enabled: true,
    parent_portal_enabled: true
  });
  
  const [currentPortalSettings, setCurrentPortalSettings] = useState({
    student_portal_enabled: true,
    teacher_portal_enabled: true,
    parent_portal_enabled: true
  });

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);

  const hasPortalChanges = JSON.stringify(originalPortalSettings) !== JSON.stringify(currentPortalSettings);

  useEffect(() => {
    loadSettings();
  }, []);

  const loadSettings = async () => {
    try {
      setLoading(true);
      setError(null);

      const response = await api.get('/school-settings/school-settings/');
      
      const settings = {
        student_portal_enabled: response.student_portal_enabled ?? true,
        teacher_portal_enabled: response.teacher_portal_enabled ?? true,
        parent_portal_enabled: response.parent_portal_enabled ?? true
      };
      
      setOriginalPortalSettings(settings);
      setCurrentPortalSettings(settings);
    } catch (err) {
      console.error('Error loading settings:', err);
      setError(err instanceof Error ? err.message : 'Failed to load settings');
    } finally {
      setLoading(false);
    }
  };

  const handleSavePortalSettings = async () => {
    try {
      setSaving(true);
      setError(null);
      setSuccess(false);
      
      await api.put('/school-settings/school-settings/', currentPortalSettings);
      
      setOriginalPortalSettings(currentPortalSettings);
      setSuccess(true);
      
      if (typeof window !== 'undefined') {
        window.dispatchEvent(new CustomEvent('settings-updated', { 
          detail: currentPortalSettings 
        }));
      }
      
      setTimeout(() => setSuccess(false), 3000);
    } catch (err) {
      console.error('Error saving settings:', err);
      setError(err instanceof Error ? err.message : 'Failed to save settings');
    } finally {
      setSaving(false);
    }
  };

  const handleDiscardChanges = () => {
    setCurrentPortalSettings(originalPortalSettings);
    setError(null);
    setSuccess(false);
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-screen bg-gray-50">
        <div className="text-center">
          <Loader2 className="w-8 h-8 animate-spin text-blue-600 mx-auto mb-4" />
          <p className="text-slate-600">Loading settings...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-8 p-6 bg-gray-50 min-h-screen">
      {/* Header */}
      <div className="bg-white rounded-2xl p-6 shadow-sm border border-slate-100">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-4">
            <div className="w-12 h-12 bg-gradient-to-br from-violet-500 to-purple-600 rounded-xl flex items-center justify-center">
              <Settings className="w-6 h-6 text-white" />
            </div>
            <div>
              <h1 className="text-2xl font-bold text-slate-900">Advanced Settings</h1>
              <p className="text-slate-600">Manage portal access, events, announcements, and UI configurations</p>
            </div>
          </div>
          
          {hasPortalChanges && (
            <div className="flex items-center gap-3">
              <button
                onClick={handleDiscardChanges}
                disabled={saving}
                className="px-4 py-2 border border-slate-300 text-slate-700 rounded-lg hover:bg-slate-50 transition-colors disabled:opacity-50"
              >
                Discard Changes
              </button>
              <button
                onClick={handleSavePortalSettings}
                disabled={saving}
                className="px-6 py-2 bg-gradient-to-r from-blue-600 to-purple-600 text-white rounded-lg hover:from-blue-700 hover:to-purple-700 transition-all disabled:opacity-50 flex items-center gap-2"
              >
                {saving ? (
                  <>
                    <Loader2 className="w-4 h-4 animate-spin" />
                    Saving...
                  </>
                ) : (
                  <>
                    <Save className="w-4 h-4" />
                    Save Portal Settings
                  </>
                )}
              </button>
            </div>
          )}
        </div>
      </div>

      {/* Messages */}
      {success && (
        <div className="bg-green-50 border border-green-200 text-green-800 px-4 py-3 rounded-lg flex items-start gap-2">
          <CheckCircle className="w-5 h-5 mt-0.5 flex-shrink-0" />
          <div>
            <p className="font-medium">Settings Saved Successfully</p>
            <p className="text-sm">Portal access controls have been updated.</p>
          </div>
        </div>
      )}

      {error && (
        <div className="bg-red-50 border border-red-200 text-red-800 px-4 py-3 rounded-lg flex items-start gap-2">
          <AlertCircle className="w-5 h-5 mt-0.5 flex-shrink-0" />
          <div>
            <p className="font-medium">Failed to Save Settings</p>
            <p className="text-sm">{error}</p>
          </div>
        </div>
      )}

      {/* Portal Settings */}
      <div className="bg-white rounded-2xl p-8 shadow-sm border border-slate-100">
        <PortalSettings 
          settings={currentPortalSettings}
          onUpdate={setCurrentPortalSettings}
          hasChanges={hasPortalChanges}
        />
      </div>

      {/* Carousel Management */}
      <div className="bg-white rounded-2xl p-8 shadow-sm border border-slate-100">
        <div className="flex items-center gap-3 mb-6">
          <div className="w-8 h-8 bg-gradient-to-br from-green-500 to-emerald-600 rounded-lg flex items-center justify-center">
            <Globe className="w-4 h-4 text-white" />
          </div>
          <div>
            <h3 className="text-xl font-semibold text-slate-900">Default Carousel Management</h3>
            <p className="text-sm text-slate-600">Upload and manage homepage carousel images</p>
          </div>
        </div>
        <CarouselManager />
      </div>

      {/* Event Management */}
      <div className="bg-white rounded-2xl p-8 shadow-sm border border-slate-100">
        <div className="flex items-center gap-3 mb-6">
          <div className="w-8 h-8 bg-gradient-to-br from-violet-500 to-purple-600 rounded-lg flex items-center justify-center">
            <Star className="w-4 h-4 text-white" />
          </div>
          <div>
            <h3 className="text-xl font-semibold text-slate-900">Event Management</h3>
            <p className="text-sm text-slate-600">Create and manage special events, banners, and announcements</p>
          </div>
        </div>
        <EventManagement />
      </div>

      {/* Announcements */}
      <div className="bg-white rounded-2xl p-8 shadow-sm border border-slate-100">
        <div className="flex items-center gap-3 mb-6">
          <div className="w-8 h-8 bg-gradient-to-br from-blue-500 to-cyan-600 rounded-lg flex items-center justify-center">
            <Megaphone className="w-4 h-4 text-white" />
          </div>
          <div>
            <h3 className="text-xl font-semibold text-slate-900">Announcements & Bulletin Board</h3>
            <p className="text-sm text-slate-600">Manage system-wide announcements and notices</p>
          </div>
        </div>
        <AnnouncementsManager />
      </div>

      {/* Info Card */}
      <div className="bg-gradient-to-r from-blue-50 to-indigo-50 rounded-2xl p-6 border border-blue-200">
        <div className="flex items-start gap-4">
          <div className="w-10 h-10 bg-blue-600 rounded-lg flex items-center justify-center flex-shrink-0">
            <Lightbulb className="w-5 h-5 text-white" />
          </div>
          <div>
            <h3 className="font-semibold text-slate-900 mb-2">About Advanced Settings</h3>
            <p className="text-sm text-slate-700 mb-3">
              This dashboard provides comprehensive control over your school management system's UI and access controls.
            </p>
            <ul className="text-sm text-slate-700 space-y-1">
              <li className="flex items-start gap-2">
                <ChevronRight className="w-4 h-4 mt-0.5 text-blue-600 flex-shrink-0" />
                <span><strong>Portal Settings:</strong> Control access to student, teacher, and parent portals</span>
              </li>
              <li className="flex items-start gap-2">
                <ChevronRight className="w-4 h-4 mt-0.5 text-blue-600 flex-shrink-0" />
                <span><strong>Carousel Manager:</strong> Upload and manage homepage slideshow images</span>
              </li>
              <li className="flex items-start gap-2">
                <ChevronRight className="w-4 h-4 mt-0.5 text-blue-600 flex-shrink-0" />
                <span><strong>Event Management:</strong> Create dynamic banners, ribbons, and event displays</span>
              </li>
              <li className="flex items-start gap-2">
                <ChevronRight className="w-4 h-4 mt-0.5 text-blue-600 flex-shrink-0" />
                <span><strong>Announcements:</strong> Broadcast important notices to targeted user groups</span>
              </li>
            </ul>
          </div>
        </div>
      </div>
    </div>
  );
};

export default Advanced;