// Single source of truth for the MusicKit JS globals so each component
// that uses MusicKit doesn't redeclare them with conflicting interfaces.
// Importing this file (side-effect only) is enough to put the global
// types in scope.

export type MusicKitAPI = {
  configure: (opts: {
    developerToken: string;
    app: { name: string; build: string };
  }) => Promise<void>;
  getInstance: () => MusicKitInstance;
};

export type MusicKitInstance = {
  isAuthorized: boolean;
  authorize: () => Promise<string>;
  api: {
    music: (
      path: string,
      params?: Record<string, unknown> | undefined,
      options?: { fetchOptions?: { method?: string; body?: unknown } },
    ) => Promise<unknown>;
  };
};

declare global {
  interface Window {
    MusicKit?: MusicKitAPI;
  }
}
