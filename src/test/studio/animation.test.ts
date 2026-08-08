import { describe, it, expect } from "vitest";
import { AnimationSystem, microinteractions, loadingMessages, emptyStateTemplates, errorTemplates } from "../../studio/animation";

describe("AnimationSystem", () => {
  const anim = new AnimationSystem();

  beforeEach(() => {
    anim.setReducedMotion(false);
  });

  describe("getPreset", () => {
    it("returns preset with duration and easing", () => {
      const preset = anim.getPreset("fade-in");
      expect(preset.duration).toBeGreaterThan(0);
      expect(preset.easing).toBeTruthy();
      expect(preset.property).toBeTruthy();
    });

    it("returns all 10 presets", () => {
      const presets: Array<Parameters<typeof anim.getPreset>[0]> = [
        "fade-in", "fade-in-up", "fade-in-down",
        "slide-in-left", "slide-in-right", "scale-in",
        "expand", "collapse", "pulse", "shimmer",
      ];
      for (const name of presets) {
        const preset = anim.getPreset(name);
        expect(preset.duration).toBeGreaterThan(0);
      }
    });

    it("returns zero duration when reduced motion", () => {
      anim.setReducedMotion(true);
      const preset = anim.getPreset("fade-in");
      expect(preset.duration).toBe(0);
    });
  });

  describe("getDuration", () => {
    it("returns correct durations", () => {
      expect(anim.getDuration("instant")).toBe(50);
      expect(anim.getDuration("fast")).toBe(100);
      expect(anim.getDuration("normal")).toBe(200);
      expect(anim.getDuration("slow")).toBe(300);
      expect(anim.getDuration("deliberate")).toBe(400);
      expect(anim.getDuration("narrative")).toBe(600);
    });

    it("returns 0 when reduced motion", () => {
      anim.setReducedMotion(true);
      expect(anim.getDuration("normal")).toBe(0);
    });
  });

  describe("getEasing", () => {
    it("returns all easing values", () => {
      const easings: Array<Parameters<typeof anim.getEasing>[0]> = [
        "linear", "default", "spring", "smooth", "decelerate", "accelerate", "emphasize",
      ];
      for (const name of easings) {
        expect(anim.getEasing(name)).toBeTruthy();
      }
    });
  });

  describe("keyframes", () => {
    it("returns valid keyframe strings for known presets", () => {
      expect(anim.keyframes("fade-in")).toContain("@keyframes");
      expect(anim.keyframes("fade-in-up")).toContain("@keyframes");
      expect(anim.keyframes("scale-in")).toContain("@keyframes");
    });

    it("returns empty for presets without keyframes", () => {
      expect(anim.keyframes("slide-in-left")).toBe("");
    });
  });

  describe("stagger", () => {
    it("returns increasing delays", () => {
      expect(anim.stagger(0)).toBe("0ms");
      expect(anim.stagger(1)).toBe("40ms");
      expect(anim.stagger(2)).toBe("80ms");
    });

    it("respects custom baseDelay", () => {
      expect(anim.stagger(1, 100)).toBe("100ms");
    });

    it("returns 0ms when reduced motion", () => {
      anim.setReducedMotion(true);
      expect(anim.stagger(3)).toBe("0ms");
    });
  });
});

describe("microinteractions", () => {
  it("has hover interactions", () => {
    expect(microinteractions.hover.panel).toBeTruthy();
    expect(microinteractions.hover.item).toBeTruthy();
    expect(microinteractions.hover.icon).toBeTruthy();
    expect(microinteractions.hover.button).toBeTruthy();
  });

  it("has click interactions", () => {
    expect(microinteractions.click.scale).toBeTruthy();
    expect(microinteractions.click.feedback).toBeTruthy();
  });

  it("has focus interactions", () => {
    expect(microinteractions.focus.ring).toBeTruthy();
    expect(microinteractions.focus.transition).toBeTruthy();
  });
});

describe("loadingMessages", () => {
  it("has research, teaching, and research_deep categories", () => {
    expect(loadingMessages.research.length).toBeGreaterThan(0);
    expect(loadingMessages.teaching.length).toBeGreaterThan(0);
    expect(loadingMessages.research_deep.length).toBeGreaterThan(0);
  });

  it("every message has id, label, description, icon", () => {
    for (const [, messages] of Object.entries(loadingMessages)) {
      for (const msg of messages) {
        expect(msg.id).toBeTruthy();
        expect(msg.label).toBeTruthy();
        expect(msg.description).toBeTruthy();
        expect(msg.icon).toBeTruthy();
      }
    }
  });
});

describe("emptyStateTemplates", () => {
  it("has templates for all workspace panels", () => {
    const keys = ["research", "notes", "knowledge", "documents", "mindmap", "whiteboard", "timeline", "tasks"];
    for (const key of keys) {
      expect(emptyStateTemplates).toHaveProperty(key);
      const template = emptyStateTemplates[key as keyof typeof emptyStateTemplates];
      expect(template.title).toBeTruthy();
      expect(template.description).toBeTruthy();
      expect(template.action).toBeTruthy();
    }
  });
});

describe("errorTemplates", () => {
  it("has error templates for all error types", () => {
    const keys = ["api_key", "network", "rate_limit", "empty_response", "timeout", "generic"];
    for (const key of keys) {
      expect(errorTemplates).toHaveProperty(key);
      const template = errorTemplates[key as keyof typeof errorTemplates];
      expect(template.title).toBeTruthy();
      expect(template.description).toBeTruthy();
      expect(template.recovery).toBeTruthy();
      expect(template.action).toBeTruthy();
    }
  });
});
