/**
 * The address of a project the app may open from this computer.
 *
 * The agent answers the project's address as the machine sees it: a name on
 * the web when a port carries one, the machine's own loopback otherwise. The
 * second is true where the agent stands and false here — opened from the
 * laptop it lands on nothing — so only a published address is offered.
 */
export function publicUrl(url: string | undefined): string | null {
  return url?.startsWith("https://") ? url : null;
}
