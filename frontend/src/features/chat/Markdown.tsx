import type { ComponentPropsWithoutRef } from "react";
import ReactMarkdown, { type Components } from "react-markdown";
import remarkGfm from "remark-gfm";

const ANCHOR_CLASS =
    "underline underline-offset-2 text-ds-accent hover:text-ds-accent-hover transition-colors duration-ds-fast";

const CODE_INLINE_CLASS =
    "font-mono bg-ds-bg-elevated text-ds-fg-primary px-1.5 py-0.5 rounded-ds-sm text-ds-xs border border-ds-border";

const CODE_BLOCK_CLASS =
    "font-mono bg-ds-bg-elevated text-ds-fg-primary p-3 rounded-ds-md overflow-x-auto text-ds-xs leading-relaxed border border-ds-border";

type CodeProps = ComponentPropsWithoutRef<"code"> & { inline?: boolean };

const components: Components = {
    p: ({ children, ...rest }) => (
        <p {...rest} className="mb-2 last:mb-0 leading-[1.55] text-ds-sm text-ds-fg-primary">
            {children}
        </p>
    ),
    a: ({ children, href, ...rest }) => (
        <a {...rest} href={href} target="_blank" rel="noreferrer noopener" className={ANCHOR_CLASS}>
            {children}
        </a>
    ),
    strong: ({ children, ...rest }) => (
        <strong {...rest} className="font-semibold text-ds-fg-primary">
            {children}
        </strong>
    ),
    em: ({ children, ...rest }) => (
        <em {...rest} className="italic text-ds-fg-primary">
            {children}
        </em>
    ),
    ul: ({ children, ...rest }) => (
        <ul
            {...rest}
            className="mb-2 last:mb-0 ml-4 list-disc space-y-1 text-ds-sm marker:text-ds-fg-subtle"
        >
            {children}
        </ul>
    ),
    ol: ({ children, ...rest }) => (
        <ol
            {...rest}
            className="mb-2 last:mb-0 ml-5 list-decimal space-y-1 text-ds-sm marker:text-ds-fg-subtle"
        >
            {children}
        </ol>
    ),
    li: ({ children, ...rest }) => (
        <li {...rest} className="leading-[1.55] text-ds-fg-primary">
            {children}
        </li>
    ),
    h1: ({ children, ...rest }) => (
        <h1
            {...rest}
            className="mb-2 mt-3 first:mt-0 text-ds-lg font-semibold tracking-[-0.01em] text-ds-fg-primary"
        >
            {children}
        </h1>
    ),
    h2: ({ children, ...rest }) => (
        <h2
            {...rest}
            className="mb-2 mt-3 first:mt-0 text-ds-md font-semibold tracking-[-0.01em] text-ds-fg-primary"
        >
            {children}
        </h2>
    ),
    h3: ({ children, ...rest }) => (
        <h3
            {...rest}
            className="mb-1.5 mt-2 first:mt-0 text-ds-sm font-semibold text-ds-fg-primary"
        >
            {children}
        </h3>
    ),
    blockquote: ({ children, ...rest }) => (
        <blockquote
            {...rest}
            className="mb-2 last:mb-0 border-l-2 border-ds-border-strong pl-3 text-ds-fg-muted italic"
        >
            {children}
        </blockquote>
    ),
    hr: () => <hr className="my-3 border-t border-ds-border" />,
    table: ({ children, ...rest }) => (
        <div className="mb-2 last:mb-0 overflow-x-auto rounded-ds-sm border border-ds-border">
            <table {...rest} className="w-full border-collapse text-ds-xs text-ds-fg-primary">
                {children}
            </table>
        </div>
    ),
    thead: ({ children, ...rest }) => (
        <thead {...rest} className="bg-ds-bg-elevated text-left">
            {children}
        </thead>
    ),
    th: ({ children, ...rest }) => (
        <th
            {...rest}
            className="border-b border-ds-border px-2.5 py-1.5 font-medium text-ds-fg-muted"
        >
            {children}
        </th>
    ),
    td: ({ children, ...rest }) => (
        <td {...rest} className="border-b border-ds-border px-2.5 py-1.5 align-top last:border-b-0">
            {children}
        </td>
    ),
    pre: ({ children, ...rest }) => (
        <pre {...rest} className={`mb-2 last:mb-0 ${CODE_BLOCK_CLASS}`}>
            {children}
        </pre>
    ),
    code: (props: CodeProps) => {
        const { inline, className = "", children, ...rest } = props;
        if (inline) {
            return (
                <code {...rest} className={`${CODE_INLINE_CLASS} ${className}`}>
                    {children}
                </code>
            );
        }
        return (
            <code {...rest} className={className}>
                {children}
            </code>
        );
    },
};

export interface MarkdownProps {
    children: string;
}

export function Markdown({ children }: MarkdownProps) {
    return (
        <ReactMarkdown remarkPlugins={[remarkGfm]} components={components}>
            {children}
        </ReactMarkdown>
    );
}
