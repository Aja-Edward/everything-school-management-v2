// components/dashboards/admin/ParentViewModal.tsx

import React from "react";
import {
  X, User, Phone, MapPin, Mail, GraduationCap,
  BookOpen, Users, Shield, Calendar,
} from "lucide-react";
import type { Parent } from "@/services/ParentService";

interface Props {
  parent: Parent;
  onClose: () => void;
  onEdit: () => void;
}

function initials(first: string, last: string) {
  return `${first?.[0] ?? ""}${last?.[0] ?? ""}`.toUpperCase() || "?";
}

function InfoRow({
  icon,
  label,
  value,
}: {
  icon: React.ReactNode;
  label: string;
  value?: string | null;
}) {
  return (
    <div className="flex items-start gap-3">
      <span className="mt-0.5 text-gray-400 flex-shrink-0">{icon}</span>
      <div className="min-w-0">
        <p className="text-xs text-gray-400 mb-0.5">{label}</p>
        <p className="text-sm text-gray-900 font-medium break-words">
          {value || <span className="text-gray-300 font-normal">—</span>}
        </p>
      </div>
    </div>
  );
}

const ParentViewModal: React.FC<Props> = ({ parent, onClose, onEdit }) => {
  const firstName = parent.user_first_name ?? "";
  const lastName  = parent.user_last_name  ?? "";
  const email     =
    typeof parent.user === "string"
      ? parent.user
      : (parent.user as any)?.email ?? "";

  const students = Array.isArray(parent.students) ? parent.students : [];

  // Deduplicate education levels and streams for the summary strip
  const levels = [...new Set(students.map((s) => s.education_level_display).filter(Boolean))];
  const streams = [...new Set(students.map((s) => s.stream_name).filter(Boolean))];

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-2xl w-full max-w-2xl max-h-[92vh] overflow-y-auto shadow-2xl">

        {/* ── Top bar ── */}
        <div className="flex items-center justify-between px-6 pt-5 pb-4 border-b border-gray-100">
          <span className="text-xs font-semibold text-gray-400 uppercase tracking-widest">
            Parent profile
          </span>
          <button
            onClick={onClose}
            className="p-1.5 rounded-lg hover:bg-gray-100 transition-colors text-gray-400"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* ── Hero section ── */}
        <div className="px-6 py-6 flex items-center gap-5 border-b border-gray-100">
          {/* Avatar */}
          <div className="w-16 h-16 rounded-2xl bg-blue-100 flex items-center justify-center flex-shrink-0">
            <span className="text-xl font-semibold text-blue-600">
              {initials(firstName, lastName)}
            </span>
          </div>

          <div className="flex-1 min-w-0">
            <h2 className="text-xl font-semibold text-gray-900 truncate">
              {firstName} {lastName}
            </h2>
            <p className="text-sm text-gray-500 truncate mt-0.5">{email}</p>

            {/* Status + role badges */}
            <div className="flex flex-wrap gap-2 mt-3">
              <span
                className={`inline-flex items-center gap-1.5 text-xs font-medium px-2.5 py-1 rounded-full
                  ${parent.is_active
                    ? "bg-green-100 text-green-700"
                    : "bg-red-100 text-red-600"}`}
              >
                <span
                  className={`w-1.5 h-1.5 rounded-full ${
                    parent.is_active ? "bg-green-500" : "bg-red-400"
                  }`}
                />
                {parent.is_active ? "Active" : "Inactive"}
              </span>

              {(parent as any).relationship_type && (
                <span className="inline-flex items-center gap-1.5 text-xs font-medium px-2.5 py-1 rounded-full bg-blue-50 text-blue-700">
                  <Shield className="w-3 h-3" />
                  {(parent as any).relationship_type}
                </span>
              )}

              <span className="inline-flex items-center gap-1.5 text-xs font-medium px-2.5 py-1 rounded-full bg-gray-100 text-gray-600">
                <Users className="w-3 h-3" />
                {students.length} {students.length === 1 ? "child" : "children"}
              </span>
            </div>
          </div>

          {/* Edit button */}
          <button
            onClick={onEdit}
            className="flex-shrink-0 px-4 py-2 text-sm font-medium bg-gray-900 text-white rounded-xl hover:bg-gray-700 transition-colors"
          >
            Edit
          </button>
        </div>

        <div className="px-6 py-6 grid grid-cols-1 md:grid-cols-2 gap-8">

          {/* ── Left column: contact details ── */}
          <div className="space-y-5">
            <h3 className="text-xs font-semibold text-gray-400 uppercase tracking-widest mb-1">
              Contact details
            </h3>

            <InfoRow
              icon={<Mail className="w-4 h-4" />}
              label="Email address"
              value={email}
            />
            <InfoRow
              icon={<Phone className="w-4 h-4" />}
              label="Phone number"
              value={parent.parent_contact}
            />
            <InfoRow
              icon={<MapPin className="w-4 h-4" />}
              label="Home address"
              value={parent.parent_address}
            />
            {(parent as any).date_joined && (
              <InfoRow
                icon={<Calendar className="w-4 h-4" />}
                label="Account created"
                value={new Date((parent as any).date_joined).toLocaleDateString(
                  undefined,
                  { year: "numeric", month: "long", day: "numeric" }
                )}
              />
            )}
          </div>

          {/* ── Right column: academic overview ── */}
          <div>
            <h3 className="text-xs font-semibold text-gray-400 uppercase tracking-widest mb-4">
              Academic overview
            </h3>

            {/* Level + stream pills */}
            {(levels.length > 0 || streams.length > 0) && (
              <div className="flex flex-wrap gap-2 mb-5">
                {levels.map((l) => (
                  <span
                    key={l}
                    className="text-xs px-2.5 py-1 rounded-full bg-indigo-50 text-indigo-700 font-medium"
                  >
                    {l}
                  </span>
                ))}
                {streams.map((s) => (
                  <span
                    key={s}
                    className="text-xs px-2.5 py-1 rounded-full bg-amber-50 text-amber-700 font-medium"
                  >
                    {s}
                  </span>
                ))}
              </div>
            )}

            {/* Children list */}
            {students.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-8 text-center">
                <GraduationCap className="w-8 h-8 text-gray-300 mb-2" />
                <p className="text-sm text-gray-400">No children linked yet</p>
              </div>
            ) : (
              <div className="space-y-2">
                {students.map((child) => (
                  <div
                    key={child.id}
                    className="flex items-start gap-3 p-3 rounded-xl bg-gray-50 border border-gray-100"
                  >
                    {/* Student avatar */}
                    <div className="w-8 h-8 rounded-lg bg-indigo-100 flex items-center justify-center flex-shrink-0">
                      <GraduationCap className="w-4 h-4 text-indigo-600" />
                    </div>

                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-semibold text-gray-900 truncate">
                        {child.full_name}
                      </p>

                      {/* Meta row */}
                      <div className="flex flex-wrap gap-x-3 gap-y-0.5 mt-0.5">
                        {child.education_level_display && (
                          <span className="text-xs text-gray-500">
                            {child.education_level_display}
                          </span>
                        )}
                        {child.student_class_display && (
                          <span className="text-xs text-gray-500 flex items-center gap-1">
                            <BookOpen className="w-3 h-3" />
                            {child.student_class_display}
                          </span>
                        )}
                        {child.stream_name && (
                          <span className="text-xs font-medium text-amber-700 bg-amber-50 px-1.5 py-0.5 rounded-md">
                            {child.stream_name}
                            {(child as any).stream_type
                              ? ` · ${(child as any).stream_type}`
                              : ""}
                          </span>
                        )}
                      </div>

                      {/* Reg number if present */}
                      {(child as any).registration_number && (
                        <p className="text-xs text-gray-400 mt-0.5 font-mono">
                          #{(child as any).registration_number}
                        </p>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>

        {/* ── Footer ── */}
        <div className="px-6 pb-5">
          <div className="border-t border-gray-100 pt-4 flex justify-end gap-2">
            <button
              onClick={onClose}
              className="px-4 py-2 text-sm border border-gray-200 rounded-xl text-gray-600 hover:bg-gray-50 transition-colors"
            >
              Close
            </button>
            <button
              onClick={onEdit}
              className="px-4 py-2 text-sm bg-gray-900 text-white rounded-xl hover:bg-gray-700 transition-colors"
            >
              Edit parent
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};

export default ParentViewModal;