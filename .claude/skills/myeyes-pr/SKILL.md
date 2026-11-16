---
name: myeyes-pr
description: Get a MyEyes! branch ready for a pull request — keeps it in scope, runs the checks, does a local code review, takes before/after screenshots when the UI changed, and writes a lovely PR description. Use when the user says they want to open or submit a PR, asks for a PR description, or asks for a review of their branch.
---

# 🎁 myeyes-pr: wrap a branch up nicely

You are helping someone (maybe their first PR ever, so be kind and skip the jargon)
turn a branch into a small, easy-to-review pull request. The rules behind this
live in `CONTRIBUTE.md` ("Opening a PR"); this file is the executable version.
Work through the steps in order, say what you're doing in plain words, and
**never push or open the PR without a clear yes from the human.**

## 0. Orient (read-only)

```sh
git branch --show-current
git status --short
# the remote that points at the PROJECT (pointtonull/myeyes). In some clones
# `upstream` is Dark Reader: a PR against darkreader/darkreader is a wrong turn.
BASE_REMOTE=$(git remote -v | awk '/pointtonull\/myeyes/ && /fetch/ {print $1; exit}'); BASE_REMOTE=${BASE_REMOTE:-origin}
git fetch "$BASE_REMOTE" main
BASE=$(git merge-base "$BASE_REMOTE/main" HEAD)
git diff --stat "$BASE"...HEAD
```

- On `main`, or uncommitted work? Propose a branch name (`git switch -c <short-topic>`) and a commit, and ask first.
- Nothing in the diff? Say so and stop.
- Summarise the change in **one sentence** and check it with the human. That sentence is the PR's purpose; the next step measures everything against it.

## 1. Scope check (keep it small!)

List the changed files and group them. Then ask of every hunk: *does this serve the one sentence?*
Flag, don't silently fix:

- drive-by reformatting, renames or "while I was here" cleanups;
- `package-lock.json` churn without a dependency change; generated or built files (`build/`, `*.pyc`), debug logging, commented-out code;
- `src/_locales/*` changes that aren't the sync of a new string (`python3 tools/sync_locales.py`);
- unrelated `brand/` assets; edits to `LICENSE` / `FORK.md` provenance.

If there's more than one idea, suggest splitting into separate PRs (`git add -p`, a second branch) and let the human decide. Smaller PRs get reviewed faster and merged happier.

## 2. Checks

```sh
npx tsc --noEmit -p src/tsconfig.json          # silent = good
npx eslint $(git diff --name-only "$BASE"...HEAD -- '*.ts' '*.tsx' '*.js')
npm test                                        # unit tests: all green
```

