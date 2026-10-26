import { useEffect, useRef, useState, type FormEvent } from "react";
import type { ChatMessage } from "../api";
import MessageBubble from "./MessageBubble";
import { AlertIcon, CloseIcon, SendIcon, SparkIcon } from "./icons";

const EXAMPLES = [
  { title: "Main trends", question: "What are the main cybercrime trends described?" },
  { title: "Recommendations", question: "Summarise the key recommendations." },
  { title: "Regional impact", question: "Which regions are most affected?" },
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
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ block: "end" });
  }, [messages]);

  useEffect(() => {
    const el = textareaRef.current;
    if (el) {
      el.style.height = "auto";
      el.style.height = `${Math.min(el.scrollHeight, 160)}px`;
    }
  }, [input]);

  function submit(e?: FormEvent) {
    e?.preventDefault();
    const question = input.trim();
    if (!question || streaming) return;
    setInput("");
    onAsk(question);
  }

  return (
    <main className="flex min-h-0 min-w-0 flex-1 flex-col">
      <div className="flex-1 overflow-y-auto px-4 py-6 sm:px-6">
        <div className="mx-auto flex max-w-3xl flex-col gap-6">
          {messages.length === 0 ? (
            <div className="mx-auto mt-6 flex max-w-xl flex-col items-center text-center sm:mt-14">
              <div className="mb-5 flex h-14 w-14 items-center justify-center rounded-2xl bg-gradient-to-br from-indigo-500 to-violet-500 text-white shadow-lg shadow-indigo-500/25">
                <SparkIcon className="h-7 w-7" />
              </div>
              <h2 className="text-2xl font-semibold tracking-tight text-slate-900">Ask about your documents</h2>
              <p className="mt-2 text-[15px] text-slate-500">
                {hasDocuments
                  ? "Answers come only from your uploaded PDFs, with a page citation for every fact."
                  : "Upload a PDF report in the library to get started."}
              </p>
              {hasDocuments && (
                <div className="mt-8 grid w-full gap-3 sm:grid-cols-3">
                  {EXAMPLES.map((ex) => (
                    <button
                      key={ex.title}
                      type="button"
                      onClick={() => onAsk(ex.question)}
                      disabled={streaming}
                      className="rounded-xl border border-slate-200 bg-white p-3.5 text-left shadow-sm transition hover:-translate-y-0.5 hover:border-indigo-200 hover:shadow-md disabled:opacity-50"
                    >
                      <p className="text-xs font-semibold text-indigo-600">{ex.title}</p>
                      <p className="mt-1 text-sm text-slate-600">{ex.question}</p>
                    </button>
                  ))}
                </div>
              )}
            </div>
          ) : (
            messages.map((m, i) => <MessageBubble key={i} message={m} pending={streaming && i === messages.length - 1} />)
          )}
          <div ref={bottomRef} />
        </div>
      </div>

      <div className="px-4 pb-4 sm:px-6">
        <div className="mx-auto max-w-3xl">
          {error && (
            <div
              role="alert"
              className="mb-3 flex items-start gap-2 rounded-xl border border-red-100 bg-red-50 px-3.5 py-2.5 text-sm text-red-700"
            >
              <AlertIcon className="mt-0.5 h-4 w-4 shrink-0" />
              <p className="flex-1">{error}</p>
              <button type="button" onClick={onDismissError} aria-label="Dismiss error" className="rounded p-0.5 hover:bg-red-100">
                <CloseIcon className="h-4 w-4" />
              </button>
            </div>
          )}
          <form
            onSubmit={submit}
            className="flex items-end gap-2 rounded-2xl border border-slate-200 bg-white p-2 shadow-lg shadow-slate-200/50 transition focus-within:border-indigo-300 focus-within:ring-4 focus-within:ring-indigo-100"
          >
            <textarea
              ref={textareaRef}
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
              placeholder={hasDocuments ? "Ask about your documents…" : "Upload a document first…"}
              aria-label="Question"
              className="max-h-40 flex-1 resize-none bg-transparent px-2.5 py-2 text-[15px] text-slate-800 outline-none placeholder:text-slate-400"
            />
            <button
              type="submit"
              disabled={streaming || !input.trim()}
              aria-label="Send"
              className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-indigo-600 text-white shadow-sm transition hover:bg-indigo-500 disabled:bg-slate-200 disabled:text-slate-400 disabled:shadow-none"
            >
              <SendIcon className="h-5 w-5" />
            </button>
          </form>
          <p className="mt-2 hidden text-center text-[11px] text-slate-400 sm:block">
            Enter to send · Shift + Enter for a new line · Answers are grounded in your documents and may still contain mistakes
          </p>
        </div>
      </div>
    </main>
  );
}
