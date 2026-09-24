import { useEffect, useState } from "react";
import { recipientFingerprint } from "./backups";

/** The short fingerprint of the key backups are sealed to, once it is computed. */
export function useFingerprint(recipient: string | null): string {
  const [fingerprint, setFingerprint] = useState("");

  useEffect(() => {
    if (!recipient) {
      setFingerprint("");

      return;
    }

    let current = true;

    recipientFingerprint(recipient).then((value) => {
      if (current) {
        setFingerprint(value);
      }
    });

    return () => {
      current = false;
    };
  }, [recipient]);

  return fingerprint;
}
