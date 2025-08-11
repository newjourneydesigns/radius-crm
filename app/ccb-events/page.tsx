import { notFound } from "next/navigation";

import { XMLParser } from "fast-xml-parser";

type ISODate = string;

export interface CCBConfig {
  baseUrl: string;         // e.g. "https://yourchurch.ccbchurch.com"
  username: string;
  password: string;
  perPage?: number;        // default 200
  concurrency?: number;    // default 5
  fetchTimeoutMs?: number; // default 20000
}

export interface CCBGroup {
  id: string;
  name: string;
}

export interface CCBEvent {
  id: string;
  name: string;
  start_datetime: ISODate;
  end_datetime?: ISODate;
  timezone?: string;
  groupId?: string;
  groupName?: string;
  created?: ISODate;
  modified?: ISODate;
}

const parser = new XMLParser({
  ignoreAttributes: false,
  attributeNamePrefix: "@_",
  trimValues: true,
});

function withTimeout<T>(p: Promise<T>, ms: number, label = "request"): Promise<T> {
  return new Promise((resolve, reject) => {
    const t = setTimeout(() => reject(new Error(`${label} timed out after ${ms}ms`)), ms);
    p.then(v => { clearTimeout(t); resolve(v); }, e => { clearTimeout(t); reject(e); });
  });
}

async function ccbPost(
  cfg: CCBConfig,
  params: Record<string, string | number | boolean>
) {
  const body = new URLSearchParams();
  for (const [k, v] of Object.entries(params)) body.append(k, String(v));

  const req = fetch(`${cfg.baseUrl}/api.php`, {
    method: "POST",
    headers: {
      Authorization: "Basic " + Buffer.from(`${cfg.username}:${cfg.password}`).toString("base64"),
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body: body.toString(),
  });

  const res = await withTimeout(req, cfg.fetchTimeoutMs ?? 20000, `CCB ${params.srv}`);
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`CCB ${params.srv} failed: ${res.status} ${res.statusText}\n${text}`);
  }
  const xml = await res.text();
  const json = parser.parse(xml);
  const root = (json as any)?.ccb_api;
  const err = (root as any)?.errors?.error;
  if (err) {
    const msg = typeof err === "string" ? err : err["#text"] || JSON.stringify(err);
    throw new Error(`CCB ${params.srv} error: ${msg}`);
  }
  return root as any;
}

async function paginateConcurrent<T>(
  cfg: CCBConfig,
  srv: string,
  baseParams: Record<string, string | number | boolean>,
  path: string[],
  perPage = cfg.perPage ?? 200,
  concurrency = cfg.concurrency ?? 5,
  maxPages = 200
): Promise<T[]> {
  let nextPage = 1;
  let stop = false;
  const out: T[] = [];

  async function fetchPage(page: number): Promise<T[]> {
    const root = await ccbPost(cfg, { ...baseParams, srv, per_page: perPage, page });
    let cursor: any = (root as any)?.response;
    for (const key of path) cursor = cursor?.[key];
    const items: T[] = !cursor ? [] : Array.isArray(cursor) ? cursor : [cursor];
    return items;
  }

  async function worker() {
    while (!stop) {
      const page = nextPage++;
      if (page > maxPages) { stop = true; break; }
      const items = await fetchPage(page);
      if (items.length === 0) { stop = true; break; }
      out.push(...items);
      if (items.length < perPage) { stop = true; break; }
    }
  }

  const workers = Array.from({ length: Math.max(1, concurrency) }, () => worker());
  await Promise.allSettled(workers);
  return out;
}

async function fetchGroupsByPrefixFast(cfg: CCBConfig, prefix: string): Promise<CCBGroup[]> {
  const groupsRaw = await paginateConcurrent<any>(
    cfg,
    "group_profiles",
    { include_participants: false },
    ["groups", "group"]
  );

  return groupsRaw
    .map((g) => ({ id: String(g?.["@_id"] ?? g?.id ?? ""), name: String(g?.name ?? "") }))
    .filter((g) => g.name.startsWith(prefix));
}

