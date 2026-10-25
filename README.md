# Arx Fatalis Browser Editor

A browser based editor for the levels of Arx Fatalis, running at
https://arx-tools.github.io/editor/

Work in progress. The levels are loaded from
[pkware-test-files](https://github.com/arx-tools/pkware-test-files), the parsing and the writing
of the formats is done by [arx-convert](https://github.com/arx-tools/arx-convert).

## Development

The tests run **directly with Node.js** — there is no build step for them. The `.ts` files are loaded
through Node's type stripping, which is **on by default since Node.js 22.18**, and the tests use the
built-in `node:test` runner. The development environment therefore needs:

- **Node.js >= 22.18** (the same as the `engines` field of `package.json`)
- npm >= 10.1

The features behind the version: type stripping (22.18), `Array.prototype.toSorted()` and
`.toReversed()` (20.0), `import.meta.dirname` (20.11) and the custom `node:test` reporter of the
shared [`@arx-tools/config`](https://github.com/arx-tools/config) package (20.1).

| command              | what it does                                                |
| -------------------- | ----------------------------------------------------------- |
| `npm ci`             | installs the dependencies                                   |
| `npm run dev`        | dev server on http://localhost:5173/editor/                 |
| `npm run lint`       | checks the code against the pre-defined coding guidelines   |
| `npm run lint:watch` | re-runs the lint when a source, test or config file changes |
| `npm run typecheck`  | type checks the app, the tooling and the tests (4 projects) |
| `npm test`           | runs the tests with the built-in runner                     |
| `npm run build`      | typecheck and build into `dist/`                            |
| `npm run preview`    | serves the build of `dist/`                                 |

`?levelIdx=N` in the url loads another level; `?lightingCalculatorMode=` (the same key the
generator's `.env` uses, default `Arx`; `Realistic`, `TextureRainbow`, `MaxBrightness`,
`CompleteDarkness` are the other values) changes how the level is lit. `TextureRainbow` gives every
polygon a hue from its texture (`hue = 240 * i / (n - 1)` over the FTS texture containers), which
makes the parts added to a level later show up in blue (lost media research).

The export button (the floppy icon of the game) starts the download right away with the lighting
settings the settings panel shows. The controls under the canvas are Vue components
(`src/components/ui/`): the visibility toggles, the shared lighting settings and the key help. The legacy `?level=` is still read. `?positionAt=x,y,z` and `?angle=pitch,yaw,roll` open a level at a given game position
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
