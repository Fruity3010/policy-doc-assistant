import type { ReactNode } from "react";

const CITATION = /(\[[^\]\n]+?,\s*pp?\.\s*\d+(?:\s*[-–,]\s*\d+)*\])/g;
const BOLD = /(\*\*[^*]+\*\*)/g;
const ITALIC = /(\*[^*\n]+\*)/g;
const BULLET = /^\s*[-*•]\s+/;
const NUMBERED = /^\s*\d+[.)]\s+/;
const HEADING = /^#{1,4}\s+/;

export function citedPages(citation: string): number[] {
  const pages = citation.slice(citation.search(/pp?\./)).match(/\d+/g) ?? [];
  return pages.map(Number);
}

function citedDocument(citation: string): string {
  return citation.slice(1, citation.search(/,\s*pp?\./)).replace(/\.pdf$/i, "");
}

function citedPageLabel(citation: string): string {
  return citation.slice(citation.search(/,\s*pp?\./), -1);
}

type Props = {
  text: string;
  onCite?: (pages: number[]) => void;
};

export default function Answer({ text, onCite }: Props) {
  const inline = (line: string, key: string): ReactNode[] =>
    line.split(CITATION).flatMap((part, i) => {
      if (i % 2 === 1) {
        return (
          <button
            key={`${key}-c${i}`}
            type="button"
            onClick={() => onCite?.(citedPages(part))}
            title={part.slice(1, -1)}
            className="mx-0.5 inline rounded bg-brand-50 px-1 py-0.5 text-xs font-medium whitespace-nowrap text-brand-700 hover:bg-brand-100"
          >
            <span className="inline-block max-w-[9rem] truncate align-bottom">{citedDocument(part)}</span>
            {citedPageLabel(part)}
          </button>
        );
      }
      return part.split(BOLD).map((seg, j) =>
        j % 2 === 1 ? (
          <strong key={`${key}-b${i}-${j}`} className="font-semibold text-gray-700">
            {seg.slice(2, -2)}
          </strong>
        ) : (
          seg.split(ITALIC).map((plain, k) =>
            k % 2 === 1 ? <em key={`${key}-i${i}-${j}-${k}`}>{plain.slice(1, -1)}</em> : plain,
          )
        ),
      );
    });

  const blocks: ReactNode[] = [];
  let list: { ordered: boolean; items: string[] } | null = null;
  let paragraph: string[] = [];

  const flushParagraph = () => {
    if (paragraph.length) {
      const k = `p${blocks.length}`;
      blocks.push(<p key={k}>{inline(paragraph.join(" "), k)}</p>);
      paragraph = [];
    }
  };
  const flushList = () => {
    if (list) {
      const k = `l${blocks.length}`;
      const items = list.items.map((item, i) => <li key={i}>{inline(item, `${k}-${i}`)}</li>);
      blocks.push(
        list.ordered ? (
          <ol key={k} className="list-decimal space-y-1.5 pl-5 marker:text-gray-400">
            {items}
          </ol>
        ) : (
          <ul key={k} className="list-disc space-y-1.5 pl-5 marker:text-gray-400">
            {items}
          </ul>
        ),
      );
      list = null;
    }
  };

  for (const line of text.split("\n")) {
    const ordered = NUMBERED.test(line);
    if (BULLET.test(line) || ordered) {
      flushParagraph();
      if (!list || list.ordered !== ordered) {
        flushList();
        list = { ordered, items: [] };
      }
      list.items.push(line.replace(ordered ? NUMBERED : BULLET, ""));
    } else if (HEADING.test(line)) {
      flushParagraph();
      flushList();
      const k = `h${blocks.length}`;
      blocks.push(
        <p key={k} className="font-semibold text-gray-700">
          {inline(line.replace(HEADING, ""), k)}
        </p>,
      );
    } else if (!line.trim()) {
      flushParagraph();
      flushList();
    } else if (list) {
      list.items[list.items.length - 1] += ` ${line.trim()}`;
    } else {
      paragraph.push(line.trim());
    }
  }
  flushParagraph();
  flushList();

  return <div className="space-y-3">{blocks}</div>;
}
