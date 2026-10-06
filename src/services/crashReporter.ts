/**
 * Crash reporting seam.
 *
 * Every caught render crash goes through `reportError`, so wiring up Sentry or
 * Crashlytics is a change to this one file: initialise the SDK at startup and
 * forward here. Until then, errors are logged in development only, so a
 * release build does not write stack traces to the device log.
 */

export interface ErrorContext {
  /** Which feature area failed, e.g. "the photo gallery". */
  readonly feature: string;
  /** React's component stack, when the error came from a render. */
  readonly componentStack?: string | null;
}

export function reportError(error: Error, context: ErrorContext): void {
  if (__DEV__) {
    console.error(`[crash] ${context.feature}`, error, context.componentStack ?? '');
  }
  // Production: forward to the crash reporter here, e.g.
  // Sentry.captureException(error, { tags: { feature: context.feature } });
}
