import { forwardRef, useCallback, useEffect, useImperativeHandle, useRef, useState } from "react";
import { Icons } from "../../design-system";

export interface ChatInputHandle {
    focus(): void;
}

export interface ChatInputProps {
    onSubmit: (value: string) => void;
    disabled?: boolean;
    placeholder?: string;
}

const MAX_ROWS = 8;
const BASE_ROW_HEIGHT_PX = 20;

function autoResize(el: HTMLTextAreaElement) {
    el.style.height = "auto";
    const capped = Math.min(el.scrollHeight, BASE_ROW_HEIGHT_PX * MAX_ROWS + 24);
    el.style.height = `${capped}px`;
}

export const ChatInput = forwardRef<ChatInputHandle, ChatInputProps>(function ChatInput(
    { onSubmit, disabled = false, placeholder = "Message the operator console…" },
    ref,
) {
    const [value, setValue] = useState("");
    const textareaRef = useRef<HTMLTextAreaElement>(null);

    useImperativeHandle(
        ref,
        () => ({
            focus: () => textareaRef.current?.focus(),
        }),
        [],
    );

    useEffect(() => {
        if (textareaRef.current) autoResize(textareaRef.current);
    }, []);

    const submit = useCallback(() => {
        const trimmed = value.trim();
        if (!trimmed || disabled) return;
        onSubmit(trimmed);
        setValue("");
        requestAnimationFrame(() => {
            if (textareaRef.current) {
                textareaRef.current.style.height = "auto";
                textareaRef.current.focus();
            }
        });
    }, [value, disabled, onSubmit]);

    const onKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
        if (e.key === "Enter" && !e.shiftKey && !e.nativeEvent.isComposing) {
            e.preventDefault();
            submit();
        }
    };

    const canSubmit = value.trim().length > 0 && !disabled;

    return (
        <form
            onSubmit={(e) => {
                e.preventDefault();
                submit();
            }}
            className="border-t border-[var(--ds-border)] bg-[var(--ds-bg-surface)] px-3 py-2"
        >
            <div className="rounded-[var(--ds-radius-md)] border border-[var(--ds-border)] bg-[var(--ds-bg-elevated)] transition-colors duration-[var(--ds-motion-fast)] focus-within:border-[var(--ds-border-strong)] focus-within:ring-2 focus-within:ring-[var(--ds-accent-ring)]">
                <div className="flex items-end gap-2 px-3 pt-2">
                    <textarea
                        ref={textareaRef}
                        value={value}
                        onChange={(e) => {
                            setValue(e.target.value);
                            autoResize(e.target);
                        }}
                        onKeyDown={onKeyDown}
                        placeholder={placeholder}
                        disabled={disabled}
                        rows={1}
                        spellCheck
                        aria-label="Message input"
                        className="min-h-[20px] flex-1 resize-none bg-transparent text-[var(--ds-text-sm)] leading-[1.4] text-[var(--ds-fg-primary)] placeholder:text-[var(--ds-fg-subtle)] focus:outline-none disabled:opacity-50"
                    />
                    <button
                        type="submit"
                        disabled={!canSubmit}
                        aria-label="Send message"
                        className="inline-flex h-7 w-7 flex-none items-center justify-center rounded-[var(--ds-radius-sm)] bg-[var(--ds-accent)] text-[var(--ds-accent-fg)] transition-colors duration-[var(--ds-motion-fast)] hover:bg-[var(--ds-accent-hover)] disabled:cursor-not-allowed disabled:bg-[var(--ds-bg-hover)] disabled:text-[var(--ds-fg-subtle)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--ds-accent-ring)]"
                    >
                        <Icons.ArrowRight className="size-3.5" />
                    </button>
                </div>
                <p className="px-3 pb-1.5 pt-1 text-[var(--ds-text-xs)] text-[var(--ds-fg-subtle)]">
                    Enter to send · Shift + Enter for new line
                </p>
            </div>
        </form>
    );
});
