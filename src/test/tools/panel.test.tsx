import { afterEach, beforeEach, describe, expect, test } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import { ToolsPanel } from "../../components/observability/ToolsPanel";
import { resetToolAuditForTests, toolAuditEntries } from "../../tools/audit";

/**
 * The panel is driven against the real registry, the real policy gateway and the
 * real audit trail, because the point of Mission 7 is that all three are wired
 * together: what the panel shows is what the gate decided.
 */

beforeEach(() => {
  resetToolAuditForTests();
});

afterEach(() => {
  resetToolAuditForTests();
});

function draft(text: string): HTMLTextAreaElement {
  const box = screen.getByLabelText("Proposal draft") as HTMLTextAreaElement;
  fireEvent.change(box, { target: { value: text } });
  return box;
}

describe("tools panel", () => {
  test("states the read-only contract and lists the registry on request", () => {
    render(<ToolsPanel />);

    expect(screen.getByText("7 registered · 0 audited")).toBeTruthy();
    expect(screen.getByText(/cannot approve one/)).toBeTruthy();

    fireEvent.click(screen.getByRole("button", { name: /Registered tools/ }));

    expect(screen.getByText("workspace.search")).toBeTruthy();
    expect(screen.getByText("evidence.retrieve")).toBeTruthy();
    expect(screen.getAllByText("read-only").length).toBe(7);
  });

  test("runs an operator-authored proposal through the gateway and records it", async () => {
    render(<ToolsPanel />);

    draft('<blackletter-action>{"tool": "workspace.search", "arguments": {"query": "coolant"}}</blackletter-action>');
    fireEvent.click(screen.getByRole("button", { name: "Run" }));

    const summaries = await screen.findAllByText(/No matches for "coolant"/);
    expect(summaries.length).toBeGreaterThan(0);

    const [entry] = toolAuditEntries();
    expect(entry.tool).toBe("workspace.search");
    expect(entry.by).toBe("operator");
    expect(entry.decision).toBe("allow");
    expect(entry.result?.status).toBe("ok");
    expect(screen.getByText("7 registered · 1 audited")).toBeTruthy();
  });

  test("refuses an unknown tool and says the proposal cannot add one", async () => {
    render(<ToolsPanel />);

    draft('{"tool": "filesystem.write", "arguments": {"path": "/etc/hosts"}}');
    fireEvent.click(screen.getByRole("button", { name: "Run" }));

    const reasons = await screen.findAllByText(/not a registered tool/);
    expect(reasons.length).toBeGreaterThan(0);

    const [entry] = toolAuditEntries();
    expect(entry.tool).toBe("filesystem.write");
    expect(entry.decision).toBe("deny");
    expect(entry.code).toBe("unknown-tool");
  });

  test("will not run a malformed draft", () => {
    render(<ToolsPanel />);
    draft("please search my files");
    expect((screen.getByRole("button", { name: "Run" }) as HTMLButtonElement).disabled).toBe(true);
    expect(screen.queryByText(/policy would say/)).toBeNull();
  });
});
