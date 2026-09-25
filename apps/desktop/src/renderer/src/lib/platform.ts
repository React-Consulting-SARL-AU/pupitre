export const isMac: boolean =
  typeof navigator !== "undefined" && /Mac/i.test(navigator.userAgent);
