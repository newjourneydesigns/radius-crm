import { ChatMessage, FavoriteGame, GameEvent, StoredGame } from "./types";

const INDEX_KEY = "aisk:games";
const GAME_KEY = (id: string) => `aisk:game:${id}`;
const FAVORITES_KEY = "aisk:favorites";

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
