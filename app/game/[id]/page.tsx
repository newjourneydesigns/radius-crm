"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import ChatPanel from "@/components/ChatPanel";
import ConfirmBanner from "@/components/ConfirmBanner";
import GameLog from "@/components/GameLog";
import ScoreBoard from "@/components/ScoreBoard";
import Toolbar from "@/components/Toolbar";
import WinnerScreen from "@/components/WinnerScreen";
import { useGame } from "@/hooks/useGame";
import { newId } from "@/lib/engine";
import {
  createGame,
  getPhotoMap,
  isFavorite,
  toggleFavorite,
  upsertRosterNames,
} from "@/lib/store";
import { isSupabaseConfigured } from "@/lib/supabase";
import { currentUserId, shareGame } from "@/lib/sync";

export default function GamePage({ params }: { params: { id: string } }) {
  const router = useRouter();
  const {
    game,
    state,
    thinking,
    suggestions,
    timerRequest,
    setSharedId,
    send,
    append,
    say,
    undo,
    redo,
    canUndo,
    canRedo,
    applyActions,
    pendingProposals,
    confirmProposals,
    dismissProposals,
  } = useGame(params.id);
  const [fav, setFav] = useState(false);
  const [showWinner, setShowWinner] = useState(false);
  const [photoMap, setPhotoMap] = useState<Map<string, string>>(new Map());

  useEffect(() => {
    setPhotoMap(getPhotoMap());
  }, []);

  useEffect(() => {
    if (state) setFav(isFavorite(state.definition.name));
  }, [state]);

  const finished = state?.finished ?? false;
  const sawLivePlay = useRef(false);
  useEffect(() => {
    // Celebrate the moment the game ends at this table — but don't ambush
    // someone who's just revisiting an already-finished game.
    if (!state) return;
    if (!finished) {
      sawLivePlay.current = true;
    } else if (sawLivePlay.current) {
      setShowWinner(true);
    }
  }, [finished, state]);

  if (game === undefined) {
    return <p className="py-12 text-center text-ink-dim">Setting the table…</p>;
  }
  if (game === null || !state) {
    return (
      <div className="py-12 text-center text-ink-dim">
        <p>That game isn&rsquo;t on this device.</p>
        <Link href="/" className="mt-2 inline-block text-gold underline">
          Start a new one
        </Link>
      </div>
    );
  }

  const trackTurns = game.events.some((e) => e.type === "turn_advanced");
  const target = state.definition.scoring.targetScore;
  const targetPlayer = state.players.find((p) => p.id === state.targetReachedBy);
  const winners = state.players.filter((p) => state.winnerIds.includes(p.id));

  const invite = async () => {
    if (!game || !state) return;
    if (!isSupabaseConfigured()) {
      say(
        "assistant",
        "Shared tables aren't switched on in this build yet — the Account page has the two-minute setup. Everything else keeps working right here."
      );
      return;
    }
    if (!(await currentUserId())) {
      say("assistant", "Sign in on the Account page first, then invite the table.");
      router.push("/account");
      return;
    }
    try {
      let sid = game.sharedId;
      if (!sid) {
        sid = await shareGame(game.events);
        setSharedId(sid);
      }
      const url = `${window.location.origin}/join/${sid}`;
      try {
        await navigator.clipboard.writeText(url);
      } catch {
        /* clipboard can be unavailable; the link is in the chat below */
      }
      if (navigator.share) {
        try {
          await navigator.share({
            text: `Join our ${state.definition.name} table — score along live: ${url}`,
          });
        } catch {
          /* user closed the sheet */
        }
      }
      say(
        "assistant",
        `Table's open! Anyone with this link scores with us live:\n${url}`
      );
    } catch {
      say(
        "assistant",
        "Couldn't open the shared table just now — check your connection and try again."
      );
    }
  };

  const rematch = () => {
    const id = newId();
    upsertRosterNames(state.players.map((p) => p.name));
    createGame(
      id,
      [
        {
          type: "game_created",
          id: newId(),
          ts: Date.now(),
          source: "manual",
          definition: state.definition,
          players: state.players.map(({ id: pid, name, teamId }) => ({
            id: pid,
            name,
            teamId,
          })),
        },
      ],
      [
        {
          role: "assistant",
          text: `Rematch! ${state.definition.name}, scores wiped clean. Make it count.`,
          ts: Date.now(),
        },
      ]
    );
    router.push(`/game/${id}`);
  };

  return (
    <div className="flex flex-1 flex-col gap-3">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h1 className="font-display text-2xl font-bold leading-tight">
            {state.definition.name}
          </h1>
          <p className="text-sm text-ink-dim">
            Round {state.round}
            {state.definition.scoring.rounds
              ? ` of ${state.definition.scoring.rounds}`
              : ""}
            {target != null && (
              <>
                {" "}
                · playing to <span className="tabular">{target}</span>
              </>
            )}
            {state.definition.scoring.direction === "lowest_wins" &&
              " · lowest wins"}
          </p>
        </div>
        <button
          type="button"
          aria-pressed={fav}
          aria-label={fav ? "Remove from favorites" : "Save as favorite"}
          title={fav ? "Remove from favorites" : "Save as favorite"}
          onClick={() =>
            setFav(
              toggleFavorite({ definition: state.definition, savedAt: Date.now() })
            )
          }
          className={`text-2xl ${fav ? "text-gold" : "text-ink-dim hover:text-gold"}`}
        >
          {fav ? "★" : "☆"}
        </button>
      </div>

      {state.finished ? (
        <div className="animate-deal-in rounded-xl border border-gold/60 bg-felt-3 p-4 text-center">
          <p className="font-display text-xl font-bold text-gold">
            🏆 {winners.map((w) => w.name).join(" & ") || "Nobody"} take
            {winners.length === 1 || winners.length === 0 ? "s" : ""} it!
          </p>
          <div className="mt-3 flex justify-center gap-2">
            <button
              type="button"
              onClick={() => setShowWinner(true)}
              className="rounded-full bg-gold px-5 py-2 font-display font-bold text-felt"
            >
              🎉 Winner screen
            </button>
            <button
              type="button"
              onClick={rematch}
              className="rounded-full border border-gold/60 px-5 py-2 font-display font-bold text-gold"
            >
              Rematch
            </button>
          </div>
        </div>
      ) : targetPlayer ? (
        <div className="animate-deal-in rounded-xl border border-gold/60 bg-felt-3 p-3 text-center text-sm">
          <span className="font-bold text-gold">{targetPlayer.name}</span> hit{" "}
          {target} —{" "}
          <button
            type="button"
            onClick={() => {
              // Highest-wins: reaching the target wins. Lowest-wins: reaching
              // the ceiling ENDS the game, and the lowest score takes it.
              const winnerIds =
                state.definition.scoring.direction === "lowest_wins"
                  ? state.leaderIds
                  : [targetPlayer.id];
              const names = state.players
                .filter((p) => winnerIds.includes(p.id))
                .map((p) => p.name)
                .join(" & ");
              append({ type: "game_finished", winnerIds, source: "manual" });
              say(
                "assistant",
                `🏆 ${names} take${winnerIds.length > 1 ? "" : "s"} ${state.definition.name}! Great game — rematch, anyone?`
              );
            }}
            className="font-bold text-gold underline"
          >
            call the game?
          </button>
        </div>
      ) : null}

      <ScoreBoard
        state={state}
        trackTurns={trackTurns}
        photoMap={photoMap}
        onAdjust={(playerId, delta) =>
          append({ type: "score_adjusted", playerId, delta, source: "manual" })
        }
      />

      <Toolbar
        finished={state.finished}
        canUndo={canUndo}
        canRedo={canRedo}
        onUndo={() => undo()}
        onRedo={() => redo()}
        onNextRound={() =>
          append({ type: "round_started", round: state.round + 1, source: "manual" })
        }
        onNextTurn={() => append({ type: "turn_advanced", source: "manual" })}
        onRoll={() => {
          const extra = applyActions([{ kind: "roll_dice", spec: "2d6" }], "manual");
          extra.forEach((t) => say("assistant", t));
        }}
        onFlip={() => {
          const extra = applyActions([{ kind: "flip_coin" }], "manual");
          extra.forEach((t) => say("assistant", t));
        }}
        onPick={() => {
          const extra = applyActions([{ kind: "pick_player" }], "manual");
          extra.forEach((t) => say("assistant", t));
        }}
        onInvite={invite}
        timerRequest={timerRequest}
      />

      <ConfirmBanner
        proposals={pendingProposals}
        onConfirm={confirmProposals}
        onDismiss={dismissProposals}
      />

      <ChatPanel
        messages={game.messages}
        thinking={thinking}
        onSend={(text, source, image) => send(text, source, image)}
        allowPhoto
        placeholder='Try “Erin gets 12” or “how do ties work?”'
        micSize="md"
        listHeightClass="max-h-[38dvh] min-h-[9rem]"
        suggestions={suggestions}
      />

      <GameLog state={state} />

      {showWinner && state.finished && (
        <WinnerScreen
          state={state}
          photoMap={photoMap}
          durationMs={Math.max(
            0,
            (game.events[game.events.length - 1]?.ts ?? 0) -
              (game.events[0]?.ts ?? 0)
          )}
          onRematch={rematch}
          onClose={() => setShowWinner(false)}
        />
      )}
    </div>
  );
}
