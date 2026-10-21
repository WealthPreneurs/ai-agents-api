# Kingdom Quest: Discovering My Divine Purpose

A 365-day chronological Bible journey for kids ages 7–12, paired with an
identity-and-purpose track that anchors who they are in Yahweh God.

This folder is the product blueprint: architecture, data model, design system,
and gamification rules, plus the machine-readable content structure the app is
built on.

| Path | What it is |
|---|---|
| `content/curriculum.json` | The Great Map: 12 Regions, 52 Realms, the four identity phases, weekly milestones and anchor verses |
| `content/catalog.json` | Traits, Identity Badges, Character Companions, Kingdom Builder materials |
| `content/days/day-NNN.json` | Daily Checkpoints: Regions 1–8 (days 1–252) plus sample day 365 |
| `schema/daily-node.schema.json` | JSON Schema for a daily Checkpoint |
| `supabase/schema.sql` | Family accounts, progress, journal, badges, wallet, village, with row-level security |
| `scripts/validate-content.js` | Content checker: `npm run validate:kingdom-quest` from the repo root |

---

## 1. Product pillars

1. **Scripture Knowledge.** Read the whole story of the Bible in order, from
   "Let there be light" (day 1) to "I am making all things new" (day 365).
2. **Identity & Purpose.** Each week turns the story into a truth about the
   child: who Yahweh says they are, how He made them, what He is growing in
   them, and how they can serve.
3. **Grace over grind.** Nothing is ever lost. No streaks, no timers, no
   leaderboards, no ads, no social feeds.
4. **Reverent accuracy.** Every story is checked against the text and reviewed
   by a theology reviewer before it ships. AI never writes Scripture, never
   speaks as Yahweh, and never tells a child what their calling is.

---

## 2. System architecture

```
┌──────────────────────────── Kid's device (iOS / Android / tablet) ───────────────────────────┐
│  React Native (Expo) app                                                                     │
│  ┌───────────┐ ┌──────────────┐ ┌───────────────┐ ┌──────────────┐ ┌──────────────────────┐   │
│  │ Great Map │ │ Daily Quest  │ │ Blueprint     │ │ Kingdom      │ │ Parent Mode          │   │
│  │ (regions, │ │ reel → gem → │ │ Journal       │ │ Builder      │ │ (PIN / biometric)    │   │
│  │  realms)  │ │ quiz → prayer│ │ + Badges      │ │ (village)    │ │ dashboard, settings  │   │
│  └───────────┘ └──────────────┘ └───────────────┘ └──────────────┘ └──────────────────────┘   │
│  Offline store (SQLite): content packs, progress queue, journal drafts                      │
└───────────────┬────────────────────────────────────┬─────────────────────────────────────────┘
                │ content packs + media (signed)      │ sync (parent's Supabase session)
                ▼                                     ▼
   ┌──────────────────────────┐        ┌───────────────────────────────┐
   │ CDN: region packs (JSON),│        │ Supabase                      │
   │ story reels, audio, art  │        │ Auth (parents only), Postgres │
   └──────────▲───────────────┘        │ + RLS, Storage (drawings,     │
              │ publish                │ voice notes)                  │
   ┌──────────┴───────────────┐        └──────────────┬────────────────┘
   │ Content studio           │                       │ service role
   │ authoring → schema check │        ┌──────────────▼────────────────┐
   │ → theology review →      │        │ Kingdom Quest API (planned)   │
   │ publish (status field)   │        │ /kq/reflections/analyze       │
   └──────────────────────────┘        │ safety screen → Claude trait  │
                                       │ signals → badge rules         │
                                       └───────────────────────────────┘
```

**Why this shape**

- **Content is static and versioned.** The 365 Checkpoints are JSON files
  bundled into 12 region packs and served from a CDN. Kids can play fully
  offline; a region pack downloads the week before it's needed.
- **Supabase only holds family data.** Progress, journal, badges, wallet, and
  village. Only parents have logins; children are profiles under the parent
  (`supabase/schema.sql`). RLS scopes every row to `auth.uid() = parent_id`.
- **One server-side job: reflections.** A small Node service (not built yet) (same pattern as
  the Deal Engine in this repo) screens journal entries for safety and, with
  the parent's separate opt-in, asks Claude for trait signals. Badges, stone
  rewards, and safety flags are written only with the service role, so the
  client can't award itself anything.
- **Media.** Story reels are pre-rendered (2 minutes, 720p/1080p, with caption
  tracks); narration audio is a separate file so text-to-speech, captions, and
  audio-only "Adventure Mode" share one script (`story_reel.narration`).

---

## 3. Module A: The 365-Day Scripture Odyssey ("The Great Map")

