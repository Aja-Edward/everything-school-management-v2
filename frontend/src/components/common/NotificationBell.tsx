import React, { useCallback, useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Bell, CheckCheck, ClipboardCheck, ClipboardList, DoorOpen, Inbox, Loader2, Megaphone, Send,
} from 'lucide-react';
import InboxService, { InboxNotification, NotificationKind, timeAgo } from '@/services/InboxService';

// How often the unread count refreshes while the page is open.
const POLL_MS = 60_000;

const KIND_ICON: Record<NotificationKind, React.ElementType> = {
  assignment_set: ClipboardList,
  assignment_handed_in: Send,
  assignment_marked: ClipboardCheck,
  announcement: Megaphone,
  gate_scan: DoorOpen,
};

interface NotificationBellProps {
  /** Classes for the bell button, so it matches each layout's other header buttons. */
  buttonClassName?: string;
  iconClassName?: string;
}

/**
 * The bell in every role's header: an unread badge, and a dropdown of the
 * latest notifications. Opening one marks it read and goes to its page.
 */
const NotificationBell: React.FC<NotificationBellProps> = ({
  buttonClassName = 'relative p-2 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-800',
  iconClassName = 'w-5 h-5 text-gray-600 dark:text-gray-300',
}) => {
  const navigate = useNavigate();
  const [open, setOpen] = useState(false);
  const [unread, setUnread] = useState(0);
  const [items, setItems] = useState<InboxNotification[] | null>(null);
  const [failed, setFailed] = useState(false);
  const panelRef = useRef<HTMLDivElement>(null);

  const refreshCount = useCallback(() => {
    InboxService.unreadCount()
      .then((data) => setUnread(data?.unread ?? 0))
      .catch(() => { /* a missed poll is retried on the next one */ });
  }, []);

  useEffect(() => {
    refreshCount();
    const timer = window.setInterval(refreshCount, POLL_MS);
    window.addEventListener('focus', refreshCount);
    return () => {
      window.clearInterval(timer);
      window.removeEventListener('focus', refreshCount);
    };
  }, [refreshCount]);

  const load = useCallback(() => {
    setFailed(false);
    InboxService.list()
      .then((data) => {
        setItems(data?.results || []);
        setUnread(data?.unread ?? 0);
      })
      .catch(() => setFailed(true));
  }, []);

  const toggle = () => {
    setOpen((was) => {
      if (!was) load();
      return !was;
    });
  };

  // Close on a click outside or Escape.
  useEffect(() => {
    if (!open) return;
    const onClick = (e: MouseEvent) => {
      if (panelRef.current && !panelRef.current.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') setOpen(false); };
    document.addEventListener('mousedown', onClick);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onClick);
      document.removeEventListener('keydown', onKey);
    };
  }, [open]);

  const openItem = async (item: InboxNotification) => {
    if (!item.is_read) {
      setItems((prev) => prev && prev.map((n) => (n.id === item.id ? { ...n, is_read: true } : n)));
      setUnread((n) => Math.max(0, n - 1));
      InboxService.markRead(item.id).catch(() => refreshCount());
    }
    if (item.link) {
      setOpen(false);
      navigate(item.link);
    }
  };

  const markAll = async () => {
    setItems((prev) => prev && prev.map((n) => ({ ...n, is_read: true })));
    setUnread(0);
    InboxService.markAllRead().catch(() => refreshCount());
  };

  return (
    <div className="relative" ref={panelRef}>
      <button
        type="button"
        onClick={toggle}
        className={buttonClassName}
        aria-label={unread ? `Notifications, ${unread} unread` : 'Notifications'}
        aria-expanded={open}
      >
        <Bell className={iconClassName} />
        {unread > 0 && (
          <span className="absolute -top-0.5 -right-0.5 min-w-[18px] h-[18px] px-1 rounded-full bg-red-600 text-white text-[10px] font-semibold leading-[18px] text-center">
            {unread > 99 ? '99+' : unread}
          </span>
        )}
      </button>

      {open && (
        <div className="fixed sm:absolute inset-x-3 sm:inset-x-auto top-16 sm:top-auto sm:right-0 sm:mt-2 sm:w-96 z-50 rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900 shadow-xl overflow-hidden">
          <div className="flex items-center justify-between px-4 py-3 border-b border-gray-100 dark:border-gray-800">
            <h2 className="text-sm font-semibold text-gray-900 dark:text-white">Notifications</h2>
            {unread > 0 && (
              <button
                type="button"
                onClick={markAll}
                className="inline-flex items-center gap-1 text-xs font-medium text-blue-600 dark:text-blue-400 hover:underline"
              >
                <CheckCheck className="w-3.5 h-3.5" /> Mark all read
              </button>
            )}
          </div>

          <div className="max-h-[70vh] sm:max-h-96 overflow-y-auto">
            {failed ? (
              <p className="px-4 py-8 text-center text-sm text-red-600 dark:text-red-400">
                Notifications could not be loaded.{' '}
                <button type="button" onClick={load} className="underline">Try again</button>
              </p>
            ) : items === null ? (
              <div className="flex justify-center py-8">
                <Loader2 className="w-5 h-5 animate-spin text-gray-400" />
              </div>
            ) : items.length === 0 ? (
              <div className="px-4 py-10 text-center text-sm text-gray-500 dark:text-gray-400">
                <Inbox className="w-8 h-8 mx-auto mb-2 text-gray-300 dark:text-gray-600" />
                You're all caught up.
              </div>
            ) : (
              <ul className="divide-y divide-gray-100 dark:divide-gray-800">
                {items.map((item) => {
                  const Icon = KIND_ICON[item.kind] || Bell;
                  return (
                    <li key={item.id}>
                      <button
                        type="button"
                        onClick={() => openItem(item)}
                        className={`w-full text-left flex gap-3 px-4 py-3 hover:bg-gray-50 dark:hover:bg-gray-800/60 ${
                          item.is_read ? '' : 'bg-blue-50/60 dark:bg-blue-900/20'
                        }`}
                      >
                        <Icon className="w-4 h-4 mt-0.5 shrink-0 text-gray-500 dark:text-gray-400" />
                        <span className="min-w-0 flex-1">
                          <span className={`block text-sm break-words ${item.is_read ? 'text-gray-700 dark:text-gray-300' : 'font-medium text-gray-900 dark:text-white'}`}>
                            {item.title}
                          </span>
                          {item.body && (
                            <span className="block text-xs text-gray-500 dark:text-gray-400 mt-0.5 line-clamp-2 break-words">
                              {item.body}
                            </span>
                          )}
                          <span className="block text-[11px] text-gray-400 mt-1">{timeAgo(item.created_at)}</span>
                        </span>
                        {!item.is_read && <span className="w-2 h-2 mt-1.5 rounded-full bg-blue-600 shrink-0" aria-label="Unread" />}
                      </button>
                    </li>
                  );
                })}
              </ul>
            )}
          </div>
        </div>
      )}
    </div>
  );
};

export default NotificationBell;
