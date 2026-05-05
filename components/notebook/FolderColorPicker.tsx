'use client';

const PRESET_COLORS = [
  '#6366f1', '#8b5cf6', '#ec4899', '#ef4444',
  '#f97316', '#f59e0b', '#22c55e', '#10b981',
  '#06b6d4', '#3b82f6', '#6b7280', '#a78bfa',
];

interface FolderColorPickerProps {
  value: string;
  onChange: (color: string) => void;
}

export default function FolderColorPicker({ value, onChange }: FolderColorPickerProps) {
  return (
    <div className="p-3 w-44">
      <p className="text-xs text-gray-400 mb-2">Folder color</p>
      <div className="grid grid-cols-6 gap-1.5 mb-2">
        {PRESET_COLORS.map(color => (
          <button
            key={color}
            type="button"
            onClick={() => onChange(color)}
            className={`w-6 h-6 rounded-full border-2 transition-transform hover:scale-110 ${
              value === color ? 'border-white' : 'border-transparent'
            }`}
            style={{ backgroundColor: color }}
            title={color}
          />
        ))}
      </div>
      <div className="flex items-center gap-2">
        <input
          type="color"
          value={value}
          onChange={e => onChange(e.target.value)}
          className="w-6 h-6 rounded cursor-pointer border-0 bg-transparent"
        />
        <input
          type="text"
          value={value}
          onChange={e => onChange(e.target.value)}
          className="flex-1 text-xs bg-white/[0.06] border border-white/[0.1] rounded px-2 py-1 text-gray-300 focus:outline-none focus:border-indigo-400"
          placeholder="#6366f1"
          maxLength={7}
        />
      </div>
    </div>
  );
}
