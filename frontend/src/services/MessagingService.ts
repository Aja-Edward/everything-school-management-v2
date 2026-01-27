/**
 * Messaging Service
 *
 * Manages messaging operations including individual messages and bulk messages.
 */

import api from './api';

// ============================================================================
// TYPE DEFINITIONS
// ============================================================================

export interface Message {
  id: number;
  sender: number;
  sender_name: string;
  sender_email: string;
  recipient: number;
  recipient_name: string;
  recipient_email: string;
  subject: string;
  body: string;
  is_read: boolean;
  is_archived: boolean;
  parent_message: number | null;
  sent_at: string;
  read_at: string | null;
  created_at: string;
  updated_at: string;
}

export interface CreateMessageData {
  recipient: number;
  subject: string;
  body: string;
  parent_message?: number | null;
}

export interface UpdateMessageData extends Partial<CreateMessageData> {}

export interface MessageFilters {
  sender?: number;
  recipient?: number;
  is_read?: boolean;
  is_archived?: boolean;
  search?: string;
  page?: number;
  page_size?: number;
}

export interface MessageStats {
  total_sent: number;
  total_received: number;
  unread_count: number;
  archived_count: number;
}

export interface MessageUser {
  id: number;
  name: string;
  email: string;
  role: string;
}

export interface BulkMessage {
  id: number;
  sender: number;
  sender_name: string;
  sender_email: string;
  subject: string;
  body: string;
  recipient_type: 'ALL' | 'STUDENTS' | 'TEACHERS' | 'PARENTS' | 'ADMINS' | 'CUSTOM';
  recipient_type_display: string;
  custom_recipients: number[];
  status: 'DRAFT' | 'SCHEDULED' | 'SENDING' | 'SENT' | 'FAILED';
  status_display: string;
  scheduled_at: string | null;
  sent_at: string | null;
  total_recipients: number;
  successful_count: number;
  failed_count: number;
  created_at: string;
  updated_at: string;
}

export interface CreateBulkMessageData {
  subject: string;
  body: string;
  recipient_type: 'ALL' | 'STUDENTS' | 'TEACHERS' | 'PARENTS' | 'ADMINS' | 'CUSTOM';
  custom_recipients?: number[];
  scheduled_at?: string | null;
}

export interface UpdateBulkMessageData extends Partial<CreateBulkMessageData> {}

export interface BulkMessageFilters {
  sender?: number;
  recipient_type?: string;
  status?: string;
  search?: string;
  page?: number;
  page_size?: number;
}

export interface BulkMessageStats {
  total_messages: number;
  draft_count: number;
  scheduled_count: number;
  sending_count: number;
  sent_count: number;
  failed_count: number;
  total_recipients_reached: number;
}

export interface ScheduleBulkMessageData {
  scheduled_at: string;
}

export interface MessageTemplate {
  id: number;
  name: string;
  subject: string;
  content: string;
  message_type: string;
  created_by: number;
  created_by_name?: string;
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

export interface CreateMessageTemplateData {
  name: string;
  subject: string;
  content: string;
  message_type: string;
}

export interface UpdateMessageTemplateData extends Partial<CreateMessageTemplateData> {
  is_active?: boolean;
}

export interface MessageTemplateFilters {
  message_type?: string;
  is_active?: boolean;
  search?: string;
  page?: number;
  page_size?: number;
}

// ============================================================================
// MESSAGING SERVICE
// ============================================================================

class MessagingService {
  // ============================================================================
  // INDIVIDUAL MESSAGES
  // ============================================================================

  /**
   * Get all messages (inbox/outbox based on filter)
   */
  async getMessages(params?: MessageFilters): Promise<Message[]> {
    try {
      const response = await api.get('/api/messaging/messages/', params);
      return response.results || response;
    } catch (error) {
      console.error('Error fetching messages:', error);
      throw error;
    }
  }

  /**
   * Get a single message by ID
   */
  async getMessage(id: number): Promise<Message> {
    try {
      const response = await api.get(`/api/messaging/messages/${id}/`);
      return response;
    } catch (error) {
      console.error(`Error fetching message ${id}:`, error);
      throw error;
    }
  }

  /**
   * Send a new message
   */
  async sendMessage(data: CreateMessageData): Promise<Message> {
    try {
      const response = await api.post('/api/messaging/messages/', data);
      return response;
    } catch (error) {
      console.error('Error sending message:', error);
      throw error;
    }
  }

  /**
   * Update a message (draft)
   */
  async updateMessage(id: number, data: UpdateMessageData): Promise<Message> {
    try {
      const response = await api.patch(`/api/messaging/messages/${id}/`, data);
      return response;
    } catch (error) {
      console.error(`Error updating message ${id}:`, error);
      throw error;
    }
  }

