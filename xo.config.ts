import { createXoConfig, rules } from '@arx-tools/config'
import tsParser from '@typescript-eslint/parser'
import unusedImports from 'eslint-plugin-unused-imports'
import vueParser from 'vue-eslint-parser'
import type { XoConfigItem } from 'xo'

// the annotation keeps the type portability: without it the inferred type points into the
// `node_modules` of the package, which typescript does not accept
const xoConfig: XoConfigItem[] = [
  ...createXoConfig({
    rootDir: import.meta.dirname,
    // the app sources and the build tooling have their own tsconfigs, the root one is a solution
    // config (`"files": []` + project references), which would leave every type unresolved and turn
    // the no-unsafe-* rules into a false positive generator
    sourceProject: './tsconfig.app.json',
    scriptProject: './tsconfig.node.json',
  }),
  {
    // the anchor generator is a vendored, dependency free module which is still plain javascript
    // with a hand written declaration file: it is ported to typescript separately, until then it
    // would only produce formatting and typing noise
    ignores: ['src/generator/anchor-generator.js', 'src/generator/anchor-generator.d.ts'],
  },
  {
    // the flat color table is a data asset (a few thousand texture name -> color pairs), not source,
    // and the editor reads it as json at runtime
    ignores: ['src/assets/**'],
  },
  {
    // the html ruleset targets documents (meta description, open graph, head order), this file is the
    // shell of a single page application, and its goatcounter snippet has to stay on one line, so
    // prettier can not reformat it either
    ignores: ['index.html'],
  },
  {
    plugins: {
      'unused-imports': unusedImports,
    },
    // single file vue components: xo has no vue support, so the parser comes from this repository
    files: ['src/**/*.vue'],
    languageOptions: {
      parser: vueParser,
      parserOptions: {
        // the script blocks are typescript, and the type aware rules need the app project
        parser: tsParser,
        // the plain typescript compiler does not accept `.vue` in a tsconfig, only the project
        // service of typescript-eslint can map the components to the app project
        extraFileExtensions: ['.vue'],
        projectService: true,
        tsconfigRootDir: import.meta.dirname,
      },
    },
    rules: {
      ...rules,
      // the jsdoc plugin does not recognise the typescript script block of an SFC and would ask for
      // the types inside the tags: the signature carries them
      'jsdoc/require-param-type': 'off',
      'jsdoc/require-returns-type': 'off',
    },
  },
  {
    plugins: {
      'unused-imports': unusedImports,
    },
    // the vite config is build tooling, it belongs to the node project of the tsconfigs
    files: ['vite.config.ts'],
    languageOptions: {
      parserOptions: {
        projectService: false,
        project: './tsconfig.node.json',
        tsconfigRootDir: import.meta.dirname,
      },
    },
    rules,
  },
  {
    // both modules do their wiring on the top level by design: `main.ts` mounts the app and builds
    // the scene, `ui.ts` creates the shared state and registers the watchers of the url and the dom
    files: ['src/main.ts', 'src/ui/ui.ts'],
    rules: {
      'unicorn/no-top-level-side-effects': 'off',
    },
  },
  {
    files: ['src/main.ts'],
    rules: {
      // the parts of the module call each other in both directions (the scene builders ask the
      // render loop for a frame, the loop renders the scene), so only the variables can keep the
      // strict definition order: the functions are hoisted anyway
      'no-use-before-define': ['error', { functions: false, classes: true, variables: true, allowNamedExports: false }],
    },
  },
]

export default xoConfig
