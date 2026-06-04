'use client';

import CircleSplash from '../../../components/circle-leader-toolkit/CircleSplash';
import CircleTabSkeleton from '../../../components/circle-leader-toolkit/CircleTabSkeleton';
import { hasEnteredCircleApp } from '../../../lib/circle-leader-toolkit/appEntered';

/**
 * Loader for the Circle group tabs (events, roster, inbox, resources).
 *
 * First entry into the app (cold load / hard refresh) shows the full green
 * splash — seamless with the parent splash boundary. Once the user has landed
 * on real content, every later tab navigation shows an in-place skeleton that
 * keeps the header + tabs on screen, so moving around the app never re-flashes
 * the splash.
 */
export default function CircleGroupTabLoading() {
  return hasEnteredCircleApp() ? <CircleTabSkeleton /> : <CircleSplash />;
}
