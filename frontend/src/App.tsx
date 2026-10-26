import { useCallback, useEffect, useRef, useState } from "react";
import { api, ApiError, type ChatMessage, type DocumentInfo, type Health } from "./api";
import DocumentSidebar, { Brand } from "./components/DocumentSidebar";
import ChatPanel from "./components/ChatPanel";
import { AlertIcon, PlusIcon } from "./components/icons";
import { micro } from "./components/tokens";

const SESSION_KEY = "pda-session-id";

function loadSessionId(): string {
  try {
    const saved = localStorage.getItem(SESSION_KEY);
    if (saved) return saved;
  } catch {
    /* storage unavailable */
  }
  return newSessionId();
}

function newSessionId(): string {
  const id = crypto.randomUUID();
  try {
    localStorage.setItem(SESSION_KEY, id);
  } catch {
    /* storage unavailable */
  }
  return id;
}

function errorMessage(e: unknown): string {
  if (e instanceof ApiError && e.status === 429) return `Rate limit reached: ${e.message}`;
  return e instanceof Error ? e.message : "Something went wrong.";
}

export default function App() {
  const [health, setHealth] = useState<Health | null>(null);
  const [documents, setDocuments] = useState<DocumentInfo[]>([]);
  const [docsLoading, setDocsLoading] = useState(true);
  const [uploading, setUploading] = useState<string | null>(null);
  const [docError, setDocError] = useState<string | null>(null);

  const [sessionId, setSessionId] = useState(loadSessionId);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [streaming, setStreaming] = useState(false);
  const [chatError, setChatError] = useState<string | null>(null);
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const abortRef = useRef<AbortController | null>(null);

  const refreshHealth = useCallback(() => {
    api.health().then(setHealth).catch(() => setHealth(null));
  }, []);

  useEffect(() => {
    refreshHealth();
    api
      .listDocuments()
      .then(setDocuments)
      .catch((e) => setDocError(errorMessage(e)))
      .finally(() => setDocsLoading(false));
  }, [refreshHealth]);

  useEffect(() => {
    api
      .getMessages(sessionId)
      .then(setMessages)
      .catch(() => setMessages([]));
  }, [sessionId]);

  async function uploadFiles(files: File[]) {
    setDocError(null);
    for (const [i, file] of files.entries()) {
      setUploading(files.length > 1 ? `${file.name} (${i + 1}/${files.length})` : file.name);
      try {
        const doc = await api.uploadDocument(file);
        setDocuments((prev) => [doc, ...prev]);
      } catch (e) {
        setDocError(`${file.name}: ${errorMessage(e)}`);
        break;
      }
    }
    setUploading(null);
    refreshHealth();
  }

  async function deleteDocument(id: string) {
    setDocError(null);
    try {
      await api.deleteDocument(id);
      setDocuments((prev) => prev.filter((d) => d.id !== id));
      refreshHealth();
    } catch (e) {
      setDocError(errorMessage(e));
    }
  }

  async function ask(question: string) {
    setChatError(null);
    setStreaming(true);
    setMessages((prev) => [
      ...prev,
      { role: "user", content: question, sources: [] },
      { role: "assistant", content: "", sources: [] },
    ]);
    const updateLast = (fn: (m: ChatMessage) => ChatMessage) =>
      setMessages((prev) => [...prev.slice(0, -1), fn(prev[prev.length - 1])]);

    const controller = new AbortController();
    abortRef.current = controller;
    try {
      await api.chat(
        sessionId,
        question,
        {
          onToken: (text) => updateLast((m) => ({ ...m, content: m.content + text })),
          onSources: (sources) => updateLast((m) => ({ ...m, sources })),
        },
        controller.signal,
      );
    } catch (e) {
      if ((e as Error).name !== "AbortError") {
        setChatError(errorMessage(e));
        setMessages((prev) => (prev[prev.length - 1]?.content ? prev : prev.slice(0, -2)));
      }
    } finally {
      setStreaming(false);
      abortRef.current = null;
    }
  }

  function newChat() {
    abortRef.current?.abort();
    setSessionId(newSessionId());
    setMessages([]);
    setChatError(null);
  }

  return (
    <div className="flex h-dvh flex-col bg-canvas text-neutral-900 md:flex-row">
      <header className="flex h-14 shrink-0 items-center gap-2 bg-ink px-4 md:hidden">
        <Brand />
        <div className="ml-auto flex items-center gap-1.5">
          <button
            type="button"
            onClick={() => setSidebarOpen((o) => !o)}
            aria-expanded={sidebarOpen}
            className="rounded-lg px-2.5 py-1.5 text-sm font-medium whitespace-nowrap text-white/80 ring-1 ring-white/20 transition hover:bg-white/10"
          >
            Library <span className="tabular-nums">{documents.length}</span>
          </button>
          <button
            type="button"
            onClick={newChat}
            aria-label="New chat"
            className="grid h-8 w-8 place-items-center rounded-lg bg-white text-ink"
          >
            <PlusIcon className="h-4 w-4" />
          </button>
        </div>
      </header>

      <DocumentSidebar
        className={sidebarOpen ? "flex" : "hidden md:flex"}
        health={health}
        documents={documents}
        loading={docsLoading}
        uploading={uploading}
        error={docError}
        onUpload={uploadFiles}
        onDelete={deleteDocument}
      />

      <div className="flex min-h-0 min-w-0 flex-1 flex-col">
        <div className="hidden h-16 shrink-0 items-center gap-3 border-b border-neutral-200 bg-white/95 px-6 backdrop-blur md:flex">
          <div className="min-w-0">
            <p className={micro}>Workspace</p>
            <p className="truncate text-[0.9375rem] font-semibold tracking-tight">Document Q&amp;A</p>
          </div>
          <div className="ml-auto flex items-center gap-2">
            <StatusChip health={health} />
            <button
              type="button"
              onClick={newChat}
              className="flex items-center gap-2 rounded-lg border border-neutral-200 px-4 py-2 text-sm font-medium text-neutral-900 transition hover:bg-neutral-50"
            >
              <PlusIcon className="h-4 w-4" />
              New chat
            </button>
          </div>
        </div>

        {health?.index_warning && <Banner tone="amber">{health.index_warning}</Banner>}
        {health?.error && <Banner tone="red">{health.error}</Banner>}
        <div className="flex px-4 pt-3 md:hidden">
          <StatusChip health={health} />
        </div>

        <ChatPanel
          messages={messages}
          streaming={streaming}
          error={chatError}
          hasDocuments={documents.length > 0}
          onAsk={ask}
          onDismissError={() => setChatError(null)}
        />
      </div>
    </div>
  );
}

