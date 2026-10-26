import { useEffect, useRef, useState, type FormEvent } from "react";
import type { ChatMessage } from "../api";
import MessageBubble from "./MessageBubble";
import { AlertIcon, CloseIcon, SendIcon } from "./icons";

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
      <div className="flex-1 overflow-y-auto px-4 py-6 sm:px-8 sm:py-8">
        <div className="mx-auto flex max-w-3xl flex-col gap-4">
          {messages.length === 0 ? (
            <div className="rounded-xl border border-gray-200 bg-white p-6 sm:p-8">
              <h1 className="text-lg font-semibold text-gray-700">Ask a question</h1>
              <p className="mt-1 text-sm text-gray-500">
                {hasDocuments
                  ? "Answers come only from your uploaded documents, with the page each fact came from. If the answer isn't in them, you'll be told."
                  : "Upload a PDF on the left to get started. Answers will come only from your documents, with page references."}
              </p>
              {hasDocuments && (
                <>
                  <p className="mt-6 mb-2 text-xs font-medium text-gray-400">Try asking</p>
                  <div className="flex flex-col gap-2">
                    {EXAMPLES.map((q) => (
                      <button
                        key={q}
                        type="button"
                        onClick={() => onAsk(q)}
                        disabled={streaming}
                        className="rounded-lg border border-gray-200 px-4 py-2.5 text-left text-sm text-gray-600 transition hover:border-brand-100 hover:bg-brand-25 hover:text-brand-500 disabled:opacity-50"
                      >
                        {q}
                      </button>
                    ))}
                  </div>
                </>
              )}
            </div>
          ) : (
            messages.map((m, i) => <MessageBubble key={i} message={m} pending={streaming && i === messages.length - 1} />)
          )}
          <div ref={bottomRef} />
        </div>
      </div>

      <div className="border-t border-gray-200 bg-white px-4 py-4 sm:px-8">
        <div className="mx-auto max-w-3xl">
          {error && (
            <div role="alert" className="mb-3 flex items-start gap-2.5 rounded-lg border border-red-200 bg-red-50 px-3.5 py-3 text-sm text-red-700">
              <AlertIcon className="mt-0.5 h-4 w-4 shrink-0" />
              <p className="flex-1">{error}</p>
              <button type="button" onClick={onDismissError} aria-label="Dismiss error" className="rounded p-0.5 hover:bg-red-100">
                <CloseIcon className="h-4 w-4" />
              </button>
            </div>
          )}
          <form onSubmit={submit} className="flex items-end gap-3">
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
              placeholder={hasDocuments ? "Ask about your documents" : "Upload a document first"}
              aria-label="Question"
              className="max-h-40 min-h-11 flex-1 resize-none rounded-lg border-[1.5px] border-gray-200 bg-white px-3.5 py-2.5 text-sm text-gray-700 outline-none transition placeholder:text-gray-400 focus:border-brand-500 focus:shadow-[0_0_0_3px_rgba(36,100,241,0.15)]"
            />
            <button
              type="submit"
              disabled={streaming || !input.trim()}
              className="flex h-11 shrink-0 items-center gap-2 rounded-lg bg-brand-500 px-4 text-sm font-semibold text-white transition hover:bg-brand-600 disabled:bg-brand-100 disabled:text-white"
            >
              <SendIcon className="h-4 w-4" />
              <span className="hidden sm:inline">{streaming ? "Answering" : "Send"}</span>
            </button>
          </form>
        </div>
      </div>
    </main>
  );
}
