"use client";

export function initials(name: string): string {
  const parts = name.trim().split(/\s+/);
  return ((parts[0]?.[0] ?? "") + (parts[1]?.[0] ?? "")).toUpperCase();
}

const SIZES = {
  sm: "h-7 w-7 text-[10px]",
  md: "h-10 w-10 text-xs",
  lg: "h-14 w-14 text-base",
  xl: "h-24 w-24 text-2xl",
};

export default function Avatar({
  name,
  photo,
  size = "md",
  className = "",
}: {
  name: string;
  photo?: string;
  size?: keyof typeof SIZES;
  className?: string;
}) {
  if (photo) {
    return (
      // eslint-disable-next-line @next/next/no-img-element -- local data URL
      <img
        src={photo}
        alt={name}
        className={`${SIZES[size]} shrink-0 rounded-full object-cover ring-2 ring-gold/50 ${className}`}
      />
    );
  }
  return (
    <span
      aria-hidden
      className={`${SIZES[size]} flex shrink-0 items-center justify-center rounded-full bg-felt-3 font-display font-bold text-gold ring-2 ring-gold/30 ${className}`}
    >
      {initials(name)}
    </span>
  );
}
