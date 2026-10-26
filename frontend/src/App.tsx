import { useCallback, useEffect, useRef, useState } from "react";
import { api, ApiError, type ChatMessage, type DocumentInfo, type Health } from "./api";
import DocumentSidebar from "./components/DocumentSidebar";
import ChatPanel from "./components/ChatPanel";
import { AlertIcon, DocIcon, PlusIcon } from "./components/icons";

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
    <div className="flex h-dvh flex-col bg-gradient-to-b from-slate-50 to-indigo-50/40 text-slate-900">
      <header className="flex items-center gap-3 border-b border-slate-200/80 bg-white/80 px-4 py-3 backdrop-blur sm:px-5">
        <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-gradient-to-br from-indigo-500 to-violet-500 text-white shadow-md shadow-indigo-500/25">
          <DocIcon className="h-5 w-5" />
        </div>
        <div className="min-w-0">
          <h1 className="truncate text-[15px] font-semibold tracking-tight sm:text-base">Policy Document Assistant</h1>
          <p className="hidden text-xs text-slate-500 sm:block">Grounded answers with page citations</p>
        </div>
        <div className="ml-auto flex items-center gap-2">
          <ProviderBadge health={health} />
          <button
            type="button"
            className="rounded-lg border border-slate-200 bg-white px-2.5 py-1.5 text-sm font-medium whitespace-nowrap text-slate-700 md:hidden"
            onClick={() => setSidebarOpen((o) => !o)}
            aria-expanded={sidebarOpen}
          >
            Library ({documents.length})
          </button>
          <button
            type="button"
            onClick={newChat}
            className="flex items-center gap-1.5 rounded-lg bg-slate-900 px-3 py-1.5 text-sm font-medium whitespace-nowrap text-white shadow-sm transition hover:bg-slate-700"
          >
            <PlusIcon className="h-4 w-4" />
            <span className="hidden sm:inline">New chat</span>
          </button>
        </div>
      </header>

      {health?.index_warning && <Banner tone="amber">{health.index_warning}</Banner>}
      {health?.error && <Banner tone="red">{health.error}</Banner>}

      <div className="flex min-h-0 flex-1 flex-col md:flex-row">
        <DocumentSidebar
          className={sidebarOpen ? "flex" : "hidden md:flex"}
          documents={documents}
          loading={docsLoading}
          uploading={uploading}
          error={docError}
          onUpload={uploadFiles}
          onDelete={deleteDocument}
        />
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
    <div role="alert" className={`flex items-start gap-2 border-b px-4 py-2.5 text-sm sm:px-5 ${styles}`}>
      <AlertIcon className="mt-0.5 h-4 w-4 shrink-0" />
      <span>{children}</span>
    </div>
  );
}

function ProviderBadge({ health }: { health: Health | null }) {
  if (!health) {
    return (
      <span className="inline-flex items-center gap-1.5 rounded-full bg-red-50 px-2.5 py-1 text-xs font-medium text-red-700 ring-1 ring-red-100">
        <span className="h-1.5 w-1.5 rounded-full bg-red-500" />
        API offline
      </span>
    );
  }
  const ok = health.status === "ok";
  return (
    <span
      title={ok ? `Chat: ${health.chat_model}\nEmbeddings: ${health.embedding_model}` : (health.error ?? "")}
      className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-medium ring-1 ${
        ok ? "bg-emerald-50 text-emerald-700 ring-emerald-100" : "bg-amber-50 text-amber-800 ring-amber-100"
      }`}
    >
      <span className="relative flex h-2 w-2">
        {ok && <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-400 opacity-60" />}
        <span className={`relative inline-flex h-2 w-2 rounded-full ${ok ? "bg-emerald-500" : "bg-amber-500"}`} />
      </span>
      <span className="capitalize">{health.provider}</span>
      <span className="hidden font-normal text-current/70 lg:inline">· {health.chat_model ?? "not configured"}</span>
    </span>
  );
}
