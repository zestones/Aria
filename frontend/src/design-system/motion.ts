import type { Transition, Variants } from "framer-motion";

const easeOut: Transition["ease"] = [0.16, 1, 0.3, 1];

export const fadeInUp: Variants = {
    hidden: { opacity: 0, y: 8 },
    visible: { opacity: 1, y: 0, transition: { duration: 0.22, ease: easeOut } },
};

export const streamToken: Variants = {
    hidden: { opacity: 0 },
    visible: { opacity: 1, transition: { duration: 0.08, ease: "linear" } },
};

export const artifactReveal: Variants = {
    hidden: { opacity: 0, scale: 0.96, y: 6 },
    visible: {
        opacity: 1,
        scale: 1,
        y: 0,
        transition: { duration: 0.28, ease: easeOut },
    },
};

export const anomalyPulse: Variants = {
    idle: { boxShadow: "0 0 0 0 rgba(239, 68, 68, 0.0)" },
    pulse: {
        boxShadow: ["0 0 0 0 rgba(239, 68, 68, 0.55)", "0 0 0 12px rgba(239, 68, 68, 0)"],
        transition: { duration: 1.4, repeat: Infinity, ease: "easeOut" },
    },
};

export const handoffSweep: Variants = {
    hidden: { opacity: 0, x: -16 },
    visible: {
        opacity: 1,
        x: 0,
        transition: { duration: 0.32, ease: easeOut },
    },
    exit: { opacity: 0, x: 16, transition: { duration: 0.2 } },
};

export const drawerSlide: Variants = {
    hidden: { x: "100%" },
    visible: { x: 0, transition: { duration: 0.24, ease: easeOut } },
    exit: { x: "100%", transition: { duration: 0.2, ease: easeOut } },
};
