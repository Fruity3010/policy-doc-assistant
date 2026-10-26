import { useState } from "react";
import type { ChatMessage, Source } from "../api";
import Answer from "./Answer";
import { DocIcon, SparkIcon, TypingDots } from "./icons";
import { dashed, micro, panel } from "./tokens";

export default function MessageBubble({ message, pending }: { message: ChatMessage; pending: boolean }) {
  const [open, setOpen] = useState<number | null>(null);

  if (message.role === "user") {
    return (
      <div className="rise flex justify-end">
        <p className="max-w-[85%] rounded-2xl rounded-br-md bg-ink px-4 py-2.5 text-[15px] leading-relaxed whitespace-pre-wrap text-white">
          {message.content}
        </p>
      </div>
    );
  }

  function openPage(pages: number[]) {
    const index = message.sources.findIndex((s) => pages.includes(s.page));
    if (index !== -1) setOpen(index);
  }

  return (
    <div className="rise flex gap-3">
      <span className="mt-0.5 grid h-8 w-8 shrink-0 place-items-center rounded-lg bg-accent text-white">
        <SparkIcon className="h-4 w-4" />
      </span>
      <div className={`min-w-0 flex-1 overflow-hidden ${panel}`}>
        <div className="px-4 py-3.5 text-[15px] leading-relaxed text-neutral-700">
          {message.content ? (
            <>
              <Answer text={message.content} onCite={openPage} />
              {pending && <span className="ml-0.5 inline-block h-4 w-1.5 animate-pulse rounded-sm bg-accent align-middle" />}
            </>
          ) : pending ? (
            <div className="flex items-center gap-3 py-0.5 text-sm text-neutral-500">
              <TypingDots /> Searching your documents…
            </div>
          ) : null}
        </div>
        {message.sources.length > 0 && <SourceList sources={message.sources} open={open} setOpen={setOpen} />}
      </div>
    </div>
  );
}

function SourceList({
  sources,
  open,
  setOpen,
}: {
  sources: Source[];
  open: number | null;
  setOpen: (i: number | null) => void;
}) {
  const active = open !== null ? sources[open] : null;
  return (
    <div className="bg-neutral-50 px-4 pt-3 pb-3.5">
      <div className={`-mx-4 -mt-3 mb-3 ${dashed}`} />
      <p className={`mb-2 ${micro}`}>
        Sources <span className="tabular-nums">· {sources.length}</span>
      </p>
      <div className="flex flex-wrap gap-1.5">
        {sources.map((s, i) => (
          <button
            key={i}
            type="button"
            onClick={() => setOpen(open === i ? null : i)}
            aria-expanded={open === i}
            className={`inline-flex max-w-full items-center gap-1.5 rounded-md border px-2 py-1 text-xs transition ${
              open === i
                ? "border-accent bg-accent text-white"
                : "border-neutral-200 bg-white text-neutral-600 hover:border-accent/40 hover:text-neutral-900"
            }`}
          >
            <DocIcon className="h-3.5 w-3.5 shrink-0 opacity-70" />
            <span className="max-w-[12rem] truncate">{s.document}</span>
            <span className="font-semibold tabular-nums">p. {s.page}</span>
          </button>
        ))}
      </div>
      {active && (
        <div className={`rise mt-3 ${panel} p-3.5`}>
          <dl className="grid grid-cols-[minmax(0,1fr)_auto_auto] gap-x-6">
            <div className="min-w-0">
              <dt className={micro}>Document</dt>
              <dd className="mt-1 truncate text-sm font-medium text-neutral-900">{active.document}</dd>
            </div>
            <div>
              <dt className={micro}>Page</dt>
              <dd className="mt-1 text-sm font-medium text-neutral-900 tabular-nums">{active.page}</dd>
            </div>
            <div>
              <dt className={micro}>Match</dt>
              <dd className="mt-1">
                <Relevance score={active.score} />
              </dd>
            </div>
          </dl>
          <div className={`my-3 ${dashed}`} />
          <p className="text-[13px] leading-relaxed text-neutral-600">{active.text}</p>
        </div>
      )}
    </div>
  );
}

function Relevance({ score }: { score: number }) {
  const pct = Math.max(0, Math.min(100, Math.round(score * 100)));
  return (
    <span className="flex items-center gap-2 text-sm font-medium text-neutral-900 tabular-nums" title="Cosine similarity to the question">
      <span className="h-1.5 w-12 overflow-hidden rounded-full bg-neutral-200">
        <span className="block h-full rounded-full bg-accent" style={{ width: `${pct}%` }} />
      </span>
      {pct}%
    </span>
  );
}