async function fetchEventsForGroupsInRangeFast(
  cfg: CCBConfig,
  groupIds: string[],
  dateStart: Date,
  dateEnd: Date
): Promise<CCBEvent[]> {
  if (groupIds.length === 0) return [];
  const modifiedSince = dateStart.toISOString().slice(0, 10);

  const eventsRaw = await paginateConcurrent<any>(
    cfg,
    "event_profiles",
    { modified_since: modifiedSince, include_guest_list: false },
    ["events", "event"]
  );

  const startMs = dateStart.getTime();
  const endMs = dateEnd.getTime();
  const set = new Set(groupIds.map(String));

  return eventsRaw
    .map((e) => {
      const groupId = String(e?.group?.["@_id"] ?? "");
      const groupName = String(e?.group?.["#text"] ?? e?.group ?? "");
      const ev: CCBEvent = {
        id: String(e?.["@_id"] ?? e?.id ?? ""),
        name: String(e?.name ?? ""),
        start_datetime: String(e?.start_datetime ?? ""),
        end_datetime: e?.end_datetime ? String(e.end_datetime) : undefined,
        timezone: e?.timezone ? String(e.timezone) : undefined,
        groupId,
        groupName,
        created: e?.created ? String(e.created) : undefined,
        modified: e?.modified ? String(e.modified) : undefined,
      };
      return ev;
    })
    .filter((ev) => {
      if (!ev.start_datetime) return false;
      const t = Date.parse(ev.start_datetime);
      if (Number.isNaN(t)) return false;
      const inRange = t >= startMs && t <= endMs;
      const inGroup = ev.groupId && set.has(ev.groupId);
      return inRange && inGroup;
    });
}

async function fetchEventsByGroupNamePrefixFast(
  cfg: CCBConfig,
  namePrefix: string,
  dateStart: Date,
  dateEnd: Date
): Promise<{ groups: CCBGroup[]; events: CCBEvent[] }> {
  const groups = await fetchGroupsByPrefixFast(cfg, namePrefix);
  if (groups.length === 0) return { groups: [], events: [] };
  const events = await fetchEventsForGroupsInRangeFast(cfg, groups.map(g => g.id), dateStart, dateEnd);
  return { groups, events };
}

type PageProps = {
  searchParams?: {
    prefix?: string;   // e.g., LVT | S1 |
    start?: string;    // YYYY-MM-DD
    end?: string;      // YYYY-MM-DD
  };
};

// Avoid caching while you iterate on this page
export const dynamic = "force-dynamic";

function makeEventUrl(baseUrl: string, eventId: string) {
  // You can override this with an env variable if your CCB path is different
  // Example overrides:
  //   /w_event.php?id={id}
  //   /event_details.php?event_id={id}
  const template = process.env.CCB_EVENT_PATH_TEMPLATE ?? "/event.php?id={id}";
  const path = template.replace("{id}", encodeURIComponent(eventId));
  return `${baseUrl}${path}`;
}

function fmt(date: Date) {
  return date.toISOString().slice(0, 10);
}

function buildQueryHref(basePath: string, params: { prefix: string; start: string; end: string }) {
  const usp = new URLSearchParams({ prefix: params.prefix, start: params.start, end: params.end });
  return `${basePath}?${usp.toString()}`;
}

