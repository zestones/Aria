import react from "@vitejs/plugin-react";
import path from "path";
import { defineConfig } from "vitest/config";

export default defineConfig({
    plugins: [react()],
    resolve: {
        alias: { "@": path.resolve(__dirname, "./src") },
    },
    test: {
        environment: "jsdom",
        globals: false,
        setupFiles: ["./__tests__/setup.ts"],
        include: ["__tests__/**/*.{test,spec}.{ts,tsx}"],
        css: false,
    },
});
