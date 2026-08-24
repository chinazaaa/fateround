import { postReclaimHost } from '@/lib/game-api'
import { setHostToken, setPlayerSession } from '@/lib/secure-session'
import type { PlayerGender } from '@fateround/shared'

/**
 * Move hosting to the device you are on — mobile mirror of `src/lib/take-over-hosting.ts`.
 *
 * WHY. Open a game you are already hosting from another device and the join call answers
 * `already_hosting`. The only thing offered was "Continue here", which retried the join with an
 * override and seated you as an ordinary PLAYER — hosting stayed on the other device. So a host
 * could join their own game on a second device and still have no way to run it, which is not
 * what "Continue here" reads as.
 *
 * The server half already existed: `/api/games/[code]/reclaim-host` hands the host token to
 * whoever owns `games.host_user_id`, on any device. Nothing had offered it from the JOIN path,
 * which is where a host on a second device actually lands.
 *
 * DELIBERATELY NOT A ROTATION. The player equivalent rotates the resume token so continuing
 * here MOVES the seat rather than cloning it. Hosting is the opposite case: both devices belong
 * to the same account, and invalidating the other device's token would leave it holding a dead
 * credential mid-game with no path back — worse than two devices that can both run a game one
 * person owns.
 *
 * Returns null for a guest, a non-host, or a failed request. All three mean "carry on with the
 * normal join", never an error to show.
 */
export async function takeOverHosting(gameCode: string): Promise<string | null> {
  try {
    const { hostToken, player } = await postReclaimHost(gameCode)
    if (!hostToken) return null
    await setHostToken(gameCode, hostToken)
    // The caller was host + player on the other device: carry that player seat over to
    // this one so the host lobby still shows them holding their own seat, not demoted to
    // host-only. The server rotated the resume token, so the other device's stored
    // credential is already dead.
    if (player && player.playerId && player.resumeToken) {
      const gender = (player.playerGender === 'male' || player.playerGender === 'female'
        ? player.playerGender
        : 'both') as PlayerGender
      await setPlayerSession(gameCode, player.playerId, player.playerName ?? '', gender, player.resumeToken)
    }
    return hostToken
  } catch {
    return null
  }
}
