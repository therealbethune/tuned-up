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
  // `authorize()` returns the Music User Token string. Once granted,
  // MusicKit also stores it on the instance under `musicUserToken`
  // for any caller that needs to ship it to the server later
  // (e.g. our /api/applemusic/connect endpoint, which stores it for
  // server-side recent-played syncs).
  authorize: () => Promise<string>;
  musicUserToken?: string;
  // ISO 3166-1 alpha-2 storefront id, set by MusicKit after auth.
  // Used to build per-region Apple Music URLs (us / gb / jp / ...).
  storefrontId?: string;
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