**Structure.** 12 Regions (months) → 52 Realms (weeks) → 365 Checkpoints (days).
Realms are 7 days, so a realm is `min(52, ceil(day / 7))`; Realm 52 has 8 days
and day 365 is the Coronation celebration. Regions are groups of 4 or 5 realms
(`content/curriculum.json`), so a region is a stretch of the story, not a
calendar month, and a child can start on any date.

| Region | Name | Books | Realms |
|---|---|---|---|
| 1 | The Garden of Beginnings | Genesis 1–11, Job | 1–4 |
| 2 | The Land of Promises | Genesis 12–50 | 5–9 |
| 3 | The Freedom Road | Exodus | 10–13 |
| 4 | The Wilderness Frontier | Numbers, Deuteronomy, Joshua | 14–17 |
| 5 | The Valley of Heroes | Judges, Ruth | 18–21 |
| 6 | The Shepherd's Hills | 1–2 Samuel, Psalms | 22–26 |
| 7 | The Kingdom of Wisdom | 2 Samuel, 1–2 Kings, 2 Chronicles, Psalms, Proverbs | 27–31 |
| 8 | The Prophets' Watchtower | Isaiah, Jonah, Jeremiah, Daniel, Esther | 32–36 |
| 9 | The City of Rebuilders | Ezra, Nehemiah, Malachi, Luke 1 | 37–40 |
| 10 | The King Arrives | The Gospels | 41–44 |
| 11 | The Hill and the Empty Tomb | Passion and Resurrection | 45–48 |
| 12 | The Forever Kingdom | Acts, Letters, Revelation | 49–52 |

**A daily Checkpoint (about 10 minutes).**

1. **Story Reel** (60–150 s). Animated, narrated retelling with captions.
   Pause, replay, and audio-only are always available. In Character Armor,
   weeks 27–32 each award a piece of the Ephesians 6 armor at Sabbath Camp, and
   weeks 33–39 each add a fruit to the Fruit of the Spirit tree in the village.
2. **Memory Gem.** The key verse is split into 3–8 chunks (`memory_verse.tokens`).
   The child taps chunks into order. Ages 10–12 can turn on Challenge mode,
   which adds decoy chunks (`distractors`). Verses quote the World English
   Bible (public domain), which uses the name Yahweh.
3. **Quest Check.** Exactly three questions. Every answer, right or wrong,
   shows the explanation and the verse. Wrong answers never cost anything;
   the child can try again.
4. **Micro-Prayer.** A short guided prayer read aloud or silently, followed by
   an optional "Talk to Yahweh in your own words" moment that is never recorded
   unless the child chooses to save it to the journal.

**Sabbath Camp.** Day 7 of every realm is lighter: a recap of the week's story,
a replay of the Memory Gem, and the weekly **Identity Milestone** (below).

---

## 4. Module B: The Identity & Purpose Mirror ("Who Yahweh Says I Am")

| Phase | Realms | Focus | Example milestones |
|---|---|---|---|
| Foundation | 1–12 | Unshakable identity | Made in His image · Chosen · Forgiven · Rescued · Loved |
| Gifts & Passions | 13–26 | How Yahweh made me | Creativity (Bezalel) · Leadership (Joshua) · Empathy (Ruth) · Courage (David) |
| Character Armor | 27–39 | Fruit of the Spirit, resilience | Honesty (Psalm 51) · Peace (Elijah) · Self-control (Daniel) · Perseverance (Nehemiah) |
| Kingdom Mission | 40–52 | Gifts → service | Salt and light · Five loaves · The Servant King · Ephesians 2:10 |

Each realm's milestone, anchor verse, and gift/character/mission focus is in
`content/curriculum.json`. The identity truth always comes out of that week's
passage, so the two tracks never feel like separate apps.

### The "My Divine Blueprint" journal

A private, illustrated notebook. Entries can be a tap choice
(`reflection_choices`), typed text, a voice note, or a drawing, so a 7-year-old
who can't type yet has the same experience as a 12-year-old. Entry kinds:
reflection, answered prayer, strength I noticed, gratitude, free page.

The Blueprint grows over the year into a one-page portrait: favorite verses,
badges with the moments that earned them, answered prayers, and in Realm 51
("One Body, Many Gifts") a "Here's how Yahweh made me" summary the child can
print and share with their family.

### Identity Badges (AI-assisted, never AI-decided alone)

Badges are positive, explainable, and earned over time.

1. A journal entry is saved. A **safety screen** runs first (keyword rules plus
   a classifier) for signs of harm, abuse, or danger. Anything flagged sets
   `journal_entries.safety_flag`, alerts the parent, and shows the child a
   gentle "Let's talk to a grown-up you trust" card. It is never analyzed for
   badges.
2. If the parent opted in (`parents.ai_reflection_consent`), the entry text,
   with names and places removed, goes to Claude with structured outputs. The
   model may only return trait ids from `catalog.json` with a short supporting
   quote and a confidence score. It cannot invent traits, return negatives, or
   write to the child. Without opt-in, signals come only from tap choices and
   completed days.
