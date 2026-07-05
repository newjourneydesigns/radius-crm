"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import ChatPanel from "@/components/ChatPanel";
import { deriveState, newId } from "@/lib/engine";
import { createGame, listFavorites, listGames } from "@/lib/store";
import {
  AiAction,
  ChatMessage,
  FavoriteGame,
  InterpretResponse,
  SetupDraft,
  StoredGame,
} from "@/lib/types";

const GREETING: ChatMessage = {
  role: "assistant",
  text: "What are we playing tonight? Name any game — or make one up and I'll learn it.",
  ts: 0,
};

export default function HomePage() {
  const router = useRouter();
  const [messages, setMessages] = useState<ChatMessage[]>([GREETING]);
  const [draft, setDraft] = useState<SetupDraft | undefined>();
  const [thinking, setThinking] = useState(false);
  const [recent, setRecent] = useState<StoredGame[]>([]);
  const [favorites, setFavorites] = useState<FavoriteGame[]>([]);

  useEffect(() => {
    setRecent(listGames().slice(0, 5));
    setFavorites(listFavorites().slice(0, 6));
  }, []);

  const startGame = (action: Extract<AiAction, { kind: "create_game" }>, history: ChatMessage[]) => {
    const id = newId();
    const players = action.players.map((p) => ({ id: newId(), name: p.name }));
    createGame(
      id,
      [
        {
          type: "game_created",
          id: newId(),
          ts: Date.now(),
          source: "ai",
          definition: action.definition,
          players,
        },
      ],
      history
    );
    router.push(`/game/${id}`);
  };

  const sendMessage = async (text: string, source: "user_text" | "user_voice") => {
    if (thinking) return;
    const history: ChatMessage[] = [...messages, { role: "user", text, ts: Date.now() }];
    setMessages(history);
    setThinking(true);
    try {
      const res = await fetch("/api/interpret", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ phase: "setup", messages: history.slice(-20), draft }),
      });
      if (!res.ok) throw new Error(`Interpreter error ${res.status}`);
      const data = (await res.json()) as InterpretResponse;
      const withReply: ChatMessage[] = [
        ...history,
        { role: "assistant", text: data.reply, ts: Date.now() },
      ];
      setMessages(withReply);
      setDraft(data.draft);
      const create = data.actions.find((a) => a.kind === "create_game");
      if (create && create.kind === "create_game" && create.players.length) {
        startGame(create, withReply);
      }
    } catch {
      setMessages((m) => [
        ...m,
        {
          role: "assistant",
          text: "Hmm, I couldn't hear the table for a second — say that again?",
          ts: Date.now(),
        },
      ]);
    } finally {
      setThinking(false);
    }
  };

  return (
    <div className="flex flex-1 flex-col">
      <section className="pb-2 pt-6 text-center">
        <p className="font-display text-sm font-bold uppercase tracking-[0.25em] text-gold">
          Game night, handled
        </p>
        <h1 className="mt-2 font-display text-4xl font-bold leading-tight sm:text-5xl">
          What are we playing?
        </h1>
        <p className="mx-auto mt-3 max-w-md text-ink-dim">
          Say the game and who&rsquo;s at the table. I&rsquo;ll build the
          scoresheet, keep score, settle rules, and remember who won.
        </p>
      </section>

      {(favorites.length > 0 || recent.length === 0) && (
        <div className="flex flex-wrap justify-center gap-2 py-3">
          {(favorites.length
            ? favorites.map((f) => f.definition.name)
            : ["Catan", "Uno", "Hearts", "our own game"]
          ).map((name) => (
            <button
              key={name}
              type="button"
              onClick={() => sendMessage(`We're playing ${name}`, "user_text")}
              className="rounded-full border felt-line bg-felt-2 px-4 py-1.5 text-sm text-ink-dim hover:border-gold/50 hover:text-gold"
            >
              {favorites.length ? "★ " : ""}
              {name}
            </button>
          ))}
        </div>
      )}

      <ChatPanel
        messages={messages}
        thinking={thinking}
        onSend={(text, source) => sendMessage(text, source)}
        placeholder='“We’re playing Catan with Trip, Erin and Ashlyn”'
      />

      {recent.length > 0 && (
        <section className="mt-6 border-t felt-line pt-4">
          <h2 className="mb-2 font-display text-sm font-bold uppercase tracking-wider text-ink-dim">
            Back to the table
          </h2>
          <ul className="space-y-1.5">
            {recent.map((g) => {
              const st = deriveState(g.events);
              if (!st) return null;
              return (
                <li key={g.id}>
                  <Link
                    href={`/game/${g.id}`}
                    className="flex items-baseline justify-between rounded-lg px-2 py-1.5 hover:bg-felt-2"
                  >
                    <span>
                      {st.definition.name}
                      <span className="ml-2 text-sm text-ink-dim">
                        {st.players.map((p) => p.name).join(", ")}
                      </span>
                    </span>
                    <span className="text-sm text-ink-dim">
                      {st.finished ? "final" : "in play"}
                    </span>
                  </Link>
                </li>
              );
            })}
          </ul>
        </section>
      )}
    </div>
  );
}
