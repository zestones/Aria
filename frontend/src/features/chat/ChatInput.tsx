import { forwardRef, useCallback, useEffect, useImperativeHandle, useRef, useState } from "react";
import { Icons } from "../../components/ui";

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

/**
 * Chat composer. Single-row pill at rest — placeholder sits on the same
 * baseline as the send button so the box never feels hollow. The keyboard
 * hint only appears while the textarea is focused (was always-on, which
 * added a useless second line of chrome to the empty state).
 */
export const ChatInput = forwardRef<ChatInputHandle, ChatInputProps>(function ChatInput(
    { onSubmit, disabled = false, placeholder = "Message ARIA…" },
    ref,
) {
    const [value, setValue] = useState("");
    const [focused, setFocused] = useState(false);
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
            className="flex flex-none flex-col gap-1 px-3 pb-3 pt-2"
        >
            <div className="flex items-center gap-2 rounded-cta border border-border bg-muted px-3 py-1.5 transition-colors duration-150 focus-within:border-input focus-within:bg-card focus-within:ring-2 focus-within:ring-ring">
                <textarea
                    ref={textareaRef}
                    value={value}
                    onChange={(e) => {
                        setValue(e.target.value);
                        autoResize(e.target);
                    }}
                    onKeyDown={onKeyDown}
                    onFocus={() => setFocused(true)}
                    onBlur={() => setFocused(false)}
                    placeholder={placeholder}
                    disabled={disabled}
                    rows={1}
                    spellCheck
                    aria-label="Message input"
                    className="block min-h-[20px] flex-1 resize-none self-center bg-transparent text-sm leading-5 text-foreground placeholder:text-text-tertiary focus:outline-none disabled:opacity-50"
                />
                <button
                    type="submit"
                    disabled={!canSubmit}
                    aria-label="Send message"
                    className="inline-flex h-7 w-7 flex-none items-center justify-center self-end rounded-md bg-primary text-primary-foreground transition-colors duration-150 hover:bg-primary-hover disabled:cursor-not-allowed disabled:bg-accent disabled:text-text-tertiary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                >
                    <Icons.ArrowRight className="size-3.5" aria-hidden />
                </button>
            </div>
            {focused && (
                <p className="px-1 text-[11px] text-text-tertiary">
                    Enter to send · Shift + Enter for new line
                </p>
            )}
        </form>
    );
});
