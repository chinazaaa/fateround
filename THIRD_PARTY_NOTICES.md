# Third-party notices

## Chess piece artwork ("Neo" piece set)

The vector geometry for the detailed chess pieces in
`src/components/chess/ChessPieceDetailed.tsx` is derived from the widely-used
SVG chess piece set by **Colin M.L. Burnett** ("Cburnett"), published on
Wikimedia Commons.

- Source: https://commons.wikimedia.org/wiki/Category:SVG_chess_pieces
- License: Creative Commons Attribution-ShareAlike 3.0 (CC BY-SA 3.0), also
  available under the GNU GPL v2+ and the BSD license.

The path data has been re-parametrised (single geometry tinted per side) to fit
this project's theming, but the shapes remain those of the original work.

## Vendored Scrabble word lists (`src/lib/data/`)

The Scrabble game validates plays against vendored word lists. Most of these are
**copyrighted, third-party dictionaries carried without a license grant** — each
file includes an explicit in-file copyright caveat, and they are vendored under
an accepted-risk project decision (not a claim of permission):

- `scrabble-words-collins.ts` — **Collins Scrabble Words**, © HarperCollins.
- `scrabble-words-twl.ts` — **TWL (Tournament Word List)**, © NASPA /
  Merriam-Webster.
- `scrabble-words-french.ts` — **ODS (L'Officiel du Scrabble)**, © Larousse /
  FISF.
- `scrabble-words-german.ts` — copyrighted German Scrabble word list.
- `scrabble-words-spanish.ts` — **FISE (Federación Internacional de Scrabble en
  Español)**, © FISE.

The one exception is:

- `scrabble-words.ts` — **ENABLE** word list, public domain (no restriction).

## LiveKit (voice chat)

Voice chat uses LiveKit: **`@livekit/components-react`**, **`livekit-client`**,
and **`livekit-server-sdk`**.

- License: Apache License 2.0.
- Source: https://github.com/livekit
