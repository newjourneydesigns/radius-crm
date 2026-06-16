/**
 * Lightweight server-side timing for the Circle Leader Toolkit SSR path.
 *
 * Diagnostic only — no behavior or data changes. Each timer emits ONE compact,
 * greppable line to the function logs (`[circle-toolkit-timing]`) so we can see,
 * per initial load, exactly where the time goes: the session lookup, the
 * Supabase shared-cache read, and whether the request was served from warm
 * cache or fell through to a live CCB call. The CCB client already records
 * per-call `durationMs`; this fills the gap of a per-page rollup.
 *
 * Set `CIRCLE_TOOLKIT_TIMING=0` to silence it without a code change.
 */

const TIMING_ENABLED = process.env.CIRCLE_TOOLKIT_TIMING !== '0';

export type Timer = {
  /** Record the elapsed time (ms) of the step since the previous mark/start. */
  mark: (name: string) => void;
  /** Emit the rollup line with all marks plus any extra context fields. */
  end: (extra?: Record<string, unknown>) => number;
};

export function createTimer(label: string): Timer {
  const start = Date.now();
  let last = start;
  const marks: Record<string, number> = {};

  return {
    mark(name: string) {
      const now = Date.now();
      marks[`${name}Ms`] = now - last;
      last = now;
    },
    end(extra?: Record<string, unknown>) {
      const totalMs = Date.now() - start;
      if (TIMING_ENABLED) {
        console.log(
          `[circle-toolkit-timing] ${label} ${JSON.stringify({ totalMs, ...marks, ...extra })}`
        );
      }
      return totalMs;
    },
  };
}
