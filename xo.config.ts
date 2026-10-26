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
    // the old app is archived under `src/_old/`: it is not built, not typechecked and not linted, it
    // only has to stay readable as the reference of the previous behaviour
    ignores: ['src/_old/**'],
  },
  {
    // `BUILD_INFO` is a compile time constant the vite config injects (`define`), so it is a global
    // in the bundle: the type side has its declaration in `src/_editor/vite-env.d.ts`
    files: ['src/**/*.ts', 'src/**/*.vue'],
    languageOptions: {
      globals: {
        BUILD_INFO: 'readonly',
      },
    },
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
]

export default xoConfig
