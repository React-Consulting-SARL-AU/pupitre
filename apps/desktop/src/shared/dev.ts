/**
 * What a development build fills in so the same machine is not typed twice a day.
 *
 * Every value comes from the environment of the developer's own computer and
 * reaches the window only when the app is not packaged: a packaged build has
 * no such thing, and answers null.
 */
export interface DevDefaults {
  server: {
    name: string;
    host: string;
    port: number | null;
    user: string;
    password: string;
  };
  /** Values put into the configuration form, by module and by field. */
  fields: Record<string, Record<string, string>>;
}
