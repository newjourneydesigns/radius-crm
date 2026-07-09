/**
 * Feature flag for campaign event-attendance tracking (CCB event check-ins).
 *
 * Off by default: the Check Attendance button, the Checked In / Attendance %
 * stat cards, the Checked In filter and columns, the By Campus attendance
 * columns on the Summary, and the CCB Event IDs input on the create/edit
 * campaign forms all stay hidden until NEXT_PUBLIC_EVENT_ATTENDANCE_ENABLED is
 * explicitly set to "true". One env var flips the whole feature on; no code
 * change needed.
 *
 * NEXT_PUBLIC_ so the same flag is readable on both the server and the client.
 */
export function isEventAttendanceEnabled(): boolean {
  return process.env.NEXT_PUBLIC_EVENT_ATTENDANCE_ENABLED === 'true';
}
