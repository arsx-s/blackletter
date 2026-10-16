import { afterAll, beforeAll, describe, expect, test } from "vitest";
import { render } from "@testing-library/react";
import { KnowledgeField } from "../../components/landing/KnowledgeField";

/**
 * jsdom has no graphics back end, which is exactly the environment these tests
 * want: with no context available the field must pick the software renderer and
 * degrade to an inert canvas instead of throwing. That is the same contract the
 * GPU path relies on for low-power devices and for browsers where a WebGL
 * context cannot be created.
 */
const originalGetContext = HTMLCanvasElement.prototype.getContext;

beforeAll(() => {
  HTMLCanvasElement.prototype.getContext = (() => null) as typeof originalGetContext;
});

afterAll(() => {
  HTMLCanvasElement.prototype.getContext = originalGetContext;
});

describe("KnowledgeField renderer selection", () => {
  test("renders exactly one canvas and preserves the caller's className", () => {
    const { container } = render(<KnowledgeField className="absolute inset-0" />);

    const canvases = container.querySelectorAll("canvas");
    expect(canvases).toHaveLength(1);
    expect(canvases[0].className).toBe("absolute inset-0");
    expect(canvases[0].getAttribute("aria-hidden")).toBe("true");
  });

  test("falls back to the software renderer without ever throwing", () => {
    const { container } = render(<KnowledgeField className="hero-field" density={0.5} />);

    // The capability check resolves in an effect; render() flushes effects, so the
    // chosen renderer has already committed by now and the canvas must survive it.
    const canvases = container.querySelectorAll("canvas");
    expect(canvases).toHaveLength(1);
    expect(canvases[0].className).toBe("hero-field");
  });
});
