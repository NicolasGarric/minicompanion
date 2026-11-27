# Companies (player groups) — plan

> Requested by a player who wants to **gather their local club**. Decisions taken by the owner on 2026-11-27.
> Name in the app: **Compagnie** (FR) / **Company** (EN), echoing MiniCompanion; translated in the 9 languages.

## Owner decisions (2026-11-27)

| Topic | Decision |
|---|---|
| Name | **Compagnie** |
| Membership | Several Companies per player, **one main** (shown on the profile, counts for rankings) |
| Size | **Default limit** at creation (e.g. 50); the leader can lower it, an app admin can raise it on request |
| Nature | Local (city, optional store) **or** online, chosen by the Company |
| Games | Multi-game, main games listed as free text (search filter, suggestions) |
| Spirit | Competition **and** mutual help, each Company chooses whether it takes part in rankings / challenges |
| Chat | **Realtime chat + pinned announcements** (officers), report button |
| Crest | **Both**: built-in generator (shapes, patterns, riso inks) by default; uploaded image only after an app admin approves it (photo quota, no trademark logos) |
| Team tournaments | **Company ranking first** (from individual results, Swiss rounds unchanged); real team pairings on the roadmap |
| Device data sync | **No**: paint shelf and sessions stay on the device, not used by Companies |
| Creation | Any signed-in account, **no validation** (reports handled afterwards in `/admin`) |
| Visibility | **Public** (indexed page: members, gallery, record) / **Private** (name + crest visible, content for members) |
| Joining | **Invitation**, **link / QR code**, **open**; the leader enables the ones they want (no "on request" mode) |
| Leader leaves / deletes account | Passes to the **oldest officer**, else the oldest member; dissolved only when empty |
| Narrative campaigns | **In V1**: a Company can be a faction on the hyperroute map |

## V1 scope

1. **Core**: Company card (name, motto, city or online, languages, games, description), crest, roles
   (leader, officers, members, recruits) with permissions, joining modes, member limit, leader handover.
2. **Chat + calendar**: realtime chat, pinned announcements, polls (optional), Company calendar with `.ics`,
   notifications `company_*`.
3. **Activity feed + collective pile**: automatic feed (painted units, results, battle reports; each member
   chooses what is shared), shared pile gauge (pile is already on the account), collective goals, Company palette /
   schemes.
4. **PLAY**: register "under the colours of" a Company, Company ranking in a tournament, games and LFG posts
   for members only, Company vs Company challenges.
5. **Narrative campaigns**: Companies as factions, territories held per Company.

## Later (V2+)

- Discovery: map of Companies, link to a store (store nights, sponsorship), recruitment posts, beginner path →
  "join a Company near you". *Note: this matches the requesting player's need (local club); worth pulling
  forward if V1 ships quickly.*
- Real team tournaments, alliances / rivalries / diplomacy, Company level and achievements, seasonal rankings,
  shared club equipment inventory, collective paint project, Company prize in painting contests, share card.

## Guard rails

Reports and moderation in `/admin`, invitation rate limits, photo quotas, account deletion rules (leader handover),
RLS tests for every rule (`supabase/tests/`), writes with business rules through `SECURITY DEFINER` functions.
