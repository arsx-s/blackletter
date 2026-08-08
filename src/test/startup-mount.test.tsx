import { describe, test, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { ErrorBoundary } from "../components/app/ErrorBoundary";
import { OperatingSystem } from "../components/app/OperatingSystem";

class MockResizeObserver {
  observe() {}
  unobserve() {}
  disconnect() {}
}
if (typeof globalThis.ResizeObserver === "undefined") {
  (globalThis as unknown as { ResizeObserver: unknown }).ResizeObserver = MockResizeObserver;
}

describe("startup after Launch", () => {
  test("OperatingSystem mounts without an initialization crash", () => {
    render(
      <ErrorBoundary>
        <OperatingSystem onExit={() => undefined} />
      </ErrorBoundary>,
    );

    const crashed = screen.queryByText("BlackLetter crashed");
    if (crashed) {
      const pre = document.querySelector("pre");
      const detail = pre ? pre.textContent ?? "(no stack captured)" : "(no <pre>)";
      throw new Error(`MOUNT CRASH: ${detail}`);
    }

    expect(screen.getByText(/Enter Workspace/i)).toBeTruthy();
    expect(screen.queryByText(/crashed/i)).toBeNull();
  });
});