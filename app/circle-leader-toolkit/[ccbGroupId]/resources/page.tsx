import ResourcesClient from './ResourcesClient';

// Bare /resources shows the first page in nav order; deep links to a specific
// page live at /resources/[slug].
export default function CircleSummaryResourcesPage() {
  return <ResourcesClient />;
}
