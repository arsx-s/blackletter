import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import { LocalProviderPanel } from "../../components/app/LocalProviderPanel";
import { workspaceStore } from "../../stores/use-workspace";
import { getProviderSelection, resetProviderSelection } from "../../providers/selection";
import { OLLAMA_BASE_URL } from "../../config/model-defaults.mjs";

/**
 * The panel is tested against the real store and the real provider layer, with
 * only `fetch` mocked: the property that matters is that a change made here
 * reaches the layer that actually routes requests.
 */

const originalFetch = globalThis.fetch;

function reset(): void {
  workspaceStore.setPrefs({
    provider: "openrouter",
    ollamaBaseUrl: OLLAMA_BASE_URL,
    ollamaModel: "",
    allowNonLoopbackLocalProvider: false,
    remoteFallback: "never",
  });
  resetProviderSelection();
  workspaceStore.setPrefs({ provider: "openrouter" });
}

beforeEach(reset);

afterEach(() => {
  globalThis.fetch = originalFetch;
  reset();
  vi.restoreAllMocks();
});

function mockRuntime() {
  globalThis.fetch = vi.fn(async (url: unknown) => {
    const href = String(url);
    if (href.includes("/api/tags")) {
      return new Response(
        JSON.stringify({ models: [{ name: "qwen2:7b", size: 4_000, details: { parameter_size: "7B", quantization_level: "Q4_K_M" } }] }),
        { status: 200 },
      );
    }
    if (href.includes("/api/show")) {
      return new Response(
        JSON.stringify({ capabilities: ["completion", "tools"], model_info: { "qwen2.context_length": 8192 } }),
        { status: 200 },
      );
    }
    return new Response(JSON.stringify({ version: "0.3.1" }), { status: 200 });
  }) as unknown as typeof fetch;
}

describe("local provider panel", () => {
  test("shows the remote provider and unknown local capabilities by default", () => {
    render(<LocalProviderPanel />);

    expect((screen.getByLabelText("Model provider") as HTMLSelectElement).value).toBe("openrouter");
    expect(screen.getByRole("option", { name: "Remote (OpenRouter)" })).toBeTruthy();
    expect(screen.getByText(/Remote \(OpenRouter\) —/)).toBeTruthy();
    // No local section until the operator selects the local runtime.
    expect(screen.queryByLabelText("Local runtime base URL")).toBeNull();
    // Capabilities are stated as unknown rather than guessed.
    expect(screen.getAllByText("unknown").length).toBeGreaterThan(0);
  });

  test("switching to the local runtime reaches the provider layer", () => {
    render(<LocalProviderPanel />);

    fireEvent.change(screen.getByLabelText("Model provider"), { target: { value: "ollama" } });

    expect(workspaceStore.getState().prefs.provider).toBe("ollama");
    expect(getProviderSelection().provider).toBe("ollama");
    expect(screen.getByLabelText("Local runtime base URL")).toBeTruthy();
    expect(screen.getByLabelText("Local model id")).toBeTruthy();
  });

  test("warns that a local run is unusable until a model is named", () => {
    workspaceStore.setPrefs({ provider: "ollama" });
    render(<LocalProviderPanel />);

    expect(screen.getByText(/Local inference is selected but not usable: no local model is configured/)).toBeTruthy();
  });

  test("refuses a non-loopback address until the operator opts in", () => {
    workspaceStore.setPrefs({ provider: "ollama", ollamaModel: "qwen2:7b", ollamaBaseUrl: "http://10.0.0.9:11434" });
    render(<LocalProviderPanel />);

    expect(screen.getAllByText(/is not loopback/).length).toBeGreaterThan(0);
    const checkButton = screen.getByRole("button", { name: /Check connection/ }) as HTMLButtonElement;
    expect(checkButton.disabled).toBe(true);

    // Two switches: the non-loopback opt-in (first in the DOM) and the fallback.
    const switches = screen.getAllByRole("checkbox");
    expect(switches).toHaveLength(2);
    fireEvent.click(switches[0]);

    expect(workspaceStore.getState().prefs.allowNonLoopbackLocalProvider).toBe(true);
    expect(getProviderSelection().allowNonLoopbackLocalProvider).toBe(true);
    expect((screen.getByRole("button", { name: /Check connection/ }) as HTMLButtonElement).disabled).toBe(false);
  });

  test("lists installed models, uses one, and copies the runtime's capability report", async () => {
    workspaceStore.setPrefs({ provider: "ollama" });
    mockRuntime();
    render(<LocalProviderPanel />);

    fireEvent.click(screen.getByRole("button", { name: /List installed models/ }));
    expect(await screen.findByText("1 model already installed.")).toBeTruthy();
    expect(screen.getByText("qwen2:7b")).toBeTruthy();

    fireEvent.click(screen.getByRole("button", { name: "Use" }));
    expect(workspaceStore.getState().prefs.ollamaModel).toBe("qwen2:7b");
    expect(getProviderSelection().ollamaModel).toBe("qwen2:7b");

    fireEvent.click(screen.getByRole("button", { name: "Inspect" }));
    expect(await screen.findByText(/Read the runtime's report for "qwen2:7b"/)).toBeTruthy();
    // Evidence from the runtime: tool calls supported, context length reported.
    expect(screen.getAllByText("supported").length).toBeGreaterThan(0);
    expect(screen.getByText("8,192 tokens")).toBeTruthy();
    expect(screen.getByText(/runtime reported capabilities: completion, tools/)).toBeTruthy();
  });

  test("turns on the remote fallback only when the operator asks for it", () => {
    workspaceStore.setPrefs({ provider: "ollama", ollamaModel: "qwen2:7b" });
    render(<LocalProviderPanel />);

    expect(workspaceStore.getState().prefs.remoteFallback).toBe("never");
    const switches = screen.getAllByRole("checkbox");
    // Loopback address and a named model: the only switch left is the fallback.
    expect(switches).toHaveLength(1);
    fireEvent.click(switches[0]);

    expect(workspaceStore.getState().prefs.remoteFallback).toBe("allow");
    expect(getProviderSelection().remoteFallback).toBe("allow");
  });
});
