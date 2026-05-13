import { db } from '../db.mjs';
import { output, fail, requireFlag, requireArg, asBool } from '../util.mjs';

// "Lists" in CLI parlance == board_columns in the DB.

export async function runLists(sub, positional, flags) {
  const json = asBool(flags.json);
  switch (sub) {
    case 'list': {
      const boardId = requireFlag(flags, 'board');
      const rows = await db.select('board_columns', {
        filters: { board_id: `eq.${boardId}` },
        order: 'position.asc',
      });
      return output(rows, { json, columns: ['id', 'title', 'position', 'color'] });
    }
    case 'show': {
      const id = requireArg(positional, 0, 'id');
      const rows = await db.select('board_columns', { filters: { id: `eq.${id}` } });
      if (!rows?.length) fail(`no list with id ${id}`);
      return output(rows[0], { json: true });
    }
    case 'add': {
      const boardId = requireFlag(flags, 'board');
      const title = requireFlag(flags, 'title');
      const existing = await db.select('board_columns', {
        filters: { board_id: `eq.${boardId}` },
        select: 'position',
        order: 'position.desc',
        limit: 1,
      });
      const nextPos = (existing?.[0]?.position ?? -1) + 1;
      const payload = {
        board_id: boardId,
        title,
        position: nextPos,
        color: flags.color || '#6366f1',
      };
      const created = await db.insert('board_columns', [payload]);
      return output(created?.[0] ?? created, { json: true });
    }
    case 'edit': {
      const id = requireArg(positional, 0, 'id');
      const updates = {};
      if (flags.title) updates.title = flags.title;
      if (flags.color) updates.color = flags.color;
      if (flags.position != null) updates.position = Number(flags.position);
      if (Object.keys(updates).length === 0) fail('no fields to update');
      const updated = await db.update('board_columns', { id: `eq.${id}` }, updates);
      if (!updated?.length) fail(`no list with id ${id}`);
      return output(updated[0], { json: true });
    }
    case 'delete': {
      const id = requireArg(positional, 0, 'id');
      if (!asBool(flags.yes)) fail('refusing to delete without --yes');
      const deleted = await db.delete('board_columns', { id: `eq.${id}` });
      return output({ deleted: deleted?.length || 0 }, { json: true });
    }
    default:
      fail(`unknown lists subcommand: ${sub}`);
  }
}

export const listsHelp = `radius lists <sub> [...]   (lists == board columns)
  list   --board <boardId> [--json]
  show   <id> [--json]
  add    --board <boardId> --title "..." [--color "#hex"]
  edit   <id> [--title][--color][--position N]
  delete <id> --yes`;
