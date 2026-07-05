import {
  ChatMessage,
  FavoriteGame,
  GameEvent,
  RosterPlayer,
  StoredGame,
} from "./types";

const INDEX_KEY = "aisk:games";
const GAME_KEY = (id: string) => `aisk:game:${id}`;
const FAVORITES_KEY = "aisk:favorites";
const ROSTER_KEY = "aisk:players";

function read<T>(key: string, fallback: T): T {
  if (typeof window === "undefined") return fallback;
  try {
    const raw = window.localStorage.getItem(key);
    return raw ? (JSON.parse(raw) as T) : fallback;
  } catch {
    return fallback;
  }
}

function write(key: string, value: unknown) {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(key, JSON.stringify(value));
}

export function listGameIds(): string[] {
  return read<string[]>(INDEX_KEY, []);
}

export function loadGame(id: string): StoredGame | null {
  return read<StoredGame | null>(GAME_KEY(id), null);
}

export function listGames(): StoredGame[] {
  return listGameIds()
    .map((id) => loadGame(id))
    .filter((g): g is StoredGame => g !== null)
    .sort((a, b) => b.updatedAt - a.updatedAt);
}

export function saveGame(game: StoredGame) {
  game.updatedAt = Date.now();
  write(GAME_KEY(game.id), game);
  const ids = listGameIds();
  if (!ids.includes(game.id)) {
    write(INDEX_KEY, [game.id, ...ids]);
  }
}

export function deleteGame(id: string) {
  if (typeof window === "undefined") return;
  window.localStorage.removeItem(GAME_KEY(id));
  write(
    INDEX_KEY,
    listGameIds().filter((x) => x !== id)
  );
}

export function createGame(
  id: string,
  events: GameEvent[],
  messages: ChatMessage[]
): StoredGame {
  const game: StoredGame = {
    id,
    createdAt: Date.now(),
    updatedAt: Date.now(),
    events,
    messages,
  };
  saveGame(game);
  return game;
}

// ---------- Player roster ----------

function nextId(): string {
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
}

export function listRoster(): RosterPlayer[] {
  const roster = read<RosterPlayer[]>(ROSTER_KEY, []);
  // Regulars first, then most recently at the table.
  return roster.sort(
    (a, b) =>
      Number(b.regular) - Number(a.regular) ||
      (b.lastPlayedAt ?? 0) - (a.lastPlayedAt ?? 0) ||
      a.name.localeCompare(b.name)
  );
}

function writeRoster(roster: RosterPlayer[]) {
  write(ROSTER_KEY, roster);
}

function findByName(roster: RosterPlayer[], name: string) {
  const q = name.trim().toLowerCase();
  return roster.find((p) => p.name.toLowerCase() === q);
}

/** Add names to the roster (or bump lastPlayedAt) — called on game creation. */
export function upsertRosterNames(names: string[], playedAt?: number) {
  const roster = read<RosterPlayer[]>(ROSTER_KEY, []);
  for (const raw of names) {
    const name = raw.trim();
    if (!name) continue;
    const existing = findByName(roster, name);
    if (existing) {
      existing.lastPlayedAt = Math.max(existing.lastPlayedAt ?? 0, playedAt ?? Date.now());
    } else {
      roster.push({
        id: nextId(),
        name,
        regular: false,
        createdAt: Date.now(),
        lastPlayedAt: playedAt ?? Date.now(),
      });
    }
  }
  writeRoster(roster);
}

/** Build the roster from game history the first time (no-op once populated). */
export function seedRosterFromHistory() {
  if (read<RosterPlayer[]>(ROSTER_KEY, []).length > 0) return;
  for (const g of listGames()) {
    const created = g.events.find((e) => e.type === "game_created");
    if (created && created.type === "game_created") {
      upsertRosterNames(created.players.map((p) => p.name), g.updatedAt);
    }
  }
}

/** Returns false when the name is empty or already taken. */
export function addRosterPlayer(name: string): boolean {
  const trimmed = name.trim();
  if (!trimmed) return false;
  const roster = read<RosterPlayer[]>(ROSTER_KEY, []);
  if (findByName(roster, trimmed)) return false;
  roster.push({
    id: nextId(),
    name: trimmed,
    regular: false,
    createdAt: Date.now(),
    lastPlayedAt: null,
  });
  writeRoster(roster);
  return true;
}

export function setRosterPhoto(id: string, photo: string | undefined) {
  const roster = read<RosterPlayer[]>(ROSTER_KEY, []);
  const p = roster.find((x) => x.id === id);
  if (p) p.photo = photo;
  writeRoster(roster);
}

/** Lowercased name -> photo, for showing portraits on score cards. */
export function getPhotoMap(): Map<string, string> {
  const map = new Map<string, string>();
  for (const p of read<RosterPlayer[]>(ROSTER_KEY, [])) {
    if (p.photo) map.set(p.name.toLowerCase(), p.photo);
  }
  return map;
}

export function toggleRegular(id: string) {
  const roster = read<RosterPlayer[]>(ROSTER_KEY, []);
  const p = roster.find((x) => x.id === id);
  if (p) p.regular = !p.regular;
  writeRoster(roster);
}

