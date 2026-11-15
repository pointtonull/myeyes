# MyEyes! — fork provenance

Forked from **Dark Reader** (MIT, © Dark Reader Ltd.) — `LICENSE` preserved verbatim.

- **Upstream:** https://github.com/darkreader/darkreader (`upstream` remote)
- **Base commit:** `097636ce` — "Update fixes for zhihu.com (#16212)", 2026-11-15
- **Why a fork, not a reuse:** the valuable, hard parts (dynamic color-inversion
  engine, per-site fix format + parser, and the remote-config fetcher that
  auto-updates fixes) are inherited. We rebrand, gut/flatten the UI, and add our
  own features.

## What we keep from upstream (and cherry-pick fixes into)
- `src/inject/dynamic-theme/` — the engine
- `src/generators/`, `src/inject/dynamic-theme/fixes.ts` — fix format + parser
- `src/background/config-manager.ts` — remote fixes auto-updater (local+remote
  per config, cache-busting fetch, bundled fallback)
- `src/config/*.config` — bundled fix snapshots (offline fallback)

## What's net-new / changed in MyEyes!
- **Rebrand:** drop all "Dark Reader" name + logo (store rejects confusingly
  similar names); product name **MyEyes!**.
- **Flatten the UI:** popup reduced to enable-global / enable-site / default-theme
  / this-site-theme + a pencil to a theme editor (mode, brightness, contrast, …).
  DR's news / page-viewer / devtools / stylesheet-editor demoted or removed.
- **Named, reusable themes:** storage schema = one default theme id + a per-URL
  theme-id override map (replaces DR's single global theme + per-URL tweaks).
- **Four keyboard commands:** toggle enabled-default, enabled-for-page,
  default-theme, theme-for-page.
- **Second source mode — userstyles:** fetch community per-site CSS from the
  Stylus ecosystem (UserStyles.world + USO-archive) into the same fetch/cache/
  fallback manager; per-site resolver prefers a good userstyle, else DR-dynamic.

## Rebase/maintenance policy
Fixes auto-update at runtime via `config-manager`, so full git rebases are rarely
needed. Periodically cherry-pick engine improvements from `upstream`. Keep the
opinionated features (named themes, userstyles mode, flat UI) as our own commits.