  /**
   * Delete a message
   */
  async deleteMessage(id: number): Promise<void> {
    try {
      await api.delete(`/api/messaging/messages/${id}/`);
    } catch (error) {
      console.error(`Error deleting message ${id}:`, error);
      throw error;
    }
  }

  /**
   * Mark message as read
   */
  async markAsRead(id: number): Promise<{ message: string; is_read: boolean }> {
    try {
      const response = await api.post(`/api/messaging/messages/${id}/mark_as_read/`, {});
      return response;
    } catch (error) {
      console.error(`Error marking message ${id} as read:`, error);
      throw error;
    }
  }

  /**
   * Mark message as unread
   */
  async markAsUnread(id: number): Promise<{ message: string; is_read: boolean }> {
    try {
      const response = await api.post(`/api/messaging/messages/${id}/mark_as_unread/`, {});
      return response;
    } catch (error) {
      console.error(`Error marking message ${id} as unread:`, error);
      throw error;
    }
  }

  /**
   * Archive a message
   */
  async archiveMessage(id: number): Promise<{ message: string; is_archived: boolean }> {
    try {
      const response = await api.post(`/api/messaging/messages/${id}/archive/`, {});
      return response;
    } catch (error) {
      console.error(`Error archiving message ${id}:`, error);
      throw error;
    }
  }

  /**
   * Unarchive a message
   */
  async unarchiveMessage(id: number): Promise<{ message: string; is_archived: boolean }> {
    try {
      const response = await api.post(`/api/messaging/messages/${id}/unarchive/`, {});
      return response;
    } catch (error) {
      console.error(`Error unarchiving message ${id}:`, error);
      throw error;
    }
  }

  /**
   * Soft delete a message (different from permanent delete)
   */
  async softDeleteMessage(id: number): Promise<{ message: string }> {
    try {
      const response = await api.post(`/api/messaging/messages/${id}/delete_message/`, {});
      return response;
    } catch (error) {
      console.error(`Error soft deleting message ${id}:`, error);
      throw error;
    }
  }

  /**
   * Get message statistics
   */
  async getMessageStats(): Promise<MessageStats> {
    try {
      const response = await api.get('/api/messaging/messages/stats/');
      return response;
    } catch (error) {
      console.error('Error fetching message stats:', error);
      throw error;
    }
  }

  /**
   * Get inbox messages with type filter
   */
  async getInboxWithFilter(userId: number): Promise<Message[]> {
    return this.getMessages({ recipient: userId, is_archived: false });
  }

  /**
   * Get sent messages with type filter
   */
  async getSentWithFilter(userId: number): Promise<Message[]> {
    return this.getMessages({ sender: userId, is_archived: false });
  }

  /**
   * Get draft messages
   */
  async getDraftMessages(userId: number): Promise<Message[]> {
    return this.getMessages({ sender: userId });
  }

  /**
   * Get list of users available for messaging
   */
  async getAvailableUsers(): Promise<MessageUser[]> {
    try {
      const response = await api.get('/api/messaging/messages/users/');
      return response;
    } catch (error) {
      console.error('Error fetching available users:', error);
      throw error;
    }
  }

  // ============================================================================
  // HELPER METHODS FOR INDIVIDUAL MESSAGES
  // ============================================================================

  /**
   * Get inbox messages (received messages)
   */
  async getInbox(userId: number): Promise<Message[]> {
    return this.getMessages({ recipient: userId, is_archived: false });
  }

  /**
   * Get sent messages
   */
  async getSentMessages(userId: number): Promise<Message[]> {
    return this.getMessages({ sender: userId, is_archived: false });
  }

  /**
   * Get unread messages
   */
  async getUnreadMessages(userId: number): Promise<Message[]> {
    return this.getMessages({ recipient: userId, is_read: false, is_archived: false });
  }

  /**
   * Get archived messages
   */
  async getArchivedMessages(userId: number): Promise<Message[]> {
    return this.getMessages({ recipient: userId, is_archived: true });
  }

  /**
   * Reply to a message
   */
  async replyToMessage(messageId: number, body: string): Promise<Message> {
    try {
      const originalMessage = await this.getMessage(messageId);
      const replyData: CreateMessageData = {
        recipient: originalMessage.sender,
        subject: `Re: ${originalMessage.subject}`,
        body,
        parent_message: messageId,
      };
      return this.sendMessage(replyData);
    } catch (error) {
      console.error(`Error replying to message ${messageId}:`, error);
      throw error;
    }
  }

