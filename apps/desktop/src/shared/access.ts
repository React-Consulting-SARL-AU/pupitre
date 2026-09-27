/** What this computer can hand out: keys it created, whose secret its keychain keeps. */
export interface AccessHeld {
  held: string[];
  /** The key the app adds to every protected address it opens. */
  device: string | null;
}

export const ACCESS_COPY_FORMS = ["link", "header", "key"] as const;

export type AccessCopyForm = (typeof ACCESS_COPY_FORMS)[number];
