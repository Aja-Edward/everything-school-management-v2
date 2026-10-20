import React, { useCallback, useEffect, useState } from 'react';
import { CheckCircle2, Loader2, Send, Users } from 'lucide-react';
import { toast } from 'react-hot-toast';
import MessageService, { BulkMessage } from '@/services/MessageService';
import { describeError } from '@/services/AssignmentService';

const AUDIENCES = [
  { id: 'teachers', label: 'Teachers' },
  { id: 'parents', label: 'Parents' },
  { id: 'students', label: 'Students' },
  { id: 'admins', label: 'Admins' },
] as const;

const inputClass =
  'w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-900 ' +
  'text-gray-900 dark:text-white text-sm focus:ring-2 focus:ring-blue-500 focus:outline-none';

// Sent bulks: 'sent' when queued, then 'delivered' or 'failed' once every email's result is known.
const wasSent = (b: BulkMessage) => ['sent', 'delivered', 'failed'].includes(b.status);

/**
 * An admin's message to whole groups in the school. Each recipient gets it in
 * their Messages inbox and their notification bell, and by email if chosen.
 */
const BulkMessagesPanel: React.FC = () => {
  const [roles, setRoles] = useState<string[]>(['teachers']);
  const [subject, setSubject] = useState('');
  const [content, setContent] = useState('');
  const [byEmail, setByEmail] = useState(false);
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [history, setHistory] = useState<BulkMessage[] | null>(null);

  const loadHistory = useCallback(() => {
    MessageService.getBulkMessages()
      .then(setHistory)
      .catch(() => setHistory([]));
  }, []);

  useEffect(() => { loadHistory(); }, [loadHistory]);

  const toggle = (id: string) =>
    setRoles((prev) => (prev.includes(id) ? prev.filter((r) => r !== id) : [...prev, id]));

  const send = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    if (!roles.length || !subject.trim() || !content.trim()) {
      setError('Choose who it is for, and write a subject and a message.');
      return;
    }
    const who = AUDIENCES.filter((a) => roles.includes(a.id)).map((a) => a.label.toLowerCase()).join(', ');
    try {
      setSending(true);
      const draft = await MessageService.createBulkMessage({
        subject: subject.trim(),
        content: content.trim(),
        message_type: byEmail ? 'email' : 'in_app',
        recipient_roles: roles,
      });
      if (!window.confirm(`Send "${subject.trim()}" to ${draft.total_recipients} ${who}?`)) {
        await MessageService.deleteBulkMessage(draft.id).catch(() => {});
        return;
      }
      const sent = await MessageService.sendBulkMessage(draft.id);
      toast.success(`Sent to ${sent.sent_count} people`);
      setSubject('');
      setContent('');
      loadHistory();
    } catch (err) {
      setError(describeError(err, 'The message could not be sent.'));
    } finally {
      setSending(false);
    }
  };

  return (
    <div className="p-4 sm:p-6 space-y-8">
      <form onSubmit={send} className="space-y-4 max-w-2xl">
        <div>
          <p className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">Send to</p>
          <div className="flex flex-wrap gap-2">
            {AUDIENCES.map((a) => (
              <label
                key={a.id}
                className={`inline-flex items-center gap-2 px-3 py-1.5 rounded-full border text-sm cursor-pointer ${
                  roles.includes(a.id)
                    ? 'border-blue-600 bg-blue-50 text-blue-700 dark:bg-blue-900/30 dark:text-blue-300'
                    : 'border-gray-300 dark:border-gray-600 text-gray-700 dark:text-gray-300'
                }`}
              >
                <input type="checkbox" className="sr-only" checked={roles.includes(a.id)} onChange={() => toggle(a.id)} />
                {roles.includes(a.id) && <CheckCircle2 className="w-4 h-4" />}
                All {a.label.toLowerCase()}
              </label>
            ))}
          </div>
        </div>

        <div>
          <label htmlFor="bulk-subject" className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Subject</label>
          <input id="bulk-subject" className={inputClass} value={subject} maxLength={255} onChange={(e) => setSubject(e.target.value)} />
        </div>

        <div>
          <label htmlFor="bulk-content" className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Message</label>
          <textarea id="bulk-content" className={`${inputClass} min-h-[140px]`} value={content} onChange={(e) => setContent(e.target.value)} />
        </div>

        <label className="flex items-start gap-2 text-sm text-gray-700 dark:text-gray-300">
          <input type="checkbox" className="mt-0.5" checked={byEmail} onChange={(e) => setByEmail(e.target.checked)} />
          <span>
            Also send by email
            <span className="block text-xs text-gray-500 dark:text-gray-400">
              Everyone gets it in their Messages and notification bell either way. Email reaches only people with an email address.
            </span>
          </span>
        </label>

        {error && (
          <p role="alert" className="text-sm text-red-700 dark:text-red-300 bg-red-50 dark:bg-red-900/30 rounded-md px-3 py-2">{error}</p>
        )}

        <button
          type="submit"
          disabled={sending}
          className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-blue-600 text-white text-sm font-medium hover:bg-blue-700 disabled:opacity-60"
        >
          {sending ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
          Send
        </button>
      </form>

      <div>
        <h3 className="text-sm font-semibold text-gray-900 dark:text-white mb-3">Sent bulk messages</h3>
        {history === null ? (
          <Loader2 className="w-5 h-5 animate-spin text-gray-400" />
        ) : history.filter(wasSent).length === 0 ? (
          <p className="flex items-center gap-2 text-sm text-gray-500 dark:text-gray-400">
            <Users className="w-4 h-4" /> None yet.
          </p>
        ) : (
          <ul className="divide-y divide-gray-100 dark:divide-gray-700 border border-gray-200 dark:border-gray-700 rounded-lg">
            {history.filter(wasSent).map((b) => (
              <li key={b.id} className="px-4 py-3 flex flex-wrap items-center justify-between gap-2">
                <div className="min-w-0">
                  <p className="text-sm font-medium text-gray-900 dark:text-white break-words">{b.subject}</p>
                  <p className="text-xs text-gray-500 dark:text-gray-400">
                    To {(b.recipient_roles || []).join(', ') || 'selected people'} · {b.message_type === 'email' ? 'app and email' : 'app'}
                  </p>
                </div>
                <div className="text-right text-xs text-gray-500 dark:text-gray-400">
                  <p className="font-medium text-gray-700 dark:text-gray-300">{b.sent_count} recipients</p>
                  {b.message_type === 'email' && (
                    b.delivered_count + b.failed_count === 0 ? (
                      <p>Emails sending…</p>
                    ) : (
                      <p>
                        {b.delivered_count} emailed
                        {b.failed_count > 0 && (
                          <span
                            className="text-red-600 dark:text-red-400 font-medium"
                            title="Open one of these messages in Sent to see why"
                          >
                            {' '}· {b.failed_count} failed
                          </span>
                        )}
                      </p>
                    )
                  )}
                  {b.sent_at && <p>{MessageService.formatDate(b.sent_at)}</p>}
                </div>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
};

export default BulkMessagesPanel;
