/** Passed to the fake agent for every channel but the privileged one, as `sudo -n pupitred serve` is the limited session. */
export const LIMITED_FLAG = "--limited";

/** The file every channel of one fake server reads its usage right from, as the agent reads its own from disk. */
export const STATE_FLAG = "--state=";
