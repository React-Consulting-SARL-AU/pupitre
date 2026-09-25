/** Every channel but the privileged one, as `sudo -n pupitred serve` is the limited session. */
export const LIMITED_FLAG = "--limited";

/** Shared by every channel of one fake server, as the real agent reads its usage from disk. */
export const STATE_FLAG = "--state=";
