'use client';

export default function NotebookEditorSkeleton() {
  return (
    <div className="flex-1 flex flex-col bg-[#0f1117] overflow-hidden">
      <div className="flex-1 overflow-y-auto">
        <div className="max-w-3xl mx-auto w-full px-6 md:px-10 py-8 md:py-12 space-y-6 animate-pulse">
          {/* Title */}
          <div className="h-9 w-2/3 rounded-md bg-white/[0.06]" />
          {/* Meta row */}
          <div className="flex gap-3">
            <div className="h-4 w-24 rounded bg-white/[0.05]" />
            <div className="h-4 w-16 rounded bg-white/[0.05]" />
          </div>
          {/* Body */}
          <div className="space-y-3 pt-4">
            <div className="h-4 w-full rounded bg-white/[0.05]" />
            <div className="h-4 w-[92%] rounded bg-white/[0.05]" />
            <div className="h-4 w-[85%] rounded bg-white/[0.05]" />
            <div className="h-4 w-[70%] rounded bg-white/[0.05]" />
            <div className="h-4 w-[88%] rounded bg-white/[0.05]" />
            <div className="h-4 w-[60%] rounded bg-white/[0.05]" />
          </div>
        </div>
      </div>
    </div>
  );
}
