'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useAuth } from '../../../contexts/AuthContext';
import { supabase } from '../../../lib/supabase';

const TABS = [
  { label: 'Profile',   route: (id: string) => `/circle/${id}` },
  { label: 'Notes',     route: (id: string) => `/circle/${id}/notes` },
  { label: 'Scorecard', route: (id: string) => `/circle/${id}/scorecard` },
  { label: 'Care',      route: (id: string) => `/circle/${id}/care`,          adminOnly: true },
  { label: 'Visits',    route: (id: string) => `/circle/${id}/circle-visits`, adminOnly: true },
] as const;

type Tab = (typeof TABS)[number];

interface UpcomingBanner {
  key: string;
  type: 'prayer' | 'encouragement' | 'birthday';
  date: string; // YYYY-MM-DD
  content?: string;
  method?: string;
  personName?: string;
}

function parseBirthday(raw: string | undefined | null): { month: number; day: number } | null {
  if (!raw) return null;
  const trimmed = raw.trim();
  if (!trimmed) return null;
  let m: number, d: number;
  if (trimmed.includes('/')) {
    const parts = trimmed.split('/');
    m = parseInt(parts[0], 10);
    d = parseInt(parts[1], 10);
  } else if (trimmed.includes('-')) {
    const parts = trimmed.split('-');
    m = parseInt(parts[1], 10);
    d = parseInt(parts[2], 10);
  } else {
    return null;
  }
  if (isNaN(m) || isNaN(d) || m < 1 || m > 12 || d < 1 || d > 31) return null;
  return { month: m, day: d };
}

function daysUntilBirthday(raw: string | undefined | null): number {
  const parsed = parseBirthday(raw);
  if (!parsed) return 9999;
  const now = new Date();
  const thisYear = now.getFullYear();
  const today = new Date(thisYear, now.getMonth(), now.getDate());
  let bday = new Date(thisYear, parsed.month - 1, parsed.day);
  if (bday < today) bday = new Date(thisYear + 1, parsed.month - 1, parsed.day);
  return Math.round((bday.getTime() - today.getTime()) / (1000 * 60 * 60 * 24));
}

function birthdayDateStr(raw: string): string {
  const parsed = parseBirthday(raw);
  if (!parsed) return '';
  const d = new Date(2000, parsed.month - 1, parsed.day);
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}

function formatBannerDate(dateStr: string): string {
  const [y, m, d] = dateStr.split('-');
  return `${m}-${d}-${y}`;
}

function methodLabel(method: string | undefined): string {
  const map: Record<string, string> = { text: 'Text', email: 'Email', call: 'Phone Call', letter: 'Letter', 'in-person': 'In Person' };
  return method ? (map[method] || method) : '';
}

