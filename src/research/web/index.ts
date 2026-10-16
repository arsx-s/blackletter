/**
 * Web research: the public surface of `src/research/web`.
 *
 * This is the only code in this app that opens a network connection on the
 * operator's behalf, and it does so under a policy: approved hosts only, no
 * redirects, bounded size and time, text content types only, and an honest
 * refusal for everything else.
 *
 * It lives inside the existing research module (`src/research`) rather than
 * beside it: the modelling layer and the retrieval layer belong to the same
 * feature, and the app keeps one research directory.
 */
export * from "./types";
export * from "./fetch";
export * from "./extract";
export * from "./analysis";
export * from "./run";
export * from "./log";
