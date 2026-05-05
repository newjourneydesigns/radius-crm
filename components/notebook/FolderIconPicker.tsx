'use client';

const ICONS: { category: string; emojis: string[] }[] = [
  { category: 'Folders', emojis: ['📁', '📂', '🗂️', '📋', '📌', '📍'] },
  { category: 'Work', emojis: ['💼', '📊', '📈', '🎯', '🏆', '⚡'] },
  { category: 'People', emojis: ['👥', '🤝', '💬', '❤️', '🙏', '⭐'] },
  { category: 'Content', emojis: ['✏️', '📝', '📖', '🔖', '💡', '🧠'] },
  { category: 'Misc', emojis: ['🔑', '🌱', '🌟', '🎓', '🏠', '🔮'] },
];

interface FolderIconPickerProps {
  value: string;
  onChange: (icon: string) => void;
}

export default function FolderIconPicker({ value, onChange }: FolderIconPickerProps) {
  return (
    <div className="p-3 w-52">
      <p className="text-xs text-gray-400 mb-2">Folder icon</p>
      {ICONS.map(group => (
        <div key={group.category} className="mb-2">
          <p className="text-[10px] text-gray-500 uppercase tracking-wide mb-1">{group.category}</p>
          <div className="flex flex-wrap gap-1">
            {group.emojis.map(emoji => (
              <button
                key={emoji}
                type="button"
                onClick={() => onChange(emoji)}
                className={`w-7 h-7 flex items-center justify-center rounded text-base transition-all hover:bg-white/[0.1] ${
                  value === emoji ? 'bg-indigo-500/30 ring-1 ring-indigo-400' : ''
                }`}
              >
                {emoji}
              </button>
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}
