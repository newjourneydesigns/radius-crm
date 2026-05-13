import { db } from '../db.mjs';
import { output, fail, requireFlag, requireArg, asBool } from '../util.mjs';

const VALID_PRIORITIES = ['low', 'medium', 'high', 'urgent'];

const EDITABLE = [
  'title', 'description', 'priority', 'start_date', 'due_date',
  'assignee', 'linked_leader_id', 'is_focused', 'column_id', 'position',
];

function flagsToUpdates(flags) {
  const updates = {};
  for (const [k, v] of Object.entries(flags)) {
    if (k === 'json' || k === 'yes') continue;
    const field = k.replace(/-/g, '_');
    if (EDITABLE.includes(field)) {
      if (field === 'is_focused') updates[field] = asBool(v);
      else if (field === 'position' || field === 'linked_leader_id') {
        updates[field] = v === true ? null : Number(v);
        if (Number.isNaN(updates[field])) updates[field] = null;
      } else {
        updates[field] = v === true ? null : v;
      }
    }
  }
  if (updates.priority && !VALID_PRIORITIES.includes(updates.priority)) {
    fail(`priority must be one of: ${VALID_PRIORITIES.join(', ')}`);
  }
  return updates;
}

export async function runCards(sub, positional, flags) {
  const json = asBool(flags.json);
  switch (sub) {
    case 'list': {
      const filters = { is_archived: 'eq.false' };
      if (flags.board) filters.board_id = `eq.${flags.board}`;
      if (flags.list) filters.column_id = `eq.${flags.list}`;
      if (flags.assignee) filters.assignee = `ilike.${flags.assignee}`;
      if (flags['leader-id']) filters.linked_leader_id = `eq.${flags['leader-id']}`;
      if (flags.priority) filters.priority = `eq.${flags.priority}`;
      const rows = await db.select('board_cards', {
        filters,
        order: flags.order || 'position.asc',
        limit: flags.limit || 500,
      });
      return output(rows, {
        json,
        columns: ['id', 'title', 'board_id', 'column_id', 'position', 'priority', 'due_date', 'assignee'],
      });
    }
    case 'show': {
      const id = requireArg(positional, 0, 'id');
      const [cards, checklists, comments] = await Promise.all([
        db.select('board_cards', { filters: { id: `eq.${id}` } }),
        db.select('card_checklists', { filters: { card_id: `eq.${id}` }, order: 'position.asc' }),
        db.select('card_comments', { filters: { card_id: `eq.${id}` }, order: 'created_at.asc' }),
      ]);
      if (!cards?.length) fail(`no card with id ${id}`);
      return output({ ...cards[0], checklists, comments }, { json: true });
    }
    case 'add': {
      const columnId = requireFlag(flags, 'list');
      const title = requireFlag(flags, 'title');
      // Look up board_id from the column unless provided.
      let boardId = flags.board;
      if (!boardId) {
        const col = await db.select('board_columns', { filters: { id: `eq.${columnId}` } });
        if (!col?.length) fail(`no list with id ${columnId}`);
        boardId = col[0].board_id;
      }
      const existing = await db.select('board_cards', {
        filters: { column_id: `eq.${columnId}` },
        select: 'position',
        order: 'position.desc',
        limit: 1,
      });
      const nextPos = (existing?.[0]?.position ?? -1) + 1;
      const payload = {
        board_id: boardId,
        column_id: columnId,
        title,
        position: nextPos,
      };
      if (flags.description) payload.description = flags.description;
      if (flags.priority) {
        if (!VALID_PRIORITIES.includes(flags.priority)) fail(`priority must be one of: ${VALID_PRIORITIES.join(', ')}`);
        payload.priority = flags.priority;
      }
      if (flags['start-date']) payload.start_date = flags['start-date'];
      if (flags['due-date']) payload.due_date = flags['due-date'];
      if (flags.assignee) payload.assignee = flags.assignee;
      if (flags['leader-id']) payload.linked_leader_id = Number(flags['leader-id']);
      const created = await db.insert('board_cards', [payload]);
      return output(created?.[0] ?? created, { json: true });
    }
    case 'edit': {
      const id = requireArg(positional, 0, 'id');
      const updates = flagsToUpdates(flags);
      if (Object.keys(updates).length === 0) fail('no fields to update');
      const updated = await db.update('board_cards', { id: `eq.${id}` }, updates);
      if (!updated?.length) fail(`no card with id ${id}`);
      return output(updated[0], { json: true });
    }
    case 'move': {
      const id = requireArg(positional, 0, 'id');
      const toList = requireFlag(flags, 'to-list');
      const updates = { column_id: toList };
      if (flags.position != null) {
        updates.position = Number(flags.position);
      } else {
        const existing = await db.select('board_cards', {
          filters: { column_id: `eq.${toList}` },
          select: 'position',
          order: 'position.desc',
          limit: 1,
        });
        updates.position = (existing?.[0]?.position ?? -1) + 1;
      }
      if (flags['to-board']) updates.board_id = flags['to-board'];
      const updated = await db.update('board_cards', { id: `eq.${id}` }, updates);
      if (!updated?.length) fail(`no card with id ${id}`);
      return output(updated[0], { json: true });
    }
    case 'delete': {
      const id = requireArg(positional, 0, 'id');
      if (!asBool(flags.yes)) fail('refusing to delete without --yes');
      const deleted = await db.delete('board_cards', { id: `eq.${id}` });
      return output({ deleted: deleted?.length || 0 }, { json: true });
    }
    case 'archive': {
      const id = requireArg(positional, 0, 'id');
      const updated = await db.update('board_cards', { id: `eq.${id}` }, { is_archived: true });
      if (!updated?.length) fail(`no card with id ${id}`);
      return output(updated[0], { json: true });
    }
    default:
      fail(`unknown cards subcommand: ${sub}`);
  }
}

export const cardsHelp = `radius cards <sub> [...]
  list    [--board <id>] [--list <colId>] [--assignee X] [--leader-id N]
          [--priority low|medium|high|urgent] [--order field.asc|desc] [--limit N] [--json]
  show    <id> [--json]
  add     --list <colId> --title "..." [--board <id>] [--description] [--priority]
          [--start-date YYYY-MM-DD] [--due-date YYYY-MM-DD] [--assignee] [--leader-id N]
  edit    <id> [--title][--description][--priority][--start-date][--due-date]
               [--assignee][--leader-id N][--is-focused true|false][--column-id <colId>][--position N]
  move    <id> --to-list <colId> [--to-board <id>] [--position N]
  archive <id>
  delete  <id> --yes`;
