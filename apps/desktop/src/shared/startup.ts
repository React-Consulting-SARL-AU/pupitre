/** Linux has no standard login-item list, so `supported` is false there and the switch is not drawn. */
export interface StartupState {
  supported: boolean;
  enabled: boolean;
}