  /**
   * Get message thread (original message + all replies)
   */
  async getMessageThread(messageId: number): Promise<Message[]> {
    try {
      const message = await this.getMessage(messageId);

      // Find the root message
      let rootId = messageId;
      if (message.parent_message) {
        rootId = message.parent_message;
      }

      // Get all messages in the thread
      const allMessages = await this.getMessages();
      const thread = allMessages.filter(
        m => m.id === rootId || m.parent_message === rootId
      );

      // Sort by sent_at
      return thread.sort((a, b) =>
        new Date(a.sent_at).getTime() - new Date(b.sent_at).getTime()
      );
    } catch (error) {
      console.error(`Error fetching message thread for ${messageId}:`, error);
      throw error;
    }
  }

  /**
   * Bulk mark messages as read
   */
  async bulkMarkAsRead(ids: number[]): Promise<void> {
    try {
      const promises = ids.map(id => this.markAsRead(id));
      await Promise.all(promises);
    } catch (error) {
      console.error('Error bulk marking messages as read:', error);
      throw error;
    }
  }

  /**
   * Bulk archive messages
   */
  async bulkArchiveMessages(ids: number[]): Promise<void> {
    try {
      const promises = ids.map(id => this.archiveMessage(id));
      await Promise.all(promises);
    } catch (error) {
      console.error('Error bulk archiving messages:', error);
      throw error;
    }
  }

  /**
   * Bulk delete messages
   */
  async bulkDeleteMessages(ids: number[]): Promise<void> {
    try {
      const promises = ids.map(id => this.deleteMessage(id));
      await Promise.all(promises);
    } catch (error) {
      console.error('Error bulk deleting messages:', error);
      throw error;
    }
  }

  // ============================================================================
  // BULK MESSAGES
  // ============================================================================

  /**
   * Get all bulk messages
   */
  async getBulkMessages(params?: BulkMessageFilters): Promise<BulkMessage[]> {
    try {
      const response = await api.get('/api/messaging/bulk-messages/', params);
      return response.results || response;
    } catch (error) {
      console.error('Error fetching bulk messages:', error);
      throw error;
    }
  }

  /**
   * Get a single bulk message by ID
   */
  async getBulkMessage(id: number): Promise<BulkMessage> {
    try {
      const response = await api.get(`/api/messaging/bulk-messages/${id}/`);
      return response;
    } catch (error) {
      console.error(`Error fetching bulk message ${id}:`, error);
      throw error;
    }
  }

  /**
   * Create a new bulk message (draft)
   */
  async createBulkMessage(data: CreateBulkMessageData): Promise<BulkMessage> {
    try {
      const response = await api.post('/api/messaging/bulk-messages/', data);
      return response;
    } catch (error) {
      console.error('Error creating bulk message:', error);
      throw error;
    }
  }

  /**
   * Update a bulk message
   */
  async updateBulkMessage(id: number, data: UpdateBulkMessageData): Promise<BulkMessage> {
    try {
      const response = await api.patch(`/api/messaging/bulk-messages/${id}/`, data);
      return response;
    } catch (error) {
      console.error(`Error updating bulk message ${id}:`, error);
      throw error;
    }
  }

  /**
   * Delete a bulk message
   */
  async deleteBulkMessage(id: number): Promise<void> {
    try {
      await api.delete(`/api/messaging/bulk-messages/${id}/`);
    } catch (error) {
      console.error(`Error deleting bulk message ${id}:`, error);
      throw error;
    }
  }

  /**
   * Send a bulk message immediately
   */
  async sendBulkMessageNow(id: number): Promise<{ message: string; bulk_message: BulkMessage }> {
    try {
      const response = await api.post(`/api/messaging/bulk-messages/${id}/send_now/`, {});
      return response;
    } catch (error) {
      console.error(`Error sending bulk message ${id}:`, error);
      throw error;
    }
  }

  /**
   * Schedule a bulk message for later
   */
  async scheduleBulkMessage(id: number, data: ScheduleBulkMessageData): Promise<{ message: string; bulk_message: BulkMessage }> {
    try {
      const response = await api.post(`/api/messaging/bulk-messages/${id}/schedule/`, data);
      return response;
    } catch (error) {
      console.error(`Error scheduling bulk message ${id}:`, error);
      throw error;
    }
  }

  /**
   * Get bulk message statistics
   */
  async getBulkMessageStats(): Promise<BulkMessageStats> {
    try {
      const response = await api.get('/api/messaging/bulk-messages/stats/');
      return response;
    } catch (error) {
      console.error('Error fetching bulk message stats:', error);
      throw error;
    }
  }

