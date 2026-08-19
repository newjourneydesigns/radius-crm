'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { supabase } from '../../lib/supabase';
import { formatFrequencyLabel } from '../../lib/frequencyUtils';
import { CIRCLE_LOCATION_OPTIONS } from '../../lib/leaderFieldValues';
import CCBPersonLookup, { type CCBPerson } from '../ui/CCBPersonLookup';

type LeaderType = 'circle' | 'host_team';

/** Mirrors the statuses POST /api/circle-leaders accepts — 'archived' is not one of them. */
const STATUS_OPTIONS = [
  { value: 'invited', label: 'Invited' },
  { value: 'pipeline', label: 'Pipeline' },
  { value: 'on-boarding', label: 'On-Boarding' },
  { value: 'active', label: 'Active' },
  { value: 'paused', label: 'Paused' },
  { value: 'off-boarding', label: 'Off-boarding' },
];

const MEETING_DAYS = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'];

const inputClass =
  'block w-full px-3 py-2 text-sm border border-gray-300 dark:border-gray-600 rounded-md shadow-sm bg-white dark:bg-gray-700 text-gray-900 dark:text-white placeholder-gray-400 focus:outline-none focus:ring-1 focus:ring-vc-500 focus:border-vc-500';

const labelClass = 'block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1';

export interface AddLeaderReferenceData {
  /** ACPDs (acpd_list) — the director of a *circle*. */
  directors: { id: number; name: string }[];
  campuses: { id: number; value: string }[];
  circleTypes: { id: number; value: string }[];
  frequencies: { id: number; value: string }[];
}

interface FormValues {
  name: string;
  email: string;
  phone: string;
  birthday: string;
  campus: string;
  director: string;
  status: string;
  circle_name: string;
  circle_type: string;
  circle_location: string;
  day: string;
  time: string;
  frequency: string;
  meeting_start_date: string;
  team_name: string;
  ccb_group_id: string;
  ccb_category_id: string;
  leader_ccb_profile_link: string;
}

const EMPTY_FORM: FormValues = {
  name: '',
  email: '',
  phone: '',
  birthday: '',
  campus: '',
  director: '',
  status: 'invited',
  circle_name: '',
  circle_type: '',
  circle_location: '',
  day: '',
  time: '',
  frequency: '',
  meeting_start_date: '',
  team_name: '',
  ccb_group_id: '',
  ccb_category_id: '',
  leader_ccb_profile_link: '',
};

function Field({
  label,
  htmlFor,
  hint,
  required,
  children,
}: {
  label: string;
  htmlFor: string;
  hint?: string;
  required?: boolean;
  children: React.ReactNode;
}) {
  return (
    <div>
      <label htmlFor={htmlFor} className={labelClass}>
        {label} {required && <span className="text-red-500">*</span>}
      </label>
      {children}
      {hint && <p className="mt-1 text-xs text-gray-400 dark:text-gray-500">{hint}</p>}
    </div>
  );
}

