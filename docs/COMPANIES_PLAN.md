# Companies (player groups) — plan

> Requested by a player who wants to **gather their local club**. Decisions taken by the owner on 2026-11-27.
> Name in the app: **Compagnie** (FR) / **Company** (EN), echoing MiniCompanion; translated in the 9 languages.
> Focus: community life between members (talk, paint, play together). **Marketing angle and store links are not a
> priority** (owner, 2026-11-27).

## Owner decisions (2026-11-27)

| Topic | Decision |
|---|---|
| Name | **Compagnie** |
| Membership | Several Companies per player, **one main** (shown on the profile, counts for rankings) |
| Size | **Default limit** at creation (e.g. 50); the leader can lower it, an app admin can raise it on request |
| Nature | Local (city) **or** online, chosen by the Company. No store link |
| Games | Multi-game, main games listed as free text (search filter, suggestions) |
| Spirit | Competition **and** mutual help, each Company chooses whether it takes part in rankings / challenges |
| Chat | **Realtime chat + pinned announcements** (officers), report button |
| Crest | **Both**: built-in generator (shapes, patterns, riso inks) by default; uploaded image only after an app admin approves it (photo quota, no trademark logos) |
| Team tournaments | **Company ranking first** (from individual results, Swiss rounds unchanged); real team pairings on the roadmap |
| Device data sync | **No**: paint shelf and sessions stay on the device, not used by Companies |
| Creation | Any signed-in account, **no validation** (reports handled afterwards in `/admin`) |
| Visibility | **Public** (members, gallery, record visible) / **Private** (name + crest visible, content for members) |
| Joining | **Invitation**, **link / QR code**, **open**; the leader enables the ones they want (no "on request" mode) |
| Leader leaves / deletes account | Passes to the **oldest officer**, else the oldest member; dissolved only when empty |
| Narrative campaigns | **In V1**: a Company can be a faction on the hyperroute map |
| Rankings (2026-11-27) | **No Company ranking for now** (tournaments "under the colours of" stay, without a ranking) |
| Account deletion (2026-11-27) | Chat messages **stay, anonymised** ("Deleted player") |
| Store link, recruitment marketing | **Not a priority**: no store link, no sponsorship, no beginner-path funnel |

## V1, in three deliveries

Each delivery = one migration (tables, RLS, `SECURITY DEFINER` functions, SQL tests) + screens + 9 languages,
shipped and checked before the next one.

### Delivery 1 — Core + chat + calendar (migration 29) — DONE 2026-11-27, migration to apply

Built: migration `20261127000029_companies.sql` (+81 SQL tests `supabase/tests/rls_companies.sql`), pages
`/play/companies` (my Companies, invitations, search, creation), `/play/c/<slug>` (tabs Home / Chat / Calendar /
Members / Settings), `/play/join/<token>` (link and QR code), crest generator (`src/play/components/Crest.tsx`),
badges on player pages, notifications `company_*`, moderation in `/admin` (reports and content list), 9 languages
(`// CHECK:` on the Japanese name カンパニー; Chinese 战团 and Korean 컴퍼니 to review too).
Postponed from delivery 1: **uploaded crest image** with admin approval (needs a storage bucket, quota, cleanup and
account-deletion rules: delivery 2), **calendar subscription feed** (webcal needs a server function; `.ics`
download per event or for all upcoming events is done), polls in the chat.

Plan as written before the build:

- **Company**: name, slug, motto, city or "online", languages, games (free text), description, visibility,
  joining modes, member limit, opt-in to rankings / challenges.
- **Crest**: generator (shape, division, pattern, symbol, 2–3 riso inks) stored as a small JSON; optional
  uploaded image pending admin approval (`/admin` queue).
- **Members and roles**: leader, officers, members, recruits; permissions (invite, moderate the chat, manage
  events, edit the card, promote). Main Company flag per player. Leave, kick, transfer leadership; automatic
  handover to the oldest officer / member when the leader leaves or deletes their account.
- **Joining**: invitation by username (notification), invitation link + QR code (revocable, optional expiry and
  number of uses), open joining.
- **Chat**: Realtime channel per Company, pinned announcements, report a message, officers delete messages,
  rate limit.
- **Calendar**: Company events (date, place or online, description, who comes), `.ics` export and subscription,
  reminders like the tournament rounds.
- **Pages**: `/play/companies` (my Companies + search by name / city / game / language), Company page
  (tabs: Feed / Chat / Calendar / Members), Company badge on profiles and player cards.
- **Notifications** `company_*`: invitation, joined, promoted, new event, announcement, mention.

### Delivery 2 — Activity feed + collective pile + PLAY

- **Activity feed**: units painted, armies finished, challenge entries, game results, battle reports, tournament
  podiums. Each member chooses what is posted (per type, off by default for private profiles).
- **Collective pile**: shared gauge from members' piles (already on the account, members opt in), collective goals
  set by officers ("300 models painted this quarter") with progress.
- **Company palette / schemes**: official colours and shared schemes, applied in one tap in the editor; crest on
  share cards.
- **Internal mentoring**: suggest the Company's veterans as mentors to its recruits (existing mentoring).
- **PLAY**:
  - Register to a tournament "under the colours of" a Company (no Company ranking for now, owner 2026-11-27).
  - Quick games and LFG posts **visible to members only** (new visibility value), filter "my Companies".
  - **Company vs Company challenges**: a challenge with N games, each confirmed result counts, score shown on both
    Company pages.
  - Battle reports posted to the feed.

### Delivery 3 — Narrative campaigns

- A campaign can be played **by Companies**: each Company is a faction on the hyperroute map, members' battles
  count for their Company, territories held per Company.
- Join a campaign as a Company (leader / officers), members join under its colours.
- Campaign events in the Company feed.

## Later (roadmap)

Real team tournaments, alliances / rivalries / truces, Company level and achievements, hall of fame and seasonal
rankings, shared club equipment (terrain, mats, loan armies), collective paint project (units assigned to members),
"collective work" category and Company prize in painting contests, polls in the chat, topic threads.
Store link, sponsorship, map of Companies and beginner funnel stay out unless the owner changes priorities.

## Guard rails

Reports and moderation in `/admin` (Companies, messages, crests), invitation and chat rate limits, photo quotas,
account deletion rules (leader handover, messages kept and anonymised),
RLS tests for every rule (`supabase/tests/`), writes with business rules through `SECURITY DEFINER` functions.
