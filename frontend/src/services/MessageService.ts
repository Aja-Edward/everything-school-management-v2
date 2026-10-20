import api from './api';

// Types
export interface Message {
  id: number;
  sender: number;
  sender_name: string;
  sender_email: string;
  recipient: number;
  recipient_name: string;
  recipient_email: string;
  subject: string;
  content: string;
  message_type: 'in_app' | 'email' | 'sms' | 'bulk';
  message_type_display: string;
  priority: 'low' | 'normal' | 'high' | 'urgent';
  priority_display: string;
  status: 'draft' | 'sent' | 'delivered' | 'failed' | 'pending';
  status_display: string;
  is_read: boolean;
  is_archived: boolean;
  is_deleted: boolean;
  sent_at?: string;
  delivered_at?: string;
  read_at?: string;
  external_id?: string;
  delivery_status?: string;
  created_at: string;
  updated_at: string;
}

export interface CreateMessageData {
  recipient: number;
  subject: string;
  content: string;
  message_type?: 'in_app' | 'email' | 'sms' | 'bulk';
  priority?: 'low' | 'normal' | 'high' | 'urgent';
}

export interface UpdateMessageData {
  subject?: string;
  content?: string;
  message_type?: 'in_app' | 'email' | 'sms' | 'bulk';
  priority?: 'low' | 'normal' | 'high' | 'urgent';
  is_archived?: boolean;
  is_deleted?: boolean;
}

export interface MessageTemplate {
  id: number;
  name: string;
  subject: string;
  content: string;
  message_type: 'in_app' | 'email' | 'sms' | 'bulk';
  message_type_display: string;
  is_active: boolean;
  created_by: number;
  created_by_name: string;
  created_at: string;
  updated_at: string;
}

export interface CreateTemplateData {
  name: string;
  subject: string;
  content: string;
  message_type?: 'in_app' | 'email' | 'sms' | 'bulk';
  is_active?: boolean;
}

export interface BulkMessage {
  id: number;
  sender: number;
  sender_name: string;
  subject: string;
  content: string;
  message_type: 'in_app' | 'email' | 'sms' | 'bulk';
  message_type_display: string;
  priority: 'low' | 'normal' | 'high' | 'urgent';
  priority_display: string;
  recipient_roles: string[];
  recipient_groups: string[];
  custom_recipients: number[];
  total_recipients: number;
  sent_count: number;
  delivered_count: number;
  failed_count: number;
  status: 'draft' | 'sent' | 'delivered' | 'failed' | 'pending';
  status_display: string;
  scheduled_at?: string;
  sent_at?: string;
  created_at: string;
  updated_at: string;
}

export interface CreateBulkMessageData {
  subject: string;
  content: string;
  message_type?: 'in_app' | 'email' | 'sms' | 'bulk';
  priority?: 'low' | 'normal' | 'high' | 'urgent';
  recipient_roles?: string[];
  recipient_groups?: string[];
  custom_recipients?: number[];
}

export interface User {
  id: number;
  email: string;
  full_name: string;
  role: string;
  role_display: string;
}

export interface MessageStats {
  total_inbox: number;
  unread_inbox: number;
  total_sent: number;
  total_drafts: number;
  total_archived: number;
}

export interface BulkMessageStats {
  total_bulk_messages: number;
  total_recipients: number;
  total_sent: number;
  total_pending: number;
}

export interface MessageFilters {
  type?: 'inbox' | 'sent' | 'drafts' | 'archived';
  message_type?: string;
  priority?: string;
  status?: string;
  is_read?: boolean;
  is_archived?: boolean;
  search?: string;
  ordering?: string;
}

// api.get/post return the parsed body, not an axios-style { data }. Paginated
// endpoints wrap their rows as { count, next, previous, results }.
const listFrom = <T>(body: any): T[] => (Array.isArray(body) ? body : body?.results || []);

class MessageService {
  // Message CRUD operations
  async getMessages(filters: MessageFilters = {}): Promise<Message[]> {
    const params = new URLSearchParams();
    
    if (filters.type) params.append('type', filters.type);
    if (filters.message_type) params.append('message_type', filters.message_type);
    if (filters.priority) params.append('priority', filters.priority);
    if (filters.status) params.append('status', filters.status);
    if (filters.is_read !== undefined) params.append('is_read', filters.is_read.toString());
    if (filters.is_archived !== undefined) params.append('archived', filters.is_archived.toString());
    if (filters.search) params.append('search', filters.search);
    if (filters.ordering) params.append('ordering', filters.ordering);

    return listFrom(await api.get(`/api/messaging/messages/?${params.toString()}`));
  }

  async getMessage(id: number): Promise<Message> {
    return await api.get(`/api/messaging/messages/${id}/`);
  }

  async createMessage(data: CreateMessageData): Promise<Message> {
    return await api.post('/api/messaging/messages/', data);
  }

  async updateMessage(id: number, data: UpdateMessageData): Promise<Message> {
    return await api.patch(`/api/messaging/messages/${id}/`, data);
  }

  async deleteMessage(id: number): Promise<void> {
    await api.delete(`/api/messaging/messages/${id}/`);
  }

  // Message actions
  async markAsRead(id: number): Promise<void> {
    await api.post(`/api/messaging/messages/${id}/mark_as_read/`);
  }

  async markAsUnread(id: number): Promise<void> {
    await api.post(`/api/messaging/messages/${id}/mark_as_unread/`);
  }

  async archiveMessage(id: number): Promise<void> {
    await api.post(`/api/messaging/messages/${id}/archive/`);
  }