export function deleteRosterPlayer(id: string) {
  writeRoster(read<RosterPlayer[]>(ROSTER_KEY, []).filter((p) => p.id !== id));
}

/**
 * Rename a person everywhere: the roster AND their name inside every stored
 * game, so history and stats follow them. Renaming onto an existing roster
 * name merges the two entries (regular status is kept if either had it).
 */
export function renameRosterPlayer(id: string, newName: string): boolean {
  const trimmed = newName.trim();
  if (!trimmed) return false;
  const roster = read<RosterPlayer[]>(ROSTER_KEY, []);
  const player = roster.find((p) => p.id === id);
  if (!player || player.name === trimmed) return false;
  const oldName = player.name;

  const duplicate = findByName(roster, trimmed);
  if (duplicate && duplicate.id !== id) {
    duplicate.regular = duplicate.regular || player.regular;
    duplicate.lastPlayedAt = Math.max(
      duplicate.lastPlayedAt ?? 0,
      player.lastPlayedAt ?? 0
    ) || null;
    writeRoster(roster.filter((p) => p.id !== id));
  } else {
    player.name = trimmed;
    writeRoster(roster);
  }

  // Propagate through history so past games and stats show the new name.
  const oldLower = oldName.toLowerCase();
  for (const g of listGames()) {
    let changed = false;
    for (const e of g.events) {
      if (e.type === "game_created") {
        for (const p of e.players) {
          if (p.name.toLowerCase() === oldLower) {
            p.name = trimmed;
            changed = true;
          }
        }
      }
    }
    if (changed) saveGame(g);
  }
  return true;
}

// ---------- Backup & restore ----------

interface BackupFile {
  version: number;
  exportedAt: number;
  games: StoredGame[];
  roster: RosterPlayer[];
  favorites: FavoriteGame[];
}

/** Everything on this device, as a JSON string ready to download. */
export function exportAll(): string {
  const backup: BackupFile = {
    version: 1,
    exportedAt: Date.now(),
    games: listGames(),
    roster: read<RosterPlayer[]>(ROSTER_KEY, []),
    favorites: listFavorites(),
  };
  return JSON.stringify(backup, null, 2);
}

/**
 * Merge a backup into this device: games dedupe by id (newer updatedAt
 * wins), roster merges by name (regular flag and photo survive from either
 * side), favorites dedupe by game name. Throws on malformed input.
 */
export function importAll(json: string): { games: number; players: number } {
  const data = JSON.parse(json) as Partial<BackupFile>;
  if (!Array.isArray(data.games) || !Array.isArray(data.roster)) {
    throw new Error("Not a Scorekeeper backup file");
  }

  let gamesImported = 0;
  for (const g of data.games) {
    if (!g?.id || !Array.isArray(g.events)) continue;
    const existing = loadGame(g.id);
    if (!existing || (g.updatedAt ?? 0) > existing.updatedAt) {
      write(GAME_KEY(g.id), {
        ...g,
        messages: g.messages ?? [],
        updatedAt: g.updatedAt ?? Date.now(),
      });
      const ids = listGameIds();
      if (!ids.includes(g.id)) write(INDEX_KEY, [g.id, ...ids]);
      gamesImported++;
    }
  }

  let playersImported = 0;
  const roster = read<RosterPlayer[]>(ROSTER_KEY, []);
  for (const p of data.roster) {
    if (!p?.name) continue;
    const existing = findByName(roster, p.name);
    if (existing) {
      existing.regular = existing.regular || !!p.regular;
      existing.photo = existing.photo ?? p.photo;
      existing.lastPlayedAt =
        Math.max(existing.lastPlayedAt ?? 0, p.lastPlayedAt ?? 0) || null;
    } else {
      roster.push({ ...p, id: p.id ?? nextId() });
      playersImported++;
    }
  }
  writeRoster(roster);

  if (Array.isArray(data.favorites)) {
    const favs = listFavorites();
    for (const f of data.favorites) {
      if (
        f?.definition?.name &&
        !favs.some(
          (x) =>
            x.definition.name.toLowerCase() === f.definition.name.toLowerCase()
        )
      ) {
        favs.push(f);
      }
    }
    write(FAVORITES_KEY, favs);
  }

  return { games: gamesImported, players: playersImported };
}

// ---------- Favorites ----------

export function listFavorites(): FavoriteGame[] {
  return read<FavoriteGame[]>(FAVORITES_KEY, []);
}

export function isFavorite(name: string): boolean {
  return listFavorites().some(
    (f) => f.definition.name.toLowerCase() === name.toLowerCase()
  );
}

export function toggleFavorite(fav: FavoriteGame): boolean {
  const all = listFavorites();
  const existing = all.findIndex(
    (f) =>
      f.definition.name.toLowerCase() === fav.definition.name.toLowerCase()
  );
  if (existing >= 0) {
    all.splice(existing, 1);
    write(FAVORITES_KEY, all);
    return false;
  }
  write(FAVORITES_KEY, [fav, ...all]);
  return true;
}
