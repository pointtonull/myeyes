# less.js (vendored)

`less.min.js` is the unmodified browser build of [less.js](https://lesscss.org)
v4.9.1 (`node_modules/less/dist/less.min.js`, same version as the devDependency),
Copyright (c) 2009-2026 Alexis Sellier and contributors, Apache-2.0 (see `LICENSE`).

MyEyes! loads it on demand in the background page to compile LESS community
styles for AI Enhance (`src/background/less-compiler.ts`). Inline JavaScript in
LESS stays disabled; imports go through an allowlist (`src/utils/less-imports.ts`).
To update: copy the new `dist/less.min.js` here and bump the version above.
