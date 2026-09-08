import { useAnnouncements } from "@renderer/stores/announcements";

/**
 * The two regions a screen reader listens to, and nothing to look at.
 *
 * They are mounted once, in the shell, so a step that changes the whole panel
 * does not take the announcement away with it. `polite` carries what happened;
 * `assertive` carries what stopped.
 */
export function LiveRegion() {
  const polite = useAnnouncements((state) => state.polite);
  const assertive = useAnnouncements((state) => state.assertive);

  return (
    <>
      <span
        aria-atomic="true"
        aria-live="polite"
        className="sr-only"
        role="status"
      >
        {polite.text}
      </span>
      <span
        aria-atomic="true"
        aria-live="assertive"
        className="sr-only"
        role="alert"
      >
        {assertive.text}
      </span>
    </>
  );
}
