import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { WebResearchPanel } from "../../components/research/WebResearchPanel";
import { resetWebResearchForTests } from "../../research/web";

/**
 * The panel drives the real pipeline: the real fetch guard, the real extraction
 * and the real binding. Only the network is replaced, and only for the URLs the
 * test itself prepared.
 */

const REPORT_HTML = `<article>
  <h1>Reactor incident report</h1>
  <p>The coolant loop B was restarted at 14:02 on 14 March 2023 by the shift team.</p>
  <p>Output was reduced to 640 megawatts for eleven hours while the loop was inspected.</p>
</article>`;

beforeEach(() => {
  resetWebResearchForTests();
  localStorage.removeItem("web-research");
});

afterEach(() => {
  resetWebResearchForTests();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

function stubFetch(routes: Array<[string, () => Response]>): void {
  vi.stubGlobal(
    "fetch",
    vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input);
      for (const [prefix, respond] of routes) if (url.startsWith(prefix)) return respond();
      throw new Error(`unexpected fetch: ${url}`);
    }),
  );
}

function setProvider(value: string): void {
  fireEvent.change(screen.getByLabelText("Search provider"), { target: { value } });
}

describe("web research panel", () => {
  test("starts with no provider configured and says so on the option list", () => {
    render(<WebResearchPanel />);

    expect(screen.getByText("Web research")).toBeTruthy();
    const select = screen.getByLabelText("Search provider") as HTMLSelectElement;
    expect(select.value).toBe("none");
    expect(screen.getAllByText(/not configured/).length).toBeGreaterThan(0);
    expect(screen.getByText(/Nothing is searched or fetched until a provider is chosen/)).toBeTruthy();
  });

  test("requires a question before it will run", async () => {
    render(<WebResearchPanel />);
    fireEvent.click(screen.getByRole("button", { name: "Run retrieval" }));

    const problem = await screen.findByText(/A research question is required/);
    expect(problem).toBeTruthy();
  });

  test("retrieves a supplied page, shows the refusal, and binds a claim to it", async () => {
    stubFetch([
      ["https://regulator.gov/report", () => new Response(REPORT_HTML, { status: 200, headers: { "content-type": "text/html" } })],
    ]);

    render(<WebResearchPanel />);
    setProvider("manual");

    fireEvent.change(screen.getByLabelText("Research question"), { target: { value: "What happened to coolant loop B?" } });
    fireEvent.change(screen.getByLabelText("URLs to fetch"), {
      target: { value: "https://regulator.gov/report\nhttps://192.168.0.10/admin" },
    });

    fireEvent.click(screen.getByRole("button", { name: "Run retrieval" }));

    const link = await screen.findByRole("link", { name: /Reactor incident report/ });
    expect(link.getAttribute("href")).toBe("https://regulator.gov/report");
    expect(link.getAttribute("rel")).toContain("noreferrer");
    expect(screen.getByText(/1 page\(s\) were retrieved/)).toBeTruthy();
    expect(screen.getByText(/private-address/)).toBeTruthy();

    // Retrieval alone made no claim.
    expect(screen.getByText(/No synthesis was provided/)).toBeTruthy();

    fireEvent.change(screen.getByLabelText("Synthesis to bind"), {
      target: { value: "The coolant loop B was restarted at 14:02 on 14 March 2023 by the shift team." },
    });
    fireEvent.click(screen.getByRole("button", { name: /Re-bind claims/ }));

    await waitFor(() => expect(screen.getByText("supported")).toBeTruthy());
    expect(screen.getByText("1 independent source(s)")).toBeTruthy();
  });

  test("binds a synthesis loaded from the active tab when one exists", async () => {
    stubFetch([["https://regulator.gov/report", () => new Response(REPORT_HTML, { status: 200, headers: { "content-type": "text/html" } })]]);
    const { useWorkspaceStore } = await import("../../stores/use-workspace");
    const { workspaceStore } = await import("../../stores/workspace-store");

    // A tab with an assistant answer is what the panel pre-fills from.
    const tab = workspaceStore.getState().tabs[0];
    if (tab) {
      workspaceStore.updateTab(tab.id, {
        messages: [{ role: "assistant", content: "The coolant loop B was restarted at 14:02 on 14 March 2023 by the shift team.", timestamp: 1 }],
      });
    }

    render(<WebResearchPanel />);
    const synthesis = screen.getByLabelText("Synthesis to bind") as HTMLTextAreaElement;
    await waitFor(() => expect(synthesis.value.length).toBeGreaterThan(0));
    expect(useWorkspaceStore).toBeDefined();
  });

  test("shows an unavailable provider instead of a run", async () => {
    render(<WebResearchPanel />);
    fireEvent.change(screen.getByLabelText("Research question"), { target: { value: "Anything at all" } });
    setProvider("brave");

    expect(screen.getByText(/Requires an API key/)).toBeTruthy();

    fireEvent.click(screen.getByRole("button", { name: "Run retrieval" }));
    const notices = await screen.findAllByText(/Brave Search needs an API key/);
    expect(notices.length).toBeGreaterThan(0);
    expect(screen.getByText(/No page was retrieved in this run/)).toBeTruthy();
  });
});
