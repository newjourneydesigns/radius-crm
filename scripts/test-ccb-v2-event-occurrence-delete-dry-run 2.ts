import dotenv from 'dotenv';
import { createCCBv2Client } from '../lib/ccb/ccb-v2-client';
import { searchEventOccurrences, type MatchMode } from '../lib/ccb/event-occurrence-delete';

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

function hasFlag(name: string): boolean {
  return process.argv.includes(`--${name}`);
}

function matchMode(value: string | undefined): MatchMode {
  return value === 'starts_with' || value === 'exact' ? value : 'contains';
}

function usage(): never {
  console.error(
    [
      'Usage:',
      '  npx ts-node --compiler-options \'{"module":"commonjs"}\' scripts/test-ccb-v2-event-occurrence-delete-dry-run.ts --group-name "GROUP" --start YYYY-MM-DD --end YYYY-MM-DD [--event-name "EVENT"]',
      '',
      'Options:',
      '  --group-mode contains|starts_with|exact   default: contains',
      '  --event-mode contains|starts_with|exact   default: contains',
      '  --include-inactive                       include inactive groups if CCB exposes status',
      '  --include-attendance                     show occurrences with attendance',
      '',
      'This is a dry-run probe. It calls GET /groups and GET /groups/{group_id}/calendar only.',
    ].join('\n')
  );
  process.exit(1);
}

async function main() {
  const groupName = argValue('group-name') || process.env.CCB_GROUP_NAME;
  const startDate = argValue('start') || process.env.CCB_START_DATE;
  const endDate = argValue('end') || process.env.CCB_END_DATE;

  if (!groupName || !startDate || !endDate) usage();

  const ccb = createCCBv2Client({
    module: 'Script',
    action: 'Dry Run Event Occurrence Delete Search',
    direction: 'pull',
  });

  const result = await searchEventOccurrences(ccb, {
    groupName,
    groupMatchMode: matchMode(argValue('group-mode')),
    eventName: argValue('event-name') || '',
    eventMatchMode: matchMode(argValue('event-mode')),
    startDate,
    endDate,
    includeInactiveGroups: hasFlag('include-inactive'),
    includeOccurrencesWithAttendance: hasFlag('include-attendance'),
  });

  console.log(JSON.stringify({
    dryRun: true,
    deleteEndpointCalled: false,
    groupsSearched: result.groupsSearched,
    groupsMatched: result.groupsMatched,
    skippedInactiveGroups: result.skippedInactiveGroups,
    skippedAttendance: result.skippedAttendance,
    calendarErrors: result.calendarErrors,
    count: result.occurrences.length,
    firstTen: result.occurrences.slice(0, 10),
  }, null, 2));
}

main().catch((error) => {
  console.error('CCB v2 event occurrence delete dry run failed:', error?.message || error);
  process.exit(1);
});
