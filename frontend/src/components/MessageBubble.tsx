import { useState } from "react";
import type { ChatMessage, Source } from "../api";
import Answer from "./Answer";
import { ChevronDownIcon, Spinner } from "./icons";

export default function MessageBubble({ message, pending }: { message: ChatMessage; pending: boolean }) {
  const [open, setOpen] = useState<number | null>(null);

  if (message.role === "user") {
    return (
      <div className="flex justify-end">
        <p className="max-w-[85%] rounded-xl rounded-br-sm border border-brand-100 bg-brand-50 px-4 py-2.5 text-[15px] leading-relaxed whitespace-pre-wrap text-brand-900">
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
    <div className="rounded-xl border border-gray-200 bg-white">
      <div className="px-5 py-4 text-[15px] leading-relaxed text-gray-600">
        {message.content ? (
          <>
            <Answer text={message.content} onCite={openPage} />
            {pending && <span className="ml-0.5 inline-block h-4 w-0.5 animate-pulse bg-gray-400 align-middle" />}
          </>
        ) : pending ? (
          <p className="flex items-center gap-2 text-sm text-gray-500">
            <Spinner className="h-3.5 w-3.5 text-gray-400" /> Searching documents…
          </p>
        ) : null}
      </div>
      {message.sources.length > 0 && <SourceList sources={message.sources} open={open} setOpen={setOpen} />}
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
  return (
    <div className="border-t border-gray-100 px-5 py-3">
      <p className="mb-1 text-xs font-medium text-gray-400">Sources ({sources.length})</p>
      <ul className="divide-y divide-gray-100">
        {sources.map((s, i) => (
          <li key={i}>
            <button
              type="button"
              onClick={() => setOpen(open === i ? null : i)}
              aria-expanded={open === i}
              className="flex w-full items-center gap-3 py-2 text-left text-sm"
            >
              <span className="shrink-0 rounded-l-md bg-brand-700 px-1.5 py-1 text-[10px] font-semibold text-white">PDF</span>
              <span className="min-w-0 flex-1 truncate font-medium text-gray-700">{s.document}</span>
              <span className="shrink-0 text-gray-500">Page {s.page}</span>
              <span className="hidden w-14 shrink-0 text-right text-gray-400 tabular-nums sm:inline" title="Similarity to the question">
                {Math.round(s.score * 100)}%
              </span>
              <ChevronDownIcon className={`h-4 w-4 shrink-0 text-gray-400 transition ${open === i ? "rotate-180" : ""}`} />
            </button>
            {open === i && (
              <p className="mb-3 rounded-lg bg-gray-50 px-3.5 py-3 text-[13px] leading-relaxed text-gray-600">{s.text}</p>
            )}
          </li>
        ))}
      </ul>
    </div>
  );
}
