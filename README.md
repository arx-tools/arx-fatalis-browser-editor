# Arx Fatalis Browser Editor

A browser based editor for the levels of Arx Fatalis, running at
https://arx-tools.github.io/editor/

Work in progress. The levels are loaded from
[pkware-test-files](https://github.com/arx-tools/pkware-test-files), the parsing and the writing
of the formats is done by [arx-convert](https://github.com/arx-tools/arx-convert).

## Development

| command           | what it does                                       |
| ----------------- | -------------------------------------------------- |
| `npm ci`          | installs the dependencies                          |
| `npm run dev`     | dev server on http://localhost:5173/editor/         |
| `npm run build`   | typecheck (`vue-tsc -b`) and build into `dist/`     |
| `npm run preview` | serves the build of `dist/`                         |

`?levelIdx=N` in the url loads another level; `?lightingCalculatorMode=` (the same key the
generator's `.env` uses, default `Arx`; `Realistic`, `MaxBrightness`, `CompleteDarkness` are the
other values) changes how the level is lit. The legacy `?level=` and `?lighting=` are still read. `?positionAt=x,y,z` and `?angle=pitch,yaw,roll` open a level at a given game position
and orientation (the roll is ignored); the url follows the camera (with `history.replaceState`, so
no history entries are created), which makes a view shareable.

## Branches

`main` is the released state, `dev` is where the development happens. A release is a `dev` ->
`main` merge, followed by a tag on `main`:

1. bump the version in `package.json` on `dev` and merge the release pull request into `main`
2. tag `main` with `v<version>` (the tag has to match `package.json`, the release workflow checks it)
3. the release workflow builds the editor and commits the result into `public/editor/` of
   [arx-tools.github.io](https://github.com/arx-tools/arx-tools.github.io), which deploys it

## Deployment

The editor is not deployed on its own: it is a folder of the arx-tools.github.io site, served
under `/editor/`. That is why `vite.config.ts` sets `base: '/editor/'` and why the build output is
`index.html` + `assets/` with hashed file names - the hashed names take care of the cache, so
there is no `?v=` suffix to maintain by hand.

The shell (`index.html`) belongs to this repository, not to the website: the website only copies
the content of `dist/` into its own `public/editor/`. The build writes its version and commit into
the shell, so the deployed editor can be identified.

`.github/workflows/release.yml` does the release. It needs one secret:

| secret            | what it is                                                                                   |
| ----------------- | -------------------------------------------------------------------------------------------- |
| `SITE_REPO_TOKEN` | a personal access token with `contents: read and write` on `arx-tools/arx-tools.github.io`     |

A push made with a personal access token triggers the deploy workflow of the website; the
`GITHUB_TOKEN` of this repository could neither write into the other repository nor trigger it.

The workflow can be started by hand as well (Actions -> Release -> Run workflow), in which case it
builds and shows what would change, but pushes nothing unless `dry_run` is turned off.