  async unarchiveMessage(id: number): Promise<void> {
    await api.post(`/api/messaging/messages/${id}/unarchive/`);
  }

  async softDeleteMessage(id: number): Promise<void> {
    await api.post(`/api/messaging/messages/${id}/delete_message/`);
  }

  // Message statistics
  async getMessageStats(): Promise<MessageStats> {
    return await api.get('/api/messaging/messages/stats/');
  }

  // User list for message composition
  async getUsers(): Promise<User[]> {
    return await api.get('/api/messaging/messages/users/');
  }

  // Template CRUD operations
  async getTemplates(): Promise<MessageTemplate[]> {
    return listFrom(await api.get('/api/messaging/templates/'));
  }

  async getTemplate(id: number): Promise<MessageTemplate> {
    return await api.get(`/api/messaging/templates/${id}/`);
  }

  async createTemplate(data: CreateTemplateData): Promise<MessageTemplate> {
    return await api.post('/api/messaging/templates/', data);
  }

  async updateTemplate(id: number, data: Partial<CreateTemplateData>): Promise<MessageTemplate> {
    return await api.patch(`/api/messaging/templates/${id}/`, data);
  }

  async deleteTemplate(id: number): Promise<void> {
    await api.delete(`/api/messaging/templates/${id}/`);
  }

  async useTemplate(id: number): Promise<{ subject: string; content: string; message_type: string }> {
    return await api.post(`/api/messaging/templates/${id}/use_template/`);
  }

  // Bulk message CRUD operations
  async getBulkMessages(): Promise<BulkMessage[]> {
    return listFrom(await api.get('/api/messaging/bulk-messages/'));
  }

  async getBulkMessage(id: number): Promise<BulkMessage> {
    return await api.get(`/api/messaging/bulk-messages/${id}/`);
  }

  async createBulkMessage(data: CreateBulkMessageData): Promise<BulkMessage> {
    return await api.post('/api/messaging/bulk-messages/', data);
  }

  async updateBulkMessage(id: number, data: Partial<CreateBulkMessageData>): Promise<BulkMessage> {
    return await api.patch(`/api/messaging/bulk-messages/${id}/`, data);
  }

  async deleteBulkMessage(id: number): Promise<void> {
    await api.delete(`/api/messaging/bulk-messages/${id}/`);
  }

  // Bulk message actions
  /** Sends a draft to everyone it names; returns it with its sent_count. */
  async sendBulkMessage(id: number): Promise<BulkMessage> {
    return await api.post(`/api/messaging/bulk-messages/${id}/send_now/`);
  }

  async scheduleBulkMessage(id: number, scheduledAt: string): Promise<void> {
    await api.post(`/api/messaging/bulk-messages/${id}/schedule/`, {
      scheduled_at: scheduledAt
    });
  }

  // Bulk message statistics
  async getBulkMessageStats(): Promise<BulkMessageStats> {
    return await api.get('/api/messaging/bulk-messages/stats/');
  }

  // Utility methods
  getPriorityColor(priority: string): string {
    switch (priority) {
      case 'urgent': return 'text-red-600 bg-red-100';
      case 'high': return 'text-orange-600 bg-orange-100';
      case 'normal': return 'text-blue-600 bg-blue-100';
      case 'low': return 'text-gray-600 bg-gray-100';
      default: return 'text-gray-600 bg-gray-100';
    }
  }

  getStatusColor(status: string): string {
    switch (status) {
      case 'delivered': return 'text-green-600 bg-green-100';
      case 'sent': return 'text-blue-600 bg-blue-100';
      case 'pending': return 'text-yellow-600 bg-yellow-100';
      case 'failed': return 'text-red-600 bg-red-100';
      case 'draft': return 'text-gray-600 bg-gray-100';
      default: return 'text-gray-600 bg-gray-100';
    }
  }

  // Why a failed email didn't go out, in words a school admin can act on.
  // delivery_status holds the provider's raw answer, e.g.
  // 'Brevo returned 401: {"message":"Key not found","code":"unauthorized"}'.
  failureReason(message: Pick<Message, 'status' | 'delivery_status'>): string | null {
    if (message.status !== 'failed') return null;
    const raw = (message.delivery_status || '').trim();
    if (!raw) return 'The email could not be sent.';
    const match = raw.match(/^Brevo returned (\d{3}):\s*(.*)$/s);
    if (!match) return raw;
    const code = Number(match[1]);
    let detail = match[2];
    try {
      detail = JSON.parse(detail).message || detail;
    } catch {
      // Not JSON; show the text as it came.
    }
    if (code === 401) return `The email service rejected the sending key, so no email went out (${detail}).`;
    if (code === 402) return `The email service account has run out of credits (${detail}).`;
    if (code === 400) return `The email service refused this email (${detail}).`;
    if (code >= 500) return `The email service was having problems; try again later (${detail}).`;
    return `The email service returned an error ${code} (${detail}).`;
  }

  getMessageTypeIcon(messageType: string): string {
    switch (messageType) {
      case 'email': return '📧';
      case 'sms': return '📱';
      case 'bulk': return '📢';
      default: return '💬';
    }
  }

  formatDate(dateString: string): string {
    const date = new Date(dateString);
    const now = new Date();
    const diffInHours = (now.getTime() - date.getTime()) / (1000 * 60 * 60);

    if (diffInHours < 1) {
      return 'Just now';
    } else if (diffInHours < 24) {
      return `${Math.floor(diffInHours)}h ago`;
    } else if (diffInHours < 168) { // 7 days
      return `${Math.floor(diffInHours / 24)}d ago`;
    } else {
      return date.toLocaleDateString();
    }
  }
}

export default new MessageService();








