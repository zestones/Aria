/**
 * PdfUpload — drop or pick a PDF, preview first page, send to backend.
 *
 * Flow: idle → previewing (file chosen + first page rendered) →
 *       uploading (progress + abort) → success (navigate /onboarding/:id)
 *       error path is reachable from any stage.
 *
 * Calls POST /api/v1/kb/equipment/{cell_id}/upload (backend M3.2). Uses
 * XMLHttpRequest to surface native upload progress + abort signalling.
 * The backend also emits five `ui_render` progress events via the WS
 * channel (kb_progress phases), surfaced separately by the orchestrator;
 * our in-component progress is wire-level bytes sent.
 */

import { motion } from "framer-motion";
import { type DragEvent, useCallback, useEffect, useId, useRef, useState } from "react";
import { Button, Icons } from "../../components/ui";
import { pdfjsLib } from "../../lib/pdfjs";
import type { EquipmentKbOut } from ".";

const MAX_BYTES = 50 * 1024 * 1024;

type Stage = "idle" | "previewing" | "uploading" | "success" | "error";

export class UploadAbortError extends Error {
    constructor() {
        super("upload aborted");
        this.name = "AbortError";
    }
}

interface UploadPdfOptions {
    cellId: number;
    file: File;
    onProgress?: (pct: number) => void;
    signal?: AbortSignal;
}

function uploadPdf(options: UploadPdfOptions): Promise<EquipmentKbOut> {
    const { cellId, file, onProgress, signal } = options;

    return new Promise<EquipmentKbOut>((resolve, reject) => {
        if (signal?.aborted) {
            reject(new UploadAbortError());
            return;
        }

        const xhr = new XMLHttpRequest();
        const url = `/api/v1/kb/equipment/${cellId}/upload`;

        const onAbort = () => {
            xhr.abort();
        };
        signal?.addEventListener("abort", onAbort, { once: true });

        xhr.upload.addEventListener("progress", (e) => {
            if (!e.lengthComputable) return;
            const pct = Math.min(100, Math.round((e.loaded / e.total) * 100));
            onProgress?.(pct);
        });

        xhr.addEventListener("load", () => {
            signal?.removeEventListener("abort", onAbort);
            if (xhr.status < 200 || xhr.status >= 300) {
                let msg = `Upload failed (${xhr.status})`;
                try {
                    const body = JSON.parse(xhr.responseText) as { message?: string };
                    if (body?.message) msg = body.message;
                } catch {
                    /* non-JSON error body — fall back to status */
                }
                reject(new Error(msg));
                return;
            }
            try {
                const body = JSON.parse(xhr.responseText) as { data: EquipmentKbOut };
                onProgress?.(100);
                resolve(body.data);
            } catch (err) {
                reject(err instanceof Error ? err : new Error("Malformed upload response"));
            }
        });

        xhr.addEventListener("error", () => {
            signal?.removeEventListener("abort", onAbort);
            reject(new Error("Network error during upload"));
        });

        xhr.addEventListener("abort", () => {
            signal?.removeEventListener("abort", onAbort);
            reject(new UploadAbortError());
        });

        const form = new FormData();
        form.append("file", file, file.name);

        xhr.open("POST", url);
        xhr.withCredentials = true;
        xhr.send(form);
    });
}

export interface PdfUploadProps {
    /** Cell id the manual is associated with — path param of the upload route. */
    cellId: number;
    /**
     * Called after a successful upload. Receives the backend response so the
     * caller can navigate to `/onboarding/:session_id` (wizard lands in M8.6).
     */
    onUploaded: (result: EquipmentKbOut) => void;
    className?: string;
}

