import { useCallback, useEffect, useRef, useState } from "react";
import { api, ApiError, type ChatMessage, type DocumentInfo, type Health } from "./api";
import DocumentSidebar from "./components/DocumentSidebar";
import ChatPanel from "./components/ChatPanel";

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
    <div className="flex h-dvh flex-col bg-slate-50 text-slate-900">
      <header className="flex items-center gap-3 border-b border-slate-200 bg-white px-4 py-3">
        <button
          className="rounded-md border border-slate-200 px-2 py-1 text-sm whitespace-nowrap md:hidden"
          onClick={() => setSidebarOpen((o) => !o)}
          aria-expanded={sidebarOpen}
        >
          Documents ({documents.length})
        </button>
        <h1 className="truncate text-base font-semibold sm:text-lg">Policy Document Assistant</h1>
        <div className="ml-auto flex items-center gap-2">
          <ProviderBadge health={health} />
          <button
            onClick={newChat}
            className="rounded-md bg-slate-900 px-3 py-1.5 text-sm font-medium whitespace-nowrap text-white hover:bg-slate-700"
          >
            New chat
          </button>
        </div>
      </header>

      {health?.index_warning && (
        <div className="border-b border-amber-200 bg-amber-50 px-4 py-2 text-sm text-amber-900">{health.index_warning}</div>
      )}
      {health?.error && (
        <div className="border-b border-red-200 bg-red-50 px-4 py-2 text-sm text-red-800">{health.error}</div>
      )}

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

function ProviderBadge({ health }: { health: Health | null }) {
  if (!health) {
    return <span className="rounded-full bg-red-100 px-2.5 py-1 text-xs font-medium text-red-800">API offline</span>;
  }
  const ok = health.status === "ok";
  return (
    <span
      title={ok ? `Chat: ${health.chat_model}\nEmbeddings: ${health.embedding_model}` : (health.error ?? "")}
      className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-medium ${
        ok ? "bg-emerald-100 text-emerald-800" : "bg-amber-100 text-amber-900"
      }`}
    >
      <span className={`h-1.5 w-1.5 rounded-full ${ok ? "bg-emerald-500" : "bg-amber-500"}`} />
      {health.provider}
      <span className="hidden font-normal sm:inline">· {health.chat_model ?? "not configured"}</span>
    </span>
  );
}
