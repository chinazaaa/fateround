# FateRound — Daily Challenge Social Posters

Ready-to-post promo graphics for the daily challenges (https://fateround.com/daily-challenges).
Generated to match the brand system: rose #f43f5e → #e11d48 with purple #a855f7 on #08080f,
FateRound logo mark, tagline "Same puzzle for everyone. One shot, one score."

## Structure
- `tiktok/`  — 1080×1920 (9:16) for TikTok posts & stories
- `twitter/` — 1600×900 (16:9) for X/Twitter in-feed
- `square/`           — 1080×1080 (1:1) universal, good for X & cross-posting

## Designs (7 per size = 21 total)
- `..._hero_...`  — all six games on one poster (launch / pinned post)
- one poster per game: sudoku, word-hunt, crossword, word-search, word-scramble, trivia

Each game has its own accent colour for daily variety:
sudoku=#38bdf8, word-hunt=#34d399, crossword=#fbbf24,
word-search=#a855f7, word-scramble=#fb7185, trivia=#22d3ee.

## How to regenerate / add new ones
Source template + render script live outside the repo (ask Claude / see /tmp/posters).
Template is a single HTML file driven by URL params (?type=game&game=<slug>&size=<vertical|landscape|square>);
rendered to PNG with Playwright at 2× for crispness. To add a game, add it to the GAMES map
and re-render. Colours are pulled from src/app/globals.css.
