import { QueryClientProvider } from "@tanstack/react-query";
import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { BrowserRouter } from "react-router-dom";
import App from "./App";
import { useChatSessionsStore } from "./features/chat/chatSessionsStore";
import { useChatStore } from "./features/chat/chatStore";
import { queryClient } from "./lib/config";
import { ThemeProvider } from "./providers";
import "./styles/index.css";

// Autosave the chat transcript into the persisted sessions store.
// Subscribes once at module load — survives StrictMode double-mount.
useChatStore.subscribe((state, prev) => {
    if (state.messages !== prev.messages) {
        useChatSessionsStore.getState().syncFromMessages(state.messages);
    }
});

createRoot(document.getElementById("root")!).render(
    <StrictMode>
        <ThemeProvider>
            <QueryClientProvider client={queryClient}>
                <BrowserRouter>
                    <App />
                </BrowserRouter>
            </QueryClientProvider>
        </ThemeProvider>
    </StrictMode>,
);