3. **Rules decide the badge, not the model.** A badge is awarded when its
   traits have at least 3 signals with confidence ≥ 0.6, spread across at
   least 2 different realms. Every award stores its evidence
   (`badge_awards.evidence`), so a parent can see exactly why their child is an
   *Encourager*.
4. **Beloved Child** is given to every child at the end of the Foundation
   phase. Identity in Yahweh is a gift, not something earned.
5. Parents can add a **Parent Affirmation** ("I saw you be a peacemaker today"),
   which counts as a signal and appears in the journal.

Badges: Beloved Child, Brave Heart, Creative Maker, Builder, Wise Leader,
Compassionate Friend, Encourager, Prayer Warrior, Joyful Worshiper, Peacemaker,
Faithful Servant, Truth Seeker, Light Bearer.

---

## 5. Module C: Gamification and engagement

### Light Stones economy

| Action | Light Stones |
|---|---|
| Finish a Checkpoint (story, gem, quiz, prayer) | 10 (3 + 3 + 3 + 1) |
| Sabbath Camp | 10 + Identity Milestone card |
| Realm chest (any 5 Checkpoints in the realm, in any order, at any time) | 15 + 2 materials |
| Region finale | 40 + a companion keepsake |
| Identity Badge | 25 + a badge banner for the village |
| Coronation Day (day 365) | 50 + the River of Life fountain |

Stones are never spent on progress, never sold for money, and never expire.
Every change goes through an append-only ledger (`stone_ledger`), so the
wallet can always be audited.

### Kingdom Builder

An isometric village that grows with the story: an Eden garden plot (Region 1),
Abraham's tents, the Tabernacle courtyard, Jericho's walls, a shepherd's field,
Solomon's temple steps, Nehemiah's gate, a Galilee fishing dock, the empty
tomb garden, and the River of Life (day 365). Kids place, rotate, and decorate
items on a grid (`village_items`). Materials (cedar wood, river stone, linen,
olive oil, clay, gold thread, palm branch, lamp) tie each build to its story.

### Character Companions

One guide per region (Eve, Joseph, Miriam, Caleb, Deborah, David, Solomon,
Esther, Nehemiah, Peter, Mary Magdalene, Paul). Their voice messages are
pre-written, reviewed, and voice-acted. Companions encourage and retell what
the text says. They never claim new revelation or speak words as Yahweh.

### Grace mechanics ("Rest & Restore")

- **No streaks.** The map shows a **Faithfulness Garden**: one flower per
  completed day, which only grows.
- **Every day stays open.** Missed days don't lock or fade.
- **Coming back after 3+ days** opens Rest & Restore: the region's companion
  says something like "Welcome back! Yahweh never left you, and neither did
  we." The child picks a path: *Catch up* (continue where they stopped),
  *Jump to today* (skipped days stay open on the map), or *Recap* (a 3-minute
  summary of what they missed).
- **No dark patterns.** No countdowns, loss-aversion pop-ups, random loot
  boxes, push notifications to the child, or comparisons with other kids.
  Parents can set a gentle daily reminder and a daily time cap.

---

## 6. UI/UX design system

**Aesthetic.** Hand-illustrated vector art, soft gradients, and isometric,
dreamlike landscapes (Monument Valley) with heroic color and light
(Kingdom Hearts). Each region has its own palette and ambient soundscape.

**Color tokens** (all text pairs meet WCAG AA, 4.5:1)

| Token | Hex | Use |
|---|---|---|
| `--sky-deep` | `#1E2A78` | Headers, night scenes |
| `--light-gold` | `#FFC93C` | Light Stones, primary actions |
| `--garden` | `#2E9E6A` | Success, Faithfulness Garden |
| `--ember` | `#E8603C` | Highlights, never for errors |
| `--parchment` | `#FFF6E5` | Reading surfaces |
| `--ink` | `#24203A` | Body text |

Feedback never relies on color alone: correct answers also get a checkmark,
a sound, and a short phrase. Colorblind modes (deuteranopia, protanopia,
tritanopia) swap the palette; a high-contrast mode is also available.

**Typography.** A rounded, readable sans for UI (e.g. Nunito); a storybook
serif for Scripture (e.g. Literata). Body text is at least 18 pt, Memory Gem
chunks at least 22 pt. OpenDyslexic is an option.

**Touch and motion.** Touch targets are at least 56 × 56 pt with 12 pt
spacing. Drag-and-drop always has a tap-to-place alternative. Reduce-motion
mode replaces parallax and particles with fades.

**Accessibility.** Text-to-speech on every screen, including quiz options and
journal prompts. Captions on every reel. Voice and drawing answers in the
journal. Works with screen readers (VoiceOver, TalkBack).

