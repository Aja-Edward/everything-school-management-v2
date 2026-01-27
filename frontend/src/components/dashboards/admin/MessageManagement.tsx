import React, { useState, useEffect } from 'react';
import ReactDOM from 'react-dom';
import {
  MessageSquare,
  Send,
  Inbox,
  Archive,
  Trash2,
  Edit,
  Plus,
  Search,
  Eye,
  Reply,
  Clock,
  Users,
  FileText,
  Settings,
  RefreshCw,
  Loader2,
  X,
  Mail,
  Smartphone,
  Bell
} from 'lucide-react';
import { toast } from 'react-hot-toast';
import MessageService, {
  Message,
  MessageTemplate,
  BulkMessage,
  User,
  MessageStats,
  CreateMessageData,
  CreateTemplateData
} from '../../../services/MessageService';

const MessageManagement: React.FC = () => {
  // State management
  const [activeTab, setActiveTab] = useState<'inbox' | 'sent' | 'drafts' | 'templates' | 'bulk'>('inbox');
  const [messages, setMessages] = useState<Message[]>([]);
  const [templates, setTemplates] = useState<MessageTemplate[]>([]);
  const [users, setUsers] = useState<User[]>([]);
  const [stats, setStats] = useState<MessageStats | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [showComposeModal, setShowComposeModal] = useState(false);
  const [showTemplateModal, setShowTemplateModal] = useState(false);
  const [showViewModal, setShowViewModal] = useState(false);
  const [selectedMessage, setSelectedMessage] = useState<Message | null>(null);
  const [searchTerm, setSearchTerm] = useState('');

  // Form states
  const [composeForm, setComposeForm] = useState<CreateMessageData>({
    recipient: 0,
    subject: '',
    content: '',
    message_type: 'in_app',
    priority: 'normal'
  });

  const [templateForm, setTemplateForm] = useState<CreateTemplateData>({
    name: '',
    subject: '',
    content: '',
    message_type: 'in_app',
    is_active: true
  });

  // Load data
  useEffect(() => {
    loadData();
  }, [activeTab]);

  const loadData = async () => {
    try {
      setLoading(true);

      if (activeTab === 'inbox' || activeTab === 'sent' || activeTab === 'drafts') {
        const messagesData = await MessageService.getMessages({ type: activeTab });
        // Ensure messages is always an array, even if API returns undefined/null
        setMessages(Array.isArray(messagesData) ? messagesData : []);
      } else if (activeTab === 'templates') {
        const templatesData = await MessageService.getTemplates();
        // Ensure templates is always an array
        setTemplates(Array.isArray(templatesData) ? templatesData : []);
      }

      // Load users and stats
      const [usersData, statsData] = await Promise.all([
        MessageService.getUsers(),
        MessageService.getMessageStats()
      ]);
      setUsers(Array.isArray(usersData) ? usersData : []);
      setStats(statsData || null);

    } catch (error) {
      console.error('Error loading data:', error);
      toast.error('Failed to load data');
      // Reset to empty arrays on error to prevent undefined errors
      setMessages([]);
      setTemplates([]);
      setUsers([]);
    } finally {
      setLoading(false);
    }
  };

  // Message actions
  const handleComposeMessage = async () => {
    try {
      setSaving(true);
      await MessageService.createMessage(composeForm);
      toast.success('Message sent successfully');
      setShowComposeModal(false);
      setComposeForm({ recipient: 0, subject: '', content: '', message_type: 'in_app', priority: 'normal' });
      loadData();
    } catch (error) {
      console.error('Error sending message:', error);
      toast.error('Failed to send message');
    } finally {
      setSaving(false);
    }
  };

  const handleCreateTemplate = async () => {
    try {
      setSaving(true);
      await MessageService.createTemplate(templateForm);
      toast.success('Template created successfully');
      setShowTemplateModal(false);
      setTemplateForm({ name: '', subject: '', content: '', message_type: 'in_app', is_active: true });
      loadData();
    } catch (error) {
      console.error('Error creating template:', error);
      toast.error('Failed to create template');
    } finally {
      setSaving(false);
    }
  };

  const handleMarkAsRead = async (messageId: number) => {
    try {
      await MessageService.markAsRead(messageId);
      loadData();
    } catch (error) {
      console.error('Error marking message as read:', error);
      toast.error('Failed to mark message as read');
    }
  };

  const handleArchiveMessage = async (messageId: number) => {
    try {
      await MessageService.archiveMessage(messageId);
      toast.success('Message archived');
      loadData();
    } catch (error) {
      console.error('Error archiving message:', error);
      toast.error('Failed to archive message');
    }
  };

  const handleDeleteMessage = async (messageId: number) => {
    try {
      await MessageService.softDeleteMessage(messageId);
      toast.success('Message deleted');
      loadData();
    } catch (error) {
      console.error('Error deleting message:', error);
      toast.error('Failed to delete message');
    }
  };

  // Filter messages - ensure messages is always an array before filtering
  const filteredMessages = (messages || []).filter(message => {
    if (!message) return false;
    const searchLower = searchTerm.toLowerCase();
    return (message.subject?.toLowerCase().includes(searchLower) ||
           message.content?.toLowerCase().includes(searchLower) ||
           message.sender_name?.toLowerCase().includes(searchLower) ||
           message.recipient_name?.toLowerCase().includes(searchLower));
  });

  const tabs = [
    { id: 'inbox', label: 'Inbox', icon: Inbox, count: stats?.unread_inbox || 0 },
    { id: 'sent', label: 'Sent', icon: Send, count: stats?.total_sent || 0 },
    { id: 'drafts', label: 'Drafts', icon: FileText, count: stats?.total_drafts || 0 },
    { id: 'templates', label: 'Templates', icon: Settings, count: templates?.length || 0 },
    { id: 'bulk', label: 'Bulk Messages', icon: Users, count: 0 },
  ];

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <Loader2 className="w-8 h-8 animate-spin text-blue-600" />
        <span className="ml-2 text-gray-600">Loading messages...</span>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900 dark:text-white">Messages</h1>
          <p className="text-gray-600 dark:text-gray-300">Manage your communications</p>
        </div>
        <div className="flex items-center space-x-3">
          <button
            onClick={() => setShowComposeModal(true)}
            className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 flex items-center space-x-2"
          >
            <Plus size={16} />
            <span>Compose</span>
          </button>
          <button
            onClick={loadData}
            className="p-2 text-gray-600 hover:text-gray-900 dark:text-gray-300 dark:hover:text-white"
          >
            <RefreshCw size={16} />
          </button>
        </div>
      </div>

      {/* Tabs */}
      <div className="border-b border-gray-200 dark:border-gray-700">
        <nav className="flex space-x-8">
          {tabs.map((tab) => (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id as any)}
              className={`flex items-center space-x-2 py-2 px-1 border-b-2 font-medium text-sm ${
                activeTab === tab.id
                  ? 'border-blue-500 text-blue-600'
                  : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
              }`}
            >
              <tab.icon size={16} />
              <span>{tab.label}</span>
              {tab.count > 0 && (
                <span className="bg-gray-100 text-gray-600 px-2 py-1 rounded-full text-xs">
                  {tab.count}
                </span>
              )}
            </button>
          ))}
        </nav>
      </div>

      {/* Search */}
      <div className="flex items-center space-x-4">
        <div className="flex-1">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400" size={16} />
            <input
              type="text"
              placeholder="Search messages..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="w-full pl-10 pr-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
            />
          </div>
        </div>
      </div>

      {/* Content */}
      <div className="bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700">
        {activeTab === 'inbox' || activeTab === 'sent' || activeTab === 'drafts' ? (
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead className="bg-gray-50 dark:bg-gray-700">
                <tr>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    {activeTab === 'inbox' ? 'From' : 'To'}
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Subject
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Type
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Priority
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Status
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Date
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Actions
                  </th>
                </tr>
              </thead>
              <tbody className="bg-white dark:bg-gray-800 divide-y divide-gray-200 dark:divide-gray-700">
                {filteredMessages.map((message) => (
                  <tr key={message.id} className={`hover:bg-gray-50 dark:hover:bg-gray-700 ${!message.is_read ? 'bg-blue-50 dark:bg-blue-900/20' : ''}`}>
                    <td className="px-6 py-4 whitespace-nowrap">
                      <div className="flex items-center">
                        <div className="flex-shrink-0 h-10 w-10">
                          <div className="h-10 w-10 rounded-full bg-gray-300 flex items-center justify-center">
                            <span className="text-sm font-medium text-gray-700">
                              {activeTab === 'inbox' ? message.sender_name.charAt(0) : message.recipient_name.charAt(0)}
                            </span>
                          </div>
                        </div>
                        <div className="ml-4">
                          <div className="text-sm font-medium text-gray-900 dark:text-white">
                            {activeTab === 'inbox' ? message.sender_name : message.recipient_name}
                          </div>
                          <div className="text-sm text-gray-500 dark:text-gray-300">
                            {activeTab === 'inbox' ? message.sender_email : message.recipient_email}
                          </div>
                        </div>
                      </div>
                    </td>
                    <td className="px-6 py-4">
                      <div className="text-sm font-medium text-gray-900 dark:text-white">
                        {message.subject}
                      </div>
                      <div className="text-sm text-gray-500 dark:text-gray-300 truncate max-w-xs">
                        {message.content}
                      </div>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap">
                      <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-gray-100 text-gray-800">
                        {MessageService.getMessageTypeIcon(message.message_type)} {message.message_type_display}
                      </span>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap">
                      <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${MessageService.getPriorityColor(message.priority)}`}>
                        {message.priority_display}
                      </span>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap">
                      <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${MessageService.getStatusColor(message.status)}`}>
                        {message.status_display}
                      </span>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500 dark:text-gray-300">
                      {MessageService.formatDate(message.created_at)}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm font-medium">
                      <div className="flex items-center space-x-2">
                        <button
                          onClick={() => {
                            setSelectedMessage(message);
                            setShowViewModal(true);
                            if (!message.is_read) handleMarkAsRead(message.id);
                          }}
                          className="text-blue-600 hover:text-blue-900"
                        >
                          <Eye size={16} />
                        </button>
                        {activeTab === 'inbox' && (
                          <button
                            onClick={() => handleArchiveMessage(message.id)}
                            className="text-gray-600 hover:text-gray-900"
                          >
                            <Archive size={16} />
                          </button>
                        )}
                        <button
                          onClick={() => handleDeleteMessage(message.id)}
                          className="text-red-600 hover:text-red-900"
                        >
                          <Trash2 size={16} />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : activeTab === 'templates' ? (
          <div className="p-6">
            <div className="flex justify-between items-center mb-4">
              <h3 className="text-lg font-medium text-gray-900 dark:text-white">Message Templates</h3>
              <button
                onClick={() => setShowTemplateModal(true)}
                className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 flex items-center space-x-2"
              >
                <Plus size={16} />
                <span>New Template</span>
              </button>
            </div>
            
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {templates.map((template) => (
                <div key={template.id} className="border border-gray-200 dark:border-gray-700 rounded-lg p-4">
                  <div className="flex items-center justify-between mb-2">
                    <h4 className="font-medium text-gray-900 dark:text-white">{template.name}</h4>
                    <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${template.is_active ? 'bg-green-100 text-green-800' : 'bg-gray-100 text-gray-800'}`}>
                      {template.is_active ? 'Active' : 'Inactive'}
                    </span>
                  </div>
                  <p className="text-sm text-gray-600 dark:text-gray-300 mb-2">{template.subject}</p>
                  <p className="text-xs text-gray-500 dark:text-gray-400 mb-3 line-clamp-2">{template.content}</p>
                  <div className="flex items-center justify-between">
                    <span className="text-xs text-gray-500 dark:text-gray-400">
                      {MessageService.getMessageTypeIcon(template.message_type)} {template.message_type_display}
                    </span>
                    <div className="flex items-center space-x-2">
                      <button
                        onClick={async () => {
                          try {
                            const templateData = await MessageService.useTemplate(template.id);
                            setComposeForm(prev => ({
                              ...prev,
                              subject: templateData.subject,
                              content: templateData.content,
                              message_type: templateData.message_type as any
                            }));
                            setShowComposeModal(true);
                          } catch (error) {
                            toast.error('Failed to use template');
                          }
                        }}
                        className="text-green-600 hover:text-green-900"
                      >
                        <Send size={14} />
                      </button>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        ) : activeTab === 'bulk' ? (
          <div className="p-6">
            <div className="text-center py-12">
              <Users className="w-16 h-16 text-gray-400 mx-auto mb-4" />
              <h3 className="text-lg font-medium text-gray-900 dark:text-white mb-2">Bulk Messaging</h3>
              <p className="text-gray-600 dark:text-gray-300">
                Send messages to multiple recipients at once. This feature is coming soon.
              </p>
            </div>
          </div>
        ) : null}
      </div>

      {/* Compose Modal */}
      {showComposeModal && ReactDOM.createPortal(
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div className="bg-white dark:bg-gray-800 rounded-lg p-6 w-full max-w-2xl max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-lg font-medium text-gray-900 dark:text-white">Compose Message</h3>
              <button
                onClick={() => setShowComposeModal(false)}
                className="text-gray-400 hover:text-gray-600"
              >
                <X size={20} />
              </button>
            </div>

            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                  To
                </label>
                <select
                  value={composeForm.recipient}
                  onChange={(e) => setComposeForm(prev => ({ ...prev, recipient: Number(e.target.value) }))}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
                >
                  <option value={0}>Select recipient...</option>
                  {users.map((user) => (
                    <option key={user.id} value={user.id}>
                      {user.full_name} ({user.role_display})
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                  Subject
                </label>
                <input
                  type="text"
                  value={composeForm.subject}
                  onChange={(e) => setComposeForm(prev => ({ ...prev, subject: e.target.value }))}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
                  placeholder="Enter subject..."
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                  Message Type
                </label>
                <select
                  value={composeForm.message_type}
                  onChange={(e) => setComposeForm(prev => ({ ...prev, message_type: e.target.value as any }))}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
                >
                  <option value="in_app">In-App Message</option>
                  <option value="email">Email</option>
                  <option value="sms">SMS</option>
                </select>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                  Priority
                </label>
                <select
                  value={composeForm.priority}
                  onChange={(e) => setComposeForm(prev => ({ ...prev, priority: e.target.value as any }))}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
                >
                  <option value="low">Low</option>
                  <option value="normal">Normal</option>
                  <option value="high">High</option>
                  <option value="urgent">Urgent</option>
                </select>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                  Content
                </label>
                <textarea
                  value={composeForm.content}
                  onChange={(e) => setComposeForm(prev => ({ ...prev, content: e.target.value }))}
                  rows={6}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
                  placeholder="Enter your message..."
                />
              </div>
            </div>

            <div className="flex items-center justify-end space-x-3 mt-6">
              <button
                onClick={() => setShowComposeModal(false)}
                className="px-4 py-2 text-gray-700 bg-gray-100 rounded-lg hover:bg-gray-200"
              >
                Cancel
              </button>
              <button
                onClick={handleComposeMessage}
                disabled={saving || !composeForm.recipient || !composeForm.subject || !composeForm.content}
                className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed flex items-center space-x-2"
              >
                {saving ? <Loader2 size={16} className="animate-spin" /> : <Send size={16} />}
                <span>{saving ? 'Sending...' : 'Send Message'}</span>
              </button>
            </div>
          </div>
        </div>,
        document.body
      )}

      {/* Template Modal */}
      {showTemplateModal && ReactDOM.createPortal(
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div className="bg-white dark:bg-gray-800 rounded-lg p-6 w-full max-w-2xl max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-lg font-medium text-gray-900 dark:text-white">New Template</h3>
              <button
                onClick={() => setShowTemplateModal(false)}
                className="text-gray-400 hover:text-gray-600"
              >
                <X size={20} />
              </button>
            </div>

            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                  Template Name
                </label>
                <input
                  type="text"
                  value={templateForm.name}
                  onChange={(e) => setTemplateForm(prev => ({ ...prev, name: e.target.value }))}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
                  placeholder="Enter template name..."
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                  Subject
                </label>
                <input
                  type="text"
                  value={templateForm.subject}
                  onChange={(e) => setTemplateForm(prev => ({ ...prev, subject: e.target.value }))}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
                  placeholder="Enter subject..."
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                  Message Type
                </label>
                <select
                  value={templateForm.message_type}
                  onChange={(e) => setTemplateForm(prev => ({ ...prev, message_type: e.target.value as any }))}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
                >
                  <option value="in_app">In-App Message</option>
                  <option value="email">Email</option>
                  <option value="sms">SMS</option>
                </select>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                  Content
                </label>
                <textarea
                  value={templateForm.content}
                  onChange={(e) => setTemplateForm(prev => ({ ...prev, content: e.target.value }))}
                  rows={6}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
                  placeholder="Enter template content..."
                />
              </div>
            </div>

            <div className="flex items-center justify-end space-x-3 mt-6">
              <button
                onClick={() => setShowTemplateModal(false)}
                className="px-4 py-2 text-gray-700 bg-gray-100 rounded-lg hover:bg-gray-200"
              >
                Cancel
              </button>
              <button
                onClick={handleCreateTemplate}
                disabled={saving || !templateForm.name || !templateForm.subject || !templateForm.content}
                className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed flex items-center space-x-2"
              >
                {saving ? <Loader2 size={16} className="animate-spin" /> : <Plus size={16} />}
                <span>{saving ? 'Saving...' : 'Save Template'}</span>
              </button>
            </div>
          </div>
        </div>,
        document.body
      )}

      {/* View Message Modal */}
      {showViewModal && selectedMessage && ReactDOM.createPortal(
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div className="bg-white dark:bg-gray-800 rounded-lg p-6 w-full max-w-2xl max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-lg font-medium text-gray-900 dark:text-white">View Message</h3>
              <button
                onClick={() => setShowViewModal(false)}
                className="text-gray-400 hover:text-gray-600"
              >
                <X size={20} />
              </button>
            </div>

            <div className="space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                    From
                  </label>
                  <p className="text-sm text-gray-900 dark:text-white">{selectedMessage.sender_name}</p>
                  <p className="text-xs text-gray-500 dark:text-gray-400">{selectedMessage.sender_email}</p>
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                    To
                  </label>
                  <p className="text-sm text-gray-900 dark:text-white">{selectedMessage.recipient_name}</p>
                  <p className="text-xs text-gray-500 dark:text-gray-400">{selectedMessage.recipient_email}</p>
                </div>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                  Subject
                </label>
                <p className="text-sm text-gray-900 dark:text-white">{selectedMessage.subject}</p>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                  Content
                </label>
                <div className="bg-gray-50 dark:bg-gray-700 rounded-lg p-4">
                  <p className="text-sm text-gray-900 dark:text-white whitespace-pre-wrap">{selectedMessage.content}</p>
                </div>
              </div>

              <div className="grid grid-cols-3 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                    Type
                  </label>
                  <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-gray-100 text-gray-800">
                    {MessageService.getMessageTypeIcon(selectedMessage.message_type)} {selectedMessage.message_type_display}
                  </span>
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                    Priority
                  </label>
                  <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${MessageService.getPriorityColor(selectedMessage.priority)}`}>
                    {selectedMessage.priority_display}
                  </span>
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                    Status
                  </label>
                  <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${MessageService.getStatusColor(selectedMessage.status)}`}>
                    {selectedMessage.status_display}
                  </span>
                </div>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                  Sent
                </label>
                <p className="text-sm text-gray-900 dark:text-white">{MessageService.formatDate(selectedMessage.created_at)}</p>
              </div>
            </div>

            <div className="flex items-center justify-end space-x-3 mt-6">
              <button
                onClick={() => setShowViewModal(false)}
                className="px-4 py-2 text-gray-700 bg-gray-100 rounded-lg hover:bg-gray-200"
              >
                Close
              </button>
            </div>
          </div>
        </div>,
        document.body
      )}
    </div>
  );
};

export default MessageManagement;
