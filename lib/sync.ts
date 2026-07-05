import { getSupabase } from "./supabase";
import { GameEvent } from "./types";

/**
 * Shared-table sync. Local-first: every game lives in localStorage; sharing
 * mirrors its event log to Supabase so any member's new events reach every
 * device in realtime. Events are immutable and deduped by id, so merging is
 * just "append what I haven't seen" — the engine derives identical state
 * everywhere.
 */

export async function currentUserId(): Promise<string | null> {
  const sb = getSupabase();
  if (!sb) return null;
  const { data } = await sb.auth.getSession();
  return data.session?.user.id ?? null;
}

/** Create a shared game and upload the existing event log. Returns its id. */
export async function shareGame(events: GameEvent[]): Promise<string> {
  const sb = getSupabase();
  if (!sb) throw new Error("Supabase isn't configured");
  const { data: game, error } = await sb
    .from("shared_games")
    .insert({})
    .select("id")
    .single();
  if (error || !game) throw error ?? new Error("could not create shared game");
  const rows = events.map((e) => ({ game_id: game.id, id: e.id, event: e }));
  const { error: evError } = await sb.from("shared_events").insert(rows);
  if (evError) throw evError;
  return game.id as string;
}

/** Join by id (the link is the invite) and fetch the full event log. */
export async function joinSharedGame(id: string): Promise<GameEvent[]> {
  const sb = getSupabase();
  if (!sb) throw new Error("Supabase isn't configured");
  const { error: joinError } = await sb.rpc("join_shared_game", { gid: id });
  if (joinError) throw joinError;
  const { data, error } = await sb
    .from("shared_events")
    .select("event")
    .eq("game_id", id)
    .order("pk", { ascending: true });
  if (error) throw error;
  return (data ?? []).map((r) => r.event as GameEvent);
}

/** Push one event; duplicate ids are ignored (unique constraint). */
export async function pushSharedEvent(
  gameId: string,
  event: GameEvent
): Promise<void> {
  const sb = getSupabase();
  if (!sb) return;
  const { error } = await sb
    .from("shared_events")
    .insert({ game_id: gameId, id: event.id, event });
  if (error && !`${error.code}`.startsWith("23")) {
    // 23505 = someone else already synced this event; anything else is real.
    console.error("event sync failed:", error);
  }
}

/** Live-subscribe to other players' events. Returns an unsubscribe fn. */
export function subscribeToSharedEvents(
  gameId: string,
  onEvent: (e: GameEvent) => void
): () => void {
  const sb = getSupabase();
  if (!sb) return () => {};
  const channel = sb
    .channel(`game-${gameId}`)
    .on(
      "postgres_changes",
      {
        event: "INSERT",
        schema: "public",
        table: "shared_events",
        filter: `game_id=eq.${gameId}`,
      },
      (payload) => {
        const e = (payload.new as { event?: GameEvent })?.event;
        if (e) onEvent(e);
      }
    )
    .subscribe();
  return () => {
    sb.removeChannel(channel);
  };
}