function formatBytes(n: number): string {
    if (n < 1024) return `${n} B`;
    if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`;
    return `${(n / (1024 * 1024)).toFixed(1)} MB`;
}

async function renderFirstPage(file: File, canvas: HTMLCanvasElement): Promise<void> {
    const buf = await file.arrayBuffer();
    const task = pdfjsLib.getDocument({ data: new Uint8Array(buf) });
    const doc = await task.promise;
    try {
        const page = await doc.getPage(1);
        const unscaled = page.getViewport({ scale: 1 });
        const targetWidth = canvas.parentElement?.clientWidth ?? 320;
        const scale = Math.min(2, targetWidth / unscaled.width);
        const viewport = page.getViewport({ scale });
        const dpr = window.devicePixelRatio || 1;
        canvas.width = Math.floor(viewport.width * dpr);
        canvas.height = Math.floor(viewport.height * dpr);
        canvas.style.width = `${Math.floor(viewport.width)}px`;
        canvas.style.height = `${Math.floor(viewport.height)}px`;
        const ctx = canvas.getContext("2d");
        if (!ctx) return;
        ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
        await page.render({ canvasContext: ctx, viewport, canvas }).promise;
    } finally {
        await doc.destroy();
    }
}

function validatePdf(candidate: File): string | null {
    const isPdf =
        candidate.type === "application/pdf" || candidate.name.toLowerCase().endsWith(".pdf");
    if (!isPdf) return "This file isn't a PDF. Only .pdf manuals are accepted.";
    if (candidate.size > MAX_BYTES) {
        return `File is ${formatBytes(candidate.size)}. The 50 MB limit applies.`;
    }
    if (candidate.size === 0) return "This PDF is empty.";
    return null;
}

export function PdfUpload({ cellId, onUploaded, className = "" }: PdfUploadProps) {
    const inputId = useId();
    const errorId = useId();
    const progressId = useId();

    const fileInputRef = useRef<HTMLInputElement>(null);
    const canvasRef = useRef<HTMLCanvasElement>(null);
    const abortRef = useRef<AbortController | null>(null);

    const [file, setFile] = useState<File | null>(null);
    const [stage, setStage] = useState<Stage>("idle");
    const [progress, setProgress] = useState(0);
    const [error, setError] = useState<string | null>(null);
    const [isDragging, setIsDragging] = useState(false);
    const [previewReady, setPreviewReady] = useState(false);

    useEffect(() => {
        return () => {
            abortRef.current?.abort();
        };
    }, []);

    useEffect(() => {
        if (!file || !canvasRef.current) return;
        setPreviewReady(false);
        let cancelled = false;
        renderFirstPage(file, canvasRef.current)
            .then(() => {
                if (!cancelled) setPreviewReady(true);
            })
            .catch(() => {
                if (!cancelled) {
                    setError("Unable to render the PDF preview. The file may be corrupt.");
                    setStage("error");
                }
            });
        return () => {
            cancelled = true;
        };
    }, [file]);

    const acceptFile = useCallback((candidate: File) => {
        const reason = validatePdf(candidate);
        if (reason) {
            setError(reason);
            setStage("error");
            setFile(null);
            return;
        }
        setError(null);
        setFile(candidate);
        setProgress(0);
        setStage("previewing");
    }, []);

    const onInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        const picked = e.target.files?.[0];
        if (picked) acceptFile(picked);
        e.target.value = "";
    };

    const onDrop = (e: DragEvent<HTMLButtonElement>) => {
        e.preventDefault();
        setIsDragging(false);
        const dropped = e.dataTransfer.files?.[0];
        if (dropped) acceptFile(dropped);
    };

    const onDragOver = (e: DragEvent<HTMLButtonElement>) => {
        e.preventDefault();
        if (!isDragging) setIsDragging(true);
    };

    const onDragLeave = (e: DragEvent<HTMLButtonElement>) => {
        if (e.currentTarget === e.target) setIsDragging(false);
    };

    const openPicker = () => fileInputRef.current?.click();

    const reset = () => {
        abortRef.current?.abort();
        abortRef.current = null;
        setFile(null);
        setStage("idle");
        setProgress(0);
        setError(null);
        setPreviewReady(false);
    };

    const startUpload = async () => {
        if (!file) return;
        setStage("uploading");
        setProgress(0);
        setError(null);
        const controller = new AbortController();
        abortRef.current = controller;
        try {
            const result = await uploadPdf({
                cellId,
                file,
                onProgress: setProgress,
                signal: controller.signal,
            });
            if (controller.signal.aborted) return;
            setStage("success");
            onUploaded(result);
        } catch (err) {
            if (err instanceof UploadAbortError) {
                setStage("previewing");
                return;
            }
            const msg = err instanceof Error ? err.message : "Upload failed.";
            setError(msg);
            setStage("error");
        } finally {
            abortRef.current = null;
        }
    };

    const abortUpload = () => {
        abortRef.current?.abort();
    };

    const showDropzone = stage === "idle" || (stage === "error" && !file);

    return (
        <div className={`flex flex-col gap-4 ${className}`}>
            <input
                ref={fileInputRef}
                id={inputId}
                type="file"
                accept="application/pdf,.pdf"
                className="sr-only"
                onChange={onInputChange}
                aria-describedby={error ? errorId : undefined}
            />

            {showDropzone && (
                <Dropzone
                    isDragging={isDragging}
                    onDrop={onDrop}
                    onDragOver={onDragOver}
                    onDragLeave={onDragLeave}
                    onOpen={openPicker}
                    inputId={inputId}
                />
            )}

            {file && stage !== "idle" && (
                <motion.div
                    initial={{ opacity: 0, y: 4 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ duration: 0.16, ease: [0.16, 1, 0.3, 1] }}
                    className="flex flex-col gap-4 rounded-lg border border-border bg-card p-4"
                >
                    <div className="flex items-start justify-between gap-4">
                        <div className="flex min-w-0 items-start gap-3">
                            <div className="mt-0.5 flex size-9 shrink-0 items-center justify-center rounded-md bg-muted text-muted-foreground">
                                <Icons.FileText className="size-5" aria-hidden="true" />
                            </div>
                            <div className="min-w-0">
                                <p className="truncate text-base font-medium text-foreground">
                                    {file.name}
                                </p>
                                <p className="mt-0.5 text-sm text-muted-foreground">
                                    {formatBytes(file.size)} · Cell {cellId}
                                </p>
                            </div>
                        </div>
                        {(stage === "previewing" || stage === "error") && (
                            <Button
                                variant="ghost"
                                size="sm"
                                type="button"
                                onClick={reset}
                                aria-label="Remove file"
                            >
                                <Icons.X className="size-4" aria-hidden="true" />
                            </Button>
                        )}
                    </div>

                    <div className="flex flex-col gap-3 sm:flex-row sm:items-start">
                        <div className="flex min-h-[160px] w-full max-w-[280px] items-center justify-center overflow-hidden rounded-md border border-border bg-muted">
                            {!previewReady && (
                                <span className="text-xs text-text-tertiary">
                                    Rendering preview…
                                </span>
                            )}
                            <canvas
                                ref={canvasRef}
                                aria-label={`First page of ${file.name}`}
                                className={`block max-w-full ${previewReady ? "" : "hidden"}`}
                            />
                        </div>
                        <div className="flex flex-1 flex-col gap-3">
                            {stage === "uploading" && (
                                <div className="space-y-2">
                                    <div className="flex items-center justify-between text-sm text-muted-foreground">
                                        <span>Uploading and extracting…</span>
                                        <span className="font-medium text-foreground tabular-nums">
                                            {progress}%
                                        </span>
                                    </div>
                                    <div
                                        id={progressId}
                                        role="progressbar"
                                        aria-valuenow={progress}
                                        aria-valuemin={0}
                                        aria-valuemax={100}
                                        aria-label="Upload progress"
                                        className="h-1.5 w-full overflow-hidden rounded-full bg-muted"
                                    >
                                        <div
                                            className="h-full rounded-full bg-primary transition-[width] duration-150"
                                            style={{ width: `${progress}%` }}
                                        />
                                    </div>
                                </div>
                            )}
                            {stage === "success" && (
                                <p className="text-sm text-success">
                                    Upload complete — redirecting to onboarding…
                                </p>
                            )}
                            <div className="mt-auto flex flex-wrap gap-2">
                                {stage === "previewing" && (
                                    <Button
                                        type="button"
                                        variant="default"
                                        size="md"
                                        onClick={startUpload}
                                        disabled={!previewReady}
                                    >
                                        <Icons.Upload className="size-4" aria-hidden="true" />
                                        Upload and extract
                                    </Button>
                                )}
                                {stage === "uploading" && (
                                    <Button
                                        type="button"
                                        variant="default"
                                        size="md"
                                        onClick={abortUpload}
                                        aria-controls={progressId}
                                    >
                                        <Icons.X className="size-4" aria-hidden="true" />
                                        Cancel
                                    </Button>
                                )}
                                {stage === "error" && (
                                    <Button
                                        type="button"
                                        variant="default"
                                        size="md"
                                        onClick={startUpload}
                                    >
                                        <Icons.RefreshCw className="size-4" aria-hidden="true" />
                                        Try again
                                    </Button>
                                )}
                            </div>
                        </div>
                    </div>
                </motion.div>
            )}

            {error && (
                <div
                    id={errorId}
                    role="alert"
                    className="flex items-start gap-2 rounded-lg border px-3 py-2 text-sm"
                    style={{
                        backgroundColor: "color-mix(in oklab, var(--destructive), transparent 88%)",
                        borderColor: "color-mix(in oklab, var(--destructive), transparent 70%)",
                        color: "var(--destructive)",
                    }}
                >
                    <Icons.AlertCircle className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
                    <span>{error}</span>
                </div>
            )}
        </div>
    );
}

interface DropzoneProps {
    isDragging: boolean;
    onDrop: (e: DragEvent<HTMLButtonElement>) => void;
    onDragOver: (e: DragEvent<HTMLButtonElement>) => void;
    onDragLeave: (e: DragEvent<HTMLButtonElement>) => void;
    onOpen: () => void;
    inputId: string;
}

function Dropzone({ isDragging, onDrop, onDragOver, onDragLeave, onOpen, inputId }: DropzoneProps) {
    return (
        <button
            type="button"
            aria-label="Drop a PDF manual here or press Enter to browse"
            aria-controls={inputId}
            onClick={onOpen}
            onDrop={onDrop}
            onDragOver={onDragOver}
            onDragLeave={onDragLeave}
            className={`flex w-full flex-col items-center justify-center gap-3 rounded-lg border border-dashed px-6 py-12 text-center transition-colors duration-150 cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring ${
                isDragging
                    ? "border-primary bg-accent-soft"
                    : "border-input bg-card hover:bg-accent"
            }`}
        >
            <span className="flex size-10 items-center justify-center rounded-md bg-muted text-muted-foreground">
                <Icons.Upload className="size-5" aria-hidden="true" />
            </span>
            <span className="space-y-1">
                <span className="block text-base font-medium text-foreground">
                    Drop a PDF manual
                </span>
                <span className="block text-sm text-muted-foreground">
                    Or click to browse. PDF only, 50 MB max.
                </span>
            </span>
        </button>
    );
}
