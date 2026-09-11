/**
 * Whether the app opens with the session, as the settings read it.
 *
 * macOS and Windows keep a list of login items the app can write itself; on
 * Linux nothing of the kind is standard, and the switch is not drawn at all.
 */
export interface StartupState {
  supported: boolean;
  enabled: boolean;
}
