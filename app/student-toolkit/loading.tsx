// Full-screen green hold shown during route transitions so the toolkit never
// flashes the dark root theme on the way in.
export default function StudentToolkitLoading() {
  return (
    <div className="st-splash" role="status" aria-label="Loading Student Toolkit">
      <span className="st-splash-title">Student Toolkit</span>
    </div>
  );
}
