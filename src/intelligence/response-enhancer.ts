export class ResponseEnhancer {
  enhance(response: string): string {
    if (!response || response.trim().length === 0) return response;

    let enhanced = response;

    enhanced = this.ensureLearningHeader(enhanced);
    enhanced = this.ensureSummarySection(enhanced);
    enhanced = this.ensureMemorySection(enhanced);
    enhanced = this.ensureExerciseSection(enhanced);
    enhanced = this.ensureTakeawaysSection(enhanced);
    enhanced = this.ensureProperLineBreaks(enhanced);

    return enhanced;
  }

  private ensureLearningHeader(response: string): string {
    if (this.hasSection(response, "learning goal") || this.hasSection(response, "🎯")) {
      return response;
    }

    const lines = response.split("\n");
    const firstContent = lines.findIndex((l) => l.trim().length > 0);

    if (firstContent >= 0 && firstContent < lines.length) {
      const firstLine = lines[firstContent].trim();
      if (firstLine.startsWith("#") || firstLine.includes("━━")) {
        return response;
      }
    }

    const learningGoal = this.extractLearningGoal(response);
    const timeEstimate = this.estimateReadTime(response);

    const header = `🎯 Learning Goal: ${learningGoal}
⏱ Estimated Read Time: ${timeEstimate}
📋 Focus: Core understanding with practical examples

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

`;

    return header + response;
  }

  private ensureSummarySection(response: string): string {
    if (this.hasSection(response, "summary") || this.hasSection(response, "key takeaway")) {
      return response;
    }

    if (response.length < 300) return response;

    const bullets = this.extractKeyBullets(response);
    if (bullets.length === 0) return response;

    const summary = `

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
📝 Summary — Key Takeaways
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

${bullets.slice(0, 5).map((b) => `• ${b}`).join("\n")}
`;

    return response + summary;
  }

  private ensureMemorySection(response: string): string {
    if (this.hasSection(response, "memory") || this.hasSection(response, "🧠")) {
      return response;
    }

    if (response.length < 500) return response;

    const hasTip = this.hasSection(response, "💡");
    if (hasTip) return response;

    const memoryTrick = this.generateMemoryHook(response);

    const memory = `

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
🧠 How to Remember This
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

${memoryTrick}
`;

    const lastSummary = response.lastIndexOf("📝 Summary");
    if (lastSummary >= 0) {
      return response.slice(0, lastSummary) + memory + "\n\n" + response.slice(lastSummary);
    }

    return response + memory;
  }

  private ensureExerciseSection(response: string): string {
    if (this.hasSection(response, "exercise") || this.hasSection(response, "checkpoint") || this.hasSection(response, "✅")) {
      return response;
    }

    if (response.length < 400) return response;

    const exercise = `

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
✋ Quick Check — Test Your Understanding
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

Before moving on, try to answer:
1. **Recall**: What is the single most important idea from this section?
2. **Apply**: Can you think of a situation where this concept applies?
3. **Connect**: How does this relate to what you already know?

> 💡 Take 30 seconds to think before reading on.
`;

    const lastSection = this.findLastSectionEnd(response);
    if (lastSection >= 0) {
      return response.slice(0, lastSection) + exercise + "\n\n" + response.slice(lastSection);
    }

    return response + exercise;
  }

  private ensureTakeawaysSection(response: string): string {
    if (this.hasSection(response, "takeaway") || this.hasSection(response, "next step")) {
      return response;
    }

    if (response.length < 400) return response;

    const takeaways = `

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
🎯 Actionable Takeaways
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

Now that you understand this concept, here's what to do next:
• **Review** the key points again in 24 hours for better retention
• **Practice** by explaining this concept to someone else
• **Apply** it to a real problem you're working on
• **Explore** related concepts to deepen your understanding

> 📝 The best way to learn is to teach. Try explaining this to a friend.
`;

    return response + takeaways;
  }

  private ensureProperLineBreaks(response: string): string {
    const paragraphs = response.split(/\n\s*\n/);
    const reformatted = paragraphs.map((p) => {
      const sentences = p.split(/(?<=[.!?])\s+/);
      if (sentences.length > 5 && !p.includes("\n-") && !p.includes("\n*") && !p.includes("\n|")) {
        const mid = Math.ceil(sentences.length / 2);
        return sentences.slice(0, mid).join(" ") + "\n" + sentences.slice(mid).join(" ");
      }
      return p;
    });

    return reformatted.join("\n\n");
  }

  private hasSection(text: string, keyword: string): boolean {
    const regex = new RegExp(
      `(?:^|\\n)(?:#{1,3}\\s*)?\\**\\s*(?:━━+\\s*)?${keyword}.*?(?:\\n|$)`,
      "im"
    );
    return regex.test(text);
  }

  private extractLearningGoal(response: string): string {
    const firstSentence = response.split(/[.!?]/)[0]?.trim();
    if (firstSentence && firstSentence.length > 10 && firstSentence.length < 200) {
      if (firstSentence.length > 100) return firstSentence.slice(0, 97) + "...";
      return firstSentence;
    }
    return "Understand the core concepts and their practical applications";
  }

  private estimateReadTime(response: string): string {
    const wordCount = response.split(/\s+/).length;
    const minutes = Math.max(1, Math.ceil(wordCount / 200));
    return `${minutes} min`;
  }

  private extractKeyBullets(response: string): string[] {
    const keySentences: string[] = [];
    const sentences = response.split(/[.!?]+/);

    const importanceMarkers = /(important|key|crucial|essential|critical|fundamental|primary|main|significant|notable|remember|note)/i;

    for (const sentence of sentences) {
      const trimmed = sentence.trim();
      if (trimmed.length > 20 && trimmed.length < 200 && importanceMarkers.test(trimmed)) {
        keySentences.push(trimmed);
      }
    }

    const firstHalf = response.slice(0, Math.floor(response.length / 2));
    const firstSentences = firstHalf.split(/[.!?]+/).filter((s) => s.trim().length > 30);
    if (firstSentences.length > 0 && keySentences.length < 3) {
      keySentences.push(firstSentences[0].trim());
    }

    return [...new Set(keySentences)].slice(0, 5);
  }

  private generateMemoryHook(response: string): string {
    const keyTerms = response.match(/\b[A-Z][a-z]{3,}\b/g) || [];
    const uniqueTerms = [...new Set(keyTerms)].slice(0, 3);

    if (uniqueTerms.length >= 2) {
      const acronym = uniqueTerms.map((t) => t[0]).join("");
      return `Think **${acronym}** — ${uniqueTerms[0]}, ${uniqueTerms[1]}${uniqueTerms[2] ? `, ${uniqueTerms[2]}` : ""}. This acronym captures the core elements of this topic.`;
    }

    return "Review this concept within 24 hours, then again in 7 days. Spaced repetition is the most effective way to move knowledge into long-term memory.";
  }

  private findLastSectionEnd(response: string): number {
    const sectionMarkers = response.match(/^#{1,3}\s+\w|^[A-Z][A-Z\s]{3,}$|^━━━/gm);
    if (sectionMarkers && sectionMarkers.length > 1) {
      const lastMarker = sectionMarkers[sectionMarkers.length - 1];
      return response.lastIndexOf(lastMarker);
    }
    return -1;
  }
}

export const responseEnhancer = new ResponseEnhancer();
