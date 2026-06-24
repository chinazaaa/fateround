/** True for `/room/[code]` lobby pages (no trailing slash). */
export function isRoomLobbyPath(pathname: string | null | undefined): boolean {
  return /^\/room\/[^/]+$/.test(pathname ?? '')
}
