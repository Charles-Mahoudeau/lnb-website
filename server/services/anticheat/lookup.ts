// Platform lookups. The real service arrives with the Modrinth and CurseForge lookups; until then
// every unknown hash stays pending and `kick` does nothing.

/** Starts a lookup run in the background. A stub for now. */
function kick(): void {}

export const anticheatLookupService = { kick };
