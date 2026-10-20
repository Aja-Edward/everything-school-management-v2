import React from 'react';
import TeacherDashboardLayout from '@/components/layouts/TeacherDashboardLayout';
import MessageManagement from '@/components/dashboards/admin/MessageManagement';

/** A teacher's own messages: what the school sent them, and what they sent. */
const TeacherMessagesPage: React.FC = () => (
  <TeacherDashboardLayout>
    <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 py-6 sm:py-8">
      <MessageManagement />
    </div>
  </TeacherDashboardLayout>
);

export default TeacherMessagesPage;
