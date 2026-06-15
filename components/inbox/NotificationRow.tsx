'use client';

import { useRouter } from 'next/navigation';
import { Check, RotateCcw, Archive, Trash2, ArchiveRestore } from 'lucide-react';
import NotificationIcon from './NotificationIcon';
import { formatNotificationTime, type NotificationRow as Row } from '../../lib/notificationsClient';

interface NotificationRowProps {
  item: Row;
  isArchivedView: boolean;
  onMarkRead: (id: string) => void;
  onMarkUnread: (id: string) => void;
  onArchive: (id: string) => void;
  onRestore: (id: string) => void;
  onDelete: (id: string) => void;
}

export default function NotificationRow({
  item,
  isArchivedView,
  onMarkRead,
  onMarkUnread,
  onArchive,
  onRestore,
  onDelete,
}: NotificationRowProps) {
  const router = useRouter();
  const unread = !item.read_at;

  const handleOpen = () => {
    if (unread) onMarkRead(item.id);
    if (item.link) router.push(item.link);
  };

  return (
    <div
      className={`group relative flex items-start gap-3 rounded-xl px-3 py-3 transition-colors ${
        unread ? 'bg-white/[0.04]' : ''
      } hover:bg-white/[0.06]`}
    >
      {/* Unread dot rail */}
      <span className={`mt-4 h-2 w-2 shrink-0 rounded-full ${unread ? 'bg-vc-500' : 'bg-transparent'}`} />

      <NotificationIcon type={item.type} />

      <button type="button" onClick={handleOpen} className="min-w-0 flex-1 text-left">
        <div className="flex items-baseline justify-between gap-2">
          <p className={`truncate text-[14px] ${unread ? 'font-semibold text-white' : 'font-medium text-slate-300'}`}>
            {item.title}
          </p>
          <span className="shrink-0 text-[11px] text-slate-500">{formatNotificationTime(item.created_at)}</span>
        </div>
        {item.body && <p className="mt-0.5 line-clamp-2 text-[12.5px] text-slate-500">{item.body}</p>}
      </button>

      {/* Actions */}
      <div className="flex shrink-0 items-center gap-0.5 opacity-0 transition-opacity focus-within:opacity-100 group-hover:opacity-100 md:opacity-0">
        {!isArchivedView &&
          (unread ? (
            <IconButton label="Mark read" onClick={() => onMarkRead(item.id)}><Check className="h-4 w-4" /></IconButton>
          ) : (
            <IconButton label="Mark unread" onClick={() => onMarkUnread(item.id)}><RotateCcw className="h-3.5 w-3.5" /></IconButton>
          ))}
        {isArchivedView ? (
          <IconButton label="Restore" onClick={() => onRestore(item.id)}><ArchiveRestore className="h-4 w-4" /></IconButton>
        ) : (
          <IconButton label="Archive" onClick={() => onArchive(item.id)}><Archive className="h-4 w-4" /></IconButton>
        )}
        <IconButton label="Delete" onClick={() => onDelete(item.id)} danger><Trash2 className="h-4 w-4" /></IconButton>
      </div>
    </div>
  );
}

function IconButton({
  children,
  label,
  onClick,
  danger,
}: {
  children: React.ReactNode;
  label: string;
  onClick: () => void;
  danger?: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={label}
      title={label}
      className={`grid h-8 w-8 place-items-center rounded-lg text-slate-400 transition-colors hover:bg-white/10 ${
        danger ? 'hover:text-red-400' : 'hover:text-white'
      }`}
    >
      {children}
    </button>
  );
}
