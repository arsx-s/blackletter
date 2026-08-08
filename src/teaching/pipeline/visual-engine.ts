import type { VisualPreferences, VisualType } from "../types";

interface VisualInstruction {
  type: VisualType;
  trigger: string;
  instruction: string;
  example: string;
}

const VISUAL_INSTRUCTIONS: VisualInstruction[] = [
  {
    type: "table",
    trigger: "When comparing multiple items, dimensions, or approaches",
    instruction: "Create a table with clear column headers and rows. Each row should compare the same dimension across items. Use --- for alignment. Put the most important comparison dimension in the first column.",
    example: "| Feature | Approach A | Approach B |\n|---------|-----------|-----------|\n| Speed   | Fast      | Slow      |\n| Cost    | Expensive | Cheap     |",
  },
  {
    type: "comparison",
    trigger: "When showing trade-offs, pros/cons, or alternatives",
    instruction: "Use a side-by-side comparison format. Present both sides with equal depth. Use a structured format: Criteria → Option 1 → Option 2 → Verdict.",
    example: "**Criteria:** Scalability\n- **Option A:** Handles 1000 req/s, easy to set up\n- **Option B:** Handles 10000 req/s, complex to configure\n- **Verdict:** Choose A for MVPs, B for production",
  },
  {
    type: "ascii-diagram",
    trigger: "When showing structural relationships, hierarchies, or component interactions",
    instruction: "Use ASCII characters to draw diagrams. Keep them simple. Use labels inside or adjacent to elements. Use arrows (→, ←, ↓, ↑) for flow. Use box characters (┌ ┐ └ ┘ │ ─) for structure.",
    example: "┌──────────┐     ┌──────────┐\n│  Input   │────→│  Process │\n└──────────┘     └──────────┘\n                        │\n                        ↓\n                 ┌──────────┐\n                 │  Output  │\n                 └──────────┘",
  },
  {
    type: "process-flow",
    trigger: "When explaining a sequence of steps, a workflow, or a pipeline",
    instruction: "Use numbered steps with clear transitions. Show the flow between steps. Indicate decision points (if/then) and parallel paths. Use indentation to show hierarchy.",
    example: "1. **Input** → Receive raw data\n2. **Validate** → Check data quality\n   ├─ Valid → Continue to step 3\n   └─ Invalid → Return to sender\n3. **Process** → Apply transformation",
  },
  {
    type: "decision-tree",
    trigger: "When showing branching logic, choices, or conditional structures",
    instruction: "Start with the initial decision point. Branch based on conditions. End each branch with an outcome or recommendation. Use indentation to show tree depth.",
    example: "Is data structured?\n├─ Yes → Use SQL approach\n│   ├─ Small dataset? → Simple query\n│   └─ Large dataset? → Optimize with indexes\n└─ No → Use NoSQL approach\n    ├─ Documents? → MongoDB\n    └─ Graphs? → Neo4j",
  },
  {
    type: "concept-map",
    trigger: "When showing relationships between multiple ideas, cause and effect, or theoretical frameworks",
    instruction: "Place the central concept in the center. Connect related concepts with labeled lines. Show direction of relationship with arrows. Group related concepts in clusters.",
    example: "       [Algorithm]\n       /    |    \\\n      ↓     ↓     ↓\n[Input] [Process] [Output]\n      \\    |    /\n       ↓   ↓   ↓\n     [Complexity]",
  },
  {
    type: "timeline",
    trigger: "When showing historical development, project phases, or evolution of ideas",
    instruction: "List events in chronological order. Mark the date/time for each event. Add brief descriptions. Use milestones for key transitions. Show before/after states.",
    example: "2010 ─── Idea conceived\n2012 ─── First prototype (milestone)\n2014 ─── v1.0 released\n2016 ─── Major redesign\n2018 ─── Industry standard\n2020 ─── Next generation",
  },
];

export class VisualThinkingEngine {
  buildInstruction(preferences: VisualPreferences): string {
    if (!preferences.enabled) {
      return "";
    }

    const lines: string[] = [
      `## VISUAL THINKING`,
      ``,
      `Whenever a concept would be clearer with a visual representation, generate one. Use visual thinking to reveal structure, relationships, and flows that would be harder to communicate with paragraphs alone.`,
      ``,
    ];

    const preferredTypes = preferences.preferredTypes;
    const typeInstructions = VISUAL_INSTRUCTIONS
      .filter((vi) => preferredTypes.includes(vi.type))
      .map((vi) => {
        return [
          `### ${formatTypeName(vi.type)}`,
          `${vi.trigger}:`,
          vi.instruction,
          ``,
          `Example:`,
          `\`\`\``,
          vi.example,
          `\`\`\``,
        ].join("\n");
      });

    if (typeInstructions.length > 0) {
      lines.push(`Available visual types (use these when applicable):`);
      lines.push(``);
      lines.push(typeInstructions.join("\n\n"));
      lines.push(``);
    }

    if (preferences.frequency === "always") {
      lines.push(`REQUIREMENT: Every response MUST include at least one visual element from the available types above.`);
    } else if (preferences.frequency === "when-useful") {
      lines.push(`GUIDELINE: Use visual elements when they make the concept clearer. Do not force visuals where text is sufficient.`);
    }

    if (preferences.guidelines) {
      lines.push(``);
      lines.push(`Additional visual guidelines:`);
      lines.push(preferences.guidelines);
    }

    lines.push(``);
    lines.push(`General visual principles:`);
    lines.push(`- Every visual must have a brief caption explaining what it shows and why it matters`);
    lines.push(`- Keep visuals simple — one idea per visual`);
    lines.push(`- Use alignment and spacing for readability`);
    lines.push(`- Label all elements clearly`);
    lines.push(`- If a visual would be too complex, break it into multiple simpler visuals`);

    return lines.join("\n");
  }
}

function formatTypeName(type: string): string {
  return type
    .split("-")
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(" ");
}
