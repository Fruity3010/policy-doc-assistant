import { useEffect, useRef, useState, type CSSProperties, type FormEvent } from "react";
import type { ChatMessage } from "../api";
import MessageBubble from "./MessageBubble";
import { AlertIcon, CloseIcon, SendIcon } from "./icons";
import { dashed, micro, panel } from "./tokens";

const EXAMPLES = [
  { title: "Trends", question: "What are the main cybercrime trends described?" },
  { title: "Recommendations", question: "Summarise the key recommendations." },
  { title: "Regions", question: "Which regions are most affected?" },
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
      <div className="flex-1 overflow-y-auto px-4 py-6 sm:px-8">
        <div className="mx-auto flex max-w-3xl flex-col gap-6">
          {messages.length === 0 ? (
            <div className="mx-auto mt-4 w-full max-w-2xl sm:mt-12">
              <p className={`blur-in ${micro}`}>Grounded answers · page citations</p>
              <h1 className="blur-in mt-3 text-3xl font-bold tracking-tight text-neutral-900 sm:text-4xl" style={{ "--d": "0.08s" } as CSSProperties}>
                Ask your <span className="text-accent">documents</span>.
              </h1>
              <p className="blur-in mt-3 max-w-lg text-[15px] text-neutral-500" style={{ "--d": "0.16s" } as CSSProperties}>
                {hasDocuments
                  ? "Every answer comes only from your uploaded PDFs and cites the page it came from. If it isn't in the documents, it says so."
                  : "Upload a PDF report in the library to get started. Answers will come only from your documents, with page citations."}
              </p>
              {hasDocuments && (
                <div className="mt-8 grid gap-3 sm:grid-cols-3">
                  {EXAMPLES.map((ex, i) => (
                    <button
                      key={ex.title}
                      type="button"
                      onClick={() => onAsk(ex.question)}
                      disabled={streaming}
                      style={{ "--d": `${0.24 + i * 0.08}s` } as CSSProperties}
                      className={`blur-in group ${panel} p-4 text-left transition hover:-translate-y-0.5 hover:border-accent/40 hover:shadow-md hover:shadow-neutral-200 disabled:opacity-50`}
                    >
                      <p className={micro}>
                        <span className="tabular-nums">0{i + 1}</span> · {ex.title}
                      </p>
                      <p className={`my-3 ${dashed}`} />
                      <p className="text-sm text-neutral-700 group-hover:text-neutral-900">{ex.question}</p>
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

      <div className="px-4 pb-4 sm:px-8">
        <div className="mx-auto max-w-3xl">
          {error && (
            <div
              role="alert"
              className="rise mb-3 flex items-start gap-2 rounded-lg border border-red-200 bg-red-50 px-3.5 py-2.5 text-sm text-red-800"
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
            className="flex items-end gap-2 rounded-xl border border-neutral-200 bg-white p-2 shadow-sm transition focus-within:border-accent/50 focus-within:ring-4 focus-within:ring-accent/10"
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
              className="max-h-40 flex-1 resize-none bg-transparent px-2.5 py-2 text-[15px] text-neutral-900 outline-none placeholder:text-neutral-400"
            />
            <button
              type="submit"
              disabled={streaming || !input.trim()}
              aria-label="Send"
              className="grid h-10 w-10 shrink-0 place-items-center rounded-lg bg-accent text-white transition hover:brightness-110 disabled:bg-neutral-100 disabled:text-neutral-400"
            >
              <SendIcon className="h-5 w-5" />
            </button>
          </form>
          <p className={`mt-2.5 hidden text-center sm:block ${micro}`}>
            Enter to send · Shift + Enter for new line · Check citations before relying on an answer
          </p>
        </div>
      </div>
    </main>
  );
}
