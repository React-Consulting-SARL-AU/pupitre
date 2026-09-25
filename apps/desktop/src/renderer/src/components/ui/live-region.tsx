import { useAnnouncements } from "@renderer/stores/announcements";

// Mounted once in the shell, so a step that swaps the whole panel does not drop the announcement.
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
