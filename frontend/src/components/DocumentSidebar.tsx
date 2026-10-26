import { useRef, useState, type DragEvent } from "react";
import type { DocumentInfo } from "../api";

type Props = {
  className: string;
  documents: DocumentInfo[];
  loading: boolean;
  uploading: string | null;
  error: string | null;
  onUpload: (files: File[]) => void;
  onDelete: (id: string) => void;
};

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

  return (
    <aside
      className={`${className} max-h-[45dvh] w-full shrink-0 flex-col gap-4 overflow-y-auto border-b border-slate-200 bg-white p-4 md:max-h-none md:w-80 md:border-r md:border-b-0`}
    >
      <div
        role="button"
        tabIndex={0}
        onClick={() => !uploading && inputRef.current?.click()}
        onKeyDown={(e) => (e.key === "Enter" || e.key === " ") && !uploading && inputRef.current?.click()}
        onDragOver={(e) => {
          e.preventDefault();
          setDragging(true);
        }}
        onDragLeave={() => setDragging(false)}
        onDrop={onDrop}
        className={`cursor-pointer rounded-lg border-2 border-dashed p-5 text-center text-sm transition ${
          dragging ? "border-blue-500 bg-blue-50" : "border-slate-300 hover:border-slate-400"
        } ${uploading ? "cursor-wait opacity-70" : ""}`}
      >
        {uploading ? (
          <div className="flex flex-col items-center gap-2 text-slate-600">
            <Spinner />
            <span className="break-all">Indexing {uploading}…</span>
          </div>
        ) : (
          <>
            <p className="font-medium text-slate-700">Drop PDFs here</p>
            <p className="mt-1 text-slate-500">or click to choose files</p>
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

      {error && <p className="rounded-md bg-red-50 px-3 py-2 text-sm text-red-800">{error}</p>}

      <div>
        <h2 className="mb-2 text-xs font-semibold tracking-wide text-slate-500 uppercase">Documents</h2>
        {loading ? (
          <p className="text-sm text-slate-500">Loading…</p>
        ) : documents.length === 0 ? (
          <p className="text-sm text-slate-500">No documents yet. Upload a PDF report to start asking questions.</p>
        ) : (
          <ul className="flex flex-col gap-2">
            {documents.map((doc) => (
              <li key={doc.id} className="group flex items-start gap-2 rounded-md border border-slate-200 p-2.5">
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-medium" title={doc.name}>
                    {doc.name}
                  </p>
                  <p className="text-xs text-slate-500">
                    {doc.pages} pages · {doc.chunks} chunks
                  </p>
                </div>
                <button
                  onClick={() => onDelete(doc.id)}
                  className="rounded px-1.5 py-0.5 text-xs text-slate-400 hover:bg-red-50 hover:text-red-700"
                  aria-label={`Delete ${doc.name}`}
                >
                  Delete
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>
    </aside>
  );
}

export function Spinner() {
  return <span className="inline-block h-4 w-4 animate-spin rounded-full border-2 border-slate-300 border-t-slate-700" />;
}