  // ============================================================================
  // HELPER METHODS FOR BULK MESSAGES
  // ============================================================================

  /**
   * Get draft bulk messages
   */
  async getDraftBulkMessages(): Promise<BulkMessage[]> {
    return this.getBulkMessages({ status: 'DRAFT' });
  }

  /**
   * Get scheduled bulk messages
   */
  async getScheduledBulkMessages(): Promise<BulkMessage[]> {
    return this.getBulkMessages({ status: 'SCHEDULED' });
  }

  /**
   * Get sent bulk messages
   */
  async getSentBulkMessages(): Promise<BulkMessage[]> {
    return this.getBulkMessages({ status: 'SENT' });
  }

  /**
   * Get failed bulk messages
   */
  async getFailedBulkMessages(): Promise<BulkMessage[]> {
    return this.getBulkMessages({ status: 'FAILED' });
  }

  /**
   * Create and send bulk message immediately
   */
  async createAndSendBulkMessage(data: CreateBulkMessageData): Promise<BulkMessage> {
    try {
      // Create the bulk message
      const bulkMessage = await this.createBulkMessage(data);

      // Send it immediately
      const result = await this.sendBulkMessageNow(bulkMessage.id);

      return result.bulk_message;
    } catch (error) {
      console.error('Error creating and sending bulk message:', error);
      throw error;
    }
  }

  /**
   * Create and schedule bulk message
   */
  async createAndScheduleBulkMessage(
    data: CreateBulkMessageData,
    scheduledAt: string
  ): Promise<BulkMessage> {
    try {
      // Create the bulk message
      const bulkMessage = await this.createBulkMessage(data);

      // Schedule it
      const result = await this.scheduleBulkMessage(bulkMessage.id, { scheduled_at: scheduledAt });

      return result.bulk_message;
    } catch (error) {
      console.error('Error creating and scheduling bulk message:', error);
      throw error;
    }
  }

  // ============================================================================
  // MESSAGE TEMPLATES
  // ============================================================================

  /**
   * Get all message templates
   */
  async getMessageTemplates(params?: MessageTemplateFilters): Promise<MessageTemplate[]> {
    try {
      const response = await api.get('/api/messaging/templates/', params);
      return response.results || response;
    } catch (error) {
      console.error('Error fetching message templates:', error);
      throw error;
    }
  }

  /**
   * Get a single message template by ID
   */
  async getMessageTemplate(id: number): Promise<MessageTemplate> {
    try {
      const response = await api.get(`/api/messaging/templates/${id}/`);
      return response;
    } catch (error) {
      console.error(`Error fetching message template ${id}:`, error);
      throw error;
    }
  }

  /**
   * Create a new message template
   */
  async createMessageTemplate(data: CreateMessageTemplateData): Promise<MessageTemplate> {
    try {
      const response = await api.post('/api/messaging/templates/', data);
      return response;
    } catch (error) {
      console.error('Error creating message template:', error);
      throw error;
    }
  }

  /**
   * Update a message template
   */
  async updateMessageTemplate(id: number, data: UpdateMessageTemplateData): Promise<MessageTemplate> {
    try {
      const response = await api.patch(`/api/messaging/templates/${id}/`, data);
      return response;
    } catch (error) {
      console.error(`Error updating message template ${id}:`, error);
      throw error;
    }
  }

  /**
   * Delete a message template
   */
  async deleteMessageTemplate(id: number): Promise<void> {
    try {
      await api.delete(`/api/messaging/templates/${id}/`);
    } catch (error) {
      console.error(`Error deleting message template ${id}:`, error);
      throw error;
    }
  }

  /**
   * Use a template to create a new message
   * Returns template content for message composition
   */
  async useMessageTemplate(id: number): Promise<{
    subject: string;
    content: string;
    message_type: string;
  }> {
    try {
      const response = await api.post(`/api/messaging/templates/${id}/use_template/`, {});
      return response;
    } catch (error) {
      console.error(`Error using message template ${id}:`, error);
      throw error;
    }
  }

  /**
   * Get active message templates
   */
  async getActiveTemplates(params?: MessageTemplateFilters): Promise<MessageTemplate[]> {
    return this.getMessageTemplates({ ...params, is_active: true });
  }

  /**
   * Get templates by message type
   */
  async getTemplatesByType(messageType: string, params?: MessageTemplateFilters): Promise<MessageTemplate[]> {
    return this.getMessageTemplates({ ...params, message_type: messageType });
  }
}

export const messagingService = new MessagingService();
export default messagingService;
