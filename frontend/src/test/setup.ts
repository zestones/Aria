import "@testing-library/jest-dom/vitest";
import { cleanup } from "@testing-library/react";
import { afterEach } from "vitest";

// Vitest runs with globals: false, which disables testing-library's auto-cleanup.
// Without this, DOM nodes from one test leak into the next and selectors match
// multiple copies of the component under test.
afterEach(() => {
    cleanup();
});
