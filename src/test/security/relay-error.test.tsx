import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { AiErrorBanner } from "../../components/ui/ai-error-banner";

describe("relay setup errors", () => {
  it("explains hosted relay configuration and opens settings", () => {
    const onOpenSettings = vi.fn();
    render(
      <AiErrorBanner
        error={{ code: "RELAY_AUTH_NOT_CONFIGURED", message: "The hosted relay is not configured with an access token." }}
        onOpenSettings={onOpenSettings}
      />,
    );

    expect(screen.getByText(/Set BLACKLETTER_RELAY_TOKEN in the hosted relay environment/)).toBeTruthy();
    expect(screen.getByText(/Keep OPENROUTER_API_KEY server-side/)).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Open Settings" }));
    expect(onOpenSettings).toHaveBeenCalledOnce();
  });
});
