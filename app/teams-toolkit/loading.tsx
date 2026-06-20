// Full-screen indigo hold shown during route transitions so the toolkit never
// flashes the dark root theme on the way in.
export default function TeamsToolkitLoading() {
  return (
    <div className="ts-splash" role="status" aria-label="Loading Teams Toolkit">
      <span className="ts-splash-title">Teams Toolkit</span>
    </div>
  );
}
