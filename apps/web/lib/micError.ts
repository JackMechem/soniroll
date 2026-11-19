/** One friendly sentence for anything that went wrong opening the microphone, shared by every tool
    that listens (Tuner, Time Test, Recorder, Input test, the trainers' Listen mode). `fallback` is
    used for errors that aren't one of the known mic failures; without it, the error's own message. */
export function micErrorMessage(error: unknown, fallback?: string): string {
  const name = error instanceof DOMException || error instanceof Error ? error.name : "";
  if (name === "NotAllowedError" || name === "SecurityError" || name === "PermissionDeniedError") {
    return "soniroll isn't allowed to use the mic. Allow it in your browser's site settings, then try again.";
  }
  if (name === "NotFoundError" || name === "OverconstrainedError") {
    return "No microphone found. Plug one in, then try again.";
  }
  if (name === "NotReadableError") {
    return "The mic is busy or couldn't start. Close other apps using it, then try again.";
  }
  if (fallback) return fallback;
  return error instanceof Error && error.message ? error.message : "Couldn't open the mic. Try again.";
}