export default function CircleLeaderLayout({
  children,
  params,
}: {
  children: React.ReactNode;
  params: { id: string };
}) {
  const { isAdmin } = useAuth();
  const pathname = usePathname().replace(/\/$/, '');
  const id = params.id;

  const [banners, setBanners] = useState<UpcomingBanner[]>([]);
  const [dismissed, setDismissed] = useState<Set<string>>(new Set());

  useEffect(() => {
    if (!id) return;
    const today = new Date();
    const todayStr = today.toISOString().split('T')[0];
    const weekOut = new Date(today);
    weekOut.setDate(today.getDate() + 7);
    const weekOutStr = weekOut.toISOString().split('T')[0];

    (async () => {
      const [{ data: prayers }, { data: encs }, { data: leaderRow }] = await Promise.all([
        supabase
          .from('acpd_prayer_points')
          .select('id, pray_date, content')
          .eq('circle_leader_id', parseInt(id))
          .eq('is_answered', false)
          .not('pray_date', 'is', null)
          .gte('pray_date', todayStr)
          .lte('pray_date', weekOutStr)
          .order('pray_date', { ascending: true }),

        supabase
          .from('acpd_encouragements')
          .select('id, message_date, encourage_method')
          .eq('circle_leader_id', parseInt(id))
          .eq('message_type', 'planned')
          .gte('message_date', todayStr)
          .lte('message_date', weekOutStr)
          .order('message_date', { ascending: true }),

        supabase
          .from('circle_leaders')
          .select('name, birthday, additional_leader_name, additional_leader_birthday')
          .eq('id', parseInt(id))
          .single(),
      ]);

      const birthdayBanners: UpcomingBanner[] = [];
      const checkBirthday = (raw: string | undefined | null, name: string, key: string) => {
        if (!raw) return;
        const days = daysUntilBirthday(raw);
        if (days > 7) return;
        const parsed = parseBirthday(raw);
        if (!parsed) return;
        const now = new Date();
        const year = days === 0 ? now.getFullYear() : (parsed.month < now.getMonth() + 1 || (parsed.month === now.getMonth() + 1 && parsed.day < now.getDate()) ? now.getFullYear() + 1 : now.getFullYear());
        const dateStr = `${year}-${String(parsed.month).padStart(2, '0')}-${String(parsed.day).padStart(2, '0')}`;
        birthdayBanners.push({ key, type: 'birthday', date: dateStr, personName: name });
      };
      if (leaderRow) {
        checkBirthday(leaderRow.birthday, leaderRow.name, `bday-primary-${id}`);
        if (leaderRow.additional_leader_name && leaderRow.additional_leader_birthday) {
          checkBirthday(leaderRow.additional_leader_birthday, leaderRow.additional_leader_name, `bday-additional-${id}`);
        }
      }

      const items: UpcomingBanner[] = [
        ...(prayers || []).map((p: any) => ({ key: `prayer-${p.id}`, type: 'prayer' as const, date: p.pray_date, content: p.content })),
        ...(encs || []).map((e: any) => ({ key: `enc-${e.id}`, type: 'encouragement' as const, date: e.message_date, method: e.encourage_method })),
        ...birthdayBanners,
      ].sort((a, b) => a.date.localeCompare(b.date));

      setBanners(items);
    })();

    // Realtime: auto-dismiss banner when a prayer is deleted or marked answered
    const channel = supabase
      .channel(`banner-prayers-${id}`)
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'acpd_prayer_points', filter: `circle_leader_id=eq.${id}` },
        (payload: any) => {
          const old = payload.old as { id?: number } | undefined;
          const updated = payload.new as { id?: number; is_answered?: boolean } | undefined;
          const removedId = old?.id ?? updated?.id;
          if (!removedId) return;
          const shouldRemove =
            payload.eventType === 'DELETE' ||
            (payload.eventType === 'UPDATE' && updated?.is_answered === true);
          if (shouldRemove) {
            setBanners(prev => prev.filter(b => b.key !== `prayer-${removedId}`));
          }
        }
      )
      .subscribe();

    return () => { supabase.removeChannel(channel); };
  }, [id]);

  useEffect(() => {
    window.scrollTo(0, 0);
  }, [pathname]);

  const filteredTabs = TABS.filter(t => !('adminOnly' in t) || isAdmin());

  const profileHref = `/circle/${id}`;

  const isActive = (tab: Tab) => {
    const href = tab.route(id);
    // Profile route is a prefix of all sub-routes, so require exact match
    if (href === profileHref) return pathname === profileHref;
    return pathname.startsWith(href);
  };

  const tabClass = (active: boolean) =>
    `flex-1 text-center whitespace-nowrap py-3 text-sm font-medium transition-colors border-b-2 ${
      active
        ? 'border-blue-500 text-white'
        : 'border-transparent text-gray-400 hover:text-white hover:border-gray-600'
    }`;

  return (
    <>
      <div className="sticky top-0 z-40 bg-gray-900/95 backdrop-blur-sm border-b border-gray-700/60">
        <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8">
          <nav className="flex" aria-label="Section navigation">
            {filteredTabs.map(tab => {
              const href = tab.route(id);
              return (
                <Link key={href} href={href} className={tabClass(isActive(tab))}>
                  {tab.label}
                </Link>
              );
            })}
          </nav>
        </div>
      </div>

      {/* Upcoming scheduled prayer / encouragement banners */}
      {banners.filter(b => !dismissed.has(b.key)).map(banner => (
        <div
          key={banner.key}
          className={`border-l-4 px-4 py-2.5 flex items-center justify-between gap-3 text-sm ${
            banner.type === 'prayer'
              ? 'bg-amber-950/40 border-amber-500/70 text-amber-200'
              : banner.type === 'encouragement'
              ? 'bg-teal-950/40 border-teal-500/70 text-teal-200'
              : 'bg-violet-950/40 border-violet-500/70 text-violet-200'
          }`}
        >
          <Link
            href={banner.type === 'birthday' ? `/circle/${id}` : `/circle/${id}/care`}
            className="flex-1 flex justify-center text-center hover:opacity-90 transition-opacity"
          >
            {banner.type === 'prayer'
              ? <>
                  Pray on <strong className="mx-1">{formatBannerDate(banner.date)}</strong>
                  {banner.content && <> — <span className="opacity-80">{banner.content}</span></>}
                </>
              : banner.type === 'encouragement'
              ? <>Planned encouragement on <strong className="mx-1">{formatBannerDate(banner.date)}</strong>{banner.method ? <> via <strong>{methodLabel(banner.method)}</strong></> : null}</>
              : <>🎂 <strong className="mx-1">{banner.personName}&apos;s</strong> birthday is <strong className="mx-1">{daysUntilBirthday(banner.date) === 0 ? 'today!' : birthdayDateStr(banner.date)}</strong></>
            }
          </Link>
          <button
            onClick={() => setDismissed(prev => new Set([...prev, banner.key]))}
            className="shrink-0 opacity-60 hover:opacity-100 transition-opacity text-xs px-2 py-0.5 rounded bg-white/10 hover:bg-white/20"
            aria-label="Dismiss"
          >
            Dismiss
          </button>
        </div>
      ))}

      {children}
    </>
  );
}
