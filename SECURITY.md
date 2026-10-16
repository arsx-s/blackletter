# Security Policy

BlackLetter takes the privacy of your research seriously. This policy describes how to report a security issue and what you can expect in return.

## Supported versions

Security fixes are applied to the latest released version of BlackLetter. Please upgrade to the newest release before reporting a vulnerability.

## Reporting a vulnerability

If you believe you have found a security vulnerability in BlackLetter, please report it privately:

- **GitHub private vulnerability reporting** — open a report on the repository: https://github.com/arsx-s/BlackLetter/security
- **Email** — feedback@blackletter.ai

Please do not open a public issue for a suspected security problem. Include as much detail as you can: the affected version, the steps to reproduce, and the impact. You will receive an acknowledgement within 5 business days, followed by a timeline for the fix and disclosure.

## Data and local-first storage

BlackLetter is designed to be local-first. Your notes, sessions, documents, and knowledge graph are stored in IndexedDB in your browser and never leave your device. Keep this in mind when using BlackLetter on a shared machine:

- Clearing your browser data removes local research data. Export what you need first.
- Do not store secrets or credentials in documents you would not want on any machine.
- Model requests are sent to the configured model provider solely to generate responses; local data is not uploaded.

## The model relay

BlackLetter never holds a provider credential in the browser. Two server-side processes do, and both are governed by one shared policy module (`src/server/relay-guard.mjs`):

| Process | Holds the key | Where it runs |
| --- | --- | --- |
| `api/chat.ts` | yes | your Vercel deployment |
| `scripts/dev-server.mjs` | yes | this machine, and inside the packaged desktop app |

Every request to either relay passes, in order: an **origin check**, a **bearer-token check**, a **per-client rate limit**, a **body-size cap**, and **field/model validation**. The hosted relay fails closed with `RELAY_AUTH_NOT_CONFIGURED` until `BLACKLETTER_RELAY_TOKEN` is set. The loopback-only local relay can omit that token for same-machine use. Responses to clients never contain stack traces, upstream provider bodies, or credential-shaped strings.

- **The local relay binds to `127.0.0.1` only.** It is not reachable from the local network. Setting `BLACKLETTER_DEV_HOST` to another address deliberately widens that exposure.
- **The hosted relay is same-origin by default.** Requests with no `Origin` header are refused, because that is the only browser-side signal available. This constrains browsers, not scripts: treat `Origin` as defence in depth, not authentication.
- **`BLACKLETTER_RELAY_TOKEN` is the real hosted access control.** The hosted relay refuses every request until the operator configures a token; when set, nothing passes without it — including browsers. The token is entered by the operator in Workshop and kept in that browser's local storage. It is not a provider API key.
- **Rate limiting is per-process.** On a serverless platform it is per-instance and resets on cold start. It bounds cost; it is not a quota system.
- **The model id is validated, not trusted.** A provider prefix outside the allowlist is refused with `MODEL_NOT_ALLOWED` rather than forwarded, which is what stops an authorised-but-runaway client from selecting an arbitrarily expensive model.

### Reporting a relay issue

When reporting, include the HTTP status and the returned `error.code` (for example `FORBIDDEN_ORIGIN`, `RATE_LIMITED`, `MODEL_NOT_ALLOWED`). Never include the value of `OPENROUTER_API_KEY` or `BLACKLETTER_RELAY_TOKEN` in a report.

## Disclosure policy

We ask that you keep reported vulnerabilities private until a fix has been released and announced in the changelog. Coordinated disclosure protects users who are still running an affected version.
