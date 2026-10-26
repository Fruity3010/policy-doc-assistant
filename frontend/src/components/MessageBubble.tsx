import { useState } from "react";
import type { ChatMessage, Source } from "../api";
import Answer from "./Answer";
import { DocIcon, SparkIcon, TypingDots } from "./icons";

export default function MessageBubble({ message, pending }: { message: ChatMessage; pending: boolean }) {
  const [open, setOpen] = useState<number | null>(null);

  if (message.role === "user") {
    return (
      <div className="flex justify-end">
        <p className="max-w-[85%] rounded-2xl rounded-br-md bg-indigo-600 px-4 py-2.5 text-[15px] leading-relaxed whitespace-pre-wrap text-white shadow-sm shadow-indigo-600/20">
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
    <div className="flex gap-3">
      <div className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-gradient-to-br from-indigo-500 to-violet-500 text-white shadow-sm">
        <SparkIcon className="h-4 w-4" />
      </div>
      <div className="min-w-0 flex-1 space-y-3">
        <div className="rounded-2xl rounded-tl-md border border-slate-200/80 bg-white px-4 py-3 text-[15px] leading-relaxed text-slate-700 shadow-sm">
          {message.content ? (
            <>
              <Answer text={message.content} onCite={openPage} />
              {pending && <span className="ml-0.5 inline-block h-4 w-1.5 animate-pulse rounded-sm bg-indigo-400 align-middle" />}
            </>
          ) : pending ? (
            <div className="flex items-center gap-3 py-0.5 text-sm text-slate-500">
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
    <div className="space-y-2">
      <div className="flex flex-wrap items-center gap-1.5">
        <span className="mr-1 text-xs font-medium tracking-wide text-slate-400 uppercase">Sources</span>
        {sources.map((s, i) => (
          <button
            key={i}
            type="button"
            onClick={() => setOpen(open === i ? null : i)}
            aria-expanded={open === i}
            className={`inline-flex max-w-full items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs transition ${
              open === i
                ? "border-indigo-300 bg-indigo-50 text-indigo-800"
                : "border-slate-200 bg-white text-slate-600 hover:border-indigo-200 hover:text-slate-900"
            }`}
          >
            <DocIcon className="h-3.5 w-3.5 shrink-0 text-slate-400" />
            <span className="truncate">{s.document}</span>
            <span className="font-semibold">p. {s.page}</span>
          </button>
        ))}
      </div>
      {active && (
        <div className="overflow-hidden rounded-xl border border-indigo-100 bg-white shadow-sm">
          <div className="flex items-center justify-between gap-3 border-b border-indigo-50 bg-indigo-50/60 px-3.5 py-2">
            <p className="flex min-w-0 items-center gap-1.5 text-xs font-medium text-indigo-900">
              <DocIcon className="h-3.5 w-3.5 shrink-0" />
              <span className="truncate">{active.document}</span>
              <span className="shrink-0">· page {active.page}</span>
            </p>
            <Relevance score={active.score} />
          </div>
          <p className="px-3.5 py-3 text-[13px] leading-relaxed text-slate-600">{active.text}</p>
        </div>
      )}
    </div>
  );
}

function Relevance({ score }: { score: number }) {
  const pct = Math.max(0, Math.min(100, Math.round(score * 100)));
  return (
    <span className="flex shrink-0 items-center gap-2 text-[11px] text-slate-500" title="Cosine similarity to the question">
      <span className="h-1.5 w-14 overflow-hidden rounded-full bg-slate-200">
        <span className="block h-full rounded-full bg-indigo-500" style={{ width: `${pct}%` }} />
      </span>
      {pct}% match
    </span>
  );
}
