import { useTheme } from "../../providers";

/**
 * Theme-aware ARIA logo mark.
 * Renders favicon-light.png on light theme, favicon-dark.png on dark theme.
 */
export function AriaLogo({
    size = 24,
    className = "rounded-md",
}: {
    size?: number;
    className?: string;
}) {
    const { resolved } = useTheme();
    const src = resolved === "light" ? "/favicon-light.png" : "/favicon-dark.png";
    return <img src={src} alt="ARIA" width={size} height={size} className={className} />;
}
