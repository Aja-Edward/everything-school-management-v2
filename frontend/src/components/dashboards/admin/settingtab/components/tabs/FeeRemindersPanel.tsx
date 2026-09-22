import React, { useEffect, useState } from 'react';
import { BellRing, Loader2, Mail, MessageSquare, RefreshCw, Send } from 'lucide-react';
import { toast } from 'react-toastify';
import {
  PaymentReminderService,
  ReminderChannel,
  ReminderPreview,
  ReminderSendResult,
} from '@/services/FeeManagementService';

const naira = (amount: string | number) =>
  `₦${Number(amount).toLocaleString(undefined, { maximumFractionDigits: 2 })}`;

const plural = (n: number, one: string, many = `${one}s`) => `${n} ${n === 1 ? one : many}`;

/** What happened, in one sentence per channel. */
const describe = (result: ReminderSendResult): string[] => {
  const lines: string[] = [];
  (['email', 'sms'] as ReminderChannel[]).forEach(channel => {
    const r = result[channel];
    if (!r) return;
    const noun = channel === 'email' ? 'email' : 'SMS';
    const parts = [`${plural(r.sent, noun, channel === 'email' ? 'emails' : 'SMS')} sent`];
    if (channel === 'sms' && r.cost) parts[0] += ` (${naira(r.cost)})`;
    if (r.queued) parts.push(`${r.queued} still sending`);
    if (r.failed) parts.push(`${r.failed} failed`);
    if (r.no_address) parts.push(`${plural(r.no_address, 'parent')} with no ${channel === 'email' ? 'email address' : 'phone number'}`);
    if (r.already_reminded) parts.push(`${r.already_reminded} already reminded today`);
    lines.push(parts.join(', ') + '.');
  });
  return lines;
};

