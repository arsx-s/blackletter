# Operating-contract review — Mission 17

This is an evidence review of observable implementation and tests, not a guarantee of safety, truth, or broad alignment. A prompt or document alone does not count as enforcement.

| Principle | Status | Evidence and residual failure mode | Next action |
|---|---|---|---|
| Truth over agreement | PARTIAL | Pipeline includes quality/evaluation and uncertainty language; the model can still assert a falsehood, and no independent fact checker validates arbitrary claims. | Add held-out adversarial factuality evaluation before stronger claims. |
| Evidence over confidence | PARTIAL | Retrieval chunks carry source names and grounding guidance; confidence is explicitly heuristic and not empirically calibrated. A plausible uncited answer can still pass some checks. | Collect licensed held-out labels and report calibration/error bars. |
| Human agency over dependence | IMPLEMENTED IN UI, NOT OUTCOME-VERIFIED | Operator controls include stop, approvals, editable memory, task/history views. There is no study measuring user understanding or dependence. | Conduct usability study with consent and task-outcome measures. |
| Transparency over mystique | PARTIAL | Tasks, tool results, refusals, provenance, and run diagnostics are inspectable; provider internals and hidden model reasoning are not exposed or independently verifiable. | Preserve concise evidence, state, and error records; do not present hidden reasoning as evidence. |
| Privacy over collection | PARTIAL | Primary storage is local and allowlisted backup exists; inference sends prompts and included extracted text remotely, and browser local storage is not a security boundary. | Make egress explicit per action and review provider retention settings. |
| Permission over initiative | IMPLEMENTED FOR REGISTERED ACTIONS | Tool registry/gateway checks grants and operator approvals; no arbitrary shell or generic network tool exists. A future or compromised renderer tool could exceed this boundary. | Require policy tests and review before every new capability. |
| Correction over ego | PARTIAL | Memory has provenance/edit/delete operations and integrity history; correction does not establish the truth of replacement information. | Keep correction events traceable and label source/uncertainty. |
| Verification over self-evaluation | PARTIAL | Deterministic tests and fixture evaluation exist; fixture success is not a real-model result and there is no independent live quality benchmark. | Add human-reviewed held-out tests and independent reviewers. |
| Rollback over irreversible experimentation | PARTIAL | Allowlisted backup/restore and code rollback instructions exist; no model promotion is implemented. Packaged data restore/rollback is not runtime-tested. | Verify backup/restore on each supported packaged target. |
| Human flourishing over engagement | UNKNOWN | The product does not claim conversation-time optimization, but there is no measured outcome framework or telemetry audit proving incentives. | Define and audit task completion/quality measures before adding engagement metrics. |

## Cross-cutting checks

- **Self-authorization:** tool grants and approval policy are code-owned; model output cannot edit the registry or release permissions. Tests cover unknown/unauthorized actions.
- **Silent model promotion:** no training or model promotion path is shipped. Candidate training is only a design/dry-run, pending human approval.
- **Untrusted content:** retrieved documents, webpages, and tool outputs are data. This reduces direct policy override risk but cannot guarantee that the model ignores injection text.
- **Execution status:** task transitions are explicit and tested, active runs have cancellation controllers, and the global stop blocks new registered work. Storage failure or a wedged process remains a residual risk.
- **Unsupported claims:** the project documents no consciousness, general intelligence, autonomous scientific discovery, or guaranteed corrigibility.
- **Planned vs working:** multimodal and the research-science workflow are marked design-only; learning is offline design/dry-run; local model capability depends on runtime probes.

## Verdict

**PARTIAL / NOT CERTIFIED.** The application has meaningful code-level boundaries and tests for several high-impact paths, but remote inference, renderer execution, heuristic quality signals, absent independent model evaluation, and unverified packaged deployment leave material residual risks. “Compliant” would overstate the evidence. The release decision remains NO-GO until the conditions in `docs/release-readiness.md` are addressed.
