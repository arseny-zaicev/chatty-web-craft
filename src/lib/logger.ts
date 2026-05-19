/**
 * Lightweight client-side logger.
 *
 * Goal: kill the "silent failure" class of bugs. Every unexpected error
 * (mutation rejection, useQuery error, unhandled promise) should land here
 * so it shows up in the console with a tag we can grep for, and so we have
 * a single place to wire Sentry / a Slack webhook later without touching
 * every call site.
 *
 * Usage:
 *   import { logError } from "@/lib/logger";
 *   try { ... } catch (err) { logError("inbox.setStarred", err, { conversationId }); throw err; }
 */

export type LogContext = Record<string, unknown> | undefined;

const LOG_TAG = "[iskra]";

function serializeError(err: unknown) {
  if (err instanceof Error) {
    return { name: err.name, message: err.message, stack: err.stack };
  }
  try {
    return { value: JSON.parse(JSON.stringify(err)) };
  } catch {
    return { value: String(err) };
  }
}

export function logError(scope: string, err: unknown, context?: LogContext) {
  // Always print — this is the failure backstop. Cheap and safe in prod.
  // eslint-disable-next-line no-console
  console.error(`${LOG_TAG} ${scope}`, serializeError(err), context ?? {});
}

export function logWarn(scope: string, message: string, context?: LogContext) {
  // eslint-disable-next-line no-console
  console.warn(`${LOG_TAG} ${scope}`, message, context ?? {});
}

let installed = false;

/**
 * Install global handlers for uncaught errors and unhandled promise
 * rejections. Idempotent — safe to call multiple times.
 */
export function installGlobalErrorHandlers() {
  if (installed || typeof window === "undefined") return;
  installed = true;

  window.addEventListener("error", (event) => {
    logError("window.error", event.error ?? event.message, {
      filename: event.filename,
      lineno: event.lineno,
      colno: event.colno,
    });
  });

  window.addEventListener("unhandledrejection", (event) => {
    logError("window.unhandledrejection", event.reason);
  });
}
