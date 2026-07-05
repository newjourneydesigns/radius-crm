import ResourcesClient from '../ResourcesClient';

export default function CircleSummaryResourcePage({
  params,
}: {
  params: { ccbGroupId: string; slug: string };
}) {
  return <ResourcesClient slug={decodeURIComponent(params.slug ?? '')} />;
}