New logic that doesn't touch the browser (parsing, scoring, copy, settings maths) belongs in a plain `src/utils/*.ts` module **with a unit test**: add one if it's missing. Failing check? Fix it (if it's in scope) or tell the human plainly what failed.

## 3. Local review

Review the diff as a kind, sharp colleague would, before anyone else has to:

- **Claude Code:** run `/code-review medium` on the branch. **Other agents:** read `git diff "$BASE"...HEAD` yourself with the list below.
- Fix real problems; list nits separately. Don't let review fixes grow the scope.

Things this project cares about extra:

- **Eyes first:** nothing may flash bright. Overlays must survive a page that a filter engine inverts (`html{filter:invert(100%) hue-rotate(180deg)}`); animation is gated on `prefers-reduced-motion`.
- **Permissions & reach:** content scripts run on *every* page. Any new manifest permission, host pattern, network fetch, `innerHTML`/`eval`, or use of untrusted text (community CSS) must be called out in the PR, and justified.
- **Provenance:** Dark Reader's `LICENSE` stays; no "Dark Reader" name or logo in user-facing UI.

## 4. UI affected? Then show it (before/after)

```sh
git diff --name-only "$BASE"...HEAD | grep -E '^(src/ui/|src/inject/osd\.ts|brand/|.*\.less$)' && echo "UI changed"
```

If nothing matches, skip to step 5. Otherwise take **the same view(s), before and after**. Screenshots must show the popup preview or a dim test page, **never a real logged-in page** (and nothing bright: the maintainers are photophobic).

```sh
# AFTER = this branch
npm run debug -- --firefox                                       # ~30 s
# BEFORE = the merge-base, in a throwaway worktree (reuses node_modules)
git worktree add --detach ../myeyes-before "$BASE"
ln -s "$PWD/node_modules" ../myeyes-before/node_modules
(cd ../myeyes-before && npm run debug -- --firefox)
```

Popup views come from the preview page (it renders the real popup with mock data;
pick the scenario(s) your change touches: `plain named modified engine custom disabled enabled dark parked`,
plus `--click` steps for menus):

```sh
mkdir -p pr-assets
python3 tools/preview_popup.py --serve --scenario enabled --build ../myeyes-before/build/debug/firefox   # prints a URL
python3 tools/preview_popup.py --serve --scenario enabled                                                # prints a URL
```

Each command prints `Preview ready: http://127.0.0.1:PORT/...` and keeps running: open the URL in a
browser, screenshot the popup into `pr-assets/before.png` / `pr-assets/after.png`, then stop the process
(Ctrl-C or kill; both clean up). No browser tool? Ask the human to take the two shots; it takes a minute.
(The maintainer's machine captures automatically and skips `--serve`.) Then:

```sh
python3 tools/compare_shots.py pr-assets/before.png pr-assets/after.png --crop --out pr-assets/popup-before-after.png
git worktree remove --force ../myeyes-before
```

(`tools/compare_shots.py` needs Pillow: `pip install pillow`.) Not the popup? The OSD, an options page or a darkened site:
shoot those the same way (see "Screenshots" tips in `CONTRIBUTE.md`). Look at the image yourself before
using it: is it the right view, readable, and clearly different?

**Getting images into the PR.** GitHub PR bodies can't take local files from the command line. Offer the human one of:

- **A (automatic, tested):** park them on a side branch of *their fork* and link the raw files. Ask before pushing.

  ```sh
  B=$(git branch --show-current | tr '/' '-')
  git worktree add --detach ../myeyes-assets && cd ../myeyes-assets
  git checkout --orphan "pr-assets-$B" && git rm -rf . -q && mkdir "$B" && cp ../myeyes/pr-assets/*.png "$B"/
  git add . && git commit -qm "Screenshots for $B" && git push origin "pr-assets-$B"
  cd .. && git worktree remove --force myeyes-assets
  # image URL: https://raw.githubusercontent.com/<owner>/<repo>/pr-assets-$B/$B/popup-before-after.png
  #   (<owner>/<repo>: gh repo view --json nameWithOwner -q .nameWithOwner)
  ```

  (Adjust `../myeyes` to the real checkout folder name. Delete the side branch after the PR merges: `git push origin --delete "pr-assets-$B"`.)
- **B (manual):** create the PR, then drag the files from `pr-assets/` into the description box on GitHub.

## 5. Write the description

Save it as `pr-assets/PR.md` (the folder is git-ignored). Plain words first, details after. Drop sections that don't apply: a short PR doesn't need every heading.

```markdown
## ✨ What & why
One or two sentences a non-programmer could follow: what is different for the person
using MyEyes!, and why it's worth it. (Fixes #123.)

## 👀 Before / after
![Before and after](IMAGE_URL)
<sub>What to look at: the thing that changed, in one line.</sub>

## 🧭 Try it
1. `npm install && npm run debug:watch`, then load `build/debug/firefox` in `about:debugging`
2. The exact clicks or shortcut to see the change
3. What you should see

## 🧰 What changed
- `src/…`: the interesting part, in plain words
- Tests: what's covered

## 🔒 Scope & safety
- **Deliberately not in this PR:** …
- **Permissions / content scripts / stored settings:** none changed, or exactly what and why
- **Dark Reader files touched:** none, or which (keeps rebasing easy)

## ✅ Checks
- [x] `npx tsc --noEmit -p src/tsconfig.json`
- [x] `npm test` (N tests)
- [x] `npx eslint` on the changed files
- [x] Reviewed locally: N findings, N fixed, the rest noted below

<details><summary>Review notes</summary>

Anything you decided *not* to change, and why.

</details>

<sub>Made with 💜 for eyes that need a break.</sub>
```

Title: short, imperative, no full stop ("Dim bright photos under Dynamic").

## 6. Show, confirm, open

Show the human the description (and the image). Offer to open it in their editor; they may want to change the words.
Only after a yes:

```sh
gh auth status                    # signed in? if not, ask them to run `gh auth login`
git push -u origin HEAD
gh pr create --base main --title "TITLE" --body-file pr-assets/PR.md
```

Check the PR's target printed by `gh` is **pointtonull/myeyes** (not `darkreader/darkreader`). Give the human the PR link, and one line on what happens next ("a maintainer will take a look; feel free to nudge after a few days"). Then tidy: `git worktree list` should show nothing extra.
