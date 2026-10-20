import api from './api';

export type NotificationKind =
  | 'assignment_set'
  | 'assignment_handed_in'
  | 'assignment_marked'
  | 'announcement'
  | 'gate_scan';

export interface InboxNotification {
  id: number;
  kind: NotificationKind;
  title: string;
  body: string;
  link: string; // a path in this app, or '' for nowhere in particular
  is_read: boolean;
  read_at: string | null;
  created_at: string;
}

/** The signed-in user's own notification bell, in the current school. */
const InboxService = {
  list: (): Promise<{ unread: number; results: InboxNotification[] }> => api.get('/api/inbox/'),

  unreadCount: (): Promise<{ unread: number }> => api.get('/api/inbox/unread-count/'),

  markRead: (id: number): Promise<{ unread: number }> => api.post(`/api/inbox/${id}/read/`, {}),

  markAllRead: (): Promise<{ unread: number }> => api.post('/api/inbox/read-all/', {}),
};

/** "just now", "5m ago", "3h ago", "2d ago", then the date. */
export const timeAgo = (iso: string): string => {
  const seconds = Math.max(0, (Date.now() - new Date(iso).getTime()) / 1000);
  if (seconds < 60) return 'just now';
  if (seconds < 3600) return `${Math.floor(seconds / 60)}m ago`;
  if (seconds < 86400) return `${Math.floor(seconds / 3600)}h ago`;
  if (seconds < 7 * 86400) return `${Math.floor(seconds / 86400)}d ago`;
  return new Date(iso).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' });
};

export default InboxService;
