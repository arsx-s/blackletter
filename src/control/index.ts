/**
 * The independent control plane: the stop, and backup/restore.
 *
 * "Independent" means independent of the model. Nothing in `src/langgraph`,
 * `src/providers` or `src/intelligence` may import this module, and the stop's
 * own module (`./stop`) imports no task, tool or provider code at all — the
 * switches are readable by the things that need to obey them, and reachable by
 * only two things: the operator's controls and the tests.
 */
export * from "./types";
export * from "./stop";
export * from "./engage";
export * from "./backup";