function SectionHeading({ title, description }: { title: string; description?: string }) {
  return (
    <div className="mb-4">
      <h3 className="text-xs font-semibold uppercase tracking-wider text-gray-400 dark:text-gray-500">{title}</h3>
      {description && <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">{description}</p>}
    </div>
  );
}

/**
 * Creates a Circle Leader or a Host Team Leader by hand, for people who aren't
 * reachable through a CCB import — invited leaders, leaders in the pipeline, a
 * circle with no CCB group, a team with no scheduling category.
 *
 * The two types are genuinely different records: a circle has a circle name,
 * meeting rhythm and an ACPD (acpd_list, stored as `acpd`); a host team has a
 * team name and a director (directors_list, stored as `director`). Only name,
 * contact details, campus and status are shared.
 */
export default function AddLeaderForm({
  accessToken,
  referenceData,
  defaultLeaderType = 'circle',
}: {
  accessToken: string | null;
  referenceData: AddLeaderReferenceData;
  defaultLeaderType?: LeaderType;
}) {
  const [leaderType, setLeaderType] = useState<LeaderType>(defaultLeaderType);
  const [values, setValues] = useState<FormValues>(EMPTY_FORM);
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState('');
  const [created, setCreated] = useState<{ id: number; name: string; leaderType: LeaderType } | null>(null);
  const [existingLeaders, setExistingLeaders] = useState<
    { name: string; circle_name: string | null; team_name: string | null }[]
  >([]);
  // Host team directors live in their own table — they are not the ACPD list.
  const [teamDirectors, setTeamDirectors] = useState<{ id: number; name: string }[]>([]);
  // Set once a CCB person is picked, so the form can say where a value came from.
  const [ccbSourceId, setCcbSourceId] = useState('');
  // CCBPersonLookup holds its own query state; bumping its key clears it.
  const [lookupKey, setLookupKey] = useState(0);

  const isHostTeam = leaderType === 'host_team';

  // Existing names power the duplicate warning below. The CCB imports refuse to
  // bring the same group or category in twice; a manual add has no such guard,
  // so at least say something before a second "Casey Bates" lands in the list.
  useEffect(() => {
    let cancelled = false;
    supabase
      .from('circle_leaders')
      .select('name, circle_name, team_name')
      .then(({ data, error: fetchError }) => {
        if (cancelled) return;
        if (fetchError) {
          console.error('Failed to load existing leader names:', fetchError);
          return;
        }
        setExistingLeaders((data as typeof existingLeaders) || []);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    let cancelled = false;
    supabase
      .from('directors_list')
      .select('id, name')
      .eq('active', true)
      .order('name')
      .then(({ data, error: fetchError }) => {
        if (cancelled) return;
        if (fetchError) {
          console.error('Failed to load host team directors:', fetchError);
          return;
        }
        setTeamDirectors((data as { id: number; name: string }[]) || []);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const setField = useCallback((field: keyof FormValues, value: string) => {
    setValues((prev) => ({ ...prev, [field]: value }));
    setError('');
  }, []);

  const trimmedName = values.name.trim();

  const duplicate = useMemo(() => {
    if (trimmedName.length < 2) return null;
    const needle = trimmedName.toLowerCase();
    const matches = (v: string | null | undefined) => v?.trim().toLowerCase() === needle;
    return (
      existingLeaders.find((l) => matches(l.name) || matches(l.circle_name) || matches(l.team_name)) || null
    );
  }, [trimmedName, existingLeaders]);

  const showStartDate = !isHostTeam && /(bi-?week|every other)/i.test(values.frequency);

  const directorOptions = isHostTeam ? teamDirectors : referenceData.directors;

  /**
   * Fill the leader's details straight from their CCB profile. The lookup fires
   * this twice — once with the search result so the form fills immediately, then
   * again with the full profile once the birthday is in.
   */
  const applyCcbPerson = (person: CCBPerson) => {
    setValues((prev) => ({
      ...prev,
      name: person.fullName || prev.name,
      email: person.email || prev.email,
      phone: person.mobilePhone || person.phone || prev.phone,
      birthday: person.birthday || prev.birthday,
      leader_ccb_profile_link: person.profileLink || prev.leader_ccb_profile_link,
    }));
    setCcbSourceId(person.id);
    setError('');
  };

  const switchLeaderType = (next: LeaderType) => {
    setLeaderType(next);
    // The director lists come from different tables, so a name carried across
    // would point at someone who isn't in the new list.
    setValues((prev) => ({ ...prev, director: '' }));
    setError('');
  };

  const resetForm = () => {
    setValues(EMPTY_FORM);
    setCcbSourceId('');
    setLookupKey((k) => k + 1);
    setError('');
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!trimmedName) {
      setError('Leader name is required.');
      return;
    }

    setIsSaving(true);
    setError('');

    try {
      const headers: Record<string, string> = { 'Content-Type': 'application/json' };
      if (accessToken) headers['Authorization'] = `Bearer ${accessToken}`;

      const shared = {
        leader_type: leaderType,
        name: trimmedName,
        email: values.email,
        phone: values.phone,
        // Passing the birthday we already pulled stops the server making a
        // second CCB call for something the lookup just handed us.
        birthday: values.birthday,
        campus: values.campus,
        status: values.status,
        leader_ccb_profile_link: values.leader_ccb_profile_link,
      };

      const payload = isHostTeam
        ? {
            ...shared,
            team_name: values.team_name,
            director: values.director,
            ccb_category_id: values.ccb_category_id,
          }
        : {
            ...shared,
            // The API falls back to the leader's name when circle_name is blank.
            circle_name: values.circle_name.trim(),
            acpd: values.director,
            circle_type: values.circle_type,
            circle_location: values.circle_location,
            day: values.day,
            time: values.time,
            frequency: values.frequency,
            // Only meaningful for bi-weekly circles; sending a stale date otherwise
            // would shift the parity of a weekly circle for no reason.
            meeting_start_date: showStartDate ? values.meeting_start_date : '',
            ccb_group_id: values.ccb_group_id,
          };

      const res = await fetch('/api/circle-leaders', {
        method: 'POST',
        headers,
        body: JSON.stringify(payload),
      });

      const data = await res.json();
      if (!res.ok) throw new Error(data.error || `Save failed (HTTP ${res.status})`);

      setCreated({ id: data.id, name: data.name, leaderType });
      setValues(EMPTY_FORM);
      setExistingLeaders((prev) => [
        ...prev,
        { name: data.name, circle_name: data.circle_name ?? null, team_name: data.team_name ?? null },
      ]);
    } catch (err: any) {
      setError(err.message || 'Failed to add the leader.');
    } finally {
      setIsSaving(false);
    }
  };

  if (created) {
    return (
      <div className="bg-white dark:bg-gray-800 shadow rounded-lg p-6">
        <div className="rounded-md bg-green-50 dark:bg-green-900/30 p-4">
          <p className="text-sm text-green-700 dark:text-green-400">
            <strong>{created.name}</strong> was added as a new{' '}
            {created.leaderType === 'host_team' ? 'team leader' : 'circle leader'}.
          </p>
        </div>
        {created.leaderType === 'host_team' && (
          <p className="mt-3 text-xs text-gray-500 dark:text-gray-400">
            Managed positions come from a CCB scheduling category, so this leader has none yet. Import them from
            CCB on <Link href="/import-team" className="text-blue-500 hover:underline">Import Host Team</Link> once
            their category exists.
          </p>
        )}
        <div className="mt-4 flex flex-col sm:flex-row gap-3">
          <Link
            href={`/circle/${created.id}`}
            className="btn-primary inline-flex items-center justify-center px-5 py-2 rounded-lg text-sm"
          >
            Open {created.name}&apos;s Profile
          </Link>
          <button
            type="button"
            onClick={() => setCreated(null)}
            className="inline-flex items-center justify-center px-4 py-2 border border-gray-300 dark:border-gray-600 rounded-lg text-sm font-medium text-gray-700 dark:text-gray-300 bg-white dark:bg-gray-700 hover:bg-gray-50 dark:hover:bg-gray-600"
          >
            Add Another Leader
          </button>
        </div>
      </div>
    );
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-6">
      <div className="bg-white dark:bg-gray-800 shadow rounded-lg p-6">
        <h2 className="text-lg font-medium text-gray-900 dark:text-white mb-1">
          Add a {isHostTeam ? 'Team' : 'Circle'} Leader
        </h2>
        <p className="text-sm text-gray-500 dark:text-gray-400 mb-5">
          {isHostTeam ? (
            <>
              For team leaders who aren&apos;t set up in CCB yet. If their scheduling category already exists, use{' '}
              <Link href="/import-team" className="text-blue-500 hover:underline">
                Import Host Team
              </Link>{' '}
              instead so their managed positions come across too.
            </>
          ) : (
            <>
              For leaders whose circle isn&apos;t in CCB yet — invited leaders, leaders in the pipeline, or anything
              the group import can&apos;t reach. If the circle already exists in CCB, use{' '}
              <Link href="/import-circles" className="text-blue-500 hover:underline">
                Import from CCB
              </Link>{' '}
              instead so its details and calendar events come across too.
            </>
          )}
        </p>

        <div className="mb-6">
          <span className={labelClass}>What kind of leader is this?</span>
          <div
            role="radiogroup"
            aria-label="Leader type"
            className="inline-flex rounded-lg bg-gray-200/60 dark:bg-gray-900/60 p-1 gap-1"
          >
            {([
              { id: 'circle' as const, label: 'Circle Leader' },
              { id: 'host_team' as const, label: 'Team Leader' },
            ]).map((option) => (
              <button
                key={option.id}
                type="button"
                role="radio"
                aria-checked={leaderType === option.id}
                onClick={() => switchLeaderType(option.id)}
                className={`px-4 py-2 rounded-md text-sm font-medium transition-all duration-200 ${
                  leaderType === option.id
                    ? 'bg-white dark:bg-blue-600 text-gray-900 dark:text-white shadow-sm'
                    : 'text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-200'
                }`}
              >
                {option.label}
              </button>
            ))}
          </div>
        </div>

        <SectionHeading title="Leader" />

        {/* Look the person up in CCB first — it fills their name, email, phone and
            birthday, and records the profile link, so the rest is just the
            circle/team details. Typing everything by hand still works. */}
        <div className="mb-4 rounded-lg border border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-900/40 p-4">
          <CCBPersonLookup
            key={lookupKey}
            onSelect={applyCcbPerson}
            withFullProfile
            label="Find them in CCB"
            placeholder="Search CCB by name or phone…"
          />
          <p className="mt-2 text-xs text-gray-500 dark:text-gray-400">
            Optional — fills in name, email, phone and birthday from their CCB profile. You can also just type
            everything below.
          </p>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div className="sm:col-span-2">
            <Field label="Leader Name" htmlFor="leader-name" required>
              <input
                id="leader-name"
                type="text"
                value={values.name}
                onChange={(e) => setField('name', e.target.value)}
                placeholder={isHostTeam ? 'e.g. Mike Lake' : 'e.g. Casey and Ashley Bates'}
                className={inputClass}
                autoComplete="off"
                required
              />
            </Field>
            {duplicate && (
              <div className="mt-2 rounded-md bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-900 px-3 py-2">
                <p className="text-xs text-amber-800 dark:text-amber-300">
                  A leader named <strong>{duplicate.name}</strong> is already in RADIUS. You can still add this one,
                  but check you&apos;re not creating a duplicate.
                </p>
              </div>
            )}
          </div>

          <Field label="Email" htmlFor="leader-email">
            <input
              id="leader-email"
              type="email"
              value={values.email}
              onChange={(e) => setField('email', e.target.value)}
              placeholder="leader@example.com"
              className={inputClass}
              autoComplete="off"
            />
          </Field>

          <Field label="Phone" htmlFor="leader-phone">
            <input
              id="leader-phone"
              type="tel"
              value={values.phone}
              onChange={(e) => setField('phone', e.target.value)}
              placeholder="(555) 555-5555"
              className={inputClass}
              autoComplete="off"
            />
          </Field>

          <Field
            label="Birthday"
            htmlFor="leader-birthday"
            hint={ccbSourceId && values.birthday ? 'Pulled from CCB.' : undefined}
          >
            <input
              id="leader-birthday"
              type="date"
              value={values.birthday}
              onChange={(e) => setField('birthday', e.target.value)}
              className={inputClass}
            />
          </Field>

          <Field label="Campus" htmlFor="leader-campus">
            <select
              id="leader-campus"
              value={values.campus}
              onChange={(e) => setField('campus', e.target.value)}
              className={inputClass}
            >
              <option value="">— Select a Campus —</option>
              {referenceData.campuses.map((c) => (
                <option key={c.id} value={c.value}>
                  {c.value}
                </option>
              ))}
            </select>
          </Field>

          <Field
            label={isHostTeam ? 'Director' : 'Director (ACPD)'}
            htmlFor="leader-director"
            hint={
              directorOptions.length === 0
                ? isHostTeam
                  ? 'No active team directors are set up yet.'
                  : 'No active ACPDs are set up yet.'
                : undefined
            }
          >
            <select
              id="leader-director"
              value={values.director}
              onChange={(e) => setField('director', e.target.value)}
              className={inputClass}
            >
              <option value="">— Select a Director —</option>
              {directorOptions.map((d) => (
                <option key={d.id} value={d.name}>
                  {d.name}
                </option>
              ))}
            </select>
          </Field>

          <Field label="Status" htmlFor="leader-status">
            <select
              id="leader-status"
              value={values.status}
              onChange={(e) => setField('status', e.target.value)}
              className={inputClass}
            >
              {STATUS_OPTIONS.map((s) => (
                <option key={s.value} value={s.value}>
                  {s.label}
                </option>
              ))}
            </select>
          </Field>
        </div>
      </div>

      {isHostTeam ? (
        <div className="bg-white dark:bg-gray-800 shadow rounded-lg p-6">
          <SectionHeading
            title="Team"
            description="Everything here can be filled in later from the leader's profile."
          />
          <Field
            label="Team Name"
            htmlFor="team-name"
            hint="Leave blank to use the leader's name."
          >
            <input
              id="team-name"
              type="text"
              value={values.team_name}
              onChange={(e) => setField('team_name', e.target.value)}
              placeholder="e.g. LVT | Safety Team"
              className={inputClass}
              autoComplete="off"
            />
          </Field>
        </div>
      ) : (
        <div className="bg-white dark:bg-gray-800 shadow rounded-lg p-6">
          <SectionHeading
            title="Circle"
            description="Everything here can be filled in later from the leader's profile."
          />
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div className="sm:col-span-2">
              <Field
                label="Circle Name"
                htmlFor="circle-name"
                hint="Leave blank to use the leader's name."
              >
                <input
                  id="circle-name"
                  type="text"
                  value={values.circle_name}
                  onChange={(e) => setField('circle_name', e.target.value)}
                  placeholder="e.g. FMT | S3 | Casey and Ashley Bates"
                  className={inputClass}
                  autoComplete="off"
                />
              </Field>
            </div>

            <Field label="Circle Type" htmlFor="circle-type">
              <select
                id="circle-type"
                value={values.circle_type}
                onChange={(e) => setField('circle_type', e.target.value)}
                className={inputClass}
              >
                <option value="">— Select a Circle Type —</option>
                {referenceData.circleTypes.map((ct) => (
                  <option key={ct.id} value={ct.value}>
                    {ct.value}
                  </option>
                ))}
              </select>
            </Field>

            <Field
              label="Circle Location"
              htmlFor="circle-location"
              hint="Where the circle meets — matches CCB's Circle Location classification."
            >
              <select
                id="circle-location"
                value={values.circle_location}
                onChange={(e) => setField('circle_location', e.target.value)}
                className={inputClass}
              >
                <option value="">— Select a Circle Location —</option>
                {CIRCLE_LOCATION_OPTIONS.map((option) => (
                  <option key={option} value={option}>
                    {option}
                  </option>
                ))}
              </select>
            </Field>

            <Field label="Meeting Day" htmlFor="circle-day">
              <select
                id="circle-day"
                value={values.day}
                onChange={(e) => setField('day', e.target.value)}
                className={inputClass}
              >
                <option value="">— Select a Day —</option>
                {MEETING_DAYS.map((d) => (
                  <option key={d} value={d}>
                    {d}
                  </option>
                ))}
              </select>
            </Field>

            <Field label="Meeting Time" htmlFor="circle-time">
              <input
                id="circle-time"
                type="time"
                value={values.time}
                onChange={(e) => setField('time', e.target.value)}
                className={inputClass}
              />
            </Field>

            <Field label="Frequency" htmlFor="circle-frequency">
              <select
                id="circle-frequency"
                value={values.frequency}
                onChange={(e) => setField('frequency', e.target.value)}
                className={inputClass}
              >
                <option value="">— Select a Frequency —</option>
                {referenceData.frequencies.map((f) => (
                  <option key={f.id} value={f.value}>
                    {formatFrequencyLabel(f.value)}
                  </option>
                ))}
              </select>
            </Field>

            {showStartDate && (
              <Field
                label="Bi-weekly Start Date"
                htmlFor="circle-start-date"
                hint="A date this circle actually meets — it sets which weeks the calendar expects."
              >
                <input
                  id="circle-start-date"
                  type="date"
                  value={values.meeting_start_date}
                  onChange={(e) => setField('meeting_start_date', e.target.value)}
                  className={inputClass}
                />
              </Field>
            )}
          </div>
        </div>
      )}

      <div className="bg-white dark:bg-gray-800 shadow rounded-lg p-6">
        <SectionHeading
          title="CCB (optional)"
          description={
            isHostTeam
              ? 'The profile link fills itself in when you use the lookup above. Managed positions still have to be imported.'
              : 'The profile link fills itself in when you use the lookup above. Importing from CCB is still the way to bring a circle’s details and calendar events across.'
          }
        />
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          {isHostTeam ? (
            <Field
              label="CCB Scheduling Category ID"
              htmlFor="ccb-category-id"
              hint="The category this team schedules from."
            >
              <input
                id="ccb-category-id"
                type="text"
                inputMode="numeric"
                value={values.ccb_category_id}
                onChange={(e) => setField('ccb_category_id', e.target.value.replace(/[^0-9]/g, ''))}
                placeholder="e.g. 128"
                className={inputClass}
                autoComplete="off"
              />
            </Field>
          ) : (
            <Field
              label="CCB Group ID"
              htmlFor="ccb-group-id"
              hint="From the CCB group URL: group_detail.php?group_id=3947"
            >
              <input
                id="ccb-group-id"
                type="text"
                inputMode="numeric"
                value={values.ccb_group_id}
                onChange={(e) => setField('ccb_group_id', e.target.value.replace(/[^0-9]/g, ''))}
                placeholder="e.g. 3947"
                className={inputClass}
                autoComplete="off"
              />
            </Field>
          )}

          <Field
            label="Leader's CCB Profile Link"
            htmlFor="leader-ccb-link"
            hint="Paste one here and RADIUS pulls the birthday on save."
          >
            <input
              id="leader-ccb-link"
              type="url"
              value={values.leader_ccb_profile_link}
              onChange={(e) => setField('leader_ccb_profile_link', e.target.value)}
              placeholder="https://…/goto/individuals/12345"
              className={inputClass}
              autoComplete="off"
            />
          </Field>
        </div>
      </div>

      {error && (
        <div className="rounded-md bg-red-50 dark:bg-red-900/30 p-4">
          <p className="text-sm text-red-700 dark:text-red-400">{error}</p>
        </div>
      )}

      <div className="flex flex-col-reverse sm:flex-row sm:justify-end gap-3">
        <button
          type="button"
          onClick={resetForm}
          disabled={isSaving}
          className="inline-flex items-center justify-center px-4 py-2 border border-gray-300 dark:border-gray-600 rounded-lg text-sm font-medium text-gray-700 dark:text-gray-300 bg-white dark:bg-gray-700 hover:bg-gray-50 dark:hover:bg-gray-600 disabled:opacity-50"
        >
          Clear
        </button>
        <button
          type="submit"
          disabled={isSaving || !trimmedName}
          className="btn-success inline-flex items-center justify-center px-5 py-2 rounded-lg text-sm disabled:opacity-50 disabled:cursor-not-allowed"
        >
          {isSaving ? (
            <>
              <svg className="animate-spin -ml-1 mr-2 h-4 w-4 text-white" fill="none" viewBox="0 0 24 24">
                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
              </svg>
              Adding…
            </>
          ) : (
            `Add ${isHostTeam ? 'Team' : 'Circle'} Leader`
          )}
        </button>
      </div>
    </form>
  );
}
