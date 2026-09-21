# KidRota

A local-first Android app that helps working parents plan childcare cover across
school holidays. Every break, cover gets pieced together from grandparents,
holiday clubs, playdates and annual leave — KidRota makes that visual, so the
gaps are obvious at a glance.

**All data stays on the device.** No server, no accounts, no sync.

## Store listing

| Field | Value |
|---|---|
| Play title (30 char limit) | `KidRota School Holiday Planner` — exactly 30 |
| Package ID | `com.kidrota.app` — **permanent after first publish** |
| Privacy policy | https://robt8.github.io/kidrota/privacy.html |
| Terms | https://robt8.github.io/kidrota/terms.html |

The title drops a colon after the brand deliberately: `KidRota: School
Holiday Planner` is 31 characters and would be rejected.

## Tech stack

| Piece | Choice |
|---|---|
| Native shell | Capacitor 8 (Android, minSdk 24 / Android 7.0+) |
| UI | React 19 + TypeScript |
| Build | Vite 8 |
| Routing | React Router (hash routing, for the WebView) |
| Storage | SQLite via `@capacitor-community/sqlite` |
| Plugins | Local Notifications, Share, Filesystem |

## Getting started

```bash
npm install
npm run dev            # web dev server, fastest loop for UI work
npm test               # data-layer tests
npm run lint
```

In the browser the database runs on jeep-sqlite (SQLite compiled to wasm),
stored in IndexedDB. On Android the native plugin is used instead and none of
that code loads. `sql.js` is pinned to an exact version because jeep-sqlite
inlines its own copy of the sql.js glue and a newer wasm fails to link against
it — see the comment in `vite.config.ts` before bumping it.

## Running on Android

```bash
npm run build          # produces dist/
npx cap sync android   # copies dist/ into the native project, updates plugins
npx cap open android   # opens Android Studio
```

`npx cap sync` must be re-run after every web build and after adding any
Capacitor plugin. Requires Android Studio and a JDK locally.

## Project structure

```
src/
├── db/          SQLite init, migrations, CRUD per table
├── hooks/       Data hooks (holidays, children, carers, assignments)
├── screens/     One file per screen
├── components/  Shared UI (grid cells, pickers, progress bars, nav)
├── utils/       Dates, sharing, theme, constants
└── styles/      Global CSS and design tokens
```

## Data layer

`src/db/` is plain SQL behind a small `DbExecutor` interface, so the same code
runs three ways: the Capacitor plugin on Android, jeep-sqlite in the browser,
and Node's built-in SQLite under test. Tests therefore exercise the real
schema and the real queries.

Day notes live in their own table rather than on assignment rows: a note like
"pack swimming kit" describes the day, so storing it per assignment would
duplicate it across slots and lose it on a day with no cover booked.

Migrations live in `src/db/schema.ts` and are tracked with SQLite's
`user_version`. A shipped migration is never edited — add a new one to the end
of the array instead.

Assignments carry two shapes in one table: simple-mode rows set `period`
('am' / 'pm' / 'all_day') and leave the times null, while detailed-mode rows
set `start_time`/`end_time` and leave `period` null. A partial unique index
enforces one carer per simple-mode slot without restricting how many time
slots a detailed day can hold.

## Theming

All colours are CSS custom properties in `src/styles/index.css`. The user's
preference (light / dark / system) is stored in `localStorage`;
`src/utils/theme.ts` resolves `system` against the OS and writes the concrete
theme to `data-theme` on `<html>`, keeping it in sync if the OS setting changes.

## Backup files

`exportData` writes every table plus the app settings into one JSON file
stamped with the schema version. Import validates before touching anything —
a malformed file is rejected with nothing deleted — then replaces the device's
contents wholesale rather than merging, keeping row ids so assignments still
point at the right child and carer. A backup from a newer schema is refused;
one from an older schema is accepted, with tables added since defaulting to
empty.

On Android the file goes to app storage and then the system share sheet, so it
can be saved to Drive, Files or email. Writing straight to the public Downloads
folder would need storage permissions the app otherwise never asks for.

## Android back button

A WebView wires nothing to Android's back button or back gesture, so without
`useAndroidBackButton` it closes the app from any screen. `handleBackPress`
decides what a press means: anything layered over a screen (a modal, a
confirmation) registers an interceptor and is dismissed first, otherwise it
navigates back, and only at the first screen does the app exit.

## Colour tokens

`--text` and `--text2` carry content and meet WCAG AA in both themes.
`--text3` is decoration only — punctuation, "+" glyphs inside already-labelled
controls, the repeated app-name eyebrow — and sits below 4.5:1 on small text by
design. Anything a user needs to read uses `--text2`.

Colours that serve two roles need two tokens: `--red-text` is a foreground and
`--danger-bg`/`--danger-on` the destructive button, because a red that reads on
the page background is unreadable as a button fill once the theme flips.

## Build progress

- [x] 1. Project scaffold — Vite + React + Capacitor + Android platform
- [x] 2. Database layer — SQLite init, migrations, CRUD
- [x] 3. Onboarding — welcome slides, add children, add carers
- [x] 4. Home screen — holiday list, progress bars, stat cards
- [x] 5. Weekly planner — week grid, navigation, gap detection
- [x] 6. Day assignment — carer picker, slot assignment, repeat logic
- [x] 7. Children & Carers screens — full CRUD
- [x] 8. Settings — theme, backup/restore, delete all data
- [ ] 9. Sharing — screenshot share, share code export/import
- [ ] 10. Polish — animations, loading/empty states, error handling
