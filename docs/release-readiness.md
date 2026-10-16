# Release readiness — Mission 15

**Decision: NO-GO for a public/hosted release from this review.** The repository builds and its local test suite can validate the implemented boundaries, but hosted deployment configuration, packaged desktop behavior, real provider compatibility, and browser visual QA are not verified here. No deployment, paid API call, model download, or training run was performed.

## Intended use

Personal research workspace for organizing user-provided material and drafting reports. It is not a verified scientific discovery system, an autonomous operator, or a calibrated decision system. Remote inference sends the prompt and included extracted document text to the configured provider.

## Feature status

| Area | Status | Evidence boundary |
|---|---|---|
| Relay validation, hosted bearer auth, limits, safe errors | IMPLEMENTED AND TESTED | Shared guard and relay tests; hosted token must be configured. No live host/proxy test. |
| Cancellation and operator stop | IMPLEMENTED AND TESTED | Abort propagation and stop/controller tests; cannot interrupt synchronous JS or kill a process. |
| Live pipeline/model default | IMPLEMENTED AND TESTED | Architecture guard and build; one live barrel to graph. The second pipeline file is retained but deliberately unreferenced. |
| Text/document extraction and grounding | IMPLEMENTED AND TESTED | Fixture/unit coverage; format-specific limits remain. No independent corpus accuracy benchmark. |
| Memory CRUD/provenance | IMPLEMENTED AND TESTED | Local fixture and storage tests; remote-model quality not assessed. |
| Evaluation/calibration harness | IMPLEMENTED AND TESTED (harness only) | Fixture replay; no real model was evaluated and confidence remains heuristic, not probability. |
| Ollama adapter | IMPLEMENTED BUT NOT RUNTIME-VERIFIED | Mocked protocol tests; no local runtime/model probe. Ornith 9B compatibility is UNKNOWN. |
| Policy-enforced tools and web research | IMPLEMENTED AND TESTED (bounded local behavior) | Registry/policy and mocked research tests; no claim of broad web coverage or perfect citation correctness. |
| Bounded tasks/projects/scheduling | PARTIAL | Durable records, deterministic plans, budgets and recovery exist. Scheduling is intent/due calculation; no background worker or execution while closed. Level 3 is unavailable. |
| Multimodal | NOT IMPLEMENTED | Mission 12 plan and fail-closed text contract only; no image/audio/video path. |
| Learning lab | DESIGN/DRY-RUN ONLY | Offline fixture/protocol documentation. No dataset or weights downloaded; no training or promotion. |
| Independent control/recovery | IMPLEMENTED AND TESTED (application layer) | Threat model plus unit tests. Packaged OS sandbox, signing, data-dir recovery, and external proxy not runtime-verified. |
| Domain-bounded research workflow | DESIGN ONLY | Reproducible human-led procedure; no scientific simulation/experiment engine. |
| Operating contract | REVIEW DOCUMENTED | Evidence and residual-risk matrix in `docs/operating-contract-audit.md`; not a certification. |

## Verification commands and evidence

Observed after the mission implementation and test fixes:

```powershell
npm.cmd run build
npm.cmd run lint
npm.cmd run test
```

- `npm.cmd run build` — **passed** (`tsc -b` and Vite production build). Vite reports the main JS chunk at 902.22 kB minified (277.59 kB gzip), above its 500 kB advisory threshold.
- `npm.cmd run lint` — **passed with 0 errors and 110 warnings**. The warnings include existing unused symbols and React refresh/hook advisories across legacy modules.
- `npm.cmd run test` — **passed: 78 test files, 1069 tests**. The test run was repeated after two stale assertions were aligned to the stricter backup parser.

The evaluation harness default fixture set is documented separately in `docs/evaluation.md`. It is a deterministic fixture result, not a model benchmark. Browser viewport/console/network QA and Lighthouse were not completed in this task, and no performance benchmark beyond the bundler's build output was collected.

## Release blockers and limits

- Configure and independently test `BLACKLETTER_RELAY_TOKEN` at the real hosted boundary and ensure HTTPS, trusted proxy behavior, and secret storage are correct.
- Resolve lint warnings; lint currently has legacy warnings even when it exits successfully.
- Review the large renderer bundle warning and measure cold-start/runtime performance on target hardware.
- Run packaged Electron navigation/IPC checks on supported OS builds, sign artifacts, and exercise user-data backup/restore.
- Probe each supported Ollama model against the runtime it claims to support. Do not infer Ornith 9B compatibility from its name.
- Run a separately approved visual QA session at 1440, 834, and 390 px, with console/network inspection and Lighthouse.
- Measure extraction and citation fidelity on an independently curated, licensed, held-out corpus.

## Recovery and rollback

Keep an exported in-app backup and a known-good installer/release. To roll back code, revert the release commit or reinstall the retained package; do not rewrite shared history. Restore the allowlisted app export and reload. Packaged app-data snapshots require closing the application and resolving Electron's actual `userData` path on the target system; this procedure has not been exercised here. There is no model-release rollback path because model promotion is not implemented.

## Roadmap

1. Verify hosted deployment auth/proxy configuration and run a security review against the actual host.
2. Perform packaged Electron and visual QA on target platforms.
3. Establish independently reviewed extraction, citation, and calibration datasets.
4. Measure a supported local model on the intended hardware; only then make compatibility claims.
5. Add scheduled execution only with an explicit lifecycle, consent, persistence, stop, and restart design.
6. Consider one modality only after selecting a model with measured support, consent UX, egress policy, and tests.
7. Keep learning isolated until a human-approved objective, dataset provenance, resource budget, independent evaluation, and rollback are available.
