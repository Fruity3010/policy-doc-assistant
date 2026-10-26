import { useEffect, useRef, useState, type FormEvent } from "react";
import type { ChatMessage } from "../api";
import MessageBubble from "./MessageBubble";

const EXAMPLES = [
  "What are the main cybercrime trends described?",
  "Summarise the key recommendations.",
  "Which regions are most affected?",
];

type Props = {
  messages: ChatMessage[];
  streaming: boolean;
  error: string | null;
  hasDocuments: boolean;
  onAsk: (question: string) => void;
  onDismissError: () => void;
};

export default function ChatPanel({ messages, streaming, error, hasDocuments, onAsk, onDismissError }: Props) {
  const [input, setInput] = useState("");
  const bottomRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ block: "end" });
  }, [messages]);

  function submit(e?: FormEvent) {
    e?.preventDefault();
    const question = input.trim();
    if (!question || streaming) return;
    setInput("");
    onAsk(question);
  }

  return (
    <main className="flex min-h-0 min-w-0 flex-1 flex-col">
      <div className="flex-1 overflow-y-auto px-4 py-6">
        <div className="mx-auto flex max-w-3xl flex-col gap-5">
          {messages.length === 0 ? (
            <div className="mt-10 text-center">
              <h2 className="text-lg font-semibold">Ask about your documents</h2>
              <p className="mt-1 text-sm text-slate-500">
                {hasDocuments
                  ? "Answers come only from the uploaded PDFs, with page citations."
                  : "Upload a PDF in the sidebar first."}
              </p>
              {hasDocuments && (
                <div className="mt-5 flex flex-wrap justify-center gap-2">
                  {EXAMPLES.map((q) => (
                    <button
                      key={q}
                      onClick={() => onAsk(q)}
                      disabled={streaming}
                      className="rounded-full border border-slate-200 bg-white px-3 py-1.5 text-sm text-slate-700 hover:border-slate-400"
                    >
                      {q}
                    </button>
                  ))}
                </div>
              )}
            </div>
          ) : (
            messages.map((m, i) => (
              <MessageBubble key={i} message={m} pending={streaming && i === messages.length - 1} />
            ))
          )}
          <div ref={bottomRef} />
        </div>
      </div>

      {error && (
        <div className="mx-auto mb-2 flex w-full max-w-3xl items-start gap-2 px-4">
          <p role="alert" className="flex-1 rounded-md bg-red-50 px-3 py-2 text-sm text-red-800">
            {error}
          </p>
          <button onClick={onDismissError} className="px-2 py-2 text-sm text-slate-500 hover:text-slate-800">
            Dismiss
          </button>
        </div>
      )}

      <form onSubmit={submit} className="border-t border-slate-200 bg-white px-4 py-3">
        <div className="mx-auto flex max-w-3xl items-end gap-2">
          <textarea
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey) {
                e.preventDefault();
                submit();
              }
            }}
            rows={1}
            maxLength={2000}
            placeholder="Ask a question about the documents…"
            aria-label="Question"
            className="max-h-40 min-h-[42px] flex-1 resize-none rounded-lg border border-slate-300 px-3 py-2 text-sm outline-none focus:border-slate-500"
          />
          <button
            type="submit"
            disabled={streaming || !input.trim()}
            className="h-[42px] rounded-lg bg-slate-900 px-4 text-sm font-medium text-white hover:bg-slate-700 disabled:opacity-40"
          >
            {streaming ? "Answering…" : "Send"}
          </button>
        </div>
      </form>
    </main>
  );
}
