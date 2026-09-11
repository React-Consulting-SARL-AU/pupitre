/** Where the app runs decides which key the shortcuts live on. */
export const isMac: boolean =
  typeof navigator !== "undefined" && /Mac/i.test(navigator.userAgent);
