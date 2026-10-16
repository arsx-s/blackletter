# Independent control plane and recovery review

**Scope:** Mission 14. This is an implementation review of BlackLetter 3.2.0, not a claim of perfect containment or corrigibility. The model cannot approve its own permissions, release a model, or deploy the application.

## Assets and trust boundaries

| Asset / boundary | Current handling | Residual risk |
|---|---|---|
| Provider credential | Held by `api/chat.ts` or `scripts/dev-server.mjs`; never supplied by the renderer. Hosted relay refuses requests until `BLACKLETTER_RELAY_TOKEN` is configured. | Relay token is shared bearer access stored in browser local storage; XSS or a compromised device can use it. No identities, expiry, per-user revocation, or rotation workflow is built in. |
| User research and memory | IndexedDB, with localStorage fallback in the browser profile. | Same-origin script access can read it; browser profile/device access is not isolated. User documents are sent as extracted prompt text when attached to remote inference. |
| Relay boundary | Shared validation, body limits, allowlisted model ids, rate limit, origin check, abort bridge, and redacted stable errors. Local relay defaults to loopback. | Origin is not authentication. Rate limiting is process-local. Forwarded client IP is only trustworthy behind a correctly configured proxy. Explicitly setting a non-loopback local host widens exposure. |
| Renderer ↔ Electron main | Context isolation and disabled Node integration; external URLs permit only bounded HTTP(S), reject URL credentials, and untrusted renderer navigation is blocked. IPC is limited to the trusted main frame. | Electron package/build has not been launched here. Renderer XSS remains a risk; OS-level sandboxing and packaged signing/update policy are not independently verified. |
| Model and external content | Model output and retrieved document/web content are treated as untrusted; tool policy is code-owned, and high-impact tools require an operator approval record. | Prompt-injection resistance is not a formal security boundary. Model outputs can still be wrong or manipulative. |
| Tools and filesystem/network | Typed registry and policy gateway; no arbitrary shell, package-manager, filesystem write, or general network-fetch tool is registered. Web retrieval has URL and redirect checks. | Tools execute in renderer JavaScript, not an OS sandbox. A future tool must receive a separate capability and threat review before registration. |
| Persistent state and recovery | Allowlisted backup keys, version/shape validation, atomic IndexedDB writes, and localStorage rollback on a failed multi-write attempt. | localStorage rollback is best effort if storage itself remains unavailable. App-store restore requires reload. Host data-directory backup and packaged rollback are operator procedures, not verified automation. |
| Stop control | Persisted operator stop, registered active chat/research controllers, and task/tool checks prevent new work while engaged. | Cannot interrupt synchronous JavaScript mid-function or force-stop a wedged OS/process. Stop must be loaded at startup and errors in storage can limit persistence. |

## Abuse cases and controls

1. **Unauthenticated relay spend:** hosted relay denies missing/invalid bearer token; model, body, prompt size, and rate are bounded. The host must configure the token before use.
2. **Cross-site/browser request:** same-origin policy and restrictive CORS headers constrain browsers. Non-browser clients can forge `Origin`, so hosted bearer auth remains required.
3. **Untrusted document or web page instructs the model:** content remains quoted/contextual evidence; it cannot alter application policy or tool grants. Human review and output checks remain necessary.
4. **Model requests a dangerous tool:** unknown tools, invalid arguments, insufficient grants, missing approval, or an engaged stop are denied in code before execution.
5. **Renderer opens a privileged or deceptive URL:** Electron denies new windows, only delegates HTTP(S) URLs without embedded credentials, and prevents navigation away from the trusted renderer origin/document.
6. **Malformed or hostile backup:** size, version, key allowlist, and per-key shapes are checked before writes; IndexedDB writes use one transaction.
7. **Stop occurs during a request:** abort controllers are registered and aborted; stale completion is ignored. No claim is made that synchronous code or the host process can be forcibly interrupted.
8. **Candidate model or code self-promotes:** no training, model registry promotion, installer, deployment, or release action is exposed to the model. Human-owned release remains outside runtime permissions.

## Recovery procedure

1. Export from the Control panel and keep the JSON outside the application profile. The file contains personal research; protect it accordingly.
2. For a desktop host-level snapshot, close BlackLetter first, then copy the Electron user-data directory resolved by the installed Electron runtime (`app.getPath("userData")`). The exact location depends on OS and packaging; this repository does not guess a path or claim this procedure was exercised on a packaged build.
3. Restore the in-app export through the Control panel. It validates the complete payload before writing and asks for a reload before stores rehydrate.
4. For a code release, retain the previous signed/known-good installer and use the platform's normal uninstall/reinstall or package rollback procedure. This repo has no automatic updater or model release mechanism.
5. After recovery, keep the global stop engaged until the operator confirms state and provider configuration.

## Verification boundary

Unit and architecture tests cover relay policy, tool authorization, stop behavior, backup validation/rollback, and Electron URL policy. A test does not prove a hostile packaged runtime is contained. The hosted proxy trust chain, OS sandboxing, signing, full app-data restore, and a real provider/Ollama runtime have not been verified by this repository's test suite. See `docs/release-readiness.md` for the exact current command results and release gate.
