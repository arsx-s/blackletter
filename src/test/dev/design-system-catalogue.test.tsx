import { describe, expect, test } from "vitest";
import { render, screen } from "@testing-library/react";
import { DesignSystemCatalogue } from "../../components/dev/DesignSystemCatalogue";

const SECTIONS = [
  "Colour roles",
  "Type scale",
  "Surfaces",
  "Buttons & interaction",
  "Radius, elevation & spacing",
  "Motion",
];

describe("design system catalogue", () => {
  test("renders one section per token family", () => {
    render(<DesignSystemCatalogue />);

    for (const heading of SECTIONS) {
      expect(screen.getByRole("heading", { level: 2, name: heading })).toBeTruthy();
    }
  });

  test("documents the colour roles by token name", () => {
    render(<DesignSystemCatalogue />);

    for (const token of ["--background", "--surface", "--accent", "--border", "--text-muted"]) {
      expect(screen.getByText(token)).toBeTruthy();
    }
  });
});
