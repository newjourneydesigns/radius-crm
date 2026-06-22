// DEV-ONLY local preview of the Teams Toolkit Roster (search + profiles).
// Not committed — exists only so the feature can be clicked through on
// localhost without a CCB-backed leader session.
'use client';

import { Open_Sans } from 'next/font/google';
import TeamRosterList from '../teams-toolkit/[categoryId]/roster/TeamRosterList';
import '../circle-leader-toolkit/circle-leader-toolkit.css';
import '../teams-toolkit/teams-toolkit.css';

const openSans = Open_Sans({
  subsets: ['latin'],
  weight: ['300', '400', '500', '600', '700', '800'],
  style: ['normal', 'italic'],
  variable: '--font-cs-body',
  display: 'swap',
});

const POSITIONS = [
  {
    positionId: 'p1',
    positionName: 'Welcome Team',
    volunteers: [
      { id: 1, name: 'Hannah Brooks', email: 'hannah.brooks@example.com', mobile: '(972) 555-0148', birthday: '', status: 'ACTIVE' },
      { id: 2, name: 'Marcus Lee', email: 'marcus.lee@example.com', mobile: '(972) 555-0172', birthday: '', status: 'ACTIVE' },
      { id: 3, name: 'Priya Nair', email: 'priya.nair@example.com', mobile: '(972) 555-0193', birthday: '', status: 'ACTIVE' },
    ],
  },
  {
    positionId: 'p2',
    positionName: 'Ops Team',
    volunteers: [
      { id: 4, name: 'David Okafor', email: 'david.okafor@example.com', mobile: '(972) 555-0110', birthday: '', status: 'ACTIVE' },
      { id: 1, name: 'Hannah Brooks', email: 'hannah.brooks@example.com', mobile: '(972) 555-0148', birthday: '', status: 'ACTIVE' },
    ],
  },
];

export default function RosterPreview() {
  return (
    <div className={`${openSans.variable} cs-root ts-root min-h-screen bg-white`}>
      <main className="max-w-2xl mx-auto px-4 py-6 space-y-5">
        <TeamRosterList
          categoryId="238"
          positions={POSITIONS}
          buildPersonHref={(id) => `/ts-preview/person/${id}`}
        />
      </main>
    </div>
  );
}
