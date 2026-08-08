import { describe, it, expect } from "vitest";
import { colors, spacing, radii, shadows, typography, breakpoints, zIndex } from "../../studio/tokens";

describe("Studio Tokens", () => {
  describe("colors", () => {
    it("has all required color roles", () => {
      const roles = ["brand", "accent", "surface", "text", "border", "learning", "research", "knowledge", "success", "warning", "error", "source", "connection"];
      for (const role of roles) {
        expect(colors).toHaveProperty(role);
      }
    });

    it("brand has full shade scale", () => {
      const shades = [50, 100, 200, 300, 400, 500, 600, 700, 800, 900, 950];
      for (const shade of shades) {
        expect(colors.brand).toHaveProperty(String(shade));
      }
    });

    it("accent has full shade scale", () => {
      const shades = [50, 100, 200, 300, 400, 500, 600, 700, 800, 900, 950];
      for (const shade of shades) {
        expect(colors.accent).toHaveProperty(String(shade));
      }
    });

    it("surface has all semantic keys", () => {
      const keys = ["base", "elevated", "card", "modal", "sidebar", "panel", "input", "panel-header"];
      for (const key of keys) {
        expect(colors.surface).toHaveProperty(key);
      }
    });

    it("text has all semantic keys", () => {
      const keys = ["primary", "secondary", "tertiary", "inverted", "link", "link-hover", "disabled", "placeholder"];
      for (const key of keys) {
        expect(colors.text).toHaveProperty(key);
      }
    });

    it("border has all semantic keys", () => {
      const keys = ["light", "medium", "focus", "divider"];
      for (const key of keys) {
        expect(colors.border).toHaveProperty(key);
      }
    });

    it("all color values are non-empty strings", () => {
      for (const [, shades] of Object.entries(colors)) {
        for (const [, value] of Object.entries(shades)) {
          expect(value).toBeTruthy();
          expect(typeof value).toBe("string");
          expect(value.length).toBeGreaterThan(0);
        }
      }
    });
  });

  describe("spacing", () => {
    it("has all spacing levels from xs to 10xl", () => {
      const keys = ["xs", "sm", "md", "lg", "xl", "2xl", "3xl", "4xl", "5xl", "6xl", "7xl", "8xl", "9xl", "10xl"];
      for (const key of keys) {
        expect(spacing).toHaveProperty(key);
      }
    });

    it("values increase monotonically", () => {
      const values = Object.values(spacing);
      for (let i = 1; i < values.length; i++) {
        expect(values[i]).toBeGreaterThan(values[i - 1]);
      }
    });

    it("returns numbers", () => {
      expect(typeof spacing.md).toBe("number");
    });
  });

  describe("radii", () => {
    it("has all radius tokens", () => {
      const keys = ["none", "sm", "md", "lg", "xl", "2xl", "full"];
      for (const key of keys) {
        expect(radii).toHaveProperty(key);
      }
    });

    it("returns string values", () => {
      expect(typeof radii.sm).toBe("string");
    });
  });

  describe("shadows", () => {
    it("has elevation levels 0-5", () => {
      for (let i = 0; i <= 5; i++) {
        expect(shadows).toHaveProperty(String(i));
      }
    });

    it("level 0 is none", () => {
      expect(shadows[0]).toBe("none");
    });

    it("higher levels have more shadow layers", () => {
      const commaCount = (s: string) => (s.match(/,/g) || []).length;
      expect(commaCount(shadows[5])).toBeGreaterThanOrEqual(commaCount(shadows[2]));
    });
  });

  describe("typography", () => {
    it("has three font families", () => {
      expect(typography.fontFamily).toHaveProperty("sans");
      expect(typography.fontFamily).toHaveProperty("mono");
      expect(typography.fontFamily).toHaveProperty("serif");
    });

    it("has 10 font sizes from xs to 6xl", () => {
      const keys = ["xs", "sm", "base", "lg", "xl", "2xl", "3xl", "4xl", "5xl", "6xl"];
      for (const key of keys) {
        expect(typography.fontSize).toHaveProperty(key);
      }
    });

    it("font sizes increase", () => {
      const sizes = Object.values(typography.fontSize).map((s) => parseInt(s));
      for (let i = 1; i < sizes.length; i++) {
        expect(sizes[i]).toBeGreaterThan(sizes[i - 1]);
      }
    });

    it("has all font weights", () => {
      expect(typography.fontWeight).toHaveProperty("normal", 400);
      expect(typography.fontWeight).toHaveProperty("medium", 500);
      expect(typography.fontWeight).toHaveProperty("semibold", 600);
      expect(typography.fontWeight).toHaveProperty("bold", 700);
    });

    it("has all line heights", () => {
      expect(typography.lineHeight).toHaveProperty("tight");
      expect(typography.lineHeight).toHaveProperty("normal");
      expect(typography.lineHeight).toHaveProperty("relaxed");
    });
  });

  describe("breakpoints", () => {
    it("has all breakpoints", () => {
      expect(breakpoints).toHaveProperty("sm", 640);
      expect(breakpoints).toHaveProperty("md", 768);
      expect(breakpoints).toHaveProperty("lg", 1024);
      expect(breakpoints).toHaveProperty("xl", 1280);
      expect(breakpoints).toHaveProperty("2xl", 1536);
    });
  });

  describe("zIndex", () => {
    it("has all z-index layers", () => {
      expect(zIndex.base).toBe(0);
      expect(zIndex.dropdown).toBe(100);
      expect(zIndex.sticky).toBe(200);
      expect(zIndex.overlay).toBe(300);
      expect(zIndex.modal).toBe(400);
      expect(zIndex.popover).toBe(500);
      expect(zIndex.toast).toBe(600);
      expect(zIndex.tooltip).toBe(700);
    });
  });
});
