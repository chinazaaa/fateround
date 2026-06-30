// Shared, client-safe constants for the community-manager access code.
// (No server-only imports here so it can be used from both the API and the UI.)

// Minimum length for the manager access code. Kept long enough that the code
// isn't practically brute-forceable on the public /api/manager/login route.
export const MANAGER_CODE_MIN_LENGTH = 10
