import { MCP_SCOPE_CONTACTS_READ } from './config';
import { authorizeLeader } from './access';
import { InputError } from './schema';
import type { JsonSchema } from './schema';
import { leaderIdProp, nullableString, radiusUrl, type ToolDefinition } from './tool-kit';

const person: JsonSchema = {
  type: 'object',
  properties: { name: nullableString, email: nullableString, phone: nullableString },
  required: ['name', 'email', 'phone'],
};

/** Empty and whitespace-only values are "not on file". Nothing is guessed or filled in. */
const clean = (value: string | null | undefined) => {
  const text = (value ?? '').trim();
  return text ? text : null;
};

const getLeaderContact: ToolDefinition = {
  name: 'get_leader_contact',
  title: "Get a leader's contact details",
  description:
    "Read the email and phone number on file for ONE leader, kept separate for the primary leader and the additional leader (co-leader), so it is clear whose is whose. " +
    'Anything not on file comes back null. Birthdays and other personal fields are not available. ' +
    'These are private details: use them to answer the signed-in user, do not repeat them elsewhere, and never guess a missing value.',
  requiredScope: MCP_SCOPE_CONTACTS_READ,
  requiresAcpd: true,
  inputSchema: {
    type: 'object',
    additionalProperties: false,
    required: ['leader_id'],
    properties: { leader_id: leaderIdProp },
  },
  outputSchema: {
    type: 'object',
    properties: {
      leader_id: { type: 'integer' },
      radius_url: { type: 'string' },
      primary: { ...person, description: 'The leader this Radius profile is for.' },
      additional: {
        anyOf: [{ ...person, description: 'The additional leader (co-leader), if one is on file.' }, { type: 'null' }],
      },
    },
    required: ['leader_id', 'radius_url', 'primary', 'additional'],
  },
  async run(args, ctx) {
    const id = args.leader_id as number;
    // Campus permission is checked on the leader record; the contact read only happens for a leader the user may see.
    authorizeLeader(ctx.principal, await ctx.repo.getLeader(id), id);
    const row = await ctx.contacts.getLeaderContact(id);
    if (!row) throw new InputError(`No Circle Leader with id ${id}.`);

    const additional = {
      name: clean(row.additional_leader_name),
      email: clean(row.additional_leader_email),
      phone: clean(row.additional_leader_phone),
    };
    const hasAdditional = !!(additional.name || additional.email || additional.phone);

    return {
      structured: {
        leader_id: id,
        radius_url: radiusUrl(ctx.config, id),
        primary: { name: clean(row.name), email: clean(row.email), phone: clean(row.phone) },
        additional: hasAdditional ? additional : null,
      },
      count: 1,
    };
  },
};

export const CONTACT_TOOLS: readonly ToolDefinition[] = [getLeaderContact];
