import { describe, test, expect, afterEach } from "vitest";
import { render, screen, fireEvent, act } from "@testing-library/react";
import { ErrorBoundary } from "../../components/app/ErrorBoundary";
import { OperatingSystem } from "../../components/app/OperatingSystem";
import { workspaceStore } from "../../stores/use-workspace";

class MockResizeObserver {
  observe() {}
  unobserve() {}
  disconnect() {}
}
if (typeof globalThis.ResizeObserver === "undefined") {
  (globalThis as unknown as { ResizeObserver: unknown }).ResizeObserver = MockResizeObserver;
}

Object.defineProperty(window, "matchMedia", {
  writable: true,
  value: (query: string) => ({
    matches: true,
    media: query,
    onchange: null,
    addListener: () => undefined,
    removeListener: () => undefined,
    addEventListener: () => undefined,
    removeEventListener: () => undefined,
    dispatchEvent: () => false,
  }),
});

describe("default mode shell", () => {
  afterEach(() => {
    workspaceStore.setPrefs({ developerMode: false });
  });

  test("Default mode renders the clean welcome experience", () => {
    render(
      <ErrorBoundary>
        <OperatingSystem onExit={() => undefined} />
      </ErrorBoundary>,
    );

    const crashed = screen.queryByText("BlackLetter crashed");
    if (crashed) throw new Error("MOUNT CRASH in default mode");

    expect(screen.getByText("What are you researching?")).toBeTruthy();
    expect(screen.getByPlaceholderText("Ask BlackLetter…")).toBeTruthy();
    expect(screen.getAllByText("New Chat").length).toBeGreaterThan(0);
  });

  test("New Chat creates a conversation immediately and makes it active", () => {
    render(<OperatingSystem onExit={() => undefined} />);

    const before = workspaceStore.getState().tabs.length;
    fireEvent.click(screen.getAllByText("New Chat")[0]);

    const after = workspaceStore.getState().tabs.length;
    const lastTab = workspaceStore.getState().tabs[after - 1];
    expect(after).toBe(before + 1);
    expect(workspaceStore.getState().activeTabId).toBe(lastTab.id);
  });

  test("switching to Developer Mode preserves chats and shows advanced shell", () => {
    render(<OperatingSystem onExit={() => undefined} />);

    const chatIdBefore = workspaceStore.getState().activeTabId;
    act(() => {
      workspaceStore.setPrefs({ developerMode: true });
    });

    expect(screen.getByText(/Search everything/i)).toBeTruthy();
    expect(workspaceStore.getState().activeTabId).toBe(chatIdBefore);
    expect(workspaceStore.getState().prefs.developerMode).toBe(true);
  });

  test("switching back to Default Mode restores the simple shell", () => {
    render(<OperatingSystem onExit={() => undefined} />);
    act(() => {
      workspaceStore.setPrefs({ developerMode: true });
      workspaceStore.setPrefs({ developerMode: false });
    });
    expect(screen.getByPlaceholderText("Ask BlackLetter…")).toBeTruthy();
  });
});