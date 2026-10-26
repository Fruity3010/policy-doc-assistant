import { useCallback, useEffect, useRef, useState } from "react";
import { api, ApiError, type ChatMessage, type DocumentInfo, type Health } from "./api";
import DocumentSidebar from "./components/DocumentSidebar";
import ChatPanel from "./components/ChatPanel";
import { AlertIcon, DocIcon, MenuIcon, PlusIcon } from "./components/icons";

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
    <div className="flex h-dvh flex-col bg-gray-50">
      <header className="flex h-14 shrink-0 items-center gap-3 bg-chrome px-4 text-white sm:px-6">
        <button
          type="button"
          onClick={() => setSidebarOpen((o) => !o)}
          aria-expanded={sidebarOpen}
          aria-label="Toggle documents"
          className="grid h-9 w-9 place-items-center rounded-lg text-white/70 hover:bg-white/10 md:hidden"
        >
          <MenuIcon className="h-5 w-5" />
        </button>
        <div className="flex items-center gap-2">
          <span className="grid h-7 w-7 place-items-center rounded-md bg-brand-500">
            <DocIcon className="h-4 w-4" />
          </span>
          <span className="text-base font-bold">Policy Docs</span>
        </div>
        <nav aria-label="Breadcrumb" className="ml-6 hidden items-center gap-2 text-sm lg:flex">
          <span className="text-white/50">Workspace</span>
          <span className="text-white/30">/</span>
          <span className="font-medium text-white">Document Q&amp;A</span>
        </nav>

        <div className="ml-auto flex items-center gap-4">
          <ProviderStatus health={health} />
          <span className="hidden h-6 w-px bg-white/15 sm:block" />
          <button
            type="button"
            onClick={newChat}
            className="flex items-center gap-1.5 rounded-lg bg-white/10 px-3 py-2 text-sm font-medium text-white ring-1 ring-white/10 transition hover:bg-white/15"
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
          health={health}
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
  const styles = tone === "amber" ? "border-amber-200 bg-amber-50 text-amber-800" : "border-red-200 bg-red-50 text-red-700";
  return (
    <div role="alert" className={`flex items-start gap-2 border-b px-4 py-2.5 text-sm sm:px-6 ${styles}`}>
      <AlertIcon className="mt-0.5 h-4 w-4 shrink-0" />
      <span>{children}</span>
    </div>
  );
}

function ProviderStatus({ health }: { health: Health | null }) {
  const ok = health?.status === "ok";
  const dot = !health ? "bg-red-500" : ok ? "bg-brand-500" : "bg-amber-400";
  const label = !health ? "API offline" : ok ? health.provider : `${health.provider} not configured`;
  return (
    <div
      className="flex items-center gap-2 text-sm"
      title={ok ? `Chat: ${health?.chat_model}\nEmbeddings: ${health?.embedding_model}` : (health?.error ?? "Can't reach the API")}
    >
      <span className={`h-2 w-2 rounded-full ring-2 ring-white/20 ${dot}`} />
      <span className="font-medium capitalize">{label}</span>
      {ok && <span className="hidden text-white/50 md:inline">{health?.chat_model}</span>}
    </div>
  );
}
