const BASE_URL = (import.meta.env.VITE_API_URL ?? "http://localhost:8000").replace(/\/$/, "");

export type DocumentInfo = {
  id: string;
  name: string;
  pages: number;
  chunks: number;
  created_at?: string | null;
};

export type Source = {
  document: string;
  document_id: string;
  page: number;
  text: string;
  score: number;
};

export type ChatMessage = {
  role: "user" | "assistant";
  content: string;
  sources: Source[];
  created_at?: string;
};

export type Health = {
  status: "ok" | "degraded";
  provider: string;
  chat_model: string | null;
  embedding_model: string | null;
  error: string | null;
  index_warning: string | null;
  documents: number;
};

export type ChatHandlers = {
  onQuestion?: (standalone: string) => void;
  onToken: (text: string) => void;
  onSources: (sources: Source[]) => void;
};

export class ApiError extends Error {
  status: number;
  constructor(message: string, status: number) {
    super(message);
    this.status = status;
  }
}

async function toApiError(res: Response): Promise<ApiError> {
  const body = await res.json().catch(() => null);
  const detail = body?.detail;
  const message =
    typeof detail === "string"
      ? detail
      : Array.isArray(detail)
        ? detail.map((d: { msg: string }) => d.msg).join(", ")
        : `Request failed (${res.status})`;
  return new ApiError(message, res.status);
}

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  let res: Response;
  try {
    res = await fetch(`${BASE_URL}${path}`, init);
  } catch {
    throw new ApiError(`Can't reach the API at ${BASE_URL}. Is the backend running?`, 0);
  }
  if (!res.ok) throw await toApiError(res);
  return (res.status === 204 ? undefined : await res.json()) as T;
}

async function chat(sessionId: string, question: string, handlers: ChatHandlers, signal?: AbortSignal) {
  let res: Response;
  try {
    res = await fetch(`${BASE_URL}/chat`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ session_id: sessionId, question }),
      signal,
    });
  } catch (e) {
    if ((e as Error).name === "AbortError") throw e;
    throw new ApiError(`Can't reach the API at ${BASE_URL}. Is the backend running?`, 0);
  }
  if (!res.ok || !res.body) throw await toApiError(res);

  const reader = res.body.pipeThrough(new TextDecoderStream()).getReader();
  let buffer = "";
  for (;;) {
    const { value, done } = await reader.read();
    if (done) break;
    buffer += value;
    const events = buffer.split("\n\n");
    buffer = events.pop() ?? "";
    for (const raw of events) {
      const event = raw.match(/^event: (.*)$/m)?.[1];
      const data = JSON.parse(raw.match(/^data: (.*)$/m)?.[1] ?? "{}");
      if (event === "question") handlers.onQuestion?.(data.standalone);
      else if (event === "token") handlers.onToken(data.text);
      else if (event === "sources") handlers.onSources(data.sources);
      else if (event === "error") throw new ApiError(data.message, data.status);
    }
  }
}

export const api = {
  health: () => request<Health>("/health"),
  listDocuments: () => request<DocumentInfo[]>("/documents"),
  uploadDocument: (file: File) => {
    const form = new FormData();
    form.append("file", file);
    return request<DocumentInfo>("/documents", { method: "POST", body: form });
  },
  deleteDocument: (id: string) => request<void>(`/documents/${id}`, { method: "DELETE" }),
  getMessages: (sessionId: string) => request<ChatMessage[]>(`/sessions/${encodeURIComponent(sessionId)}/messages`),
  chat,
};
