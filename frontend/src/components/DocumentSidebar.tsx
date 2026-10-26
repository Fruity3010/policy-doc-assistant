import { useRef, useState, type DragEvent } from "react";
import type { DocumentInfo } from "../api";
import { AlertIcon, CloudUploadIcon, Spinner, TrashIcon } from "./icons";

type Props = {
  className: string;
  documents: DocumentInfo[];
  loading: boolean;
  uploading: string | null;
  error: string | null;
  onUpload: (files: File[]) => void;
  onDelete: (id: string) => void;
};

function Dot() {
  return <span className="mx-1.5 inline-block h-1 w-1 rounded-full bg-gray-300 align-middle" />;
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

  const browse = () => {
    if (!uploading) inputRef.current?.click();
  };

  return (
    <aside
      className={`${className} max-h-[65dvh] w-full shrink-0 flex-col gap-6 overflow-y-auto border-b border-gray-100 bg-gray-25 px-5 py-6 md:max-h-none md:w-80 md:border-r md:border-b-0`}
    >
      <section>
        <p className="mb-2 text-xs font-medium text-gray-400">Upload</p>
        <div
          onDragOver={(e) => {
            e.preventDefault();
            setDragging(true);
          }}
          onDragLeave={() => setDragging(false)}
          onDrop={onDrop}
          className={`rounded-2xl border-[1.5px] border-dashed px-5 py-6 text-center transition ${
            dragging ? "border-brand-700 bg-brand-25" : error ? "border-red-300 bg-white" : "border-[#E4E8EF] bg-white"
          }`}
        >
          {uploading ? (
            <div className="py-2">
              <span className="mx-auto mb-3 grid h-12 w-12 place-items-center rounded-full bg-gray-100 text-brand-500">
                <Spinner className="h-5 w-5" />
              </span>
              <p className="truncate text-sm font-medium text-gray-700">{uploading}</p>
              <div className="mt-3 h-2 overflow-hidden rounded-full bg-gray-100">
                <div className="progress-indeterminate h-full w-2/5 rounded-full bg-brand-700" />
              </div>
              <p className="mt-2 text-xs text-gray-500">Reading, chunking and embedding…</p>
            </div>
          ) : (
            <>
              <span className={`mx-auto mb-3 grid h-12 w-12 place-items-center rounded-full ${error ? "bg-red-50 text-red-500" : "bg-[#F0F2F5] text-gray-400"}`}>
                {error ? <AlertIcon className="h-5 w-5" /> : <CloudUploadIcon className="h-6 w-6" strokeWidth={2.25} />}
              </span>
              <p className="text-sm">
                <button type="button" onClick={browse} className="font-semibold text-brand-500 hover:underline">
                  Click to upload
                </button>{" "}
                <span className="text-gray-600">or drag and drop</span>
              </p>
              <p className="mt-1 text-xs text-gray-400">PDF files only, up to 20 MB</p>

              <div className="my-4 flex items-center gap-3 text-xs font-semibold text-gray-400">
                <span className="h-px flex-1 bg-gray-300" />
                OR
                <span className="h-px flex-1 bg-gray-300" />
              </div>

              <button
                type="button"
                onClick={browse}
                className="w-full rounded-lg border border-gray-300 bg-white px-4 py-2 text-sm font-semibold text-gray-700 shadow-xs transition hover:bg-gray-50"
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
          <p role="alert" className="mt-2 text-sm text-red-600">
            {error}
          </p>
        )}
      </section>

      <section>
        <p className="mb-3 text-xs font-medium text-gray-400">
          Documents {documents.length > 0 && <span>({documents.length})</span>}
        </p>

        {loading ? (
          <div className="space-y-4">
            {[0, 1].map((i) => (
              <div key={i} className="h-11 animate-pulse rounded-lg bg-gray-100" />
            ))}
          </div>
        ) : documents.length === 0 ? (
          <p className="text-sm text-gray-500">No documents uploaded yet.</p>
        ) : (
          <ul className="space-y-4">
            {documents.map((doc) => (
              <li key={doc.id} className="flex items-center gap-3">
                <span className="shrink-0 rounded-l-lg bg-brand-700 px-2 py-3 text-[11px] font-semibold text-white">PDF</span>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-semibold text-gray-700" title={`${doc.name}${doc.created_at ? ` · uploaded ${doc.created_at} UTC` : ""}`}>
                    {doc.name}
                  </p>
                  <p className="truncate text-xs text-gray-400">
                    {doc.pages} pages
                    <Dot />
                    {doc.chunks} chunks
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => onDelete(doc.id)}
                  className="grid h-8 w-8 shrink-0 place-items-center rounded-lg text-gray-600 opacity-80 transition hover:bg-gray-100 hover:text-red-600 hover:opacity-100"
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
    </aside>
  );
}
