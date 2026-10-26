import { useRef, useState, type DragEvent } from "react";
import type { DocumentInfo } from "../api";
import { AlertIcon, DocIcon, LibraryIcon, Spinner, TrashIcon, UploadIcon } from "./icons";

type Props = {
  className: string;
  documents: DocumentInfo[];
  loading: boolean;
  uploading: string | null;
  error: string | null;
  onUpload: (files: File[]) => void;
  onDelete: (id: string) => void;
};

function formatDate(value?: string | null) {
  if (!value) return "";
  const date = new Date(value.replace(" ", "T") + "Z");
  return Number.isNaN(date.getTime()) ? "" : date.toLocaleDateString(undefined, { day: "numeric", month: "short" });
}

export default function DocumentSidebar({ className, documents, loading, uploading, error, onUpload, onDelete }: Props) {
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
      className={`${className} max-h-[50dvh] w-full shrink-0 flex-col gap-5 overflow-y-auto border-b border-slate-200/80 bg-white/70 p-4 backdrop-blur md:max-h-none md:w-80 md:border-r md:border-b-0 md:p-5`}
    >
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
        className={`group flex cursor-pointer flex-col items-center rounded-2xl border-2 border-dashed px-4 py-6 text-center transition focus:outline-none focus-visible:ring-2 focus-visible:ring-indigo-400 ${
          dragging
            ? "scale-[1.01] border-indigo-400 bg-indigo-50"
            : "border-slate-200 bg-slate-50/60 hover:border-indigo-300 hover:bg-indigo-50/40"
        } ${uploading ? "cursor-wait" : ""}`}
      >
        {uploading ? (
          <>
            <div className="mb-3 flex h-11 w-11 items-center justify-center rounded-full bg-indigo-100 text-indigo-600">
              <Spinner className="h-5 w-5" />
            </div>
            <p className="text-sm font-medium text-slate-700">Indexing document…</p>
            <p className="mt-1 max-w-full truncate text-xs text-slate-500">{uploading}</p>
            <p className="mt-2 text-[11px] text-slate-400">Chunking and embedding, this can take a minute</p>
          </>
        ) : (
          <>
            <div className="mb-3 flex h-11 w-11 items-center justify-center rounded-full bg-white text-indigo-600 shadow-sm ring-1 ring-slate-200 transition group-hover:scale-105 group-hover:ring-indigo-200">
              <UploadIcon className="h-5 w-5" />
            </div>
            <p className="text-sm font-medium text-slate-700">
              Drop PDFs here or <span className="text-indigo-600">browse</span>
            </p>
            <p className="mt-1 text-xs text-slate-400">Text-based PDFs, up to 20 MB</p>
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
        <div role="alert" className="flex gap-2 rounded-xl border border-red-100 bg-red-50 px-3 py-2.5 text-sm text-red-700">
          <AlertIcon className="mt-0.5 h-4 w-4 shrink-0" />
          <span className="min-w-0 break-words">{error}</span>
        </div>
      )}

      <div>
        <div className="mb-3 flex items-center justify-between">
          <h2 className="flex items-center gap-2 text-xs font-semibold tracking-wider text-slate-500 uppercase">
            <LibraryIcon className="h-4 w-4" /> Library
          </h2>
          {documents.length > 0 && (
            <span className="rounded-full bg-slate-100 px-2 py-0.5 text-[11px] font-medium text-slate-600">{documents.length}</span>
          )}
        </div>

        {loading ? (
          <div className="space-y-2">
            {[0, 1].map((i) => (
              <div key={i} className="h-16 animate-pulse rounded-xl bg-slate-100" />
            ))}
          </div>
        ) : documents.length === 0 ? (
          <div className="rounded-xl border border-slate-100 bg-slate-50/60 px-4 py-5 text-center">
            <p className="text-sm text-slate-600">No documents yet</p>
            <p className="mt-1 text-xs text-slate-400">Upload a report to start asking questions.</p>
          </div>
        ) : (
          <ul className="space-y-2">
            {documents.map((doc) => (
              <li
                key={doc.id}
                className="group flex items-center gap-3 rounded-xl border border-slate-200/80 bg-white p-3 shadow-sm shadow-slate-200/40 transition hover:border-slate-300"
              >
                <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-rose-50 text-rose-500">
                  <DocIcon className="h-5 w-5" />
                </div>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-medium text-slate-800" title={doc.name}>
                    {doc.name}
                  </p>
                  <p className="mt-0.5 truncate text-xs text-slate-500">
                    {doc.pages} pages · {doc.chunks} chunks
                    {formatDate(doc.created_at) && <> · {formatDate(doc.created_at)}</>}
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => onDelete(doc.id)}
                  className="rounded-lg p-1.5 text-slate-400 transition hover:bg-red-50 hover:text-red-600 focus-visible:opacity-100 md:opacity-0 md:group-hover:opacity-100"
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
    </aside>
  );
}
