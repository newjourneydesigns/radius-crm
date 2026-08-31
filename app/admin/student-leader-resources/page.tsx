'use client';

import LeaderResourcesAdmin from '../../../components/admin/LeaderResourcesAdmin';

export default function StudentLeaderResourcesAdminPage() {
  return (
    <LeaderResourcesAdmin
      audience="student"
      title="Student Leader Resources"
      audienceLabel="all Student Leaders"
    />
  );
}
