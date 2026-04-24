import { motion } from "framer-motion";
import { Component, type ErrorInfo, type ReactNode } from "react";
import { Badge, Card, Icons } from "../ui";
import { popIn } from "../ui/motion";
import { getArtifactComponent } from "./registry";
import { type ArtifactComponentName, schemas } from "./schemas";

type FallbackKind = "unknown" | "invalid" | "runtime";

interface FallbackProps {
    kind: FallbackKind;
    name: string;
    detail?: string;
}

/**
 * Discrete, DS-tokens-only error surface — never leaks a stacktrace into the
 * chat. Each variant maps to a failure mode the dispatcher knows about.
 */
function ArtifactFallback({ kind, name, detail }: FallbackProps) {
    const title =
        kind === "unknown"
            ? `Unknown artifact: ${name}`
            : kind === "invalid"
              ? `Artifact error: invalid props for ${name}`
              : `Artifact error: ${name} failed to render`;

    return (
        <Card padding="sm">
            <div className="flex items-start gap-2">
                <Icons.AlertTriangle aria-hidden className="size-4 flex-none text-text-tertiary" />
                <div className="flex min-w-0 flex-col gap-1">
                    <div className="flex items-center gap-2">
                        <Badge variant="default" size="sm">
                            Artifact
                        </Badge>
                        <span className="text-xs text-muted-foreground">{title}</span>
                    </div>
                    {detail && (
                        <span className="font-mono text-xs text-text-tertiary wrap-break-word">
                            {detail}
                        </span>
                    )}
                </div>
            </div>
        </Card>
    );
}

interface BoundaryProps {
    component: string;
    children: ReactNode;
}

interface BoundaryState {
    hasError: boolean;
    message?: string;
}

/**
 * Class error boundary — hooks don't catch render errors. Scoped per-artifact
 * so a single bad payload can't take down the whole message list.
 */
class ArtifactErrorBoundary extends Component<BoundaryProps, BoundaryState> {
    state: BoundaryState = { hasError: false };

    static getDerivedStateFromError(error: unknown): BoundaryState {
        const message = error instanceof Error ? error.message : String(error);
        return { hasError: true, message };
    }

    componentDidCatch(error: unknown, info: ErrorInfo): void {
        // Keep it visible in dev — swallowing errors here would hide real bugs.
        console.error(`[ArtifactRenderer] ${this.props.component} threw:`, error, info);
    }

    render(): ReactNode {
        if (this.state.hasError) {
            return (
                <ArtifactFallback
                    kind="runtime"
                    name={this.props.component}
                    detail={this.state.message}
                />
            );
        }
        return this.props.children;
    }
}

export interface ArtifactRendererProps {
    component: string;
    props: unknown;
}

/**
 * Resolve a `ui_render` event to a React node.
 *
 * Flow (mirrors issue #44):
 *  1. Lookup name in registry → unknown → fallback.
 *  2. Parse props against the Zod schema → invalid → fallback.
 *  3. Mount behind an error boundary + `fadeInUp` motion wrap.
 *
 * No fetching, no data shaping — placeholders receive the parsed props as-is.
 */
export function ArtifactRenderer({ component, props }: ArtifactRendererProps) {
    const Component = getArtifactComponent(component);
    if (!Component) {
        return <ArtifactFallback kind="unknown" name={component} />;
    }

    const schema = schemas[component as ArtifactComponentName];
    const parseResult = schema.safeParse(props);
    if (!parseResult.success) {
        const issue = parseResult.error.issues[0];
        const detail = issue ? `${issue.path.join(".") || "(root)"} — ${issue.message}` : undefined;
        return <ArtifactFallback kind="invalid" name={component} detail={detail} />;
    }

    return (
        <ArtifactErrorBoundary component={component}>
            <motion.div variants={popIn} initial="hidden" animate="visible">
                <Component {...parseResult.data} />
            </motion.div>
        </ArtifactErrorBoundary>
    );
}
