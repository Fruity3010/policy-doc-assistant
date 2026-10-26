import { useRef, useState, type DragEvent } from "react";
import type { DocumentInfo, Health } from "../api";
import { AlertIcon, DocIcon, SidebarArt, Spinner, TrashIcon, UploadIcon } from "./icons";

type Props = {
  className: string;
  health: Health | null;
  documents: DocumentInfo[];
  loading: boolean;
  uploading: string | null;
  error: string | null;
  onUpload: (files: File[]) => void;
  onDelete: (id: string) => void;
};

const microOnDark = "text-[0.625rem] font-medium uppercase tracking-[0.18em] text-white/45";

function formatDate(value?: string | null) {
  if (!value) return "";
  const date = new Date(value.replace(" ", "T") + "Z");
  return Number.isNaN(date.getTime()) ? "" : date.toLocaleDateString(undefined, { day: "numeric", month: "short" });
}

export function Brand() {
  return (
    <div className="flex items-center gap-2.5">
      <span className="grid h-8 w-8 shrink-0 place-items-center rounded-lg bg-white/10 text-white ring-1 ring-white/15">
        <DocIcon className="h-[1.125rem] w-[1.125rem]" />
      </span>
      <span className="leading-tight">
        <span className="block text-[0.9375rem] font-semibold tracking-tight text-white">Policy Docs</span>
        <span className={`block ${microOnDark}`}>Assistant</span>
      </span>
    </div>
  );
}

export default function DocumentSidebar({ className, health, documents, loading, uploading, error, onUpload, onDelete }: Props) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [dragging, setDragging] = useState(false);

  function handleFiles(list: FileList | null) {
    const files = Array.from(list ?? []);
    if (files.length) onUpload(files);
  }

  function onDrop(e: DragEvent) {
    e.preventDefault();
    setDragging(false);
    if (!uploading) handleFiles(e.dataTransfer.files);
  }

  const browse = () => !uploading && inputRef.current?.click();

  return (
    <aside
      className={`${className} relative max-h-[60dvh] w-full shrink-0 flex-col overflow-hidden bg-ink text-white md:h-dvh md:max-h-none md:w-80`}
    >
      <SidebarArt />

      <div className="relative hidden h-16 shrink-0 items-center border-b border-white/10 px-5 md:flex">
        <Brand />
      </div>

      <div className="relative flex min-h-0 flex-1 flex-col gap-5 overflow-y-auto px-4 py-5">
        <div
          role="button"
          tabIndex={0}
          aria-label="Upload PDF documents"
          onClick={browse}
          onKeyDown={(e) => (e.key === "Enter" || e.key === " ") && browse()}
          onDragOver={(e) => {
            e.preventDefault();
            setDragging(true);
          }}
          onDragLeave={() => setDragging(false)}
          onDrop={onDrop}
          className={`group flex cursor-pointer flex-col items-center rounded-xl border border-dashed px-4 py-5 text-center transition focus:outline-none focus-visible:ring-2 focus-visible:ring-white/40 ${
            dragging ? "border-white/60 bg-white/15" : "border-white/25 bg-white/5 hover:border-white/40 hover:bg-white/10"
          } ${uploading ? "cursor-wait" : ""}`}
        >
          {uploading ? (
            <>
              <span className="mb-2.5 grid h-10 w-10 place-items-center rounded-full bg-white/10">
                <Spinner className="h-5 w-5" />
              </span>
              <p className="text-sm font-medium">Indexing document…</p>
              <p className="mt-1 max-w-full truncate text-xs text-white/60">{uploading}</p>
              <p className={`mt-3 ${microOnDark}`}>Chunk · embed · store</p>
            </>
          ) : (
            <>
              <span className="mb-2.5 grid h-10 w-10 place-items-center rounded-full bg-white text-ink transition group-hover:scale-105">
                <UploadIcon className="h-5 w-5" />
              </span>
              <p className="text-sm font-medium">
                Drop PDFs or <span className="underline decoration-white/40 underline-offset-2">browse</span>
              </p>
              <p className="mt-1 text-xs text-white/50">Text-based PDFs, up to 20 MB</p>
            </>
          )}
          <input
            ref={inputRef}
            type="file"
            accept="application/pdf,.pdf"
            multiple
            hidden
            onChange={(e) => {
              handleFiles(e.target.files);
              e.target.value = "";
            }}
          />
        </div>

        {error && (
          <div role="alert" className="rise flex gap-2 rounded-lg bg-red-600/90 px-3 py-2.5 text-sm text-white">
            <AlertIcon className="mt-0.5 h-4 w-4 shrink-0" />
            <span className="min-w-0 break-words">{error}</span>
          </div>
        )}

        <div>
          <div className="mb-2 flex items-center justify-between px-1">
            <h2 className={microOnDark}>Library</h2>
            <span className="text-xs text-white/50 tabular-nums">{documents.length}</span>
          </div>

          {loading ? (
            <div className="space-y-1.5">
              {[0, 1].map((i) => (
                <div key={i} className="h-14 animate-pulse rounded-lg bg-white/10" />
              ))}
            </div>
          ) : documents.length === 0 ? (
            <p className="rounded-lg border border-white/10 px-3 py-4 text-center text-sm text-white/60">
              No documents yet. Upload a report to begin.
            </p>
          ) : (
            <ul className="space-y-1">
              {documents.map((doc) => (
                <li key={doc.id} className="rise group flex items-center gap-3 rounded-lg px-2 py-2 transition hover:bg-white/10">
                  <span className="grid h-9 w-9 shrink-0 place-items-center rounded-lg bg-white/10 text-white/80">
                    <DocIcon className="h-[1.125rem] w-[1.125rem]" />
                  </span>
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-medium" title={doc.name}>
                      {doc.name}
                    </p>
                    <p className="truncate text-xs text-white/55 tabular-nums">
                      {doc.pages} pp · {doc.chunks} chunks
                      {formatDate(doc.created_at) && <> · {formatDate(doc.created_at)}</>}
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={() => onDelete(doc.id)}
                    className="grid h-8 w-8 shrink-0 place-items-center rounded-lg text-white/50 transition hover:bg-red-500/20 hover:text-red-200 focus-visible:opacity-100 md:opacity-0 md:group-hover:opacity-100"
                    aria-label={`Delete ${doc.name}`}
                    title="Delete"
                  >
                    <TrashIcon className="h-4 w-4" />
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>

      {health?.status === "ok" && (
        <dl className="relative grid shrink-0 grid-cols-2 gap-x-4 gap-y-3 border-t border-white/10 px-5 py-4">
          <div className="min-w-0">
            <dt className={microOnDark}>Chat model</dt>
            <dd className="mt-1 truncate text-xs text-white/85" title={health.chat_model ?? ""}>
              {health.chat_model}
            </dd>
          </div>
          <div className="min-w-0">
            <dt className={microOnDark}>Embeddings</dt>
            <dd className="mt-1 truncate text-xs text-white/85" title={health.embedding_model ?? ""}>
              {health.embedding_model}
            </dd>
          </div>
        </dl>
      )}
    </aside>
  );
}
