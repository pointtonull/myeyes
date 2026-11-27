<h1 align="center">💜 Contributing to MyEyes!</h1>

<p align="center"><em>Dark mode, because your retinas have feelings.<br/>Welcome! You don't need to be a hacker. You just need to care about tired eyes.</em></p>

---

## 🤖 The easiest way in: let a robot set you up

Never opened a terminal? Perfect, you're in good company. Install a coding agent
([Claude Code](https://claude.com/claude-code), OpenAI Codex, or any similar one),
open it **inside this repo's folder**, and say:

> **Read CONTRIBUTE.md and get me set up to hack on MyEyes!**

That's it. The agent follows this file, installs what's missing, builds the
extension, runs the tests, loads it in a browser, and then helps you make your
first change and open a pull request. (Yes, this whole file is written so a robot
can follow it. Hello, robot friend. 👋 You're welcome here too.)

Prefer doing it by hand? Skip to [Setup](#setup). Not into code at all?
There are [plenty of ways to help](#ways-to-help).

---

## 🧑‍🚀 Agent briefing (humans may skip, but it's short and funny in places)

**Goal:** get your human to a working dev loop, then help them make one small,
well-scoped change and open a good PR.

| Fact | Value |
| --- | --- |
| What it is | A browser extension (Firefox first, Chromium too): proactive, keyboard-driven dark mode. A fork of Dark Reader. |
| Language / UI | TypeScript, Malevic JSX (a tiny React-like library: not React), LESS |
| Project repo | `github.com/pointtonull/myeyes`. **Not** `darkreader/darkreader` |
| Build output | `build/debug/<browser>/`, the folder you load into the browser |
| Pure logic lives in | `src/utils/*.ts`, unit-tested without a browser (`tests/unit/`) |
| Done means | tsc clean · eslint clean · `npm test` green · scoped diff · screenshots if UI changed |

**Do**

- Run the [setup block](#setup) step by step; **check each expected output** before moving on.
- Keep changes small and in scope: one PR, one idea.
- Put new non-browser logic in a plain `src/utils/` module **with a unit test**, behind a thin `chrome.*` shell.
- Use the **`/myeyes-pr`** skill (or the same steps by hand) when it's time to open a PR.
- Give every scratch/test page a **dark background**. This project exists because bright pages hurt people.

**Don't**

- ❌ Load a dev build into your human's everyday browser profile: a content script runs on *every* page they visit, logins included. Use the throwaway profile that `web-ext` creates (see [Loading it](#loading-it-into-a-browser)).
- ❌ Push, open a PR, or comment on GitHub without a clear yes from your human.
- ❌ Target `darkreader/darkreader` with a PR. In some clones the git remote called `upstream` points there. Check with `git remote -v`.
- ❌ Reformat or "tidy" code you weren't asked to touch. Don't touch `LICENSE`, and don't put Dark Reader's name or logo in the UI.
- ❌ Take screenshots of real logged-in pages, or bright ones.

**Stop and ask your human when:** a command fails twice for the same reason · you'd widen manifest permissions · you'd delete or rewrite something big · you're about to push · you're unsure what "done" looks like.

---

<a id="setup"></a>

## 🛠️ Setup in five minutes

You need **Git**, **Node.js** (recent; there's no pinned version, the maintainer runs a very new one) and **Firefox**
(the primary dev target). Optional: **Python 3 + Pillow** (`pip install pillow`) for the screenshot tools, and the
[GitHub CLI](https://cli.github.com) (`gh`) for opening PRs.

```sh
node --version && git --version && npm --version   # ✔ all three print a version

gh repo fork pointtonull/myeyes --clone && cd myeyes   # or: git clone https://github.com/pointtonull/myeyes.git && cd myeyes
npm install                                            # ✔ a minute or two; ignore the audit chatter
npm run debug -- --firefox                             # ✔ ~30 s; ends with "MISSION PASSED! RESPECT +"
npx tsc --noEmit -p src/tsconfig.json                  # ✔ prints nothing = no type errors
npm test                                               # ✔ "Tests: … passed", no failures
```

If every ✔ held, you're ready to hack. 🎉

### Loading it into a browser

The build lands in `build/debug/firefox/`. Pick one:

- **Safest and nicest (a throwaway Firefox profile that auto-reloads on rebuild):**
  `npx web-ext run --source-dir build/debug/firefox` (add `--firefox <path to Firefox>` if it can't find it).
- **By hand:** open `about:debugging#/runtime/this-firefox` → *Load Temporary Add-on…* → pick `build/debug/firefox/manifest.json`.
- **Chrome / Edge:** `npm run debug -- --chrome-mv3`, then `chrome://extensions` → *Developer mode* → *Load unpacked* → `build/debug/chrome-mv3`.
  (The maintainer develops on Firefox; if Chromium misbehaves, please say so. That's a useful bug report!)

### The everyday loop

```sh
npm run debug:watch     # rebuilds as you save: Chrome + Firefox, first build ≈ 1 min, CSS changes ≈ 0.1 s
```

Edit → save → look at the browser. Before you call it done, the three quick checks:

```sh
npx tsc --noEmit -p src/tsconfig.json   # seconds. Do this *before* waiting on a build
npx eslint <the files you changed>      # or `npm run lint` for everything
npm test
```

| Command | What it does | Time |
| --- | --- | --- |
| `npm run debug -- --firefox` | one-browser debug build | ~30 s |
| `npm run debug:watch` | incremental Chrome + Firefox | ~1 min, then instant |
| `npm run debug` | every browser, once | ~5 min ☕ |
| `npm test` | unit tests (Jest) | seconds |

---

## 🧠 Hard-won tips (so you don't have to learn them the ouch way)

**Builds**

- **Builds can fail quietly.** Always look for `MISSION PASSED` / `MISSION FAILED`. A failed build can leave the popup folder half-empty, which shows up later as a page that just says "Loading, please wait".
- **`debug:watch` dies on a TypeScript error** (a half-finished multi-file edit will do it). Run `npx tsc --noEmit -p src/tsconfig.json`, fix, restart. Habit: tsc first, build second.
- **`node: command not found`?** Your shell's PATH is missing it (common with Homebrew). Add the folder containing `node` to your PATH instead of reinstalling.
- **Firefox's `--start-debugger-server` flag never bound a port for us (Firefox 160).** Don't burn an afternoon on it. `web-ext` handles loading and reloading for you.

**Code gotchas**

- 🧩 **Malevic isn't React.** Three traps: never name a variable `m` (it's the JSX factory); a **number as a JSX child** type-checks but throws at render (`{String(n)}`, not `{n}`); helper props typed `Malevic.Child` reject arrays of JSX (type them `any`).
- 🎨 **LESS inside `.mobile, .preview {}`.** The popup styles are imported under that wrapper, so a nested selector with **two `&`s** (`&--auto &__icon`) repeats the parent and silently never matches. Spell those out flat.
- ✨ **Glows.** Popup controls share the `GlowButton` mixins in `src/ui/popup/main-page/glow.less`. A glow is a `::after` at `z-index: -1`, so it needs an `isolation: isolate` container *behind* the control, and the control must **not** create its own stacking context (no `opacity`, `filter` or `backdrop-filter` on it), or the glow vanishes or ghosts.
- 🌍 **Adding UI text?** Put the key in `src/_locales/en.config`, then run `python3 tools/sync_locales.py`. It mirrors the key into the other locales as English placeholders (a unit test insists they match line for line).
- 🧪 **Keep logic out of the browser.** `named-themes`, `site-enable`, `osd-message`, `image-triage`, `usercss`, `glare-metric`: all pure TypeScript, all unit-tested, behind thin `chrome.*` shells. Copy that shape.

**Eyes & safety** *(the heart of this project)*

- 🌑 **Anything you overlay on a page must survive a filter-inverted page.** The Filter+ engine puts `invert()` on `<html>`, which would turn a dark popup *white*. `src/inject/osd.ts` counter-filters itself every frame; copy that. Test on a page with `html { filter: invert(100%) hue-rotate(180deg) }`.
- 🔒 **Style overlays through the CSSOM** (`el.style.setProperty(prop, value, 'important')`), not `<style>` tags or `style=""` attributes, so strict page CSPs can't block them. The OSD also lives in a closed shadow root.
- 🐢 **Respect `prefers-reduced-motion`.** And remember its users *only ever see the static path*, so make it look finished, not like a fallback.
- ☠️ **Community CSS is untrusted.** `src/utils/usercss.ts` drops remote `url()`s, `@import`, `-moz-binding`, `behavior`, `expression()`. Keep that discipline for anything that reads text from the web.
- 🕶️ **Dim test pages, always.** If you make a scratch HTML file, give it a dark background. Please don't ambush anyone's retinas, including your own.

**Screenshots** (needed for UI PRs)

- 🖼️ **Popup:** `python3 tools/preview_popup.py --serve --scenario enabled` renders the real popup as a normal web page with mock data and prints a URL; screenshot it with any browser. Scenarios: `plain named modified engine custom disabled enabled dark parked`; `--click ".me-card--theme"` opens menus first.
  (The maintainer's machine auto-captures through a private tool and skips `--serve`.)
- 🔔 **The on-screen confirmation (OSD):** compile it alone (`npx tsc src/inject/osd.ts --outDir /tmp/osd --rootDir src --target es2020 --module es2020 --lib es2020,dom --skipLibCheck`; type complaints about unrelated utils are harmless, the JS still comes out), then serve that folder (`python3 -m http.server`; browsers won't load modules from `file://`) and open a **dark** page in it that does `import {showOSD} from './inject/osd.js'; showOSD({title: 'Filter+', host: 'example.com', note: 'Engine for this site', icon: 'filter'})`.
- ↔️ **Before/after:** `python3 tools/compare_shots.py before.png after.png --crop --out pr-assets/popup.png`. The `/myeyes-pr` skill does this for you.
- 🌐 **A real site:** run `web-ext` (above) and visit a page. The extension only touches pages while loaded, and `web-ext`'s throwaway profile keeps it away from your real logins.

**Upstream & provenance**

- 🍴 MyEyes! is a fork. Dark Reader's `LICENSE` stays, and [FORK.md](FORK.md) says which commit we forked from. Keep edits to inherited engine files small and explainable.
- 🌍 **Per-site fixes** (a site that looks wrong): MyEyes! fetches Dark Reader's community fixes at runtime, so a fix sent to [Dark Reader](https://github.com/darkreader/darkreader) helps everyone, us included. Great first contribution.
- ⌨️ On macOS, `Alt` in shortcuts means `Option`.

---

## 🗺️ Where things live

```
src/ui/popup/main-page/   the popup: index.tsx (markup), style.less, glow.less (GlowButton), theme-menus.tsx
src/ui/popup/body/        the popup frame: header, gear, pane background
src/inject/osd.ts         the on-screen confirmations (drawn); src/utils/osd-message.ts has the wording
src/background/extension.ts   keyboard commands & settings plumbing
src/utils/                pure, tested logic: named-themes, site-enable, image-triage, usercss, glare-metric…
src/config/               bundled per-site fixes (offline fallback; updated from upstream at runtime)
tools/                    preview_popup.py, compare_shots.py, sync_locales.py, icon & mascot scripts, gen_site.py (site images + fonts)
tests/unit/               Jest tests
brand/                    logo, UI kit, the design mockups (brand/reference/*) our UI is aiming at
docs/                     the project site (GitHub Pages, https://www.pointtonull.dev/myeyes/); docs/assets/ is generated: edit tools/gen_site.py, not the files
```

The design targets are `brand/reference/popup-mockup.png` and `osd-mockup.png`. When in doubt, the closer to the mockup, the better.

---

<a id="ways-to-help"></a>

## 🎁 Ways to help that aren't code

No terminal needed:

- 🌍 **Translate.** New strings arrive as English placeholders in every locale (`src/_locales/*.config`). Real translations are gold.
- 🐛 **Report a site that looks wrong** (with a screenshot, and a *dim* one if you can) or a page that's still too bright.
- 🎨 **Design and accessibility feedback.** "This hurt my eyes / this was confusing" is exactly the feedback this project is for.
- 📖 **Improve these docs.** If something in this file tripped you up, fixing it is a perfect first PR.

---

## 🚀 Opening a pull request

The golden rules, and they're friendly:

1. **One PR, one idea.** If you can't say what it does in a single sentence, it's two PRs. Small PRs get reviewed (and loved) faster.
2. **Stay in scope.** No drive-by reformatting, renames or lockfile churn. A stray tidy-up deserves its own PR.
3. **Logic gets a test.** New pure logic goes in `src/utils/` with a unit test.
4. **UI changes need before/after pictures.** A glance says more than a paragraph.
5. **Say what you *didn't* do.** "Not in this PR: X" saves everyone a question.
6. **Be gentle with the reviewer, and with yourself.** First PRs are allowed to be imperfect; that's what review is for.

### ✨ The `/myeyes-pr` skill (Claude Code)

`.claude/skills/myeyes-pr/SKILL.md` automates the lot. When your branch is ready, run **`/myeyes-pr`** and it will:

- 🔍 **check scope** and suggest splitting if the diff wandered;
- ✅ run `tsc`, `eslint` and the tests;
- 🧐 do a **local code review** (via `/code-review`) before a human has to;
- 📸 if the UI changed, build the baseline, take **before/after screenshots** and stitch them side by side;
- 💌 write a **tidy PR description** (what & why, before/after, how to try it, scope, safety, checks);
- 🙋 show you everything, and only open the PR once you say so.

Not on Claude Code? The skill is just a Markdown file: point your agent (Codex or friends) at
`.claude/skills/myeyes-pr/SKILL.md` and say *"follow this to prepare my PR"*. Works the same.

---

## 🆘 Stuck?

| Symptom | Likely fix |
| --- | --- |
| Popup says "Loading, please wait" | The build failed quietly: check for `MISSION FAILED`, run tsc, rebuild. |
| `debug:watch` stopped by itself | A TypeScript error. Run tsc, fix it, restart the watcher. |
| `node: command not found` | Fix your PATH (see Builds above). |
| My style change does nothing | Two `&`s in a nested LESS selector? Spell it out flat. Also check the browser actually reloaded the extension. |
| My glow is missing / ghosted | Stacking context: see "Glows" above. |
| Locales test fails after adding text | Run `python3 tools/sync_locales.py`. |
| The OSD turned white on a page | It needs the filter counter: see "Eyes & safety". |
| `preview_popup.py` says "no debug build" | Run `npm run debug -- --firefox` (or `debug:watch`) first. |
| Everything is on fire 🔥 | Open an issue, paste the error, and say hi. Someone will help. |

---

## 💬 Be kind

We're building something for people whose eyes, brains and days are already tired.
Be patient, assume good intent, and leave every thread a little warmer than you found it. 💜

<p align="center"><sub>Thank you for being here. Now go make the internet a little less bright.</sub></p>
