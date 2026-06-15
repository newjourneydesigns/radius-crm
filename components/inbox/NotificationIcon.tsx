'use client';

import { MessageSquare, ClipboardList, MessageCircle, LayoutGrid, NotebookPen, Cake, BellRing } from 'lucide-react';
import { NOTIFICATION_TYPE_META, type NotificationType } from '../../lib/notificationsClient';

const ICONS: Record<NotificationType, typeof MessageSquare> = {
  message: MessageSquare,
  card_assignment: ClipboardList,
  card_comment: MessageCircle,
  board_share: LayoutGrid,
  notebook_share: NotebookPen,
  birthday: Cake,
  follow_up: BellRing,
};

export default function NotificationIcon({ type }: { type: NotificationType }) {
  const Icon = ICONS[type] || MessageSquare;
  const meta = NOTIFICATION_TYPE_META[type];
  return (
    <div className={`grid h-9 w-9 shrink-0 place-items-center rounded-xl ${meta.accent}`}>
      <Icon className="h-[18px] w-[18px]" strokeWidth={1.9} />
    </div>
  );
}
