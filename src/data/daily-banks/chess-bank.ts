export interface ChessMatePuzzle {
  fen: string
  mateIn: 2 | 3
  toMove: 'white' | 'black'
  lines: string[][] // each line has (mateIn*2 - 1) moves
  difficulty?: 'standard' | 'hard'
}

export const CHESS_BANK: ChessMatePuzzle[] = [
  // ── Mate-in-2 (25 existing puzzles, difficulty: standard) ─────────────

  // 1 — Classic queen sacrifice + bishop mate
  {
    fen: '2bqkbn1/2pppp2/np2N3/r3P1p1/p2N2B1/5Q2/PPPPKPP1/RNB2r2 w - - 0 1',
    mateIn: 2,
    toMove: 'white',
    lines: [['Qf6', 'gxf6', 'Bh5#']],
    difficulty: 'standard',
  },

  // 2 — Rook + queen back-rank
  {
    fen: '6k1/5ppp/8/8/8/8/5PPP/3QR1K1 w - - 0 1',
    mateIn: 2,
    toMove: 'white',
    lines: [
      ['Qd8+', 'Re8', 'Qxe8#'],
      ['Qd8+', 'Kf8', 'Qxf8#'],
    ],
    difficulty: 'standard',
  },

  // 3 — Knight + queen coordinate
  {
    fen: 'r1bqk2r/pppp1ppp/2n2n2/2b1N3/2B1P3/8/PPPP1PPP/RNBQK2R w KQkq - 0 1',
    mateIn: 2,
    toMove: 'white',
    lines: [['Bxf7+', 'Ke7', 'Qxd8#']],
    difficulty: 'standard',
  },

  // 4 — Smothered mate setup
  {
    fen: 'r4rk1/ppp2ppp/8/8/8/5N2/PPP2PPP/R4RK1 w - - 0 1',
    mateIn: 2,
    toMove: 'white',
    lines: [['Nh4', 'Kh8', 'Nf5#']],
    difficulty: 'standard',
  },

  // 5 — Bishop pair criss-cross
  {
    fen: '5rk1/5p1p/8/8/1B6/8/5PPP/4B1K1 w - - 0 1',
    mateIn: 2,
    toMove: 'white',
    lines: [
      ['Bd5', 'Kh8', 'Bxf8#'],
      ['Bd5', 'Rf6', 'Bxf6#'],
    ],
    difficulty: 'standard',
  },

  // 6 — Queen + knight fork into mate
  {
    fen: 'r1b1kb1r/pppp1ppp/5q2/4N3/4n3/8/PPPPQPPP/RNB1KB1R w KQkq - 0 1',
    mateIn: 2,
    toMove: 'white',
    lines: [['Qxe4+', 'Qe7', 'Qxe7#']],
    difficulty: 'standard',
  },

  // 7 — Back-rank rook sacrifice
  {
    fen: '3r2k1/5ppp/8/8/8/8/5PPP/1R2R1K1 w - - 0 1',
    mateIn: 2,
    toMove: 'white',
    lines: [
      ['Re8+', 'Rxe8', 'Rxe8#'],
      ['Re8+', 'Kf8', 'Rxd8#'],
    ],
    difficulty: 'standard',
  },

  // 8 — Queen h-file attack
  {
    fen: 'r4rk1/pppb1ppp/8/4N3/8/8/PPP1QPPP/R4RK1 w - - 0 1',
    mateIn: 2,
    toMove: 'white',
    lines: [['Qh5', 'h6', 'Qxf7#']],
    difficulty: 'standard',
  },

  // 9 — Discovered check + mate
  {
    fen: 'rnb1kbnr/pppp1ppp/8/4N3/4P3/8/PPP2PPP/RNBQKB1R w KQkq - 0 1',
    mateIn: 2,
    toMove: 'white',
    lines: [['Nd6+', 'Ke7', 'Qh4#']],
    difficulty: 'standard',
  },

  // 10 — Rook lift to h-file
  {
    fen: '5rk1/ppp2p1p/8/6R1/8/8/PPP2PPP/6K1 w - - 0 1',
    mateIn: 2,
    toMove: 'white',
    lines: [['Rg7+', 'Kh8', 'Rxf7#']],
    difficulty: 'standard',
  },

  // 11 — Queen + rook ladder
  {
    fen: '6k1/5p1p/6p1/8/8/8/4RPPP/4Q1K1 w - - 0 1',
    mateIn: 2,
    toMove: 'white',
    lines: [
      ['Qe8+', 'Kf8', 'Re1#'],
      ['Qe8+', 'Kg7', 'Qe7#'],
    ],
    difficulty: 'standard',
  },

  // 12 — Pawn promotion threat + mate
  {
    fen: '4k3/4P3/4K3/8/8/8/8/6R1 w - - 0 1',
    mateIn: 2,
    toMove: 'white',
    lines: [['Rg8+', 'Kd7', 'e8=Q#']],
    difficulty: 'standard',
  },

  // 13 — Double rook mate
  {
    fen: '6k1/8/8/8/8/8/R7/R5K1 w - - 0 1',
    mateIn: 2,
    toMove: 'white',
    lines: [
      ['Ra8+', 'Kf7', 'Rh7#'],
      ['Ra8+', 'Kg7', 'Rh1#'],
    ],
    difficulty: 'standard',
  },

  // 14 — Queen sacrifice for knight mate
  {
    fen: 'r1bqkb1r/pppp1ppp/2n2n2/4p2Q/2B1P3/8/PPPP1PPP/RNB1K1NR w KQkq - 0 1',
    mateIn: 2,
    toMove: 'white',
    lines: [['Qxf7+', 'Ke7', 'Qxe5#']],
    difficulty: 'standard',
  },

  // 15 — Bishop + queen diagonal
  {
    fen: 'r3k3/ppp2p1p/5Bp1/8/8/8/PPP1QPPP/R5K1 w q - 0 1',
    mateIn: 2,
    toMove: 'white',
    lines: [['Qa6+', 'Kf8', 'Qf1#']],
    difficulty: 'standard',
  },

  // 16 — King walk into net
  {
    fen: '5k2/R7/5K2/8/8/8/8/7R w - - 0 1',
    mateIn: 2,
    toMove: 'white',
    lines: [['Rh8+', 'Ke8', 'Ra8#']],
    difficulty: 'standard',
  },

  // 17 — Knight outpost mate
  {
    fen: '3qk3/3p1p2/4N3/8/8/8/PPP2PPP/R4RK1 w - - 0 1',
    mateIn: 2,
    toMove: 'white',
    lines: [['Nxf7', 'Qe7', 'Nd6#']],
    difficulty: 'standard',
  },

  // 18 — Queen penetration + back rank
  {
    fen: 'r5k1/ppp2ppp/3b4/8/8/8/PPPQ1PPP/R4RK1 w - - 0 1',
    mateIn: 2,
    toMove: 'white',
    lines: [['Qxd6', 'Kh8', 'Qd4#']],
    difficulty: 'standard',
  },

  // 19 — Rook + bishop coordinate
  {
    fen: '6k1/5ppp/8/8/4B3/8/5PPP/4R1K1 w - - 0 1',
    mateIn: 2,
    toMove: 'white',
    lines: [['Bd5', 'Kh8', 'Re8#']],
    difficulty: 'standard',
  },

  // 20 — Queen cornering the king
  {
    fen: 'k7/pp6/1P6/8/8/8/8/4Q1K1 w - - 0 1',
    mateIn: 2,
    toMove: 'white',
    lines: [['Qa5', 'Kb8', 'Qa7#']],
    difficulty: 'standard',
  },

  // 21 — Two rooks on 7th rank
  {
    fen: '6k1/1R3R2/8/8/8/8/5PPP/6K1 w - - 0 1',
    mateIn: 2,
    toMove: 'white',
    lines: [
      ['Rfg7+', 'Kh8', 'Rbh7#'],
      ['Rfg7+', 'Kf8', 'Rb8#'],
    ],
    difficulty: 'standard',
  },

  // 22 — Pin-based mate
  {
    fen: 'r1bqk2r/pppp1Bpp/2n2n2/2b1p3/4P3/5N2/PPPP1PPP/RNBQK2R w KQkq - 0 1',
    mateIn: 2,
    toMove: 'white',
    lines: [['Bxg8', 'Rxg8', 'Qb3#']],
    difficulty: 'standard',
  },

  // 23 — Arabian mate pattern
  {
    fen: '5rk1/5Npp/8/8/8/8/8/R5K1 w - - 0 1',
    mateIn: 2,
    toMove: 'white',
    lines: [['Nh6+', 'Kh8', 'Ra8#']],
    difficulty: 'standard',
  },

  // 24 — Anastasia's mate
  {
    fen: '4r1k1/5Npp/8/8/8/8/8/3R2K1 w - - 0 1',
    mateIn: 2,
    toMove: 'white',
    lines: [
      ['Nh6+', 'Kh8', 'Rd8#'],
      ['Nh6+', 'Kf8', 'Rd8#'],
    ],
    difficulty: 'standard',
  },

  // 25 — Epaulette mate
  {
    fen: '3rkr2/8/4Q3/8/8/8/8/6K1 w - - 0 1',
    mateIn: 2,
    toMove: 'white',
    lines: [['Qe7+', 'Kd7', 'Qe8#']],
    difficulty: 'standard',
  },

  // ── Mate-in-3 (10 existing puzzles, difficulty: hard) ─────────────────

  // 26
  {
    fen: 'r1bqkbnr/pppp1ppp/2n5/4p3/2B1P3/5Q2/PPPP1PPP/RNB1K1NR w KQkq - 0 1',
    mateIn: 3,
    toMove: 'white',
    lines: [['Qxf7+', 'Kd8', 'Qxe8+', 'Kxe8', 'Bf7#']],
    difficulty: 'hard',
  },

  // 27 — Queen + rook staircase
  {
    fen: '6k1/5p2/6p1/8/8/6Q1/5PP1/4R1K1 w - - 0 1',
    mateIn: 3,
    toMove: 'white',
    lines: [
      ['Qd6', 'f5', 'Re8+', 'Kf7', 'Qd7#'],
      ['Qd6', 'f6', 'Re8+', 'Kf7', 'Qd7#'],
      ['Qd6', 'Kh7', 'Re8', 'Kh6', 'Qg3#'],
    ],
    difficulty: 'hard',
  },

  // 28 — Smothered mate classic (Philidor)
  {
    fen: '6rk/5Npp/8/8/8/8/1Q6/6K1 w - - 0 1',
    mateIn: 3,
    toMove: 'white',
    lines: [['Qb8+', 'Rxb8', 'Nf6+', 'Kg8', 'Nh6#']],
    difficulty: 'hard',
  },

  // 29 — Clearance sacrifice
  {
    fen: 'r3k2r/ppp2ppp/2n5/3Np1q1/2B5/4Q3/PPP2PPP/R4RK1 w kq - 0 1',
    mateIn: 3,
    toMove: 'white',
    lines: [
      ['Nf6+', 'Kd8', 'Qe8+', 'Rxe8', 'Rd1#'],
      ['Nf6+', 'Kf8', 'Qe8+', 'Rxe8', 'Rd1#'],
    ],
    difficulty: 'hard',
  },

  // 30 — Double check + queen sac
  {
    fen: 'r1b1k1nr/pppp1ppp/2n5/2b1N3/4P3/2N5/PPPPQPPP/R1B1KB1R w KQkq - 0 1',
    mateIn: 3,
    toMove: 'white',
    lines: [['Nd5', 'Nf6', 'Nxf7', 'Rf8', 'Nd6#']],
    difficulty: 'hard',
  },

  // 31 — Heavy-piece corridor
  {
    fen: '2r3k1/5ppp/8/8/8/4Q3/5PPP/1R4K1 w - - 0 1',
    mateIn: 3,
    toMove: 'white',
    lines: [
      ['Qe8+', 'Rxe8', 'Rb8', 'Kf8', 'Rxe8#'],
      ['Qe8+', 'Rxe8', 'Rb8', 'Rxb8', 'Qe8#'],
    ],
    difficulty: 'hard',
  },

  // 32 — Bishop corridor assist
  {
    fen: 'r2qkb1r/ppp2ppp/2np1n2/4N2Q/2B1P3/8/PPPP1PPP/RNB1K2R w KQkq - 0 1',
    mateIn: 3,
    toMove: 'white',
    lines: [
      ['Bxf7+', 'Ke7', 'Bg5', 'Qe8', 'Qxh7#'],
      ['Bxf7+', 'Ke7', 'Bg5', 'Rf8', 'Qf7#'],
    ],
    difficulty: 'hard',
  },

  // 33 — Knight hop + queen delivery
  {
    fen: 'r1bqkbnr/pppp2pp/2n2p2/4N3/4P3/8/PPPPQPPP/RNB1KB1R w KQkq - 0 1',
    mateIn: 3,
    toMove: 'white',
    lines: [
      ['Qh5+', 'g6', 'Nxg6', 'hxg6', 'Qxg6#'],
      ['Qh5+', 'Ke7', 'Qf7+', 'Kd6', 'Qd5#'],
    ],
    difficulty: 'hard',
  },

  // 34 — Rook sacrifice + promotion
  {
    fen: '4k3/3P4/4K3/8/8/8/8/R7 w - - 0 1',
    mateIn: 3,
    toMove: 'white',
    lines: [
      ['Ra8+', 'Kd8', 'd7', 'Kc7', 'd8=Q#'],
      ['Ra8+', 'Kd8', 'd7', 'Ke8', 'd8=Q#'],
    ],
    difficulty: 'hard',
  },

  // 35 — King hunt with minor pieces
  {
    fen: 'r1bq1rk1/pppp1Npp/2n5/2b1n3/2B1P3/3P4/PPP2PPP/RNBQK2R w KQ - 0 1',
    mateIn: 3,
    toMove: 'white',
    lines: [['Nh6+', 'Kh8', 'Qg4', 'Nf3+', 'Qxf3#']],
    difficulty: 'hard',
  },

  // ── NEW Mate-in-2 puzzles (36–80, difficulty: standard) ───────────────

  // 36 — Greco's mate (bishop + rook on open h-file)
  {
    fen: '4k3/8/8/8/8/6B1/8/R3K3 w - - 0 1',
    mateIn: 2,
    toMove: 'white',
    lines: [['Ra8+', 'Ke7', 'Bd6#']],
    difficulty: 'standard',
  },

  // 37 — Queen sac into rook back-rank
  {
    fen: '1r4k1/5ppp/8/8/8/8/4QPPP/1R4K1 w - - 0 1',
    mateIn: 2,
    toMove: 'white',
    lines: [['Qe8+', 'Rxe8', 'Rb8#']],
    difficulty: 'standard',
  },

  // 38 — Hook mate with rook and knight
  {
    fen: '5k2/5N1p/8/8/8/8/8/4R1K1 w - - 0 1',
    mateIn: 2,
    toMove: 'white',
    lines: [['Re8+', 'Kg7', 'Ne5#']],
    difficulty: 'standard',
  },

  // 39 — Damiano's bishop mate
  {
    fen: '6k1/5ppp/8/8/8/5Q2/5PPP/6K1 w - - 0 1',
    mateIn: 2,
    toMove: 'white',
    lines: [
      ['Qf6', 'Kh7', 'Qg7#'],
      ['Qf6', 'h6', 'Qg7#'],
      ['Qf6', 'h5', 'Qg7#'],
    ],
    difficulty: 'standard',
  },

  // 40 — Queen + bishop battery (Boden's theme)
  {
    fen: '2k5/ppp5/2b5/8/8/2B5/PPP5/2K1Q3 w - - 0 1',
    mateIn: 2,
    toMove: 'white',
    lines: [
      ['Qa5', 'b6', 'Ba6#'],
      ['Qa5', 'Bb5', 'Qa8#'],
    ],
    difficulty: 'standard',
  },

  // 41 — Rook on 7th + knight on 6th
  {
    fen: '6k1/5Rpp/5N2/8/8/8/8/6K1 w - - 0 1',
    mateIn: 2,
    toMove: 'white',
    lines: [['Nh5', 'Kh8', 'Rf8#']],
    difficulty: 'standard',
  },

  // 42 — Queen + pawn ladder
  {
    fen: '6k1/6Pp/8/8/8/8/8/4Q1K1 w - - 0 1',
    mateIn: 2,
    toMove: 'white',
    lines: [['Qe8+', 'Kxg7', 'Qe7#']],
    difficulty: 'standard',
  },

  // 43 — Dovetail mate (Cozio's mate)
  {
    fen: '8/8/8/8/8/5pk1/4Q3/6K1 w - - 0 1',
    mateIn: 2,
    toMove: 'white',
    lines: [['Qe1+', 'Kf4', 'Qe3#']],
    difficulty: 'standard',
  },

  // 44 — Black to move: queen + rook back rank
  {
    fen: 'R5k1/5ppp/8/8/8/8/5PPP/1r2q1K1 b - - 0 1',
    mateIn: 2,
    toMove: 'black',
    lines: [['Qe3+', 'Kh1', 'Qe1#']],
    difficulty: 'standard',
  },

  // 45 — Diagonal queen + bishop mate
  {
    fen: '6k1/pp3pp1/8/8/8/1B6/PP3PPP/3Q2K1 w - - 0 1',
    mateIn: 2,
    toMove: 'white',
    lines: [
      ['Qd5', 'Kh8', 'Qf7#'],
      ['Qd5', 'Kh7', 'Qf7#'],
    ],
    difficulty: 'standard',
  },

  // 46 — Swallow's tail mate
  {
    fen: '8/8/8/8/8/4Qk2/4P3/4K3 w - - 0 1',
    mateIn: 2,
    toMove: 'white',
    lines: [['Qf4+', 'Ke6', 'Qf5#']],
    difficulty: 'standard',
  },

  // 47 — Queen sac into knight smothered mate
  {
    fen: 'r5k1/ppp2Npp/8/8/8/8/PPPQ1PPP/R5K1 w - - 0 1',
    mateIn: 2,
    toMove: 'white',
    lines: [['Nh6+', 'Kh8', 'Qd8#']],
    difficulty: 'standard',
  },

  // 48 — Rook + bishop Greco-style
  {
    fen: '6k1/5pBp/8/8/8/8/8/6RK w - - 0 1',
    mateIn: 2,
    toMove: 'white',
    lines: [
      ['Bf6', 'Kh8', 'Rg8#'],
      ['Bf6', 'Kf8', 'Rg8#'],
    ],
    difficulty: 'standard',
  },

  // 49 — Opera mate (bishop + rook along open file)
  {
    fen: '3k4/8/3K4/8/8/5B2/8/3R4 w - - 0 1',
    mateIn: 2,
    toMove: 'white',
    lines: [
      ['Bg4', 'Kc8', 'Rd8#'],
      ['Bg4', 'Ke8', 'Re1#'],
    ],
    difficulty: 'standard',
  },

  // 50 — Queen sacrifice into back rank
  {
    fen: '2rr2k1/5ppp/8/8/4Q3/8/5PPP/4R1K1 w - - 0 1',
    mateIn: 2,
    toMove: 'white',
    lines: [['Qe8+', 'Rxe8', 'Rxe8+', 'Rd8', 'Rxd8#']],
    difficulty: 'standard',
  },

  // 51 — Knight + rook mate
  {
    fen: '6k1/8/5NK1/8/8/8/8/7R w - - 0 1',
    mateIn: 2,
    toMove: 'white',
    lines: [['Rh8+', 'Kf7', 'Nd8#']],
    difficulty: 'standard',
  },

  // 52 — Rook lift + back rank
  {
    fen: 'r4rk1/ppp1qppp/8/8/8/4R3/PPP2PPP/5RK1 w - - 0 1',
    mateIn: 2,
    toMove: 'white',
    lines: [['Re8', 'Qxe8', 'Rxe8#']],
    difficulty: 'standard',
  },

  // 53 — Black to move: queen + bishop diagonal
  {
    fen: '6k1/5ppp/8/8/8/1b6/ppp2PPP/2K2q2 b - - 0 1',
    mateIn: 2,
    toMove: 'black',
    lines: [['Qd3', 'Kb1', 'Ba2#']],
    difficulty: 'standard',
  },

  // 54 — Kill box: king trapped by own pawns
  {
    fen: '6k1/5ppp/4N3/8/8/8/5PPP/2Q3K1 w - - 0 1',
    mateIn: 2,
    toMove: 'white',
    lines: [['Qc4', 'Kh8', 'Nf8#']],
    difficulty: 'standard',
  },

  // 55 — Lolli's mate (pawn + queen on g-file)
  {
    fen: '5rk1/5pPp/8/8/8/8/5P1P/4Q1K1 w - - 0 1',
    mateIn: 2,
    toMove: 'white',
    lines: [['Qe6', 'Kxg7', 'Qf6#']],
    difficulty: 'standard',
  },

  // 56 — Max Lange's double bishop mate
  {
    fen: '1k6/8/1K6/8/3B4/3B4/8/8 w - - 0 1',
    mateIn: 2,
    toMove: 'white',
    lines: [['Ba6', 'Ka8', 'Bc5#']],
    difficulty: 'standard',
  },

  // 57 — Rook + queen battery on file
  {
    fen: '3r1bk1/5ppp/8/8/8/5Q2/5PPP/3R2K1 w - - 0 1',
    mateIn: 2,
    toMove: 'white',
    lines: [['Rxd8', 'Kh8', 'Qf6#']],
    difficulty: 'standard',
  },

  // 58 — Queen lateral + rook file
  {
    fen: 'r3k3/8/4K3/8/8/8/8/4QR2 w - - 0 1',
    mateIn: 2,
    toMove: 'white',
    lines: [
      ['Qa5+', 'Kb8', 'Rf8#'],
      ['Qa5+', 'Kd8', 'Qd5#'],
    ],
    difficulty: 'standard',
  },

  // 59 — Blackburne's mate (bishop pair + knight)
  {
    fen: '5rk1/5pBp/5N2/8/8/8/5PPP/2B3K1 w - - 0 1',
    mateIn: 2,
    toMove: 'white',
    lines: [['Nh5', 'Kh8', 'Bf6#']],
    difficulty: 'standard',
  },

  // 60 — David and Goliath (pawn delivers mate)
  {
    fen: '7k/5ppK/5P1P/8/8/8/8/8 w - - 0 1',
    mateIn: 2,
    toMove: 'white',
    lines: [['fxg7+', 'Kg8', 'h7#']],
    difficulty: 'standard',
  },

  // 61 — Corridor mate with rook
  {
    fen: '3k4/3P4/3K4/8/8/8/8/7R w - - 0 1',
    mateIn: 2,
    toMove: 'white',
    lines: [['Rh8+', 'Kc7', 'd8=Q#']],
    difficulty: 'standard',
  },

  // 62 — Queen + knight box
  {
    fen: '5k2/5p2/4N3/8/8/8/8/3Q2K1 w - - 0 1',
    mateIn: 2,
    toMove: 'white',
    lines: [['Qd8+', 'Ke7', 'Qd7#']],
    difficulty: 'standard',
  },

  // 63 — Black to move: smothered-like with knight
  {
    fen: '2RK4/8/8/8/8/8/1n4pp/5rkr b - - 0 1',
    mateIn: 2,
    toMove: 'black',
    lines: [['Na4', 'Kd7', 'Nc5#']],
    difficulty: 'standard',
  },

  // 64 — Rook + king squeeze
  {
    fen: '8/8/8/8/8/k7/8/KR6 w - - 0 1',
    mateIn: 2,
    toMove: 'white',
    lines: [['Rb3+', 'Ka4', 'Ra3#']],
    difficulty: 'standard',
  },

  // 65 — Queen + bishop criss-cross diagonal
  {
    fen: '2k5/1pp5/8/8/8/3B4/1PP5/2K1Q3 w - - 0 1',
    mateIn: 2,
    toMove: 'white',
    lines: [
      ['Qa5', 'Kd8', 'Qa8#'],
      ['Qa5', 'b6', 'Qa8#'],
    ],
    difficulty: 'standard',
  },

  // 66 — Rook pin + queen delivery
  {
    fen: 'r3rbk1/1p3ppp/8/8/8/4Q3/1P3PPP/R3R1K1 w - - 0 1',
    mateIn: 2,
    toMove: 'white',
    lines: [['Qe6', 'fxe6', 'Rxe6#']],
    difficulty: 'standard',
  },

  // 67 — Two-bishop diagonal checkmate
  {
    fen: 'k7/8/1K6/3B4/8/5B2/8/8 w - - 0 1',
    mateIn: 2,
    toMove: 'white',
    lines: [['Be4', 'Ka8', 'Bc6#']],
    difficulty: 'standard',
  },

  // 68 — Knight + queen h7 mate
  {
    fen: 'r4rk1/pppb1ppp/8/3N4/8/8/PPP1QPPP/R4RK1 w - - 0 1',
    mateIn: 2,
    toMove: 'white',
    lines: [['Nf6+', 'Kh8', 'Qh5#']],
    difficulty: 'standard',
  },

  // 69 — Rook sacrifice + queen back rank
  {
    fen: '1k5r/ppp5/8/8/8/8/PPP5/1KR4Q w - - 0 1',
    mateIn: 2,
    toMove: 'white',
    lines: [['Rc8+', 'Rxc8', 'Qh1#']],
    difficulty: 'standard',
  },

  // 70 — Queen + rook battery on rank
  {
    fen: '6k1/5p1p/8/8/8/8/5PPP/3RQ1K1 w - - 0 1',
    mateIn: 2,
    toMove: 'white',
    lines: [
      ['Qe8+', 'Kf6', 'Rd6#'],
      ['Qe8+', 'Kg7', 'Qe7#'],
    ],
    difficulty: 'standard',
  },

  // 71 — Pillsbury's mate (rook + bishop on h-file)
  {
    fen: '5rk1/5pBp/8/8/8/8/5PPP/R5K1 w - - 0 1',
    mateIn: 2,
    toMove: 'white',
    lines: [['Bf6', 'Kh8', 'Ra8#']],
    difficulty: 'standard',
  },

  // 72 — Black to move: double rook back rank
  {
    fen: '6k1/5ppp/8/8/8/8/5PPP/rr4K1 b - - 0 1',
    mateIn: 2,
    toMove: 'black',
    lines: [['Rb2', 'Kh1', 'Ra1#']],
    difficulty: 'standard',
  },

  // 73 — Queen pivot + diagonal
  {
    fen: '5bk1/5p1p/5Pp1/8/8/6Q1/5PPP/6K1 w - - 0 1',
    mateIn: 2,
    toMove: 'white',
    lines: [['Qc7', 'Kh8', 'Qg7#']],
    difficulty: 'standard',
  },

  // 74 — Rook lift back-rank ambush
  {
    fen: '2kr4/ppp5/8/8/8/8/PPP5/1KR2R2 w - - 0 1',
    mateIn: 2,
    toMove: 'white',
    lines: [['Rfd1', 'Rxd1', 'Rxd1#']],
    difficulty: 'standard',
  },

  // 75 — Knight on e7 + queen on g6
  {
    fen: 'r4rk1/ppp1Nppp/6q1/8/8/6Q1/PPP2PPP/R4RK1 w - - 0 1',
    mateIn: 2,
    toMove: 'white',
    lines: [['Qc3', 'Kh8', 'Nf7#']],
    difficulty: 'standard',
  },

  // 76 — Morphy's mate pattern
  {
    fen: '3k4/3P4/2PKB3/8/8/8/8/8 w - - 0 1',
    mateIn: 2,
    toMove: 'white',
    lines: [['Bf7', 'Ke7', 'd8=Q#']],
    difficulty: 'standard',
  },

  // 77 — Queen + knight cooperation on castled king
  {
    fen: 'r4rk1/ppp2ppp/5N2/8/8/8/PPP1QPPP/R4RK1 w - - 0 1',
    mateIn: 2,
    toMove: 'white',
    lines: [['Qe4', 'Kh8', 'Qh7#']],
    difficulty: 'standard',
  },

  // 78 — Rook on 8th + bishop covers escape
  {
    fen: '4k3/8/3BK3/8/8/8/8/R7 w - - 0 1',
    mateIn: 2,
    toMove: 'white',
    lines: [['Ra8+', 'Kd7', 'Bf5#']],
    difficulty: 'standard',
  },

  // 79 — Balestra mate
  {
    fen: '7k/6pp/6N1/6Q1/8/8/8/6K1 w - - 0 1',
    mateIn: 2,
    toMove: 'white',
    lines: [['Qe5', 'Kh8', 'Qe8#']],
    difficulty: 'standard',
  },

  // 80 — Black to move: queen sac into rook mate
  {
    fen: '1Q4K1/5PPP/8/8/8/8/5ppp/1r2q1k1 b - - 0 1',
    mateIn: 2,
    toMove: 'black',
    lines: [['Qe3', 'Kh8', 'Qe8#']],
    difficulty: 'standard',
  },

  // ── NEW Mate-in-3 puzzles (81–110, difficulty: hard) ──────────────────

  // 81 — Smothered mate (classic Nf7/Nh6/Qg8/Nf7)
  {
    fen: 'r4rk1/ppp2ppp/3q1N2/8/8/8/PPP1QPPP/R4RK1 w - - 0 1',
    mateIn: 3,
    toMove: 'white',
    lines: [['Nh5', 'Kh8', 'Qe8', 'Rxe8', 'Nf7#']],
    difficulty: 'hard',
  },

  // 82 — Queen sac into rook corridor
  {
    fen: '2r2rk1/5ppp/8/8/8/8/4QPPP/1R3RK1 w - - 0 1',
    mateIn: 3,
    toMove: 'white',
    lines: [
      ['Qe8', 'Rfxe8', 'Rb8', 'Kf8', 'Rxc8#'],
      ['Qe8', 'Rcxe8', 'Rb8', 'Kf8', 'Rxf8#'],
    ],
    difficulty: 'hard',
  },

  // 83 — Double rook + promotion
  {
    fen: '4k3/3PP3/4K3/8/8/8/8/8 w - - 0 1',
    mateIn: 3,
    toMove: 'white',
    lines: [['d8=Q+', 'Kf8', 'Qd6+', 'Ke8', 'e8=Q#']],
    difficulty: 'hard',
  },

  // 84 — Rook sacrifice + pawn roller
  {
    fen: '2k5/2P5/1K6/8/8/8/8/4R3 w - - 0 1',
    mateIn: 3,
    toMove: 'white',
    lines: [['Re8+', 'Kd7', 'c8=Q+', 'Kd6', 'Qc5#']],
    difficulty: 'hard',
  },

  // 85 — Queen deflection + bishop pair mate
  {
    fen: '2k5/ppp5/2b5/3B4/8/2B5/PPP5/2K1Q3 w - - 0 1',
    mateIn: 3,
    toMove: 'white',
    lines: [['Qe8+', 'Bd7', 'Qxd7+', 'Kb8', 'Ba6#']],
    difficulty: 'hard',
  },

  // 86 — King march + rook mate
  {
    fen: '8/8/8/8/8/k7/p7/KR6 w - - 0 1',
    mateIn: 3,
    toMove: 'white',
    lines: [
      ['Rb3+', 'Ka4', 'Rb4+', 'Ka5', 'Ra4#'],
      ['Rb3+', 'Ka4', 'Rb4+', 'Ka3', 'Ra4#'],
    ],
    difficulty: 'hard',
  },

  // 87 — Queen triangulation
  {
    fen: 'k7/pp6/8/8/8/8/1PP5/1K2Q3 w - - 0 1',
    mateIn: 3,
    toMove: 'white',
    lines: [
      ['Qe8+', 'Ka7', 'Qd7+', 'Ka6', 'Qa4#'],
      ['Qe8+', 'Ka7', 'Qd7+', 'Ka8', 'Qa4#'],
    ],
    difficulty: 'hard',
  },

  // 88 — Knight fork + back rank
  {
    fen: '1r3rk1/5ppp/8/3N4/8/4Q3/5PPP/R5K1 w - - 0 1',
    mateIn: 3,
    toMove: 'white',
    lines: [['Nf6+', 'Kh8', 'Qe8', 'Rfxe8', 'Ra8#']],
    difficulty: 'hard',
  },

  // 89 — Bishop pair squeeze
  {
    fen: 'k7/p1B5/1p6/8/8/1B6/8/6K1 w - - 0 1',
    mateIn: 3,
    toMove: 'white',
    lines: [['Ba6', 'b5', 'Bxb5', 'Ka7', 'Bc6#']],
    difficulty: 'hard',
  },

  // 90 — Rook staircase + king box
  {
    fen: 'k7/8/1K6/8/8/8/8/R6R w - - 0 1',
    mateIn: 3,
    toMove: 'white',
    lines: [['Rh8+', 'Ka7', 'Rha8+', 'Kb8', 'R1a8#']],
    difficulty: 'hard',
  },

  // 91 — Queen + knight spiral
  {
    fen: '5rk1/5ppp/8/8/4N3/8/5PPP/3Q2K1 w - - 0 1',
    mateIn: 3,
    toMove: 'white',
    lines: [['Nf6+', 'Kh8', 'Qd5', 'Rf7', 'Qxf7#']],
    difficulty: 'hard',
  },

  // 92 — Rook + bishop corridor
  {
    fen: '1k6/1p6/1K6/8/8/8/7B/7R w - - 0 1',
    mateIn: 3,
    toMove: 'white',
    lines: [['Bg1', 'Ka8', 'Bc5', 'bxc5', 'Ra1#']],
    difficulty: 'hard',
  },

  // 93 — Queen sacrifice + promotion mate
  {
    fen: '2k5/1pP5/1P6/8/8/8/8/4Q1K1 w - - 0 1',
    mateIn: 3,
    toMove: 'white',
    lines: [['Qe8+', 'Kxc7', 'Qd8+', 'Kc6', 'Qd5#']],
    difficulty: 'hard',
  },

  // 94 — Intermezzo rook sac
  {
    fen: '3rkb2/5p2/4N3/8/8/8/4RPPP/6K1 w - - 0 1',
    mateIn: 3,
    toMove: 'white',
    lines: [['Re8+', 'Kd7', 'Rxf8', 'Ke7', 'Rf7#']],
    difficulty: 'hard',
  },

  // 95 — Queen maneuver + rook file
  {
    fen: '1k6/1p6/8/8/8/8/PPP5/1K1QR3 w - - 0 1',
    mateIn: 3,
    toMove: 'white',
    lines: [['Qd7', 'Ka8', 'Qc8+', 'Ka7', 'Re7#']],
    difficulty: 'hard',
  },

  // 96 — Black to move: knight + rook combo
  {
    fen: '3R2K1/5PPP/8/8/8/5n2/5ppp/4r1k1 b - - 0 1',
    mateIn: 3,
    toMove: 'black',
    lines: [['Nh4', 'Kh8', 'Ng6+', 'hxg6', 'Re8#']],
    difficulty: 'hard',
  },

  // 97 — Queen sac + bishop + rook
  {
    fen: 'r3k3/ppp2p2/4N3/3Q4/8/8/PPP2PPP/R5K1 w q - 0 1',
    mateIn: 3,
    toMove: 'white',
    lines: [['Qd8+', 'Rxd8', 'Nf4+', 'Kf8', 'Rd1#']],
    difficulty: 'hard',
  },

  // 98 — Double pawn promotion
  {
    fen: '1k6/2P1P3/1K6/8/8/8/8/8 w - - 0 1',
    mateIn: 3,
    toMove: 'white',
    lines: [['c8=R', 'Ka8', 'e8=Q+', 'Kb7', 'Qb5#']],
    difficulty: 'hard',
  },

  // 99 — Rook + knight driving king
  {
    fen: '8/8/8/8/8/5Nk1/8/R5K1 w - - 0 1',
    mateIn: 3,
    toMove: 'white',
    lines: [['Ra3+', 'Kf4', 'Nh2+', 'Ke5', 'Ra5#']],
    difficulty: 'hard',
  },

  // 100 — Queen + bishop Boden's theme deep
  {
    fen: '2kr4/ppp2p2/2n5/4B3/8/2B5/PPP2PPP/2K1R3 w - - 0 1',
    mateIn: 3,
    toMove: 'white',
    lines: [['Re8+', 'Rxe8', 'Bd6', 'cxd6', 'Ba6#']],
    difficulty: 'hard',
  },

  // 101 — Queen pivot + knight fence
  {
    fen: '5rk1/5p1p/5NpQ/8/8/8/5PPP/6K1 w - - 0 1',
    mateIn: 3,
    toMove: 'white',
    lines: [['Qxh7+', 'Kf8', 'Qh8+', 'Ke7', 'Qe8#']],
    difficulty: 'hard',
  },

  // 102 — Rook on 7th + pawn mate
  {
    fen: '6k1/5RPp/7P/8/8/8/8/6K1 w - - 0 1',
    mateIn: 3,
    toMove: 'white',
    lines: [
      ['Rf8+', 'Kxf8', 'hxg7+', 'Ke8', 'g8=Q#'],
      ['Rf8+', 'Kxf8', 'hxg7+', 'Kg8', 'g8=Q#'],
    ],
    difficulty: 'hard',
  },

  // 103 — Quiet queen move + rook strike
  {
    fen: '1k1r4/pp6/8/8/8/8/PP6/KR4Q1 w - - 0 1',
    mateIn: 3,
    toMove: 'white',
    lines: [['Qg8', 'Rd1', 'Qxd1+', 'Kc8', 'Rb8#']],
    difficulty: 'hard',
  },

  // 104 — Bishop sac opens diagonal
  {
    fen: 'r1b2rk1/pppp1ppp/8/4N3/2B5/8/PPP1QPPP/R4RK1 w - - 0 1',
    mateIn: 3,
    toMove: 'white',
    lines: [['Bxf7+', 'Kh8', 'Ng6+', 'hxg6', 'Qe8#']],
    difficulty: 'hard',
  },

  // 105 — Knight check + queen infiltration
  {
    fen: '4r1k1/5ppp/8/3N4/8/8/PPP1QPPP/6K1 w - - 0 1',
    mateIn: 3,
    toMove: 'white',
    lines: [
      ['Nf6+', 'Kf8', 'Qe7+', 'Kg7', 'Qf7#'],
      ['Nf6+', 'Kh8', 'Qe7', 'Rf8', 'Qxf8#'],
    ],
    difficulty: 'hard',
  },

  // 106 — Rook switchback
  {
    fen: '1k1r4/pp6/1K6/8/8/8/8/R3R3 w - - 0 1',
    mateIn: 3,
    toMove: 'white',
    lines: [['Re8', 'Rxe8', 'Ra8+', 'Kxa8', 'Re8#']],
    difficulty: 'hard',
  },

  // 107 — Queen + pawn storm
  {
    fen: '6k1/5p1p/6pP/8/8/6Q1/5PP1/6K1 w - - 0 1',
    mateIn: 3,
    toMove: 'white',
    lines: [['Qc7', 'Kh8', 'Qf4', 'Kg8', 'Qd6#']],
    difficulty: 'hard',
  },

  // 108 — Black to move: queen sac for promotion mate
  {
    fen: '6K1/5PPP/8/8/8/8/3p1ppp/3Rq1k1 b - - 0 1',
    mateIn: 3,
    toMove: 'black',
    lines: [['Qe3', 'Rd8', 'Qe1+', 'Rd1', 'Qxd1#']],
    difficulty: 'hard',
  },

  // 109 — Knight + queen weave
  {
    fen: 'r4rk1/ppp2Npp/3q4/8/8/6Q1/PPP2PPP/R4RK1 w - - 0 1',
    mateIn: 3,
    toMove: 'white',
    lines: [['Nh6+', 'Kh8', 'Qg8+', 'Rxg8', 'Nf7#']],
    difficulty: 'hard',
  },

  // 110 — Interference + back rank
  {
    fen: '1r1r2k1/5ppp/8/3B4/8/8/5PPP/1R2Q1K1 w - - 0 1',
    mateIn: 3,
    toMove: 'white',
    lines: [['Be6', 'fxe6', 'Qe4', 'Kh8', 'Qxa8#']],
    difficulty: 'hard',
  },
]
