'use client';

import LeaderResourcesAdmin from '../../../components/admin/LeaderResourcesAdmin';

export default function TeamLeaderResourcesAdminPage() {
  return (
    <LeaderResourcesAdmin
      audience="host_team"
      title="Host Team Resources"
      audienceLabel="all Host Team Leaders"
    />
  );
}
