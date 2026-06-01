export async function setCircleSummaryAppBadge(totalAlertCount: number, enabled = true) {
  if (typeof navigator === 'undefined') return;
  try {
    const nav = navigator as Navigator & {
      setAppBadge?: (contents?: number) => Promise<void>;
      clearAppBadge?: () => Promise<void>;
    };
    if (!enabled || totalAlertCount <= 0) {
      if (nav.clearAppBadge) await nav.clearAppBadge();
      return;
    }
    if (nav.setAppBadge) await nav.setAppBadge(totalAlertCount);
  } catch {
    // Badging is a progressive enhancement; unsupported platforms fail silently.
  }
}
