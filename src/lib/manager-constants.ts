// Shared, client-safe constants for the community-manager access code.
// (No server-only imports here so it can be used from both the API and the UI.)

// Minimum length for the manager access code. Kept long enough that the code
// isn't practically brute-forceable on the public /api/manager/login route.
export const MANAGER_CODE_MIN_LENGTH = 10

// Minimum length for the weekly "post code" that game winners use to self-report
// wins. Lower-stakes than the manager code (it only lets someone add their own
// win, and it's rotated weekly), but still guarded by a failure delay on the
// public endpoint. Kept short enough to be easy to share in the WhatsApp group.
export const POST_CODE_MIN_LENGTH = 6
