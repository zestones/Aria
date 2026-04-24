import type { ComponentPropsWithoutRef } from "react";
import ReactMarkdown, { type Components } from "react-markdown";
import remarkGfm from "remark-gfm";

const ANCHOR_CLASS =
    "underline underline-offset-2 text-primary hover:text-primary-hover transition-colors duration-150";

const CODE_INLINE_CLASS =
    "font-mono bg-muted text-foreground px-1.5 py-0.5 rounded-md text-xs border border-border";

const CODE_BLOCK_CLASS =
    "font-mono bg-muted text-foreground p-3 rounded-lg overflow-x-auto text-xs leading-relaxed border border-border";

type CodeProps = ComponentPropsWithoutRef<"code"> & { inline?: boolean };

const components: Components = {
    p: ({ children, ...rest }) => (
        <p {...rest} className="mb-2 last:mb-0 leading-[1.55] text-sm text-foreground">
            {children}
        </p>
    ),
    a: ({ children, href, ...rest }) => (
        <a {...rest} href={href} target="_blank" rel="noreferrer noopener" className={ANCHOR_CLASS}>
            {children}
        </a>
    ),
    strong: ({ children, ...rest }) => (
        <strong {...rest} className="font-semibold text-foreground">
            {children}
        </strong>
    ),
    em: ({ children, ...rest }) => (
        <em {...rest} className="italic text-foreground">
            {children}
        </em>
    ),
    ul: ({ children, ...rest }) => (
        <ul
            {...rest}
            className="mb-2 last:mb-0 ml-4 list-disc space-y-1 text-sm marker:text-text-tertiary"
        >
            {children}
        </ul>
    ),
    ol: ({ children, ...rest }) => (
        <ol
            {...rest}
            className="mb-2 last:mb-0 ml-5 list-decimal space-y-1 text-sm marker:text-text-tertiary"
        >
            {children}
        </ol>
    ),
    li: ({ children, ...rest }) => (
        <li {...rest} className="leading-[1.55] text-foreground">
            {children}
        </li>
    ),
    h1: ({ children, ...rest }) => (
        <h1
            {...rest}
            className="mb-2 mt-3 first:mt-0 text-lg font-semibold tracking-[-0.01em] text-foreground"
        >
            {children}
        </h1>
    ),
    h2: ({ children, ...rest }) => (
        <h2
            {...rest}
            className="mb-2 mt-3 first:mt-0 text-base font-semibold tracking-[-0.01em] text-foreground"
        >
            {children}
        </h2>
    ),
    h3: ({ children, ...rest }) => (
        <h3 {...rest} className="mb-1.5 mt-2 first:mt-0 text-sm font-semibold text-foreground">
            {children}
        </h3>
    ),
    blockquote: ({ children, ...rest }) => (
        <blockquote
            {...rest}
            className="mb-2 last:mb-0 border-l-2 border-input pl-3 text-muted-foreground italic"
        >
            {children}
        </blockquote>
    ),
    hr: () => <hr className="my-3 border-t border-border" />,
    table: ({ children, ...rest }) => (
        <div className="mb-2 last:mb-0 overflow-x-auto rounded-md border border-border">
            <table {...rest} className="w-full border-collapse text-xs text-foreground">
                {children}
            </table>
        </div>
    ),
    thead: ({ children, ...rest }) => (
        <thead {...rest} className="bg-muted text-left">
            {children}
        </thead>
    ),
    th: ({ children, ...rest }) => (
        <th
            {...rest}
            className="border-b border-border px-2.5 py-1.5 font-medium text-muted-foreground"
        >
            {children}
        </th>
    ),
    td: ({ children, ...rest }) => (
        <td {...rest} className="border-b border-border px-2.5 py-1.5 align-top last:border-b-0">
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
