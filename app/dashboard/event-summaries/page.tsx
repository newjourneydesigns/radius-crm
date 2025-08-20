'use client';

import { useSearchParams } from 'next/navigation';
import EventSummariesPanel from "./EventSummariesPanel";

export default function EventSummariesPage() {
  const searchParams = useSearchParams();
  
  return <EventSummariesPanel searchParams={searchParams} />;
}
