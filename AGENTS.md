# AGENTS.md

Rules for every agent working in this repo. A folder can add its own
`AGENTS.md`; where it is stricter, it wins.

## Where things stand

Everything here is in the **prototype** phase. Prototypes are tests of an
idea: they only have to run and answer their question. The real game will
get its own folder, with stricter rules, once it starts.

A prototype ends with its verdict written into
[design/direction.md](design/direction.md). A `RESULT.md` in the prototype
folder holds the details and numbers, but the decision belongs in
`direction.md`.

## Principles

- **Playable increments.** Work ends in something you can try. Before
  calling work done, look at the result yourself: a screenshot, a bot run
  or a short play, not only tests.
- **Measure what the player feels.** Frame time, pacing, win rate: if the
  work is about it, a script reports it as a number.
- **Agents check their own work.** Prefer adding a headless check (bot,
  screenshot diff, validator) over asking a person to look.
- **Docs describe the present.** Delete what is no longer true; keep
  history in commits and PRs.

## Checks

- `npm run check` in `prototypes/` is the standard check. Run it before
  every push. It needs no network and opens no windows.
- Browser checks use a headless browser and never open a window:
  `prototypes/README.md` lists them.
- No CI. Checks run locally. GitHub Actions are only for releases.

## Assets and size

Git holds code, docs and the files a prototype actually loads. Keep the
repo small; removing a big file from history later is hard.

- Textures the game loads are WebP (`prototypes/scripts/to-webp.sh`).
  Source images, previews and texture-lab output stay local (see
  `.gitignore`).
- Generated 3D models go through the asset gate (`prototypes/e12-asset-gate`)
  before a prototype loads them. Raw generator output and high-poly work
  files stay local, under `local/` (ignored).
- Screenshots are not committed; scripts recreate them in `shots/`.
- Ask before committing a single file over 5 MB, or a change that adds
  more than 20 MB.
- Never commit third-party files whose licence forbids redistribution.
  The Polyfork downloads in `prototypes/e9-polyfork/download/` are one.

## Public repo

- No local absolute paths, machine names, usernames, emails or secrets in
  committed files, issues, PRs or comments. Keys come from the environment.
- Use git and `gh` directly.
- Only the owner merges into `main`, unless the owner's brief explicitly
  allows an agent to merge.
