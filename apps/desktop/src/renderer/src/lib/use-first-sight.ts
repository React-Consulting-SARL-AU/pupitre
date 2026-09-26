import { type RefObject, useEffect, useRef } from "react";

// Once per identity, the first time the element scrolls into view; at once where nothing can watch.
export function useFirstSight(
  target: RefObject<Element | null>,
  identity: string,
  onSight: () => void
): void {
  const latest = useRef(onSight);
  latest.current = onSight;

  // biome-ignore lint/correctness/useExhaustiveDependencies: the identity is the only reason to watch again
  useEffect(() => {
    const element = target.current;

    if (!element || typeof IntersectionObserver !== "function") {
      latest.current();

      return;
    }

    const observer = new IntersectionObserver((entries) => {
      if (entries.some((entry) => entry.isIntersecting)) {
        latest.current();
        observer.disconnect();
      }
    });

    observer.observe(element);

    return () => observer.disconnect();
  }, [target, identity]);
}
