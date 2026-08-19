
import { Mail, Phone, MapPin, Calendar, User, Book, Loader2, AlertCircle } from 'lucide-react';
import { useStudentProfile } from '@/hooks/useStudentProfile';
import { getAbsoluteUrl } from '@/utils/urlUtils';

const ProfileTab = () => {
  const { profile, loading, error } = useStudentProfile();

  // Loading state
  if (loading) {
    return (
      <div className="bg-white rounded-3xl p-8 shadow-xl border border-gray-100">
        <div className="flex items-center justify-center h-64">
          <div className="text-center">
            <Loader2 className="w-8 h-8 animate-spin text-primary-600 mx-auto mb-4" />
            <p className="text-gray-600">Loading profile...</p>
          </div>
        </div>
      </div>
    );
  }

  // Error state
  if (error) {
    return (
      <div className="bg-white rounded-3xl p-8 shadow-xl border border-gray-100">
        <div className="flex items-center justify-center h-64">
          <div className="text-center">
            <AlertCircle className="w-8 h-8 text-red-600 mx-auto mb-4" />
            <p className="text-red-600 mb-2">Failed to load profile</p>
            <p className="text-gray-600 text-sm">{error}</p>
          </div>
        </div>
      </div>
    );
  }

  // No profile data
  if (!profile) {
    return (
      <div className="bg-white rounded-3xl p-8 shadow-xl border border-gray-100">
        <div className="flex items-center justify-center h-64">
          <div className="text-center">
            <User className="w-8 h-8 text-gray-400 mx-auto mb-4" />
            <p className="text-gray-600">No profile data available</p>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="bg-white rounded-3xl p-8 shadow-xl border border-gray-100">
      {/* Profile Header */}
      <div className="text-center mb-8">
        <div className="relative mx-auto mb-4 flex justify-center">
          {profile.profile_picture ? (
            <img
              src={getAbsoluteUrl(profile.profile_picture)}
              alt={profile.full_name}
              className="w-32 h-32 rounded-full object-cover border-4 border-primary-100 shadow-lg"
              onError={(e) => {
                e.currentTarget.style.display = 'none';
                e.currentTarget.nextElementSibling?.classList.remove('hidden');
              }}
            />
          ) : null}
          <div className={`w-32 h-32 bg-gradient-to-br from-primary-400 to-primary-700 rounded-full flex items-center justify-center shadow-lg ${profile.profile_picture ? 'hidden' : ''}`}>
            <span className="text-3xl font-bold text-white">
              {profile.full_name.split(' ').map(n => n[0]).join('').toUpperCase()}
            </span>
          </div>
        </div>
        <h2 className="text-2xl font-bold text-gray-800">{profile.full_name}</h2>
        <p className="text-gray-600">{profile.academic_info?.registration_number || profile.id}</p>
        <p className="text-sm text-gray-500 mt-1">{profile.academic_info?.class} • {profile.academic_info?.education_level}</p>
      </div>

      {/* Profile Information */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
        {/* Personal Information */}
        <div className="bg-gray-50 rounded-xl p-6">
          <h3 className="text-lg font-semibold text-gray-800 mb-4">Personal Information</h3>
          <div className="space-y-4">
            <div className="flex items-center gap-3">
              <Mail className="text-primary-600" size={20} />
              <div>
                <p className="text-sm text-gray-500">Email</p>
                <p className="text-gray-800">{profile.email}</p>
              </div>
            </div>
            <div className="flex items-center gap-3">
              <Calendar className="text-primary-600" size={20} />
              <div>
                <p className="text-sm text-gray-500">Date of Birth</p>
                <p className="text-gray-800">{new Date(profile.date_of_birth).toLocaleDateString()}</p>
              </div>
            </div>
            <div className="flex items-center gap-3">
              <User className="text-primary-600" size={20} />
              <div>
                <p className="text-sm text-gray-500">Age</p>
                <p className="text-gray-800">{profile.age} years old</p>
              </div>
            </div>
            <div className="flex items-center gap-3">
              <User className="text-primary-600" size={20} />
              <div>
                <p className="text-sm text-gray-500">Gender</p>
                <p className="text-gray-800">{profile.gender === 'M' ? 'Male' : 'Female'}</p>
              </div>
            </div>
          </div>
        </div>

        {/* Academic Information */}
        <div className="bg-gray-50 rounded-xl p-6">
          <h3 className="text-lg font-semibold text-gray-800 mb-4">Academic Information</h3>
          <div className="space-y-4">
            <div className="flex items-center gap-3">
              <Book className="text-primary-600" size={20} />
              <div>
                <p className="text-sm text-gray-500">Class</p>
                <p className="text-gray-800">{profile.student_class_display}</p>
              </div>
            </div>
            <div className="flex items-center gap-3">
              <Book className="text-primary-600" size={20} />
              <div>
                <p className="text-sm text-gray-500">Education Level</p>
                <p className="text-gray-800">{profile.education_level_display}</p>
              </div>
            </div>
            <div className="flex items-center gap-3">
              <Calendar className="text-primary-600" size={20} />
              <div>
                <p className="text-sm text-gray-500">Admission Date</p>
                <p className="text-gray-800">{new Date(profile.admission_date).toLocaleDateString()}</p>
              </div>
            </div>
            {profile.classroom && (
              <div className="flex items-center gap-3">
                <Book className="text-primary-600" size={20} />
                <div>
                  <p className="text-sm text-gray-500">Classroom</p>
                  <p className="text-gray-800">{profile.classroom}</p>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Contact Information */}
      {(profile.parent_contact || profile.emergency_contact || profile.parents?.length > 0) && (
        <div className="mt-8">
          <div className="bg-gray-50 rounded-xl p-6">
            <h3 className="text-lg font-semibold text-gray-800 mb-4">Contact Information</h3>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              {profile.parent_contact && (
                <div className="flex items-center gap-3">
                  <Phone className="text-primary-600" size={20} />
                  <div>
                    <p className="text-sm text-gray-500">Parent Contact</p>
                    <p className="text-gray-800">{profile.parent_contact}</p>
                  </div>
                </div>
              )}
              {profile.emergency_contact && (
                <div className="flex items-center gap-3">
                  <Phone className="text-primary-600" size={20} />
                  <div>
                    <p className="text-sm text-gray-500">Emergency Contact</p>
                    <p className="text-gray-800">{profile.emergency_contact}</p>
                  </div>
                </div>
              )}
              {profile.parents?.map((parent, index) => (
                <div key={parent.id} className="flex items-center gap-3">
                  <User className="text-primary-600" size={20} />
                  <div>
                    <p className="text-sm text-gray-500">
                      {parent.relationship} {parent.is_primary_contact ? '(Primary)' : ''}
                    </p>
                    <p className="text-gray-800">{parent.full_name}</p>
                    <p className="text-sm text-gray-600">{parent.email}</p>
                    {parent.phone && <p className="text-sm text-gray-600">{parent.phone}</p>}
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* Medical Information */}
      {(profile.medical_conditions || profile.special_requirements) && (
        <div className="mt-8">
          <div className="bg-gray-50 rounded-xl p-6">
            <h3 className="text-lg font-semibold text-gray-800 mb-4">Medical Information</h3>
            <div className="space-y-4">
              {profile.medical_conditions && (
                <div>
                  <p className="text-sm text-gray-500 mb-1">Medical Conditions</p>
                  <p className="text-gray-800">{profile.medical_conditions}</p>
                </div>
              )}
              {profile.special_requirements && (
                <div>
                  <p className="text-sm text-gray-500 mb-1">Special Requirements</p>
                  <p className="text-gray-800">{profile.special_requirements}</p>
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default ProfileTab;
