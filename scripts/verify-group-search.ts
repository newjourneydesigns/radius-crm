/**
 * Assertions for the CCB group-search matching/ranking contract and the
 * group_profiles page parser. No network, no database — pure logic only.
 *
 *   npm run verify:group-search
 *
 * The repo has no unit-test framework, so this follows the scripts/ pattern:
 * a ts-node script that exits non-zero on the first failed assertion.
 */

import { strict as assert } from 'assert';
import { searchWords, escapeIlikePattern, nameMatches, rankGroups } from '../lib/ccb/group-search';
import { parseGroupProfilesPage } from '../lib/ccb/group-cache-sync';

// ---- searchWords ----
assert.deepEqual(searchWords('  stm   Leader '), ['stm', 'leader']);
assert.deepEqual(searchWords(''), []);
assert.deepEqual(searchWords('   '), []);

// ---- escapeIlikePattern ----
assert.equal(escapeIlikePattern('50%_off\\x'), '50\\%\\_off\\\\x');
assert.equal(escapeIlikePattern('leader'), 'leader');

// ---- nameMatches: AND of substrings, case-insensitive (spec examples) ----
const words = searchWords('stm leader');
assert.equal(nameMatches('STM Leaders – Denton', words), true);
assert.equal(nameMatches('Leaders of STM Teams', words), true);
assert.equal(nameMatches('STM Kids', words), false);
assert.equal(nameMatches('Anthem STM Leaders', searchWords('leader')), true);

// ---- rankGroups: exact first, then starts-with, then alphabetical ----
const ranked = rankGroups(
  [
    { name: 'Zeal STM Leaders' },
    { name: 'STM Leaders – Denton' },
    { name: 'stm leaders' },
    { name: 'Anthem STM Leaders' },
  ],
  'STM Leaders'
);
assert.deepEqual(
  ranked.map((g) => g.name),
  ['stm leaders', 'STM Leaders – Denton', 'Anthem STM Leaders', 'Zeal STM Leaders']
);
// Ties within a tier stay alphabetical; input is not mutated.
const input = [{ name: 'b' }, { name: 'a' }];
const out = rankGroups(input, 'zz');
assert.deepEqual(out.map((g) => g.name), ['a', 'b']);
assert.deepEqual(input.map((g) => g.name), ['b', 'a']);

// ---- parseGroupProfilesPage: fast-xml-parser-shaped group_profiles page ----
const page = parseGroupProfilesPage({
  ccb_api: {
    response: {
      groups: {
        group: [
          {
            '@_id': '1234',
            name: 'Anthem STM Leaders',
            campus: { '#text': 'Lewisville', '@_id': '7' },
            group_type: { '#text': 'Serve Team', '@_id': '3' },
            main_leader: { '@_id': '99', first_name: 'Jane', last_name: 'Doe' },
            inactive: 'false',
          },
          {
            '@_id': '5678',
            name: 'Retired Circle',
            inactive: 'true',
            main_leader: { full_name: 'someone@example.com' },
          },
          // No id → skipped
          { name: 'Nameless' },
        ],
      },
    },
  },
});
assert.equal(page.length, 2);
assert.deepEqual(page[0], {
  id: '1234',
  name: 'Anthem STM Leaders',
  campus: 'Lewisville',
  group_type: 'Serve Team',
  main_leader: 'Jane Doe',
  member_count: null,
  inactive: false,
});
assert.equal(page[1].inactive, true);
assert.equal(page[1].main_leader, null); // email-like "names" are dropped

// Single-group page (fast-xml-parser collapses one-element lists to an object)
const single = parseGroupProfilesPage({
  ccb_api: { response: { groups: { group: { '@_id': '9', name: 'Solo Group' } } } },
});
assert.equal(single.length, 1);
assert.equal(single[0].name, 'Solo Group');

// Empty page
assert.deepEqual(parseGroupProfilesPage({ ccb_api: { response: {} } }), []);

console.log('✅ verify-group-search: all assertions passed');
