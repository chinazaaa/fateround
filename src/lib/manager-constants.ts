// Shared, client-safe constants for the community-manager access code.
// (No server-only imports here so it can be used from both the API and the UI.)

// Minimum length for the manager access code. Kept long enough that the code
// isn't practically brute-forceable on the public /api/manager/login route.
export const MANAGER_CODE_MIN_LENGTH = 10

// Minimum length for the weekly "post code" that game winners use to self-report
// wins. Deliberately short so it can be a single memorable word (e.g. "Naza")
// that's easy to type every time and share in the WhatsApp group. Lower-stakes
// than the manager code (it only lets someone add their own win, is rotated
// weekly, and is guarded by a failure delay on the public endpoint).
export const POST_CODE_MIN_LENGTH = 4
