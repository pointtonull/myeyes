# MyEyes! privacy policy

MyEyes! does not collect your data. There are no accounts, no analytics and no telemetry, and nothing about the pages you visit is sent to the author or to anyone else.

## What stays on your device

The extension reads and restyles the pages you visit entirely in your browser, to make them dark. Your settings (themes, per-site choices, shortcuts) are saved in the browser's extension storage. If you use a Firefox account with add-on data syncing, Firefox may sync those settings between your devices; that is Mozilla's service, not ours.

## The only network requests the extension makes

1. **Per-site fixes.** The extension downloads the community-maintained per-site fix files of the open-source Dark Reader project from `raw.githubusercontent.com/darkreader/darkreader`. These requests contain no page addresses or personal data. As with any download, GitHub can see your IP address.
2. **AI Enhance, only when you ask for it** (the popup button or `Alt+Shift+E`). The extension downloads the public style index from `userstyles.world`, then the community style files that match the current site. The page address itself is never sent, but the style numbers requested can hint at which site you used it on.

Separately, Firefox itself (not the extension) periodically checks `www.pointtonull.dev/myeyes/updates.json` (a file served by GitHub Pages) for a newer version, which is how MyEyes! updates itself. That request carries no information about you or your browsing; as with any download, GitHub can see your IP address.

Nothing else leaves your browser.

## Questions

Open an issue at <https://github.com/pointtonull/myeyes/issues>.
