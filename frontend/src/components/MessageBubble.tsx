import { useState } from "react";
import type { ChatMessage, Source } from "../api";
import { Spinner } from "./DocumentSidebar";

const CITATION = /(\[[^\]\n]+?,\s*p\.\s*\d+(?:\s*[-–]\s*\d+)?\])/g;

function withCitations(text: string) {
  return text.split(CITATION).map((part, i) =>
    i % 2 === 1 ? (
      <span key={i} className="rounded bg-blue-50 px-1 text-xs font-medium whitespace-nowrap text-blue-800">
        {part}
      </span>
    ) : (
      part
    ),
  );
}

export default function MessageBubble({ message, pending }: { message: ChatMessage; pending: boolean }) {
  if (message.role === "user") {
    return (
      <div className="flex justify-end">
        <p className="max-w-[85%] rounded-2xl rounded-br-sm bg-slate-900 px-4 py-2.5 text-sm whitespace-pre-wrap text-white">
          {message.content}
        </p>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-2">
      <div className="max-w-[95%] rounded-2xl rounded-bl-sm border border-slate-200 bg-white px-4 py-3 text-sm leading-relaxed whitespace-pre-wrap">
        {message.content ? (
          withCitations(message.content)
        ) : pending ? (
          <span className="flex items-center gap-2 text-slate-500">
            <Spinner /> Searching documents…
          </span>
        ) : null}
        {pending && message.content && <span className="ml-0.5 inline-block h-4 w-1.5 animate-pulse bg-slate-400 align-middle" />}
      </div>
      {message.sources.length > 0 && <SourceList sources={message.sources} />}
    </div>
  );
}

function SourceList({ sources }: { sources: Source[] }) {
  const [open, setOpen] = useState<number | null>(null);
  return (
    <div className="flex flex-col gap-1.5">
      <div className="flex flex-wrap gap-1.5">
        <span className="py-1 text-xs text-slate-500">Sources:</span>
        {sources.map((s, i) => (
          <button
            key={i}
            onClick={() => setOpen(open === i ? null : i)}
            aria-expanded={open === i}
            className={`max-w-full truncate rounded-full border px-2.5 py-1 text-xs ${
              open === i ? "border-blue-400 bg-blue-50 text-blue-900" : "border-slate-200 bg-white text-slate-700 hover:border-slate-400"
            }`}
          >
            {s.document} · p. {s.page} · {Math.round(s.score * 100)}%
          </button>
        ))}
      </div>
      {open !== null && (
        <blockquote className="rounded-md border-l-4 border-blue-300 bg-white px-3 py-2 text-xs leading-relaxed text-slate-700">
          <p className="mb-1 font-medium text-slate-900">
            {sources[open].document}, page {sources[open].page}{" "}
            <span className="font-normal text-slate-500">(similarity {sources[open].score.toFixed(2)})</span>
          </p>
          {sources[open].text}
        </blockquote>
      )}
    </div>
  );
}
