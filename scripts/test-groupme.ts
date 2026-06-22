/**
 * Smoke test for the GroupMe client against the live API.
 *
 *   npx ts-node scripts/test-groupme.ts            # list groups
 *   npx ts-node scripts/test-groupme.ts <groupId>  # dump one group's members
 *
 * Requires GROUPME_ACCESS_TOKEN in .env.local.
 */

import { config } from 'dotenv';
config({ path: '.env.local' });

import { listGroups, getGroup, groupMeRequest } from '../lib/groupme/client';

interface GroupMeUser {
  id: string;
  name: string;
  email?: string;
}

(async () => {
  const groupId = process.argv[2];

  const me = await groupMeRequest<GroupMeUser>('/users/me');
  console.log(`Authenticated as: ${me.name} (user_id ${me.id})\n`);

  if (groupId) {
    const group = await getGroup(groupId);
    const members = group.members ?? [];
    console.log(`Group: ${group.name} (id ${group.id}) — ${members.length} members\n`);
    for (const m of members) {
      console.log(`  • ${m.nickname}  [user_id ${m.user_id}]${m.roles?.length ? `  ${m.roles.join(',')}` : ''}`);
    }
    return;
  }

  const groups = await listGroups();
  console.log(`Service account belongs to ${groups.length} group(s):\n`);
  for (const g of groups) {
    console.log(`  • ${g.name}  [id ${g.id}]`);
  }
  console.log('\nRun again with a group id to dump that group\'s members.');
})().catch((err) => {
  console.error('\nGroupMe test failed:');
  console.error(err);
  process.exit(1);
});
