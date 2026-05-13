import { db } from '../db.mjs';
import { output, fail, requireFlag, requireArg, asBool } from '../util.mjs';

export async function runBoards(sub, positional, flags) {
  const json = asBool(flags.json);
  switch (sub) {
    case 'list': {
      const filters = {};
      if (!asBool(flags['include-archived'])) filters.is_archived = 'eq.false';
      const rows = await db.select('project_boards', {
        filters,
        order: 'created_at.desc',
        limit: flags.limit || 200,
      });
      return output(rows, { json, columns: ['id', 'title', 'description', 'is_archived', 'created_at'] });
    }
    case 'show': {
      const id = requireArg(positional, 0, 'id');
      const [board, columns, cards] = await Promise.all([
        db.select('project_boards', { filters: { id: `eq.${id}` } }),
        db.select('board_columns', { filters: { board_id: `eq.${id}` }, order: 'position.asc' }),
        db.select('board_cards', { filters: { board_id: `eq.${id}`, is_archived: 'eq.false' }, order: 'position.asc' }),
      ]);
      if (!board?.length) fail(`no board with id ${id}`);
      if (json) return output({ ...board[0], columns, cards }, { json: true });
      output([board[0]], { columns: ['id', 'title', 'description', 'is_archived'] });
      process.stdout.write('\nColumns:\n');
      output(columns, { columns: ['id', 'title', 'position', 'color'] });
      process.stdout.write('\nCards:\n');
      output(cards, { columns: ['id', 'title', 'column_id', 'position', 'priority', 'due_date'] });
      return;
    }
    case 'add': {
      const title = requireFlag(flags, 'title');
      const payload = { title, description: flags.description || null };
      const created = await db.insert('project_boards', [payload]);
      return output(created?.[0] ?? created, { json: true });
    }
    case 'edit': {
      const id = requireArg(positional, 0, 'id');
      const updates = {};
      if (flags.title) updates.title = flags.title;
      if (flags.description != null) updates.description = flags.description === true ? null : flags.description;
      if (flags.archived != null) updates.is_archived = asBool(flags.archived);
      if (Object.keys(updates).length === 0) fail('no fields to update');
      const updated = await db.update('project_boards', { id: `eq.${id}` }, updates);
      if (!updated?.length) fail(`no board with id ${id}`);
      return output(updated[0], { json: true });
    }
    case 'delete': {
      const id = requireArg(positional, 0, 'id');
      if (!asBool(flags.yes)) fail('refusing to delete without --yes');
      const deleted = await db.delete('project_boards', { id: `eq.${id}` });
      return output({ deleted: deleted?.length || 0 }, { json: true });
    }
    default:
      fail(`unknown boards subcommand: ${sub}`);
  }
}

export const boardsHelp = `radius boards <sub> [...]
  list   [--include-archived] [--limit N] [--json]
  show   <id> [--json]
  add    --title "..." [--description "..."]
  edit   <id> [--title][--description][--archived true|false]
  delete <id> --yes`;
