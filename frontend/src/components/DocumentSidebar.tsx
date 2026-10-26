import { useRef, useState, type DragEvent } from "react";
import type { DocumentInfo, Health } from "../api";
import { AlertIcon, CloudUploadIcon, Spinner, TrashIcon } from "./icons";

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

const label = "text-xs font-medium text-white/50";

function Dot() {
  return <span className="mx-1.5 inline-block h-1 w-1 rounded-full bg-white/30 align-middle" />;
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

  const browse = () => {
    if (!uploading) inputRef.current?.click();
  };

  return (
    <aside
      className={`${className} max-h-[65dvh] w-full shrink-0 flex-col bg-sidebar text-white md:max-h-none md:w-80`}
    >
      <div className="flex min-h-0 flex-1 flex-col gap-7 overflow-y-auto px-5 py-6">
        <section>
          <p className={`mb-2.5 ${label}`}>Upload</p>
          <div
            onDragOver={(e) => {
              e.preventDefault();
              setDragging(true);
            }}
            onDragLeave={() => setDragging(false)}
            onDrop={onDrop}
            className={`rounded-2xl border-[1.5px] border-dashed px-5 py-6 text-center transition ${
              dragging
                ? "border-brand-300 bg-brand-500/10"
                : error
                  ? "border-red-300/60 bg-white/5"
                  : "border-white/20 bg-white/[0.04] hover:border-white/30"
            }`}
          >
            {uploading ? (
              <div className="py-2">
                <span className="mx-auto mb-3 grid h-12 w-12 place-items-center rounded-full bg-white/10 text-brand-300">
                  <Spinner className="h-5 w-5" />
                </span>
                <p className="truncate text-sm font-medium">{uploading}</p>
                <div className="mt-3 h-1.5 overflow-hidden rounded-full bg-white/10">
                  <div className="progress-indeterminate h-full w-2/5 rounded-full bg-brand-500" />
                </div>
                <p className="mt-2 text-xs text-white/55">Reading, chunking and embedding…</p>
              </div>
            ) : (
              <>
                <span
                  className={`mx-auto mb-3 grid h-12 w-12 place-items-center rounded-full ${
                    error ? "bg-red-400/15 text-red-300" : "bg-white/10 text-white/70"
                  }`}
                >
                  {error ? <AlertIcon className="h-5 w-5" /> : <CloudUploadIcon className="h-6 w-6" strokeWidth={2} />}
                </span>
                <p className="text-sm">
                  <button type="button" onClick={browse} className="font-semibold text-brand-300 hover:underline">
                    Click to upload
                  </button>{" "}
                  <span className="text-white/70">or drag and drop</span>
                </p>
                <p className="mt-1 text-xs text-white/45">PDF files only, up to 20 MB</p>

                <div className="my-4 flex items-center gap-3 text-xs font-semibold text-white/40">
                  <span className="h-px flex-1 bg-white/15" />
                  OR
                  <span className="h-px flex-1 bg-white/15" />
                </div>

                <button
                  type="button"
                  onClick={browse}
                  className="w-full rounded-lg bg-white px-4 py-2 text-sm font-semibold text-chrome transition hover:bg-brand-50"
                >
                  Browse files
                </button>
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
            <p role="alert" className="mt-2.5 text-sm text-red-300">
              {error}
            </p>
          )}
        </section>

        <section>
          <p className={`mb-2 ${label}`}>Documents {documents.length > 0 && <span>({documents.length})</span>}</p>

          {loading ? (
            <div className="space-y-2">
              {[0, 1].map((i) => (
                <div key={i} className="h-14 animate-pulse rounded-lg bg-white/10" />
              ))}
            </div>
          ) : documents.length === 0 ? (
            <p className="rounded-lg bg-white/5 px-3 py-3 text-sm text-white/55">No documents uploaded yet.</p>
          ) : (
            <ul className="-mx-2 space-y-0.5">
              {documents.map((doc) => (
                <li
                  key={doc.id}
                  className="group flex items-center gap-3 rounded-lg px-2 py-2.5 transition hover:bg-white/[0.06]"
                >
                  <span className="shrink-0 rounded-l-lg bg-brand-500 px-2 py-2.5 text-[11px] font-bold text-chrome">PDF</span>
                  <div className="min-w-0 flex-1">
                    <p
                      className="truncate text-sm font-semibold text-white"
                      title={`${doc.name}${doc.created_at ? ` · uploaded ${doc.created_at} UTC` : ""}`}
                    >
                      {doc.name}
                    </p>
                    <p className="truncate text-xs text-white/50">
                      {doc.pages} pages
                      <Dot />
                      {doc.chunks} chunks
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={() => onDelete(doc.id)}
                    className="grid h-8 w-8 shrink-0 place-items-center rounded-lg text-white/50 transition hover:bg-red-400/15 hover:text-red-300"
                    aria-label={`Delete ${doc.name}`}
                    title="Delete"
                  >
                    <TrashIcon className="h-[1.125rem] w-[1.125rem]" />
                  </button>
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>

      {health?.status === "ok" && (
        <dl className="hidden shrink-0 space-y-2 border-t border-white/10 px-5 py-4 text-sm md:block">
          <div className="flex items-center justify-between gap-3">
            <dt className="text-white/50">Chat model</dt>
            <dd className="truncate text-white/85">{health.chat_model}</dd>
          </div>
          <div className="flex items-center justify-between gap-3">
            <dt className="text-white/50">Embeddings</dt>
            <dd className="truncate text-white/85">{health.embedding_model}</dd>
          </div>
        </dl>
      )}
    </aside>
  );
}
