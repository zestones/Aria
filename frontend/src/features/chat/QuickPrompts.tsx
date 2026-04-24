import { Icons } from "../../components/ui";
import type { EquipmentSelection } from "../../lib/hierarchy";

export interface QuickPromptsProps {
    selection: EquipmentSelection | null;
    onPick: (prompt: string) => void;
    disabled?: boolean;
}

/**
 * Equipment-scoped quick-prompt launchpad — sits above `ChatInput`.
 *
 * The chips reflect the operator's current `EquipmentPicker` selection so
 * the chat reads as a co-pilot that knows the rig under your nose, not a
 * generic Claude.ai window. When nothing is selected we fall back to plant-
 * wide prompts so the launchpad is never dead.
 *
 * See [docs/audits/M9-frontend-pre-demo-audit.md §4.3](../../../docs/audits/M9-frontend-pre-demo-audit.md)
 * Tier 2 #11.
 */
export function QuickPrompts({ selection, onPick, disabled }: QuickPromptsProps) {
    const prompts = buildPrompts(selection);
    return (
        <div className="flex flex-none gap-1.5 overflow-x-auto px-3 pb-1 pt-1 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
            {prompts.map((p) => (
                <button
                    key={p.label}
                    type="button"
                    onClick={() => onPick(p.send)}
                    disabled={disabled}
                    title={p.send}
                    className="inline-flex flex-none items-center gap-1 rounded-full border border-border bg-card px-2.5 py-1 text-[11px] text-muted-foreground transition-colors duration-150 hover:border-input hover:bg-accent hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-50"
                >
                    <Icons.Sparkles className="size-3 flex-none text-primary" aria-hidden />
                    <span className="max-w-[180px] truncate">{p.label}</span>
                </button>
            ))}
        </div>
    );
}

interface Prompt {
    label: string;
    send: string;
}

function buildPrompts(selection: EquipmentSelection | null): Prompt[] {
    if (selection?.cellName) {
        const name = selection.cellName;
        return [
            { label: `Why did ${name} alarm?`, send: `Why did ${name} alarm?` },
            {
                label: `Last 24h on ${name}`,
                send: `Show me the last 24h of telemetry for ${name}`,
            },
            { label: `Recent WOs for ${name}`, send: `List recent work orders for ${name}` },
        ];
    }
    return [
        { label: "What's degrading right now?", send: "What is degrading on the plant right now?" },
        { label: "Search KB for turbidity", send: "query_kb for turbidity RCAs" },
        { label: "Hand off to investigator", send: "Hand off to the investigator" },
    ];
}
