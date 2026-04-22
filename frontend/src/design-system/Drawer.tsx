import { AnimatePresence, motion } from "framer-motion";
import { type ReactNode, useEffect } from "react";
import { drawerSlide } from "./motion";

export interface DrawerProps {
    open: boolean;
    onClose: () => void;
    side?: "left" | "right" | "bottom";
    width?: number | string;
    height?: number | string;
    className?: string;
    children: ReactNode;
    /**
     * If true, an overlay is rendered that closes the drawer on click.
     * Default true for bottom/left, false for right (chat drawer stays docked).
     */
    overlay?: boolean;
}

export function Drawer({
    open,
    onClose,
    side = "right",
    width = 420,
    height = "40vh",
    className = "",
    children,
    overlay,
}: DrawerProps) {
    const showOverlay = overlay ?? side !== "right";

    useEffect(() => {
        if (!open) return;
        function onKey(e: KeyboardEvent) {
            if (e.key === "Escape") onClose();
        }
        window.addEventListener("keydown", onKey);
        return () => window.removeEventListener("keydown", onKey);
    }, [open, onClose]);

    const position = {
        left: "top-0 left-0 h-full",
        right: "top-0 right-0 h-full",
        bottom: "left-0 right-0 bottom-0",
    }[side];

    const slideDir = {
        left: { hidden: { x: "-100%" }, visible: { x: 0 }, exit: { x: "-100%" } },
        right: drawerSlide,
        bottom: { hidden: { y: "100%" }, visible: { y: 0 }, exit: { y: "100%" } },
    }[side];

    const sizeStyle = side === "bottom" ? { height } : { width };

    return (
        <AnimatePresence>
            {open && (
                <>
                    {showOverlay && (
                        <motion.div
                            className="fixed inset-0 bg-black/40 z-40"
                            initial={{ opacity: 0 }}
                            animate={{ opacity: 1 }}
                            exit={{ opacity: 0 }}
                            transition={{ duration: 0.2 }}
                            onClick={onClose}
                            aria-hidden
                        />
                    )}
                    <motion.aside
                        className={`fixed ${position} z-50 bg-[var(--ds-bg-surface)] border-[var(--ds-border)] shadow-2xl ${
                            side === "right"
                                ? "border-l"
                                : side === "left"
                                  ? "border-r"
                                  : "border-t"
                        } ${className}`}
                        style={sizeStyle}
                        variants={slideDir}
                        initial="hidden"
                        animate="visible"
                        exit="exit"
                        transition={{ duration: 0.24, ease: [0.16, 1, 0.3, 1] }}
                        role="dialog"
                        aria-modal={showOverlay ? true : undefined}
                    >
                        {children}
                    </motion.aside>
                </>
            )}
        </AnimatePresence>
    );
}
