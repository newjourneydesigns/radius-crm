'use client';

import { useSearchParams } from 'next/navigation';
import { Suspense } from 'react';
import EventSummariesPanel from "./EventSummariesPanel";

function EventSummariesContent() {
  const searchParams = useSearchParams();
  return <EventSummariesPanel searchParams={searchParams} />;
}

export default function EventSummariesPage() {
  return (
    <Suspense fallback={<div>Loading...</div>}>
      <EventSummariesContent />
    </Suspense>
  );
}
