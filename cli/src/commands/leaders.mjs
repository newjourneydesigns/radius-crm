import { db } from '../db.mjs';
import { output, fail, requireFlag, requireArg, asBool } from '../util.mjs';

const VALID_STATUSES = ['invited', 'pipeline', 'on-boarding', 'active', 'paused', 'off-boarding'];

const EDITABLE_FIELDS = [
  'name', 'email', 'phone', 'campus', 'status', 'acpd',
  'day', 'time', 'frequency', 'circle_type', 'circle_name',
  'meeting_start_date', 'ccb_profile_link', 'leader_ccb_profile_link',
  'team_name', 'director', 'leader_type',
];

function flagToField(flagKey) {
  return flagKey.replace(/-/g, '_');
}

function buildFieldUpdates(flags) {
  const updates = {};
  for (const [k, v] of Object.entries(flags)) {
    if (k === 'json') continue;
    const field = flagToField(k);
    if (EDITABLE_FIELDS.includes(field)) {
      updates[field] = v === true ? null : v;
    }
  }
  if (updates.status) {
    const s = String(updates.status).toLowerCase();
    if (!VALID_STATUSES.includes(s)) fail(`status must be one of: ${VALID_STATUSES.join(', ')}`);
    updates.status = s;
  }
  return updates;
}

export async function runLeaders(sub, positional, flags) {
  const json = asBool(flags.json);
  switch (sub) {
    case 'list': {
      const filters = {};
      if (flags.campus) filters.campus = `ilike.${flags.campus}`;
      if (flags.status) filters.status = `eq.${flags.status}`;
      if (flags.acpd) filters.acpd = `ilike.${flags.acpd}`;
      if (flags['leader-type']) filters.leader_type = `eq.${flags['leader-type']}`;
      if (flags.search) filters.name = `ilike.*${flags.search}*`;
      const rows = await db.select('circle_leaders', {
        filters,
        order: 'name.asc',
        limit: flags.limit || 200,
      });
      return output(rows, {
        json,
        columns: ['id', 'name', 'campus', 'status', 'acpd', 'day', 'time', 'frequency'],
      });
    }
    case 'show': {
      const id = requireArg(positional, 0, 'id');
      const rows = await db.select('circle_leaders', { filters: { id: `eq.${id}` } });
      if (!rows?.length) fail(`no leader with id ${id}`);
      return output(rows[0], { json: true });
    }
    case 'add': {
      const name = requireFlag(flags, 'name');
      const leaderType = flags['leader-type'] === 'host_team' ? 'host_team' : 'circle';
      const payload = {
        name,
        leader_type: leaderType,
        status: (flags.status && VALID_STATUSES.includes(String(flags.status).toLowerCase()))
          ? String(flags.status).toLowerCase()
          : 'active',
        event_summary_received: false,
      };
      const passthrough = ['email', 'phone', 'campus', 'acpd', 'day', 'time', 'frequency',
        'circle_type', 'ccb_profile_link', 'leader_ccb_profile_link', 'team_name', 'director'];
      for (const f of passthrough) {
        const flagKey = f.replace(/_/g, '-');
        if (flags[flagKey]) payload[f] = flags[flagKey];
      }
      if (leaderType === 'circle') {
        payload.circle_name = flags['circle-name'] || name;
      }
      if (flags['meeting-start-date'] && /^\d{4}-\d{2}-\d{2}$/.test(flags['meeting-start-date'])) {
        payload.meeting_start_date = flags['meeting-start-date'];
      }
      const created = await db.insert('circle_leaders', [payload]);
      return output(created?.[0] ?? created, { json: true });
    }
    case 'edit': {
      const id = requireArg(positional, 0, 'id');
      const updates = buildFieldUpdates(flags);
      if (Object.keys(updates).length === 0) fail('no editable fields provided');
      updates.updated_at = new Date().toISOString();
      const updated = await db.update('circle_leaders', { id: `eq.${id}` }, updates);
      if (!updated?.length) fail(`no leader with id ${id}`);
      return output(updated[0], { json: true });
    }
    case 'bulk': {
      const idsRaw = requireFlag(flags, 'ids');
      const field = requireFlag(flags, 'field');
      const value = requireFlag(flags, 'value');
      const ids = String(idsRaw).split(',').map((s) => s.trim()).filter(Boolean);
      const allowed = ['campus', 'acpd', 'frequency', 'circle_type', 'day', 'time', 'meeting_start_date', 'status'];
      if (!allowed.includes(field)) fail(`field must be one of: ${allowed.join(', ')}`);
      let v = String(value).trim();
      if (field === 'status') {
        v = v.toLowerCase();
        if (!VALID_STATUSES.includes(v)) fail(`status must be one of: ${VALID_STATUSES.join(', ')}`);
      }
      const updated = await db.update(
        'circle_leaders',
        { id: `in.(${ids.join(',')})` },
        { [field]: v, updated_at: new Date().toISOString() }
      );
      return output({ updated: updated?.length || 0, leaders: updated }, { json: true });
    }
    case 'delete': {
      const id = requireArg(positional, 0, 'id');
      if (!asBool(flags.yes)) fail('refusing to delete without --yes');
      const deleted = await db.delete('circle_leaders', { id: `eq.${id}` });
      return output({ deleted: deleted?.length || 0 }, { json: true });
    }
    default:
      fail(`unknown leaders subcommand: ${sub}`);
  }
}

export const leadersHelp = `radius leaders <sub> [...]
  list   [--campus X] [--status X] [--acpd X] [--search X] [--leader-type circle|host_team] [--limit N] [--json]
  show   <id> [--json]
  add    --name "..." [--campus] [--status] [--acpd] [--day] [--time] [--frequency]
         [--circle-type] [--email] [--phone] [--circle-name] [--leader-type circle|host_team]
         [--ccb-profile-link] [--leader-ccb-profile-link] [--meeting-start-date YYYY-MM-DD]
  edit   <id> [--name][--campus][--status][--acpd][--day][--time][--frequency]
              [--circle-type][--circle-name][--email][--phone][--meeting-start-date]
              [--ccb-profile-link][--leader-ccb-profile-link][--team-name][--director][--leader-type]
  bulk   --ids "1,2,3" --field <campus|acpd|frequency|circle_type|day|time|meeting_start_date|status> --value "..."
  delete <id> --yes`;