function Banner({ tone, children }: { tone: "amber" | "red"; children: React.ReactNode }) {
  const styles = tone === "amber" ? "border-amber-200 bg-amber-50 text-amber-900" : "border-red-200 bg-red-50 text-red-800";
  return (
    <div role="alert" className={`flex items-start gap-2 border-b px-4 py-2.5 text-sm md:px-6 ${styles}`}>
      <AlertIcon className="mt-0.5 h-4 w-4 shrink-0" />
      <span>{children}</span>
    </div>
  );
}

function StatusChip({ health }: { health: Health | null }) {
  const state = !health
    ? { text: "API offline", chip: "border-red-300 bg-red-50 text-red-900", dot: "bg-red-500" }
    : health.status === "ok"
      ? { text: `${health.provider} · online`, chip: "border-emerald-300 bg-emerald-50 text-emerald-900", dot: "bg-emerald-500" }
      : { text: `${health.provider} · not configured`, chip: "border-amber-300 bg-amber-50 text-amber-900", dot: "bg-amber-500" };
  return (
    <span
      title={health?.status === "ok" ? `Chat: ${health.chat_model}\nEmbeddings: ${health.embedding_model}` : (health?.error ?? "")}
      className={`inline-flex shrink-0 items-center gap-1.5 rounded border px-2 py-1 text-[0.6875rem] font-semibold tracking-wider uppercase ${state.chip}`}
    >
      <span className="relative flex h-1.5 w-1.5">
        {health?.status === "ok" && <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-400 opacity-70" />}
        <span className={`relative inline-flex h-1.5 w-1.5 rounded-full ${state.dot}`} />
      </span>
      {state.text}
    </span>
  );
}
