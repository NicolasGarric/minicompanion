# Roadmap

Features planned after the PLAY MVP. The data model is designed with them in mind
(see `docs/PLAY_PLAN.md`, "Prepared for later"), but they are not built yet.

## Ranked ladder with matchmaking
Players opt in to find opponents by level, distance and format (500 / 1000 / 2000 points).
Suggestions favour nearby stores and similar ratings, so that finding a game at a local store
becomes easy. Uses `profiles.home_location`, `ratings` and the existing format reference table.

## Ratings, ranks and seasons
An ELO-style rating per format and season, shown as ranks from Bronze to Diamond.
Seasons reset softly every few months to bring lapsed players back. Only matches from confirmed
tournaments count, which keeps the ladder tied to in-store play.

## Badges and achievements
Rewards for hobby milestones, not just wins: first painted army, first tournament, five stores
visited, painting contest podium, ten games in a season. They are shown on profiles and on
shareable cards, to drive retention and social reach.

## Offline mode (PWA)
Installable app with offline score entry and pairings, synchronised when the connection returns.
Store basements often have poor mobile coverage, so this matters on tournament day.

## Big-screen venue display
A full-screen view for a TV in the store: current pairings and table numbers, a round timer,
live standings, and contest voting results. It replaces printed sheets and makes the event visible
to customers walking in.

## YouTube Live integration
YouTube Live is widely used for tabletop streaming in Japan. The Live tab would add YouTube
streams next to Twitch ones, using the official YouTube embed and API, with the same keyword
rules, caching and tournament live badge.

## Curated streamers and featured streams
An admin list of trusted tabletop streamers and the ability to pin featured streams (for example
a store's own event), so quality content appears first instead of relying only on keyword
filtering.
