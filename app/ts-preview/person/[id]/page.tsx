// DEV-ONLY local preview of a Teams Toolkit person profile. Not committed.
// Mirrors the real page's markup with mock data, keyed by id so the roster
// search/list can click through.
import { Open_Sans } from 'next/font/google';
import '../../../circle-leader-toolkit/circle-leader-toolkit.css';
import '../../../teams-toolkit/teams-toolkit.css';

const openSans = Open_Sans({
  subsets: ['latin'],
  weight: ['300', '400', '500', '600', '700', '800'],
  style: ['normal', 'italic'],
  variable: '--font-cs-body',
  display: 'swap',
});

function initials(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return '?';
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}

const STATUS = {
  accepted: { label: 'Accepted', cls: 'ts-status-accepted' },
  declined: { label: 'Declined', cls: 'ts-status-declined' },
  pending: { label: 'Pending', cls: 'ts-status-pending' },
} as const;

type Status = keyof typeof STATUS;

const PEOPLE: Record<string, {
  name: string; mobile: string; email: string;
  memberships: { position: string; team: string }[];
  history: { id: string; date: string; position: string; status: Status; reason: string }[];
}> = {
  '1': {
    name: 'Hannah Brooks', mobile: '(972) 555-0148', email: 'hannah.brooks@example.com',
    memberships: [
      { position: 'Welcome Team', team: 'Host Teams' },
      { position: 'Ops Team', team: 'Host Teams' },
    ],
    history: [
      { id: 'h1', date: 'Sunday, Jun 15', position: 'Welcome Team', status: 'accepted', reason: '' },
      { id: 'h2', date: 'Sunday, Jun 8', position: 'Ops Team', status: 'accepted', reason: '' },
      { id: 'h3', date: 'Sunday, Jun 1', position: 'Welcome Team', status: 'declined', reason: 'Out of town' },
    ],
  },
  '2': {
    name: 'Marcus Lee', mobile: '(972) 555-0172', email: 'marcus.lee@example.com',
    memberships: [{ position: 'Welcome Team', team: 'Host Teams' }],
    history: [
      { id: 'h1', date: 'Sunday, Jun 15', position: 'Welcome Team', status: 'accepted', reason: '' },
      { id: 'h2', date: 'Sunday, Jun 8', position: 'Welcome Team', status: 'pending', reason: '' },
    ],
  },
  '3': {
    name: 'Priya Nair', mobile: '(972) 555-0193', email: 'priya.nair@example.com',
    memberships: [{ position: 'Welcome Team', team: 'Host Teams' }],
    history: [],
  },
  '4': {
    name: 'David Okafor', mobile: '(972) 555-0110', email: 'david.okafor@example.com',
    memberships: [{ position: 'Ops Team', team: 'Host Teams' }],
    history: [
      { id: 'h1', date: 'Sunday, Jun 15', position: 'Ops Team', status: 'accepted', reason: '' },
    ],
  },
};

export default function PersonPreview({ params }: { params: { id: string } }) {
  const person = PEOPLE[params.id];
  const tel = person ? person.mobile.replace(/[^\d+]/g, '') : '';

  return (
    <div className={`${openSans.variable} cs-root ts-root min-h-screen bg-white`}>
      <main className="max-w-2xl mx-auto px-4 py-6 space-y-5">
        <a href="/ts-preview" className="ts-back-link">‹ Back to roster</a>

        {!person ? (
          <div className="text-center py-12 border border-dashed border-neutral-200 rounded-xl bg-neutral-50">
            <p className="text-neutral-500 text-sm font-medium">Not on your roster</p>
          </div>
        ) : (
          <>
            <section className="cs-card">
              <div className="flex items-center gap-3.5">
                <span className="ts-person-avatar" aria-hidden="true">{initials(person.name)}</span>
                <div className="min-w-0 flex-1">
                  <h2 className="text-lg font-bold text-neutral-900 tracking-tight truncate">{person.name}</h2>
                  <p className="text-xs text-neutral-500 truncate">{person.mobile}</p>
                </div>
              </div>
              <div className="mt-4 grid grid-cols-2 gap-2">
                <a className="ts-action-btn ts-action-btn-primary" href={`tel:${tel}`}>Call</a>
                <a className="ts-action-btn" href={`sms:${tel}`}>Text</a>
              </div>
            </section>

            <section className="ts-position-card">
              <div className="ts-position-head">
                <span className="ts-position-name">On your teams</span>
              </div>
              {person.memberships.map((m) => (
                <div key={m.position} className="ts-roster-row">
                  <div className="min-w-0 flex-1">
                    <div className="ts-roster-name truncate">{m.position}</div>
                    <div className="ts-roster-contact truncate">{m.team}</div>
                  </div>
                </div>
              ))}
            </section>

            <section className="ts-position-card">
              <div className="ts-position-head">
                <span className="ts-position-name">Recent serving</span>
                <span className="ts-position-count">Last 4 weeks</span>
              </div>
              {person.history.length === 0 ? (
                <div className="px-4 py-6 text-center">
                  <p className="text-neutral-400 text-xs">No scheduled serving in the last 4 weeks.</p>
                </div>
              ) : (
                person.history.map((h) => {
                  const meta = STATUS[h.status];
                  return (
                    <div key={h.id} className="ts-roster-row">
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-2">
                          <span className="ts-roster-name truncate">{h.date}</span>
                          <span className={`ts-status ${meta.cls}`}>{meta.label}</span>
                        </div>
                        <div className="ts-roster-contact truncate">{h.position}</div>
                        {h.status === 'declined' && h.reason && (
                          <div className="ts-roster-contact">Reason: {h.reason}</div>
                        )}
                      </div>
                    </div>
                  );
                })
              )}
            </section>
          </>
        )}
      </main>
    </div>
  );
}
