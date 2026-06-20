/**
 * CCB scheduling discovery spike (read-only).
 *
 * The Teams Toolkit "Schedule" tab needs, per upcoming date, the people
 * scheduled in a team's positions and each person's response status
 * (pending / accepted / declined + reason). The CCB v2 client only maps the
 * static category → team → position → volunteer roster today, and we don't yet
 * know which (if any) CCB REST endpoint exposes scheduled occurrences + per-
 * person response status. This script probes likely endpoints against a real
 * scheduling category and dumps the RAW JSON so we can design the data layer
 * against the actual response shape.
 *
 * READ-ONLY: only GETs. Still hits the live CCB API (consumes API budget) and
 * needs CCB OAuth tokens in Supabase, so run it in an environment with
 * .env.local configured — NOT in CI.
 *
 * Usage:
 *   npx ts-node scripts/probe-ccb-scheduling.ts --category-id 123 [--start 2026-06-20 --end 2026-07-31]
 */

export {}; // module scope — keeps top-level names out of the shared scripts/ global scope

const dotenv = require('dotenv');
const { createCCBv2Client } = require('../lib/ccb/ccb-v2-client');

dotenv.config({ path: '.env.local', quiet: true });
dotenv.config({ quiet: true });

function argValue(name: string): string | undefined {
  const prefix = `--${name}=`;
  const withEquals = process.argv.find((arg) => arg.startsWith(prefix));
  if (withEquals) return withEquals.slice(prefix.length);
  const index = process.argv.indexOf(`--${name}`);
  if (index >= 0) return process.argv[index + 1];
  return undefined;
}

function today(): string {
  return new Date().toISOString().slice(0, 10);
}
function plusDays(days: number): string {
  const d = new Date();
  d.setDate(d.getDate() + days);
  return d.toISOString().slice(0, 10);
}

async function main() {
  const categoryId = argValue('category-id') || process.env.CCB_CATEGORY_ID;
  if (!categoryId) {
    console.error('Usage: npx ts-node scripts/probe-ccb-scheduling.ts --category-id 123 [--start YYYY-MM-DD --end YYYY-MM-DD]');
    process.exit(1);
  }
  const start = argValue('start') || today();
  const end = argValue('end') || plusDays(42);

  const client = createCCBv2Client({ module: 'Teams Toolkit Spike', action: 'Probe Scheduling', direction: 'pull' });

  // Candidate endpoints. We don't know CCB's exact scheduling surface, so try a
  // spread of plausible paths and report which return data. `get()` throws on
  // non-2xx; we catch and report the status so 404s are obvious vs. real data.
  const candidates: Array<{ label: string; path: string; query?: Record<string, string> }> = [
    { label: 'category detail (raw, look for nested schedules/requests)', path: `/scheduling/categories/${categoryId}` },
    { label: 'category volunteers (raw, look for response/request fields)', path: `/scheduling/categories/${categoryId}/volunteers` },
    { label: 'category schedules', path: `/scheduling/categories/${categoryId}/schedules`, query: { start, end } },
    { label: 'category events', path: `/scheduling/categories/${categoryId}/events`, query: { start, end } },
    { label: 'category occurrences', path: `/scheduling/categories/${categoryId}/occurrences`, query: { start, end } },
    { label: 'category needs', path: `/scheduling/categories/${categoryId}/needs`, query: { start, end } },
    { label: 'category assignments', path: `/scheduling/categories/${categoryId}/assignments`, query: { start, end } },
    { label: 'category requests', path: `/scheduling/categories/${categoryId}/requests`, query: { start, end } },
    { label: 'schedules by category_id', path: `/scheduling/schedules`, query: { category_id: String(categoryId), start, end } },
    { label: 'scheduling events by category_id', path: `/scheduling/events`, query: { category_id: String(categoryId), start, end } },
  ];

  for (const c of candidates) {
    const qs = c.query ? '?' + new URLSearchParams(c.query).toString() : '';
    console.log('\n' + '═'.repeat(80));
    console.log(`▶ ${c.label}`);
    console.log(`  GET ${c.path}${qs}`);
    try {
      const data = await client.get(c.path, c.query);
      const json = JSON.stringify(data, null, 2);
      // Trim very large payloads so the terminal stays readable; the shape is
      // what matters, not every row.
      console.log('  ✓ OK — sample:');
      console.log(json.length > 6000 ? json.slice(0, 6000) + '\n  …(truncated)…' : json);
    } catch (e: any) {
      const status = e?.status ?? e?.statusCode ?? '?';
      console.log(`  ✗ ${status} — ${e?.message || e}`);
    }
  }

  console.log('\n' + '═'.repeat(80));
  console.log('Done. Look for an endpoint that returns dated occurrences with, per position,');
  console.log('the scheduled individual + a response/status field (pending/accepted/declined)');
  console.log('and a decline reason. Paste a successful sample back so we can map it.');
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
