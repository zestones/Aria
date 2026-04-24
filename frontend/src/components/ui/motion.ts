import type { Transition, Variants } from "framer-motion";

/**
 * Shared motion variants. Keep transitions short (<300ms) and use the soft
 * easing curve for everything that scrolls or expands so the app feels
 * cohesive. Anything longer than 350ms feels laggy in an operator UI.
 */

const easeOut: Transition["ease"] = [0.16, 1, 0.3, 1];

export const motionEase = easeOut;
export const motionFast = 0.16;
export const motionBase = 0.22;
export const motionSlow = 0.32;

/** Subtle bottom-up fade — the "default" entry for cards, panels, artifacts. */
export const fadeInUp: Variants = {
    hidden: { opacity: 0, y: 8 },
    visible: { opacity: 1, y: 0, transition: { duration: motionBase, ease: easeOut } },
};

/** Plain fade — for content that shouldn't move (e.g. tooltips, overlays). */
export const fadeIn: Variants = {
    hidden: { opacity: 0 },
    visible: { opacity: 1, transition: { duration: motionBase, ease: easeOut } },
    exit: { opacity: 0, transition: { duration: motionFast, ease: easeOut } },
};

/** Tiny scale-up combined with fade — for artifacts mounting into chat. */
export const popIn: Variants = {
    hidden: { opacity: 0, y: 6, scale: 0.98 },
    visible: {
        opacity: 1,
        y: 0,
        scale: 1,
        transition: { duration: motionBase, ease: easeOut },
    },
};

/** Right-edge drawer slide. */
export const drawerSlide: Variants = {
    hidden: { x: "100%" },
    visible: { x: 0, transition: { duration: 0.24, ease: easeOut } },
    exit: { x: "100%", transition: { duration: 0.2, ease: easeOut } },
};

/** Page transition — used by route-level wrappers under AnimatePresence. */
export const pageTransition: Variants = {
    hidden: { opacity: 0, y: 6 },
    visible: { opacity: 1, y: 0, transition: { duration: motionBase, ease: easeOut } },
    exit: { opacity: 0, y: -4, transition: { duration: motionFast, ease: easeOut } },
};

/** Container that staggers child entry animations. */
export const staggerContainer: Variants = {
    hidden: {},
    visible: {
        transition: {
            staggerChildren: 0.05,
            delayChildren: 0.04,
        },
    },
};

/** Child variant compatible with `staggerContainer`. */
export const staggerItem: Variants = {
    hidden: { opacity: 0, y: 6 },
    visible: { opacity: 1, y: 0, transition: { duration: motionBase, ease: easeOut } },
};
