const inert: unknown = new Proxy(
  {},
  {
    get: (_target, name) =>
      name === "then" ? undefined : (..._args: unknown[]) => inert,
  }
);

/** Every file mocks Electron with the same names: Bun re-mocks a module only on the names it first had. */
export function electronStub(
  root: string,
  overrides: Record<string, unknown> = {}
): Record<string, unknown> {
  return {
    app: {
      getLocale: () => "fr",
      getPath: () => root,
      getVersion: () => "0.0.0",
      isPackaged: false,
      isReady: () => false,
      on: () => undefined,
    },
    autoUpdater: inert,
    BrowserWindow: { getAllWindows: () => [] },
    clipboard: inert,
    dialog: inert,
    ipcMain: inert,
    Menu: inert,
    nativeTheme: inert,
    Notification: inert,
    safeStorage: { isEncryptionAvailable: () => false },
    session: inert,
    shell: inert,
    ...overrides,
  };
}