// Sends every parent of a student with an unpaid fee one reminder per child,
// by email (free) and/or SMS (billed per text). The school's colour comes from
// the Tailwind `primary` palette, as on the Services tab.
const FeeRemindersPanel: React.FC = () => {
  const [preview, setPreview] = useState<ReminderPreview | null>(null);
  const [channels, setChannels] = useState<Record<ReminderChannel, boolean>>({ email: true, sms: false });
  const [loading, setLoading] = useState(true);
  const [sending, setSending] = useState(false);
  const [result, setResult] = useState<string[] | null>(null);

  const load = async () => {
    try {
      setLoading(true);
      setPreview(await PaymentReminderService.preview());
    } catch (err) {
      console.error('Error loading fee reminders:', err);
      toast.error('Could not check who owes fees. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
  }, []);

  const chosen = (Object.keys(channels) as ReminderChannel[]).filter(c => channels[c]);
  const smsChosen = channels.sms && !!preview?.sms_enabled;
  const nothingToSend = !preview || preview.students_owing === 0 || chosen.length === 0
    || (!channels.email && !smsChosen);

  const send = async () => {
    if (!preview) return;
    const toSend = chosen.filter(c => c !== 'sms' || preview.sms_enabled);
    if (toSend.includes('sms') && !window.confirm(
      `This sends up to ${plural(preview.sms_messages, 'SMS', 'SMS')} to parents, ` +
      `costing up to ${naira(preview.sms_cost)} on your next invoice. Send?`)) {
      return;
    }
    try {
      setSending(true);
      setResult(null);
      const outcome = await PaymentReminderService.sendBulk({ channels: toSend });
      setResult(describe(outcome));
      await load();
    } catch (err: any) {
      console.error('Error sending fee reminders:', err);
      toast.error(err?.response?.data?.error || err?.message || 'Reminders were not sent.');
    } finally {
      setSending(false);
    }
  };

  return (
    <div className="bg-white dark:bg-slate-900 rounded-2xl p-6 sm:p-8 shadow-sm border border-slate-200 dark:border-slate-700">
      <div className="flex items-start justify-between gap-4">
        <div className="flex items-start gap-3">
          <span className="w-9 h-9 rounded-lg bg-primary-50 dark:bg-primary-900/40 text-primary-600 dark:text-primary-300 flex items-center justify-center flex-shrink-0">
            <BellRing className="w-4 h-4" />
          </span>
          <div>
            <h3 className="text-lg font-semibold text-slate-900 dark:text-white">Fee reminders</h3>
            <p className="mt-0.5 text-sm text-slate-500 dark:text-slate-400">
              Remind the parents of every student with an unpaid fee. Each parent gets one message per
              child, listing what is owed.
            </p>
          </div>
        </div>
        <button
          onClick={load}
          disabled={loading || sending}
          className="flex-shrink-0 inline-flex items-center gap-1.5 px-3 py-1.5 text-sm text-slate-600 dark:text-slate-300 border border-slate-200 dark:border-slate-700 rounded-lg hover:bg-slate-50 dark:hover:bg-slate-800 disabled:opacity-50 transition-colors"
        >
          <RefreshCw className="w-3.5 h-3.5" />
          Refresh
        </button>
      </div>

      {loading && !preview ? (
        <div className="py-10 flex justify-center">
          <Loader2 className="w-6 h-6 text-primary-600 animate-spin" />
        </div>
      ) : preview && preview.students_owing === 0 ? (
        <p className="mt-6 text-sm text-slate-500 dark:text-slate-400">
          No unpaid fees are recorded, so there is no one to remind.
        </p>
      ) : preview && (
        <>
          <div className="mt-6 grid grid-cols-1 sm:grid-cols-3 rounded-xl border border-slate-200 dark:border-slate-700 overflow-hidden">
            <div className="p-4 border-l-4 border-primary-600">
              <p className="text-xs font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">Owing</p>
              <p className="mt-1 text-xl font-semibold text-slate-900 dark:text-white">{naira(preview.total_outstanding)}</p>
              <p className="text-sm text-slate-500 dark:text-slate-400">{plural(preview.students_owing, 'student')}</p>
            </div>
            <div className="p-4 border-t sm:border-t-0 sm:border-l border-slate-200 dark:border-slate-700">
              <p className="text-xs font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">By email</p>
              <p className="mt-1 text-xl font-semibold text-slate-900 dark:text-white">{preview.email_messages}</p>
              <p className="text-sm text-slate-500 dark:text-slate-400">
                messages, free{preview.no_email ? ` · ${preview.no_email} with no email` : ''}
              </p>
            </div>
            <div className="p-4 border-t sm:border-t-0 sm:border-l border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800/60">
              <p className="text-xs font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">By SMS</p>
              <p className="mt-1 text-xl font-semibold text-slate-900 dark:text-white">{preview.sms_messages}</p>
              <p className="text-sm text-slate-500 dark:text-slate-400">
                texts, {naira(preview.sms_cost)} at {naira(preview.sms_price)} each
              </p>
            </div>
          </div>

          <fieldset className="mt-6">
            <legend className="text-sm font-medium text-slate-900 dark:text-white">Send by</legend>
            <div className="mt-2 flex flex-col sm:flex-row gap-3">
              <label className="flex items-center gap-2.5 px-3 py-2 rounded-lg border border-slate-200 dark:border-slate-700 cursor-pointer">
                <input
                  type="checkbox"
                  checked={channels.email}
                  onChange={e => setChannels(c => ({ ...c, email: e.target.checked }))}
                  className="w-4 h-4 rounded border-slate-300 text-primary-600 focus:ring-primary-500"
                />
                <Mail className="w-4 h-4 text-slate-400" />
                <span className="text-sm text-slate-700 dark:text-slate-200">Email <span className="text-slate-400">· free</span></span>
              </label>
              <label className={`flex items-center gap-2.5 px-3 py-2 rounded-lg border border-slate-200 dark:border-slate-700 ${
                preview.sms_enabled ? 'cursor-pointer' : 'opacity-60 cursor-not-allowed'
              }`}>
                <input
                  type="checkbox"
                  checked={channels.sms && preview.sms_enabled}
                  disabled={!preview.sms_enabled}
                  onChange={e => setChannels(c => ({ ...c, sms: e.target.checked }))}
                  className="w-4 h-4 rounded border-slate-300 text-primary-600 focus:ring-primary-500"
                />
                <MessageSquare className="w-4 h-4 text-slate-400" />
                <span className="text-sm text-slate-700 dark:text-slate-200">
                  SMS <span className="text-slate-400">· {naira(preview.sms_price)} each</span>
                </span>
              </label>
            </div>
            {!preview.sms_enabled && (
              <p className="mt-2 text-xs text-slate-500 dark:text-slate-400">
                To text parents, switch on the SMS add-on under Settings → Services.
              </p>
            )}
          </fieldset>

          <div className="mt-6 flex flex-col sm:flex-row sm:items-center gap-3">
            <button
              onClick={send}
              disabled={nothingToSend || sending}
              className="inline-flex items-center justify-center gap-2 px-4 py-2 bg-primary-600 hover:bg-primary-700 disabled:bg-slate-300 dark:disabled:bg-slate-700 disabled:cursor-not-allowed text-white text-sm font-medium rounded-lg transition-colors"
            >
              {sending ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
              {sending ? 'Sending…' : 'Send reminders'}
            </button>
            <p className="text-xs text-slate-500 dark:text-slate-400">
              A parent already reminded about a fee today is not reminded again.
            </p>
          </div>

          {result && (
            <div className="mt-4 p-3 rounded-lg bg-primary-50 dark:bg-primary-900/30 border border-primary-100 dark:border-primary-800 text-sm text-slate-700 dark:text-slate-200 space-y-0.5">
              {result.map(line => <p key={line}>{line}</p>)}
            </div>
          )}
        </>
      )}
    </div>
  );
};

export default FeeRemindersPanel;
