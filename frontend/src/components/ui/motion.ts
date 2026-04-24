import type { Transition, Variants } from "framer-motion";

const easeOut: Transition["ease"] = [0.16, 1, 0.3, 1];

export const fadeInUp: Variants = {
    hidden: { opacity: 0, y: 8 },
    visible: { opacity: 1, y: 0, transition: { duration: 0.22, ease: easeOut } },
};

export const drawerSlide: Variants = {
    hidden: { x: "100%" },
    visible: { x: 0, transition: { duration: 0.24, ease: easeOut } },
    exit: { x: "100%", transition: { duration: 0.2, ease: easeOut } },
};
