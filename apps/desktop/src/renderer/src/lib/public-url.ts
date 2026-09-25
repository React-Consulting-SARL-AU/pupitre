/** A non-https address is the server's own loopback, which leads nowhere from this laptop. */
export function publicUrl(url: string | undefined): string | null {
  return url?.startsWith("https://") ? url : null;
}
