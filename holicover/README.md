# HoliCover

A local-first Android app that helps working parents plan childcare cover across
school holidays. Every break, cover gets pieced together from grandparents,
holiday clubs, playdates and annual leave — HoliCover makes that visual, so the
gaps are obvious at a glance.

**All data stays on the device.** No server, no accounts, no sync.

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
```

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

## Theming

All colours are CSS custom properties in `src/styles/index.css`. The user's
preference (light / dark / system) is stored in `localStorage`;
`src/utils/theme.ts` resolves `system` against the OS and writes the concrete
theme to `data-theme` on `<html>`, keeping it in sync if the OS setting changes.

## Build progress

- [x] 1. Project scaffold — Vite + React + Capacitor + Android platform
- [ ] 2. Database layer — SQLite init, migrations, CRUD
- [ ] 3. Onboarding — welcome slides, add children, add carers
- [ ] 4. Home screen — holiday list, progress bars, stat cards
- [ ] 5. Weekly planner — week grid, navigation, gap detection
- [ ] 6. Day assignment — carer picker, slot assignment, repeat logic
- [ ] 7. Children & Carers screens — full CRUD
- [ ] 8. Settings — theme, backup/restore, delete all data
- [ ] 9. Sharing — screenshot share, share code export/import
- [ ] 10. Polish — animations, loading/empty states, error handling
