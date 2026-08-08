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

## Disclosure policy

We ask that you keep reported vulnerabilities private until a fix has been released and announced in the changelog. Coordinated disclosure protects users who are still running an affected version.