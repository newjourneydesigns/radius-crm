import CircleSplash from '../../components/circle-leader-toolkit/CircleSplash';

/**
 * Full-page green splash shown while the /circle-leader-toolkit segment resolves —
 * covers both the initial sign-in route's server redirect and any nested
 * route transitions inside the segment. Shares one splash component with the
 * group-level loader so the screen holds solid through the whole entry.
 */
export default function CircleSummaryLoading() {
  return <CircleSplash />;
}