**Screens.** Welcome and avatar → Great Map → Realm view → Checkpoint (Reel →
Gem → Quest Check → Prayer → Reward) → Sabbath Camp → Blueprint Journal →
Badge Hall → Kingdom Builder → Rest & Restore → Parent Mode.

**Tone of voice.** Warm, adventurous, reverent, simple. Short sentences, a
2nd–4th grade reading level, and "you" language.

| Instead of | Say |
|---|---|
| "Wrong! Try again." | "Good try! Let's look at what the story says." |
| "You lost your streak." | "Welcome back! Your garden kept growing." |
| "Level up!" | "You finished the Realm! David has a message for you." |

---

## 7. Data model

### Daily Checkpoint

The node keeps the fields from the original spec (`day`, `month`, `theme`,
`scripture_passage`, `story_title`, `summary`, `memory_verse`,
`identity_focus`, `quiz`) and adds what the app needs to play it:

- `realm`, `identity_phase`, `is_sabbath_camp`: derived placement on the map
  (checked by the validator)
- `story_reel`: duration, narration script (also the TTS and caption
  source), and scenes with art direction for illustrators
- `memory_verse.translation`, `excerpt`, `tokens`, `distractors`: for the
  tap-to-assemble builder
- `identity_focus.reflection_choices`: tap answers for younger kids;
  `trait_unlocked` is a trait id from `catalog.json`
- `quiz[].explanation`, `verse_ref`: shown after every answer
- `micro_prayer`, `companion`, `rewards`, `review`

See `schema/daily-node.schema.json` and `content/days/day-158.json`.

> **Note on the sample in the original spec.** It placed David and Goliath at
> day 45, month 2. On a chronological map, Realm 7 (days 43–49) is still in
> Genesis, so the David story is at **day 158** (Realm 23, Region 6, Gifts &
> Passions phase). Its fields are otherwise the same, with `trait_unlocked`
> as the id `bold_faith`. The memory verse uses the WEB wording of
> 1 Samuel 17:47 ("for the battle is Yahweh's").

### Family data (Supabase)

`parents` → `child_profiles` → `checkpoint_progress`, `journal_entries`,
`trait_signals`, `badge_awards`, `wallets` + `stone_ledger`, `village_items`,
`rest_restore_events`. There is intentionally no streak column anywhere.

---

## 8. Child safety and privacy

- **COPPA / GDPR-K.** Verifiable parental consent before any child data is
  stored (`parents.consent_given_at`). Collect only a nickname and an age band,
  never a child's email, photo of their face, location, or real name. Parents
  can export or delete everything.
- **AI opt-in is separate** from account consent. Reflection text is stripped
  of names and places before it's sent, isn't used to train models, and is
  never shown back to the child as AI output.
- **No ads, no third-party trackers, no chat, no social feeds, no external
  links** in the child experience. External links and purchases live behind
  Parent Mode.
- **Safety flags** always reach the parent, even when the entry wasn't shared.
- **Journal privacy** from parents is a UI default (only shared entries appear
  in the parent dashboard), not a security boundary. The parent owns the
  account and can always review their child's data.

---

## 9. Content production

1. Author a Checkpoint as JSON (or in the content studio, which writes the same
   JSON).
2. `npm run validate:kingdom-quest` checks the schema rules, the map math, and
   narration pace (at most 1.65 words per second of reel, about 100 wpm).
3. A theology reviewer checks the narration, quiz, and prayer against the text
   and sets `review.status` to `theology_reviewed`, recording their name in
   `review.reviewers` (the validator won't accept a `published` node without a
   reviewer).
4. Art, animation, and voice are produced from `story_reel.scenes` and
   `narration`.
5. Publish: the region pack is rebuilt and pushed to the CDN.

AI can help draft narration and quiz questions in the studio, but every node
goes through human review, and Memory Gems are always quoted directly from
the translation.

---

## 10. Roadmap

| Phase | Scope |
|---|---|
| MVP (Region 1, 4 realms) | Map, Checkpoint flow, Sabbath Camp, Blueprint journal (tap + text), Light Stones, Eden garden, Parent Mode, TTS and captions |
| v1 (full year) | All 12 region packs, all companions, Kingdom Builder, AI badges with opt-in, Rest & Restore |
| v1.1 | Voice and drawing journal entries, family devotion mode (parent + child), Spanish |

Today this folder has the full year's map, Regions 1–8 (days 1–252: Creation
through Esther), and the day 365 sample. The remaining 112 Checkpoints follow
the same schema. Days with sensitive content (death, judgment, the binding of
Isaac, the plagues, the conquest of Canaan, violence in Judges and Samuel,
David and Bathsheba, the fall of Jerusalem, and Haman's decree) carry
`review.notes` for the theology reviewer.
