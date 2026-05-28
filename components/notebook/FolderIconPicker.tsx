'use client';

import {
  BookOpen,
  Bookmark,
  Brain,
  Briefcase,
  ChartNoAxesColumn,
  ClipboardList,
  Files,
  Folder,
  FolderOpen,
  Gem,
  GraduationCap,
  HandHeart,
  Handshake,
  Heart,
  House,
  KeyRound,
  Lightbulb,
  MapPin,
  MessageCircle,
  NotebookPen,
  Pencil,
  Pin,
  Sparkles,
  Sprout,
  Star,
  Target,
  TrendingUp,
  Trophy,
  Users,
  Zap,
} from 'lucide-react';
import type { LucideIcon as FolderIconComponent } from 'lucide-react';

type FolderIconOption = {
  name: string;
  label: string;
  Icon: FolderIconComponent;
};

const ICON_GROUPS: { category: string; icons: FolderIconOption[] }[] = [
  {
    category: 'Folders',
    icons: [
      { name: 'Folder', label: 'Folder', Icon: Folder },
      { name: 'FolderOpen', label: 'Open folder', Icon: FolderOpen },
      { name: 'Files', label: 'Files', Icon: Files },
      { name: 'ClipboardList', label: 'Checklist', Icon: ClipboardList },
      { name: 'Pin', label: 'Pinned', Icon: Pin },
      { name: 'MapPin', label: 'Location', Icon: MapPin },
    ],
  },
  {
    category: 'Work',
    icons: [
      { name: 'Briefcase', label: 'Work', Icon: Briefcase },
      { name: 'ChartNoAxesColumn', label: 'Chart', Icon: ChartNoAxesColumn },
      { name: 'TrendingUp', label: 'Growth', Icon: TrendingUp },
      { name: 'Target', label: 'Goal', Icon: Target },
      { name: 'Trophy', label: 'Win', Icon: Trophy },
      { name: 'Zap', label: 'Energy', Icon: Zap },
    ],
  },
  {
    category: 'People',
    icons: [
      { name: 'Users', label: 'People', Icon: Users },
      { name: 'Handshake', label: 'Handshake', Icon: Handshake },
      { name: 'MessageCircle', label: 'Conversation', Icon: MessageCircle },
      { name: 'Heart', label: 'Heart', Icon: Heart },
      { name: 'HandHeart', label: 'Care', Icon: HandHeart },
      { name: 'Star', label: 'Star', Icon: Star },
    ],
  },
  {
    category: 'Content',
    icons: [
      { name: 'Pencil', label: 'Pencil', Icon: Pencil },
      { name: 'NotebookPen', label: 'Notebook', Icon: NotebookPen },
      { name: 'BookOpen', label: 'Book', Icon: BookOpen },
      { name: 'Bookmark', label: 'Bookmark', Icon: Bookmark },
      { name: 'Lightbulb', label: 'Idea', Icon: Lightbulb },
      { name: 'Brain', label: 'Brainstorm', Icon: Brain },
    ],
  },
  {
    category: 'Misc',
    icons: [
      { name: 'KeyRound', label: 'Key', Icon: KeyRound },
      { name: 'Sprout', label: 'Sprout', Icon: Sprout },
      { name: 'Sparkles', label: 'Sparkles', Icon: Sparkles },
      { name: 'GraduationCap', label: 'Training', Icon: GraduationCap },
      { name: 'House', label: 'Home', Icon: House },
      { name: 'Gem', label: 'Gem', Icon: Gem },
    ],
  },
];

const LEGACY_EMOJI_ICONS: Record<string, string> = {
  '📁': 'Folder',
  '📂': 'FolderOpen',
  '🗂️': 'Files',
  '📋': 'ClipboardList',
  '📌': 'Pin',
  '📍': 'MapPin',
  '📥': 'Folder',
  '💼': 'Briefcase',
  '📊': 'ChartNoAxesColumn',
  '📈': 'TrendingUp',
  '🎯': 'Target',
  '🏆': 'Trophy',
  '⚡': 'Zap',
  '👥': 'Users',
  '🤝': 'Handshake',
  '💬': 'MessageCircle',
  '❤️': 'Heart',
  '🙏': 'HandHeart',
  '⭐': 'Star',
  '✏️': 'Pencil',
  '📝': 'NotebookPen',
  '📖': 'BookOpen',
  '🔖': 'Bookmark',
  '💡': 'Lightbulb',
  '🧠': 'Brain',
  '🔑': 'KeyRound',
  '🌱': 'Sprout',
  '🌟': 'Sparkles',
  '🎓': 'GraduationCap',
  '🏠': 'House',
  '🔮': 'Gem',
};

const ICONS_BY_NAME = ICON_GROUPS.flatMap(group => group.icons).reduce<Record<string, FolderIconOption>>(
  (icons, icon) => {
    icons[icon.name] = icon;
    return icons;
  },
  {},
);

interface FolderIconPickerProps {
  value: string;
  onChange: (icon: string) => void;
}

export function getFolderIconName(value?: string | null) {
  if (!value) return 'Folder';
  return ICONS_BY_NAME[value] ? value : LEGACY_EMOJI_ICONS[value] || 'Folder';
}

export function FolderIcon({
  name,
  className,
  size = 14,
  strokeWidth = 2,
}: {
  name?: string | null;
  className?: string;
  size?: number;
  strokeWidth?: number;
}) {
  const option = ICONS_BY_NAME[getFolderIconName(name)] || ICONS_BY_NAME.Folder;
  const Icon = option.Icon;
  return <Icon size={size} strokeWidth={strokeWidth} className={className} />;
}

export default function FolderIconPicker({ value, onChange }: FolderIconPickerProps) {
  const selectedIconName = getFolderIconName(value);

  return (
    <div className="p-3 w-56">
      <p className="text-xs text-gray-400 mb-2">Folder icon</p>
      {ICON_GROUPS.map(group => (
        <div key={group.category} className="mb-2">
          <p className="text-[10px] text-gray-500 uppercase tracking-wide mb-1">{group.category}</p>
          <div className="flex flex-wrap gap-1">
            {group.icons.map(({ name, label, Icon }) => (
              <button
                key={name}
                type="button"
                onClick={() => onChange(name)}
                className={`w-7 h-7 flex items-center justify-center rounded text-gray-300 transition-all hover:bg-white/[0.1] hover:text-white ${
                  selectedIconName === name ? 'bg-vc-500/30 text-white ring-1 ring-vc-400' : ''
                }`}
                aria-label={label}
                title={label}
              >
                <Icon size={15} strokeWidth={2} />
              </button>
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}
