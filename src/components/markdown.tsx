"use client";

import { memo, useState, type ComponentPropsWithoutRef } from "react";
import ReactMarkdown from "react-markdown";
import rehypeHighlight from "rehype-highlight";
import rehypeKatex from "rehype-katex";
import remarkGfm from "remark-gfm";
import remarkMath from "remark-math";
import { Check, Copy } from "lucide-react";

function CodeBlock({ children, ...props }: ComponentPropsWithoutRef<"pre">) {
  const [copied, setCopied] = useState(false);

  const copy = async (event: React.MouseEvent<HTMLButtonElement>) => {
    const pre = event.currentTarget.parentElement?.querySelector("pre");
    const text = pre?.textContent ?? "";
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      setTimeout(() => setCopied(false), 1600);
    } catch {
      // Peramban menolak akses papan klip; biarkan pengguna menyalin manual.
    }
  };

  return (
    <div className="group relative">
      <pre {...props}>{children}</pre>
      <button
        type="button"
        onClick={copy}
        aria-label="Salin kode"
        className="absolute right-2 top-2 rounded-lg border border-line bg-card/90 p-1.5 text-muted opacity-0 transition hover:text-primary focus:opacity-100 group-hover:opacity-100"
      >
        {copied ? <Check size={14} /> : <Copy size={14} />}
      </button>
    </div>
  );
}

function MarkdownBase({ children }: { children: string }) {
  return (
    <div className="prose-somat">
      <ReactMarkdown
        remarkPlugins={[remarkGfm, remarkMath]}
        rehypePlugins={[
          rehypeKatex,
          [rehypeHighlight, { detect: true, ignoreMissing: true }],
        ]}
        components={{
          pre: CodeBlock,
          a: (props) => <a {...props} target="_blank" rel="noreferrer noopener" />,
          table: (props) => (
            <div className="overflow-x-auto">
              <table {...props} />
            </div>
          ),
        }}
      >
        {children}
      </ReactMarkdown>
    </div>
  );
}

/** Render ulang hanya saat teksnya berubah — penting saat jawaban mengalir. */
export const Markdown = memo(MarkdownBase, (prev, next) => prev.children === next.children);
