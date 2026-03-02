'use client';

import ReactMarkdown from 'react-markdown';
import type { Components } from 'react-markdown';
import remarkGfm from 'remark-gfm';

/** Props for the AgentMarkdown component. */
export interface AgentMarkdownProps {
  /** Raw markdown string to render. */
  content: string;
}

/** Custom element renderers styled for the dark chat theme. */
const components: Components = {
  p: ({ children }) => <p className="mb-2 last:mb-0">{children}</p>,
  strong: ({ children }) => (
    <strong className="font-semibold text-slate-100">{children}</strong>
  ),
  em: ({ children }) => <em className="italic text-slate-300">{children}</em>,
  h1: ({ children }) => (
    <h1 className="text-base font-bold text-slate-100 mb-2">{children}</h1>
  ),
  h2: ({ children }) => (
    <h2 className="text-sm font-bold text-slate-100 mb-1">{children}</h2>
  ),
  h3: ({ children }) => (
    <h3 className="text-sm font-semibold text-slate-200 mb-1">{children}</h3>
  ),
  ul: ({ children }) => (
    <ul className="list-disc list-inside ml-1 mb-2 space-y-0.5">{children}</ul>
  ),
  ol: ({ children }) => (
    <ol className="list-decimal list-inside ml-1 mb-2 space-y-0.5">
      {children}
    </ol>
  ),
  li: ({ children }) => <li className="text-slate-200">{children}</li>,
  a: ({ href, children }) => (
    <a
      href={href}
      className="text-indigo-400 hover:text-indigo-300 underline"
      target="_blank"
      rel="noopener noreferrer"
    >
      {children}
    </a>
  ),
  blockquote: ({ children }) => (
    <blockquote className="border-l-2 border-indigo-500/50 pl-3 text-slate-400 mb-2">
      {children}
    </blockquote>
  ),
  table: ({ children }) => (
    <div className="overflow-x-auto mb-2">
      <table className="min-w-full text-xs border-collapse">{children}</table>
    </div>
  ),
  thead: ({ children }) => (
    <thead className="bg-slate-800/60">{children}</thead>
  ),
  tbody: ({ children }) => <tbody>{children}</tbody>,
  tr: ({ children }) => (
    <tr className="border-b border-slate-700/50">{children}</tr>
  ),
  th: ({ children }) => (
    <th className="px-2 py-1 text-left font-semibold text-slate-200">{children}</th>
  ),
  td: ({ children }) => (
    <td className="px-2 py-1 text-slate-300">{children}</td>
  ),
  img: ({ src, alt }) => (
    <img
      src={src}
      alt={alt ?? 'QA Screenshot'}
      className="rounded-lg border border-slate-600 max-w-full my-2"
    />
  ),
  pre: ({ children }) => <>{children}</>,
  code: ({ className, children }) => {
    // Fenced code blocks get a language-* className from react-markdown
    const isBlock = typeof className === 'string' && className.startsWith('language-');
    if (isBlock) {
      return (
        <code className="block bg-slate-900/60 rounded px-3 py-2 text-[11px] font-mono text-slate-300 overflow-x-auto mb-2 whitespace-pre">
          {children}
        </code>
      );
    }
    // Inline code
    return (
      <code className="bg-slate-900/40 text-indigo-300 text-xs font-mono px-1 py-0.5 rounded">
        {children}
      </code>
    );
  },
};

/**
 * Renders markdown content with dark-theme styling for the chat panel.
 * Uses react-markdown with custom component overrides for consistent styling.
 */
export function AgentMarkdown({ content }: AgentMarkdownProps) {
  return <ReactMarkdown remarkPlugins={[remarkGfm]} components={components}>{content}</ReactMarkdown>;
}
