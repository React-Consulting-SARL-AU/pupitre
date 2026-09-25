export interface DevDefaults {
  server: {
    name: string;
    host: string;
    port: number | null;
    user: string;
    password: string;
  };
  /** By module, then by field. */
  fields: Record<string, Record<string, string>>;
}