export default async function CCBEventsPage({ searchParams }: PageProps) {
  // Defaults for quick testing; override via /ccb-events?prefix=...&start=YYYY-MM-DD&end=YYYY-MM-DD
  const prefix = searchParams?.prefix ?? "LVT | S1 |";
  const startStr = searchParams?.start ?? "2025-08-01";
  const endStr = searchParams?.end ?? "2025-08-31";

  // Quick links for common ranges
  const today = new Date();
  const firstOfMonth = new Date(today.getFullYear(), today.getMonth(), 1);
  const endOfMonth = new Date(today.getFullYear(), today.getMonth() + 1, 0);
  const last7Start = new Date(today);
  last7Start.setDate(today.getDate() - 6);

  const thisMonthHref = buildQueryHref("/ccb-events", { prefix, start: fmt(firstOfMonth), end: fmt(endOfMonth) });
  const last7Href = buildQueryHref("/ccb-events", { prefix, start: fmt(last7Start), end: fmt(today) });

  const start = new Date(startStr);
  const end = new Date(endStr);
  if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime()) || start > end) {
    return notFound();
  }

  const cfg: CCBConfig = {
    baseUrl: process.env.CCB_BASE_URL ?? "https://yourchurch.ccbchurch.com",
    username: process.env.CCB_API_USER!,
    password: process.env.CCB_API_PASS!,
    perPage: 200,
    concurrency: 6,
    fetchTimeoutMs: 20000,
  };

  const { groups, events } = await fetchEventsByGroupNamePrefixFast(cfg, prefix, start, end);

  return (
    <div style={{ background: "#fff", color: "#111", minHeight: "100vh", padding: 24, maxWidth: 1100, margin: "0 auto" }}>
      <h1 style={{ fontSize: 28, fontWeight: 700 }}>CCB Events</h1>
      <form action="/ccb-events" method="get" style={{ display: "grid", gridTemplateColumns: "1fr auto auto auto", gap: 12, marginTop: 12, alignItems: "end" }}>
        <label style={{ display: "grid" }}>
          <span style={{ fontSize: 12, color: "#666", marginBottom: 4 }}>Prefix</span>
          <input
            type="text"
            name="prefix"
            defaultValue={prefix}
            placeholder="e.g. LVT | S1 |"
            style={{ padding: "8px 10px", border: "1px solid #ddd", borderRadius: 6 }}
          />
        </label>
        <label style={{ display: "grid" }}>
          <span style={{ fontSize: 12, color: "#666", marginBottom: 4 }}>Start</span>
          <input
            type="date"
            name="start"
            defaultValue={startStr}
            style={{ padding: "8px 10px", border: "1px solid #ddd", borderRadius: 6 }}
          />
        </label>
        <label style={{ display: "grid" }}>
          <span style={{ fontSize: 12, color: "#666", marginBottom: 4 }}>End</span>
          <input
            type="date"
            name="end"
            defaultValue={endStr}
            style={{ padding: "8px 10px", border: "1px solid #ddd", borderRadius: 6 }}
          />
        </label>
        <button type="submit" style={{ padding: "10px 14px", border: 0, borderRadius: 6, cursor: "pointer", fontWeight: 600, background: "#111", color: "#fff" }}>
          Load Events
        </button>
      </form>

      <div style={{ marginTop: 8, color: "#444", display: "flex", gap: 12, alignItems: "center", flexWrap: "wrap" }}>
        <div>
          Prefix: <code>{prefix}</code> | Range: <code>{startStr}</code> to <code>{endStr}</code>
        </div>
        <div style={{ height: 16, width: 1, background: "#e5e5e5" }} />
        <div style={{ display: "flex", gap: 8 }}>
          <a href={thisMonthHref} style={{ textDecoration: "underline" }}>This month</a>
          <a href={last7Href} style={{ textDecoration: "underline" }}>Last 7 days</a>
        </div>
      </div>

      <section style={{ marginTop: 24 }}>
        <h2 style={{ fontSize: 18, fontWeight: 600, marginBottom: 8 }}>Matched Groups ({groups.length})</h2>
        {groups.length === 0 ? (
          <p style={{ color: "#666" }}>No groups matched that prefix.</p>
        ) : (
          <ul style={{ lineHeight: 1.7 }}>
            {groups.map((g) => (
              <li key={g.id}>
                <strong>{g.name}</strong> <small style={{ color: "#666" }}>({g.id})</small>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section style={{ marginTop: 24 }}>
        <h2 style={{ fontSize: 18, fontWeight: 600, marginBottom: 8 }}>Events ({events.length})</h2>
        {events.length === 0 ? (
          <p style={{ color: "#666" }}>No events found in that window for the matched groups.</p>
        ) : (
          <div style={{ overflowX: "auto", border: "1px solid #eee", borderRadius: 8 }}>
            <table style={{ width: "100%", borderCollapse: "separate", borderSpacing: 0 }}>
              <thead>
                <tr style={{ background: "#fafafa" }}>
                  <th style={{ textAlign: "left", padding: "10px 12px", borderBottom: "1px solid #eee" }}>Start</th>
                  <th style={{ textAlign: "left", padding: "10px 12px", borderBottom: "1px solid #eee" }}>Event</th>
                  <th style={{ textAlign: "left", padding: "10px 12px", borderBottom: "1px solid #eee" }}>Group</th>
                  <th style={{ textAlign: "left", padding: "10px 12px", borderBottom: "1px solid #eee" }}>Actions</th>
                </tr>
              </thead>
              <tbody>
                {events.map((e, idx) => {
                  const href = makeEventUrl(cfg.baseUrl, e.id);
                  const rowBg = idx % 2 === 0 ? undefined : "#fcfcfc";
                  return (
                    <tr key={e.id} style={{ background: rowBg }}>
                      <td style={{ padding: "10px 12px", borderBottom: "1px solid #f1f1f1", whiteSpace: "nowrap" }}>{e.start_datetime}</td>
                      <td style={{ padding: "10px 12px", borderBottom: "1px solid #f1f1f1" }}>
                        <strong>{e.name}</strong>
                      </td>
                      <td style={{ padding: "10px 12px", borderBottom: "1px solid #f1f1f1" }}>
                        <em>{e.groupName}</em> <small style={{ color: "#666" }}>({e.groupId})</small>
                      </td>
                      <td style={{ padding: "10px 12px", borderBottom: "1px solid #f1f1f1" }}>
                        <a href={href} target="_blank" rel="noopener noreferrer" style={{ textDecoration: "underline" }}>
                          Open in CCB
                        </a>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </section>

      <p style={{ marginTop: 12, color: "#777", fontSize: 12 }}>
        Tip: If the “Open in CCB” link doesn’t land on your event, set <code>CCB_EVENT_PATH_TEMPLATE</code> in your env.
        For example: <code>/w_event.php?id={"{id}"}</code> or <code>/event_details.php?event_id={"{id}"}</code>.
      </p>
    </div>
  );
}