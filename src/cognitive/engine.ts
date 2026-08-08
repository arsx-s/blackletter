import { LearnerProfileManager } from "./profile/learner-profile";
import { KnowledgeConfidenceEstimator } from "./profile/knowledge-confidence";
import { LearningPatternDetector } from "./observation/pattern-detector";
import { ConfusionDetector } from "./observation/confusion-detector";
import { AutomaticTeachingAdapter, type AdaptedConfig } from "./adaptation/teaching-adapter";
import { ExplanationVariationSelector } from "./adaptation/explanation-selector";
import { ProgressIntelligence, type ProgressReport, type ProgressMetrics } from "./progress/progress-intelligence";
import { CognitiveSmartContinuations, type CognitiveNextStep } from "./progress/smart-continuations";
import type {
  LearnerProfile,
  InteractionEvent,
  ConfusionSignal,
  CognitiveOverride,
  ExplanationStyle,
} from "./types";

export class CognitiveEngine {
  private profileManager: LearnerProfileManager;
  private confidenceEstimator: KnowledgeConfidenceEstimator;
  private patternDetector: LearningPatternDetector;
  private confusionDetector: ConfusionDetector;
  private teachingAdapter: AutomaticTeachingAdapter;
  private explanationSelector: ExplanationVariationSelector;
  private progressIntelligence: ProgressIntelligence;
  private continuationGenerator: CognitiveSmartContinuations;

  constructor() {
    this.profileManager = new LearnerProfileManager();
    this.confidenceEstimator = new KnowledgeConfidenceEstimator();
    this.patternDetector = new LearningPatternDetector();
    this.confusionDetector = new ConfusionDetector();
    this.teachingAdapter = new AutomaticTeachingAdapter();
    this.explanationSelector = new ExplanationVariationSelector();
    this.progressIntelligence = new ProgressIntelligence();
    this.continuationGenerator = new CognitiveSmartContinuations();
  }

  getProfile(): LearnerProfile {
    return this.profileManager.getProfile();
  }

  getAdaptedConfig(): AdaptedConfig {
    return this.teachingAdapter.adapt(this.getProfile());
  }

  recordInteraction(event: InteractionEvent): void {
    const profile = this.profileManager.getProfile();
    this.patternDetector.recordEvent(profile, event);
  }

  recordQuery(query: string): void {
    this.confusionDetector.recordQuery(query);
    this.confusionDetector.updateTimestamp();
  }

  recordScroll(): void {
    this.confusionDetector.recordScroll();
  }

  updateReadingTime(timeMs: number): void {
    const profile = this.profileManager.getProfile();
    this.patternDetector.updateReadingTime(profile, timeMs);
  }

  recordConceptInteraction(
    conceptId: string,
    conceptLabel: string,
    relatedConcepts?: string[],
    preferredStyle?: ExplanationStyle,
  ): void {
    const profile = this.profileManager.getProfile();
    this.confidenceEstimator.recordInteraction(profile, conceptId, conceptLabel, relatedConcepts, preferredStyle);
  }

  recordTestResult(conceptId: string, correct: boolean): void {
    const profile = this.profileManager.getProfile();
    this.confidenceEstimator.recordTestResult(profile, conceptId, correct);
  }

  detectConfusion(events?: InteractionEvent[]): ConfusionSignal[] {
    const profile = this.profileManager.getProfile();
    return this.confusionDetector.analyze(profile, events ?? []);
  }

  applyOverride(overrides: Partial<CognitiveOverride>): CognitiveOverride {
    const profile = this.profileManager.getProfile();
    return this.teachingAdapter.createOverride(profile, overrides);
  }

  clearOverride(): void {
    const profile = this.profileManager.getProfile();
    this.teachingAdapter.clearOverride(profile);
  }

  selectExplanationStyle(
    conceptId?: string,
    context?: { isNewTopic?: boolean; hasConfusion?: boolean; requestedDepth?: number },
  ): ExplanationStyle {
    const profile = this.profileManager.getProfile();
    return this.explanationSelector.selectBestStyle(profile, conceptId, context);
  }

  getProgressReport() {
    const profile = this.profileManager.getProfile();
    return this.progressIntelligence.generateReport(profile);
  }

  getNextSteps(currentQuery: string, currentSubject: string, detectedConcepts: string[]) {
    const profile = this.profileManager.getProfile();
    return this.continuationGenerator.generateNextSteps(profile, currentQuery, currentSubject, detectedConcepts);
  }

  endSession(): void {
    const profile = this.profileManager.getProfile();
    this.patternDetector.analyzeAndAdapt(profile);
    this.profileManager.endSession();
  }

  persist(): void {
    const profile = this.profileManager.getProfile();
    this.patternDetector.analyzeAndAdapt(profile);
    this.profileManager.save();
  }

  resetProfile(): void {
    this.profileManager.reset();
  }

  getStyleVariants() {
    return this.explanationSelector.getAllVariants();
  }

  getExplanationSelector(): ExplanationVariationSelector {
    return this.explanationSelector;
  }
}
