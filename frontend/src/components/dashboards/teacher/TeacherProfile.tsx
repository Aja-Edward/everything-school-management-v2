import React, { useState, useEffect } from "react";
import { User, Award, GraduationCap, Edit, BookOpen, TrendingUp, Users, Camera, Save, X, CheckCircle, AlertCircle, Briefcase, FileText, Share2 } from "lucide-react";
import { useAuth } from "@/hooks/useAuth";
import { TeacherUserData } from "@/types/types";
import TeacherService from "@/services/TeacherService";
import AssignmentManagement from "./AssignmentManagement";
import SignatureRemarksManagement from "./SignatureRemarksManagement";

interface TeacherProfileProps {
  onRefresh?: () => void;
}

interface ProfileTab {
  id: string;
  name: string;
  icon: React.ComponentType<any>;
}

const TeacherProfile: React.FC<TeacherProfileProps> = ({ onRefresh }) => {
  const { user } = useAuth();
  const teacher = user as TeacherUserData;
  const teacherData = teacher?.teacher_data;

  const [activeTab, setActiveTab] = useState("overview");
  const [isEditing, setIsEditing] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);
  const [profileData, setProfileData] = useState<any>(null);
  const [showBioModal, setShowBioModal] = useState(false);
  const [formData, setFormData] = useState({
    first_name: "",
    last_name: "",
    email: "",
    phone_number: "",
    address: "",
    qualification: "",
    specialization: "",
    bio: "",
    date_of_birth: ""
  });

  const tabs: ProfileTab[] = [
    { id: "overview", name: "Overview", icon: User },
    { id: "personal", name: "Personal", icon: User },
    { id: "professional", name: "Professional", icon: Briefcase },
    { id: "assignments", name: "Assignments", icon: GraduationCap },
    { id: "signature-remarks", name: "Signature & Remarks", icon: FileText },
    { id: "performance", name: "Performance", icon: Award },
    { id: "documents", name: "Documents", icon: FileText },
  ];

  useEffect(() => {
    loadProfileData();
  }, []);

  const loadProfileData = async () => {
    try {
      setIsLoading(true);
      setError(null);
      
      let teacherId = null;
      
      if ((user as any)?.teacher_data?.id) {
        teacherId = (user as any).teacher_data.id;
      } else if (teacherData?.id) {
        teacherId = teacherData.id;
      } else if (user?.id) {
        try {
          const teachersResponse = await TeacherService.getTeachers({ 
            search: user.email || user.username 
          });
          
          if (teachersResponse.results && teachersResponse.results.length > 0) {
            const teacher = teachersResponse.results.find((t: any) => 
              t.user?.id === user.id || t.user?.email === user.email
            );
            
            if (teacher) {
              teacherId = teacher.id;
            }
          }
        } catch (error) {
          console.warn('Failed to find teacher by user lookup:', error);
        }
      }
      
      if (!teacherId) {
        throw new Error("Teacher ID not found. Please ensure your teacher profile is properly set up.");
      }

      const response = await TeacherService.getTeacher(teacherId);
      setProfileData(response);
      
      const responseData = response as any;
      setFormData({
        first_name: responseData.user?.first_name || responseData.first_name || "",
        last_name: responseData.user?.last_name || responseData.last_name || "",
        email: responseData.user?.email || responseData.email || "",
        phone_number: responseData.phone_number || "",
        address: responseData.address || "",
        qualification: responseData.qualification || "",
        specialization: responseData.specialization || "",
        bio: responseData.bio || responseData.user?.bio || "",
        date_of_birth: responseData.date_of_birth || ""
      });
    } catch (error) {
      console.error("Error loading profile data:", error);
      setError(error instanceof Error ? error.message : "Failed to load profile data");
    } finally {
      setIsLoading(false);
    }
  };

  const handleSave = async () => {
    try {
      setIsLoading(true);
      setError(null);
      
      let teacherId = null;
      if ((user as any)?.teacher_data?.id) {
        teacherId = (user as any).teacher_data.id;
      } else if (teacherData?.id) {
        teacherId = teacherData.id;
      } else if (profileData?.id) {
        teacherId = profileData.id;
      }

      if (!teacherId) {
        throw new Error("Teacher ID not found");
      }

      const updateData = {
        user: {
          first_name: formData.first_name,
          last_name: formData.last_name,
          email: formData.email,
          bio: formData.bio
        },
        bio: formData.bio,
        phone_number: formData.phone_number,
        address: formData.address,
        qualification: formData.qualification,
        specialization: formData.specialization,
        date_of_birth: formData.date_of_birth,
      };

      const response = await TeacherService.updateTeacher(teacherId, updateData);
      setSuccessMessage("Profile updated successfully!");
      setIsEditing(false);
      setProfileData(response);
      
      const responseData = response as any;
      setFormData({
        first_name: responseData.user?.first_name || responseData.first_name || "",
        last_name: responseData.user?.last_name || responseData.last_name || "",
        email: responseData.user?.email || responseData.email || "",
        phone_number: responseData.phone_number || "",
        address: responseData.address || "",
        qualification: responseData.qualification || "",
        specialization: responseData.specialization || "",
        bio: responseData.bio || responseData.user?.bio || "",
        date_of_birth: responseData.date_of_birth || "",
      });

      if (onRefresh) {
        onRefresh();
      }
      
      setTimeout(() => setSuccessMessage(null), 3000);
    } catch (error) {
      console.error("Error updating profile:", error);
      setError(error instanceof Error ? error.message : "Failed to update profile");
    } finally {
      setIsLoading(false);
    }
  };

  const handleCancel = () => {
    setIsEditing(false);
    setError(null);
    setSuccessMessage(null);
    
    if (profileData) {
      const profileDataAny = profileData as any;
      setFormData({
        first_name: profileDataAny.user?.first_name || profileDataAny.first_name || "",
        last_name: profileDataAny.user?.last_name || profileDataAny.last_name || "",
        email: profileDataAny.user?.email || profileDataAny.email || "",
        phone_number: profileDataAny.phone_number || "",
        address: profileDataAny.address || "",
        qualification: profileDataAny.qualification || "",
        specialization: profileDataAny.specialization || "",
        bio: profileDataAny.bio || profileDataAny.user?.bio || "",
        date_of_birth: profileDataAny.date_of_birth || "",
      });
    }
  };

  const getProfilePicture = () => {
    return (profileData as any)?.photo || (teacherData as any)?.photo || null;
  };

  const getYearsOfService = () => {
    if (!profileData?.hire_date) return 0;
    const hireDate = new Date(profileData.hire_date);
    const currentDate = new Date();
    return Math.floor((currentDate.getTime() - hireDate.getTime()) / (1000 * 60 * 60 * 24 * 365));
  };

  const truncateBio = (text: string, maxWords: number = 15) => {
    if (!text) return "";
    const words = text.split(" ");
    if (words.length <= maxWords) return text;
    return words.slice(0, maxWords).join(" ") + "...";
  };

  const getBio = () => {
    return profileData?.bio || profileData?.user?.bio || "";
  };

  if (isLoading && !profileData) {
    return (
      <div className="min-h-screen bg-slate-50 dark:bg-slate-900 flex items-center justify-center">
        <div className="flex flex-col items-center space-y-4">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600"></div>
          <p className="text-slate-600 dark:text-slate-400 text-sm">Loading profile...</p>
        </div>
      </div>
    );
  }

  if (error && !profileData) {
    return (
      <div className="min-h-screen bg-slate-50 dark:bg-slate-900 flex items-center justify-center p-4">
        <div className="bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-2xl p-6 max-w-md mx-4">
          <div className="flex items-center space-x-3 mb-4">
            <AlertCircle className="w-6 h-6 text-red-600 dark:text-red-400" />
            <h3 className="text-lg font-semibold text-red-800 dark:text-red-200">Error Loading Profile</h3>
          </div>
          <p className="text-red-700 dark:text-red-300 mb-4">{error}</p>
          <div className="flex flex-col sm:flex-row gap-3">
            <button
              onClick={loadProfileData}
              className="px-4 py-3 bg-red-600 text-white rounded-xl hover:bg-red-700 transition-colors font-medium"
            >
              Try Again
            </button>
            <button
              onClick={() => window.location.reload()}
              className="px-4 py-3 bg-slate-600 text-white rounded-xl hover:bg-slate-700 transition-colors font-medium"
            >
              Refresh Page
            </button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-50 dark:bg-slate-900">
      {/* Mobile-Optimized Header */}
      <div className="bg-blue-600 text-white">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6 sm:py-8">
          <div className="flex flex-col sm:flex-row items-start sm:items-center gap-4 sm:gap-6">
            <div className="relative flex-shrink-0">
              <div className="w-20 h-20 sm:w-24 sm:h-24 rounded-2xl bg-white/20 backdrop-blur-sm flex items-center justify-center overflow-hidden ring-4 ring-white/30">
                {getProfilePicture() ? (
                  <img src={getProfilePicture()} alt="Profile" className="w-full h-full object-cover" />
                ) : (
                  <span className="text-2xl sm:text-3xl font-bold text-white">
                    {user?.first_name?.charAt(0)}{user?.last_name?.charAt(0)}
                  </span>
                )}
              </div>
              {isEditing && (
                <button className="absolute -bottom-2 -right-2 w-10 h-10 bg-white text-blue-600 rounded-xl flex items-center justify-center shadow-lg hover:scale-110 transition-transform">
                  <Camera className="w-5 h-5" />
                </button>
              )}
            </div>
            
            <div className="flex-1 min-w-0">
              <h1 className="text-xl sm:text-2xl lg:text-3xl font-bold mb-2">
                {profileData?.user?.first_name || user?.first_name} {profileData?.user?.last_name || user?.last_name}
              </h1>
              <div className="flex flex-wrap items-center gap-2 text-sm sm:text-base">
                <span className="px-3 py-1 bg-white/20 backdrop-blur-sm rounded-lg font-medium">
                  {profileData?.staff_type || "Teaching Staff"}
                </span>
                <span className="text-white/70">•</span>
                <span className="text-white/90">ID: {profileData?.employee_id || "N/A"}</span>
              </div>
            </div>
            
            <div className="flex gap-2 w-full sm:w-auto">
              {!isEditing ? (
                <button
                  onClick={() => setIsEditing(true)}
                  className="flex-1 sm:flex-none flex items-center justify-center gap-2 px-5 py-3 bg-white text-blue-600 rounded-xl hover:bg-blue-50 transition-all font-medium shadow-lg active:scale-95"
                >
                  <Edit className="w-4 h-4" />
                  <span>Edit Profile</span>
                </button>
              ) : (
                <>
                  <button
                    onClick={handleSave}
                    disabled={isLoading}
                    className="flex-1 sm:flex-none flex items-center justify-center gap-2 px-5 py-3 bg-white text-blue-600 rounded-xl hover:bg-blue-50 transition-all font-medium shadow-lg disabled:opacity-50 active:scale-95"
                  >
                    <Save className="w-4 h-4" />
                    <span>{isLoading ? "Saving..." : "Save"}</span>
                  </button>
                  <button
                    onClick={handleCancel}
                    className="flex-1 sm:flex-none flex items-center justify-center gap-2 px-5 py-3 bg-white/20 backdrop-blur-sm text-white rounded-xl hover:bg-white/30 transition-all font-medium active:scale-95"
                  >
                    <X className="w-4 h-4" />
                    <span>Cancel</span>
                  </button>
                </>
              )}
            </div>
          </div>
        </div>
      </div>

      {successMessage && (
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-4">
          <div className="bg-green-50 dark:bg-green-900/20 border border-green-200 dark:border-green-800 rounded-xl p-4 flex items-start gap-3">
            <CheckCircle className="w-5 h-5 text-green-600 dark:text-green-400 flex-shrink-0 mt-0.5" />
            <p className="text-green-800 dark:text-green-200 font-medium text-sm sm:text-base">{successMessage}</p>
          </div>
        </div>
      )}

      {error && (
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-4">
          <div className="bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-xl p-4 flex items-start gap-3">
            <AlertCircle className="w-5 h-5 text-red-600 dark:text-red-400 flex-shrink-0 mt-0.5" />
            <p className="text-red-800 dark:text-red-200 font-medium text-sm sm:text-base">{error}</p>
          </div>
        </div>
      )}

      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6 sm:py-8">
        <div className="mb-6 sm:mb-8">
          <div className="bg-white dark:bg-slate-800 rounded-2xl p-2 shadow-sm border border-slate-200 dark:border-slate-700">
            <div className="grid grid-cols-3 sm:grid-cols-6 gap-2">
              {tabs.map((tab) => {
                const Icon = tab.icon;
                return (
                  <button
                    key={tab.id}
                    onClick={() => setActiveTab(tab.id)}
                    className={`flex flex-col sm:flex-row items-center justify-center gap-1 sm:gap-2 px-2 py-2.5 sm:px-4 rounded-xl font-medium text-xs sm:text-sm transition-all ${
                      activeTab === tab.id
                        ? "bg-blue-600 text-white shadow-md"
                        : "text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-700"
                    }`}
                  >
                    <Icon className="w-4 h-4 flex-shrink-0" />
                    <span className="text-center leading-tight">{tab.name}</span>
                  </button>
                );
              })}
            </div>
          </div>
        </div>

        <div className="space-y-4 sm:space-y-6">
          {activeTab === "overview" && (
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-4 sm:gap-6">
              <div className="lg:col-span-2 space-y-4 sm:space-y-6">
                <div className="bg-white dark:bg-slate-800 rounded-2xl p-4 sm:p-6 shadow-sm border border-slate-200 dark:border-slate-700">
                  <h2 className="text-lg sm:text-xl font-bold text-slate-900 dark:text-white mb-4 sm:mb-6">Profile Summary</h2>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 sm:gap-6">
                    <div className="space-y-3 sm:space-y-4">
                      <div className="pb-3 border-b border-slate-200 dark:border-slate-700">
                        <label className="text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wider">Full Name</label>
                        <p className="text-slate-900 dark:text-white mt-1 font-medium text-sm sm:text-base">
                          {profileData?.user?.first_name} {profileData?.user?.last_name}
                        </p>
                      </div>
                      <div className="pb-3 border-b border-slate-200 dark:border-slate-700">
                        <label className="text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wider">Email</label>
                        <p className="text-slate-900 dark:text-white mt-1 font-medium text-sm sm:text-base break-all">{profileData?.user?.email}</p>
                      </div>
                      <div>
                        <label className="text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wider">Phone</label>
                        <p className="text-slate-900 dark:text-white mt-1 font-medium text-sm sm:text-base">{profileData?.phone_number || "Not provided"}</p>
                      </div>
                    </div>
                    <div className="space-y-3 sm:space-y-4">
                      <div className="pb-3 border-b border-slate-200 dark:border-slate-700">
                        <label className="text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wider">Qualification</label>
                        <p className="text-slate-900 dark:text-white mt-1 font-medium text-sm sm:text-base">{profileData?.qualification || "Not provided"}</p>
                      </div>
                      <div className="pb-3 border-b border-slate-200 dark:border-slate-700">
                        <label className="text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wider">Specialization</label>
                        <p className="text-slate-900 dark:text-white mt-1 font-medium text-sm sm:text-base">{profileData?.specialization || "Not provided"}</p>
                      </div>
                      <div>
                        <label className="text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wider">Years of Service</label>
                        <p className="text-slate-900 dark:text-white mt-1 font-medium text-sm sm:text-base">{getYearsOfService()} years</p>
                      </div>
                    </div>
                  </div>
                </div>
              </div>

              <div className="space-y-4 sm:space-y-6">
                <div className="bg-white dark:bg-slate-800 rounded-2xl p-4 sm:p-6 shadow-sm border border-slate-200 dark:border-slate-700">
                  <h3 className="text-base sm:text-lg font-bold text-slate-900 dark:text-white mb-4">Quick Stats</h3>
                  <div className="space-y-3">
                    <div className="flex items-center justify-between p-3 bg-blue-50 dark:bg-blue-900/20 rounded-xl">
                      <div className="flex items-center gap-3">
                        <div className="w-10 h-10 rounded-lg bg-blue-600 flex items-center justify-center flex-shrink-0">
                          <BookOpen className="w-5 h-5 text-white" />
                        </div>
                        <span className="text-slate-700 dark:text-slate-300 font-medium text-sm">Subjects</span>
                      </div>
                      <span className="text-xl font-bold text-blue-600 dark:text-blue-400">
                        {profileData?.assigned_subjects?.length || 0}
                      </span>
                    </div>
                    <div className="flex items-center justify-between p-3 bg-blue-50 dark:bg-blue-900/20 rounded-xl">
                      <div className="flex items-center gap-3">
                        <div className="w-10 h-10 rounded-lg bg-blue-600 flex items-center justify-center flex-shrink-0">
                          <GraduationCap className="w-5 h-5 text-white" />
                        </div>
                        <span className="text-slate-700 dark:text-slate-300 font-medium text-sm">Classes</span>
                      </div>
                      <span className="text-xl font-bold text-blue-600 dark:text-blue-400">
                        {profileData?.classroom_assignments?.length || 0}
                      </span>
                    </div>
                    <div className="flex items-center justify-between p-3 bg-blue-50 dark:bg-blue-900/20 rounded-xl">
                      <div className="flex items-center gap-3">
                        <div className="w-10 h-10 rounded-lg bg-blue-600 flex items-center justify-center flex-shrink-0">
                          <Users className="w-5 h-5 text-white" />
                        </div>
                        <span className="text-slate-700 dark:text-slate-300 font-medium text-sm">Students</span>
                      </div>
                      
                      <span className="text-xl font-bold text-blue-600 dark:text-blue-400">
                            {profileData?.total_students || 0}
                      </span>
                    </div>
                  </div>
                </div>

                <div className="bg-white dark:bg-slate-800 rounded-2xl p-4 sm:p-6 shadow-sm border border-slate-200 dark:border-slate-700">
                  <h3 className="text-base sm:text-lg font-bold text-slate-900 dark:text-white mb-3 sm:mb-4">Bio</h3>
                  {getBio() ? (
                    <div>
                      <p className="text-slate-600 dark:text-slate-300 leading-relaxed text-sm">
                        {truncateBio(getBio())}
                      </p>
                      {getBio().split(" ").length > 15 && (
                        <button
                          onClick={() => setShowBioModal(true)}
                          className="mt-3 text-blue-600 dark:text-blue-400 hover:text-blue-700 dark:hover:text-blue-300 text-sm font-semibold transition-colors active:scale-95"
                        >
                          Read More →
                        </button>
                      )}
                    </div>
                  ) : (
                    <p className="text-slate-500 dark:text-slate-400 text-sm italic">
                      No bio provided. Click "Edit Profile" to add your bio.
                    </p>
                  )}
                </div>
              </div>
            </div>
          )}

          {activeTab === "personal" && (
            <div className="bg-white dark:bg-slate-800 rounded-2xl p-4 sm:p-6 shadow-sm border border-slate-200 dark:border-slate-700">
              <h2 className="text-lg sm:text-xl font-bold text-slate-900 dark:text-white mb-4 sm:mb-6">Personal Information</h2>
              
              {isEditing ? (
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 sm:gap-6">
                  <div>
                    <label className="block text-sm font-semibold text-slate-700 dark:text-slate-300 mb-2">First Name</label>
                    <input
                      type="text"
                      value={formData.first_name}
                      onChange={(e) => setFormData({...formData, first_name: e.target.value})}
                      className="w-full px-4 py-3 text-base border border-slate-300 dark:border-slate-600 rounded-xl focus:ring-2 focus:ring-blue-500 focus:border-transparent dark:bg-slate-700 dark:text-white transition-all"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-semibold text-slate-700 dark:text-slate-300 mb-2">Last Name</label>
                    <input
                      type="text"
                      value={formData.last_name}
                      onChange={(e) => setFormData({...formData, last_name: e.target.value})}
                      className="w-full px-4 py-3 text-base border border-slate-300 dark:border-slate-600 rounded-xl focus:ring-2 focus:ring-blue-500 focus:border-transparent dark:bg-slate-700 dark:text-white transition-all"
                    />
                  </div>
                  <div className="sm:col-span-2">
                    <label className="block text-sm font-semibold text-slate-700 dark:text-slate-300 mb-2">Email</label>
                    <input
                      type="email"
                      value={formData.email}
                      onChange={(e) => setFormData({...formData, email: e.target.value})}
                      className="w-full px-4 py-3 text-base border border-slate-300 dark:border-slate-600 rounded-xl focus:ring-2 focus:ring-blue-500 focus:border-transparent dark:bg-slate-700 dark:text-white transition-all"
                    />
                  </div>
                  <div className="sm:col-span-2">
                    <label className="block text-sm font-semibold text-slate-700 dark:text-slate-300 mb-2">Phone Number</label>
                    <input
                      type="tel"
                      value={formData.phone_number}
                      onChange={(e) => setFormData({...formData, phone_number: e.target.value})}
                      className="w-full px-4 py-3 text-base border border-slate-300 dark:border-slate-600 rounded-xl focus:ring-2 focus:ring-blue-500 focus:border-transparent dark:bg-slate-700 dark:text-white transition-all"
                    />
                  </div>
                  <div className="sm:col-span-2">
                    <label className="block text-sm font-semibold text-slate-700 dark:text-slate-300 mb-2">Date of Birth</label>
                    <input
                      type="date"
                      value={formData.date_of_birth}
                      onChange={(e) => setFormData({...formData, date_of_birth: e.target.value})}
                      className="w-full px-4 py-3 text-base border border-slate-300 dark:border-slate-600 rounded-xl focus:ring-2 focus:ring-blue-500 focus:border-transparent dark:bg-slate-700 dark:text-white transition-all"
                    />
                  </div>
                  <div className="sm:col-span-2">
                    <label className="block text-sm font-semibold text-slate-700 dark:text-slate-300 mb-2">Address</label>
                    <textarea
                      value={formData.address}
                      onChange={(e) => setFormData({...formData, address: e.target.value})}
                      rows={3}
                      className="w-full px-4 py-3 text-base border border-slate-300 dark:border-slate-600 rounded-xl focus:ring-2 focus:ring-blue-500 focus:border-transparent dark:bg-slate-700 dark:text-white transition-all"
                    />
                  </div>
                  <div className="sm:col-span-2">
                    <label className="block text-sm font-semibold text-slate-700 dark:text-slate-300 mb-2">Bio</label>
                    <textarea
                      value={formData.bio}
                      onChange={(e) => setFormData({...formData, bio: e.target.value})}
                      rows={5}
                      placeholder="Tell us about yourself, your teaching philosophy, and experience..."
                      className="w-full px-4 py-3 text-base border border-slate-300 dark:border-slate-600 rounded-xl focus:ring-2 focus:ring-blue-500 focus:border-transparent dark:bg-slate-700 dark:text-white transition-all"
                    />
                  </div>
                </div>
              ) : (
                <div className="space-y-4">
                  <div className="pb-4 border-b border-slate-200 dark:border-slate-700">
                    <label className="text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wider">Full Name</label>
                    <p className="text-slate-900 dark:text-white mt-1 font-medium text-sm sm:text-base">
                      {profileData?.user?.first_name} {profileData?.user?.last_name}
                    </p>
                  </div>
                  <div className="pb-4 border-b border-slate-200 dark:border-slate-700">
                    <label className="text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wider">Email</label>
                    <p className="text-slate-900 dark:text-white mt-1 font-medium text-sm sm:text-base break-all">{profileData?.user?.email}</p>
                  </div>
                  <div className="pb-4 border-b border-slate-200 dark:border-slate-700">
                    <label className="text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wider">Phone Number</label>
                    <p className="text-slate-900 dark:text-white mt-1 font-medium text-sm sm:text-base">{profileData?.phone_number || "Not provided"}</p>
                  </div>
                  <div className="pb-4 border-b border-slate-200 dark:border-slate-700">
                    <label className="text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wider">Date of Birth</label>
                    <p className="text-slate-900 dark:text-white mt-1 font-medium text-sm sm:text-base">
                      {profileData?.date_of_birth ? new Date(profileData.date_of_birth).toLocaleDateString() : "Not provided"}
                    </p>
                  </div>
                  <div className="pb-4 border-b border-slate-200 dark:border-slate-700">
                    <label className="text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wider">Address</label>
                    <p className="text-slate-900 dark:text-white mt-1 font-medium text-sm sm:text-base">{profileData?.address || "Not provided"}</p>
                  </div>
                  <div>
                    <label className="text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wider">Bio</label>
                    {getBio() ? (
                      <div>
                        <p className="text-slate-700 dark:text-slate-300 leading-relaxed mt-2 text-sm">
                          {truncateBio(getBio(), 20)}
                        </p>
                        {getBio().split(" ").length > 20 && (
                          <button
                            onClick={() => setShowBioModal(true)}
                            className="mt-3 text-blue-600 dark:text-blue-400 hover:text-blue-700 dark:hover:text-blue-300 text-sm font-semibold transition-colors"
                          >
                            Read More →
                          </button>
                        )}
                      </div>
                    ) : (
                      <p className="text-slate-500 dark:text-slate-400 italic mt-2 text-sm">
                        No bio provided. Click "Edit Profile" to add your bio.
                      </p>
                    )}
                  </div>
                </div>
              )}
            </div>
          )}

          {activeTab === "professional" && (
            <div className="space-y-4 sm:space-y-6">
              <div className="bg-white dark:bg-slate-800 rounded-2xl p-4 sm:p-6 shadow-sm border border-slate-200 dark:border-slate-700">
                <h2 className="text-lg sm:text-xl font-bold text-slate-900 dark:text-white mb-4 sm:mb-6">Professional Information</h2>
                
                {isEditing ? (
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 sm:gap-6">
                    <div>
                      <label className="block text-sm font-semibold text-slate-700 dark:text-slate-300 mb-2">Qualification</label>
                      <input
                        type="text"
                        value={formData.qualification}
                        onChange={(e) => setFormData({...formData, qualification: e.target.value})}
                        placeholder="e.g., B.Sc Education, M.Ed"
                        className="w-full px-4 py-3 text-base border border-slate-300 dark:border-slate-600 rounded-xl focus:ring-2 focus:ring-blue-500 focus:border-transparent dark:bg-slate-700 dark:text-white transition-all"
                      />
                    </div>
                    <div>
                      <label className="block text-sm font-semibold text-slate-700 dark:text-slate-300 mb-2">Specialization</label>
                      <input
                        type="text"
                        value={formData.specialization}
                        onChange={(e) => setFormData({...formData, specialization: e.target.value})}
                        placeholder="e.g., Mathematics, English Literature"
                        className="w-full px-4 py-3 text-base border border-slate-300 dark:border-slate-600 rounded-xl focus:ring-2 focus:ring-blue-500 focus:border-transparent dark:bg-slate-700 dark:text-white transition-all"
                      />
                    </div>
                  </div>
                ) : (
                  <div className="space-y-4">
                    <div className="pb-4 border-b border-slate-200 dark:border-slate-700">
                      <label className="text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wider">Qualification</label>
                      <p className="text-slate-900 dark:text-white mt-1 font-medium text-sm sm:text-base">{profileData?.qualification || "Not provided"}</p>
                    </div>
                    <div className="pb-4 border-b border-slate-200 dark:border-slate-700">
                      <label className="text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wider">Specialization</label>
                      <p className="text-slate-900 dark:text-white mt-1 font-medium text-sm sm:text-base">{profileData?.specialization || "Not provided"}</p>
                    </div>
                    <div className="pb-4 border-b border-slate-200 dark:border-slate-700">
                      <label className="text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wider">Hire Date</label>
                      <p className="text-slate-900 dark:text-white mt-1 font-medium text-sm sm:text-base">
                        {profileData?.hire_date ? new Date(profileData.hire_date).toLocaleDateString() : "Not available"}
                      </p>
                    </div>
                    <div>
                      <label className="text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wider">Years of Service</label>
                      <p className="text-slate-900 dark:text-white mt-1 font-medium text-sm sm:text-base">{getYearsOfService()} years</p>
                    </div>
                  </div>
                )}
              </div>

              <div className="bg-white dark:bg-slate-800 rounded-2xl p-4 sm:p-6 shadow-sm border border-slate-200 dark:border-slate-700">
                <h3 className="text-base sm:text-lg font-bold text-slate-900 dark:text-white mb-4 sm:mb-6">Professional Development</h3>
                <div className="grid grid-cols-3 gap-3 sm:gap-4">
                  <div className="text-center p-4 sm:p-6 bg-blue-50 dark:bg-blue-900/20 rounded-2xl">
                    <div className="text-2xl sm:text-3xl font-bold text-blue-600 dark:text-blue-400 mb-1">48</div>
                    <div className="text-xs sm:text-sm text-slate-600 dark:text-slate-400 font-medium">Training Hours</div>
                  </div>
                  <div className="text-center p-4 sm:p-6 bg-blue-50 dark:bg-blue-900/20 rounded-2xl">
                    <div className="text-2xl sm:text-3xl font-bold text-blue-600 dark:text-blue-400 mb-1">3</div>
                    <div className="text-xs sm:text-sm text-slate-600 dark:text-slate-400 font-medium">Certifications</div>
                  </div>
                  <div className="text-center p-4 sm:p-6 bg-blue-50 dark:bg-blue-900/20 rounded-2xl">
                    <div className="text-2xl sm:text-3xl font-bold text-blue-600 dark:text-blue-400 mb-1">12</div>
                    <div className="text-xs sm:text-sm text-slate-600 dark:text-slate-400 font-medium">Workshops</div>
                  </div>
                </div>
              </div>

              <div className="bg-white dark:bg-slate-800 rounded-2xl p-4 sm:p-6 shadow-sm border border-slate-200 dark:border-slate-700">
                <h3 className="text-base sm:text-lg font-bold text-slate-900 dark:text-white mb-4 sm:mb-6">Teaching Experience</h3>
                <div className="space-y-3 sm:space-y-4">
                  <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between p-4 bg-slate-50 dark:bg-slate-700/50 rounded-xl gap-2">
                    <div>
                      <h4 className="font-semibold text-slate-900 dark:text-white text-sm sm:text-base">Primary Education</h4>
                      <p className="text-xs sm:text-sm text-slate-600 dark:text-slate-400 mt-1">5 years experience</p>
                    </div>
                    <span className="text-xs sm:text-sm text-slate-500 dark:text-slate-400 font-medium">2016-2021</span>
                  </div>
                  <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between p-4 bg-slate-50 dark:bg-slate-700/50 rounded-xl gap-2">
                    <div>
                      <h4 className="font-semibold text-slate-900 dark:text-white text-sm sm:text-base">Secondary Education</h4>
                      <p className="text-xs sm:text-sm text-slate-600 dark:text-slate-400 mt-1">3 years experience</p>
                    </div>
                    <span className="text-xs sm:text-sm text-slate-500 dark:text-slate-400 font-medium">2021-Present</span>
                  </div>
                </div>
              </div>
            </div>
          )}

          {activeTab === "performance" && (
            <div className="space-y-4 sm:space-y-6">
              <div className="bg-white dark:bg-slate-800 rounded-2xl p-4 sm:p-6 shadow-sm border border-slate-200 dark:border-slate-700">
                <h2 className="text-lg sm:text-xl font-bold text-slate-900 dark:text-white mb-4 sm:mb-6">Performance Overview</h2>
                
                <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4 mb-6 sm:mb-8">
                  <div className="bg-blue-600 rounded-2xl p-4 sm:p-5 text-white shadow-md">
                    <div className="flex items-center justify-between mb-2 sm:mb-3">
                      <div className="w-10 h-10 sm:w-12 sm:h-12 bg-white/20 rounded-xl flex items-center justify-center backdrop-blur-sm">
                        <CheckCircle className="w-5 h-5 sm:w-6 sm:h-6" />
                      </div>
                      <TrendingUp className="w-4 h-4 sm:w-5 sm:h-5 text-white/70" />
                    </div>
                    <p className="text-xs sm:text-sm font-medium text-white/80 mb-1">Attendance</p>
                    <p className="text-2xl sm:text-3xl font-bold">95%</p>
                    <p className="text-xs text-white/70 mt-1 sm:mt-2">Last 30 days</p>
                  </div>

                  <div className="bg-blue-600 rounded-2xl p-4 sm:p-5 text-white shadow-md">
                    <div className="flex items-center justify-between mb-2 sm:mb-3">
                      <div className="w-10 h-10 sm:w-12 sm:h-12 bg-white/20 rounded-xl flex items-center justify-center backdrop-blur-sm">
                        <Users className="w-5 h-5 sm:w-6 sm:h-6" />
                      </div>
                      <TrendingUp className="w-4 h-4 sm:w-5 sm:h-5 text-white/70" />
                    </div>
                    <p className="text-xs sm:text-sm font-medium text-white/80 mb-1">Success Rate</p>
                    <p className="text-2xl sm:text-3xl font-bold">87%</p>
                    <p className="text-xs text-white/70 mt-1 sm:mt-2">This term</p>
                  </div>

                  <div className="bg-blue-600 rounded-2xl p-4 sm:p-5 text-white shadow-md">
                    <div className="flex items-center justify-between mb-2 sm:mb-3">
                      <div className="w-10 h-10 sm:w-12 sm:h-12 bg-white/20 rounded-xl flex items-center justify-center backdrop-blur-sm">
                        <BookOpen className="w-5 h-5 sm:w-6 sm:h-6" />
                      </div>
                      <TrendingUp className="w-4 h-4 sm:w-5 sm:h-5 text-white/70" />
                    </div>
                    <p className="text-xs sm:text-sm font-medium text-white/80 mb-1">Completion</p>
                    <p className="text-2xl sm:text-3xl font-bold">92%</p>
                    <p className="text-xs text-white/70 mt-1 sm:mt-2">This week</p>
                  </div>

                  <div className="bg-blue-600 rounded-2xl p-4 sm:p-5 text-white shadow-md">
                    <div className="flex items-center justify-between mb-2 sm:mb-3">
                      <div className="w-10 h-10 sm:w-12 sm:h-12 bg-white/20 rounded-xl flex items-center justify-center backdrop-blur-sm">
                        <Award className="w-5 h-5 sm:w-6 sm:h-6" />
                      </div>
                      <TrendingUp className="w-4 h-4 sm:w-5 sm:h-5 text-white/70" />
                    </div>
                    <p className="text-xs sm:text-sm font-medium text-white/80 mb-1">Rating</p>
                    <p className="text-2xl sm:text-3xl font-bold">4.2/5</p>
                    <p className="text-xs text-white/70 mt-1 sm:mt-2">Annual review</p>
                  </div>
                </div>

                <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 sm:gap-6">
                  <div className="bg-slate-50 dark:bg-slate-700/50 rounded-2xl p-4 sm:p-6">
                    <h3 className="text-base sm:text-lg font-bold text-slate-900 dark:text-white mb-3 sm:mb-4">Student Performance</h3>
                    <div className="space-y-3 sm:space-y-4">
                      <div className="flex items-center justify-between">
                        <span className="text-xs sm:text-sm text-slate-600 dark:text-slate-400">Class Average</span>
                        <span className="font-bold text-slate-900 dark:text-white text-sm sm:text-base">87.5%</span>
                      </div>
                      <div className="flex items-center justify-between">
                        <span className="text-xs sm:text-sm text-slate-600 dark:text-slate-400">Students Improved</span>
                        <span className="font-bold text-slate-900 dark:text-white text-sm sm:text-base">78%</span>
                      </div>
                      <div className="flex items-center justify-between">
                        <span className="text-xs sm:text-sm text-slate-600 dark:text-slate-400">Pass Rate</span>
                        <span className="font-bold text-slate-900 dark:text-white text-sm sm:text-base">94%</span>
                      </div>
                    </div>
                  </div>
                  <div className="bg-slate-50 dark:bg-slate-700/50 rounded-2xl p-4 sm:p-6">
                    <h3 className="text-base sm:text-lg font-bold text-slate-900 dark:text-white mb-3 sm:mb-4">Development</h3>
                    <div className="space-y-3 sm:space-y-4">
                      <div className="flex items-center justify-between">
                        <span className="text-xs sm:text-sm text-slate-600 dark:text-slate-400">Training Hours</span>
                        <span className="font-bold text-slate-900 dark:text-white text-sm sm:text-base">48 hrs</span>
                      </div>
                      <div className="flex items-center justify-between">
                        <span className="text-xs sm:text-sm text-slate-600 dark:text-slate-400">Certifications</span>
                        <span className="font-bold text-slate-900 dark:text-white text-sm sm:text-base">3</span>
                      </div>
                      <div className="flex items-center justify-between">
                        <span className="text-xs sm:text-sm text-slate-600 dark:text-slate-400">Workshops</span>
                        <span className="font-bold text-slate-900 dark:text-white text-sm sm:text-base">12</span>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          )}

          {activeTab === "assignments" && (
            <AssignmentManagement
              teacherId={profileData?.id || 0}
              profileData={profileData}
              onRefresh={loadProfileData}
            />
          )}
          {activeTab === "signature-remarks" && (
          <SignatureRemarksManagement
            teacherId={profileData?.id || 0}
            profileData={profileData}
          />
          )}

          {activeTab === "documents" && (
            <div className="bg-white dark:bg-slate-800 rounded-2xl p-4 sm:p-6 shadow-sm border border-slate-200 dark:border-slate-700">
              <h2 className="text-lg sm:text-xl font-bold text-slate-900 dark:text-white mb-4 sm:mb-6">Documents</h2>
              <div className="text-center py-8 sm:py-12">
                <div className="w-12 h-12 sm:w-16 sm:h-16 bg-slate-100 dark:bg-slate-700 rounded-2xl flex items-center justify-center mx-auto mb-4">
                  <FileText className="w-6 h-6 sm:w-8 sm:h-8 text-slate-400" />
                </div>
                <p className="text-slate-500 dark:text-slate-400 text-sm">Document management will be available here.</p>
              </div>
            </div>
          )}
        </div>
      </div>

      {showBioModal && (
        <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-end sm:items-center justify-center z-50 p-0 sm:p-4">
          <div className="bg-white dark:bg-slate-900 w-full sm:max-w-2xl sm:rounded-3xl rounded-t-3xl max-h-[90vh] overflow-y-auto shadow-2xl border-t sm:border border-slate-200 dark:border-slate-800">
            <div className="sticky top-0 bg-white dark:bg-slate-900 border-b border-slate-200 dark:border-slate-700 px-4 sm:px-6 py-4 flex items-center justify-between z-10">
              <h2 className="text-lg sm:text-2xl font-bold text-slate-900 dark:text-white">Teacher Bio</h2>
              <button
                onClick={() => setShowBioModal(false)}
                className="w-10 h-10 rounded-xl bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 flex items-center justify-center transition-all active:scale-95"
              >
                <X className="w-5 h-5 text-slate-600 dark:text-slate-400" />
              </button>
            </div>
            <div className="p-4 sm:p-6 lg:p-8">
              <div className="bg-slate-50 dark:bg-slate-800/50 rounded-2xl p-4 sm:p-6">
                <h3 className="text-base sm:text-lg font-semibold text-slate-900 dark:text-white mb-3 sm:mb-4">
                  About {profileData?.user?.first_name} {profileData?.user?.last_name}
                </h3>
                <div className="text-sm sm:text-base text-slate-700 dark:text-slate-300 leading-relaxed whitespace-pre-wrap">
                  {getBio()}
                </div>
              </div>
              <div className="mt-4 sm:mt-6 flex flex-col sm:flex-row gap-3">
                <button
                  onClick={async () => {
                    try {
                      const url = `${window.location.origin}/teacher/bio/${profileData?.id}`;
                      await navigator.clipboard.writeText(url);
                      setSuccessMessage("Shared link copied to clipboard!");
                      setShowBioModal(false);
                    } catch (error) {
                      console.error("Failed to copy link:", error);
                      setError("Failed to copy link. Please try again.");
                    }
                  }}
                  className="flex-1 flex items-center justify-center gap-2 px-5 py-3 bg-blue-600 text-white rounded-xl hover:bg-blue-700 transition-all font-medium shadow-lg active:scale-95"
                >
                  <Share2 className="w-4 h-4" />
                  <span>Share Bio</span>
                </button>
                <button
                  onClick={() => setShowBioModal(false)}
                  className="flex-1 px-5 py-3 bg-slate-200 dark:bg-slate-800 text-slate-900 dark:text-white rounded-xl hover:bg-slate-300 dark:hover:bg-slate-700 transition-all font-medium active:scale-95"
                >
                  Close
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default TeacherProfile;