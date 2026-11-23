import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { isVersionOnlyDiff } from '../../scripts/changedSpecs.ts'

/**
 * The diff of a release commit in `package.json`.
 */
const PACKAGE_DIFF = `diff --git a/package.json b/package.json
index 1111111..2222222 100644
--- a/package.json
+++ b/package.json
@@ -3,7 +3,7 @@
   "name": "arx-fatalis-browser-editor",
-  "version": "0.25.1",
+  "version": "0.26.0",
   "private": true,
`

/**
 * The diff of a release commit in `package-lock.json`: the root and the package entry.
 */
const LOCK_DIFF = `diff --git a/package-lock.json b/package-lock.json
index 3333333..4444444 100644
--- a/package-lock.json
+++ b/package-lock.json
@@ -1,8 +1,8 @@
   "name": "arx-fatalis-browser-editor",
-  "version": "0.25.1",
+  "version": "0.26.0",
@@ -9,7 +9,7 @@
     "": {
       "name": "arx-fatalis-browser-editor",
-      "version": "0.25.1",
+      "version": "0.26.0",
`

/**
 * The diff of a dependency bump: the version of a package moves with its resolved and integrity fields.
 */
const DEPENDENCY_DIFF = `diff --git a/package-lock.json b/package-lock.json
index 5555555..6666666 100644
--- a/package-lock.json
+++ b/package-lock.json
@@ -100,8 +100,8 @@
     "node_modules/three": {
-      "version": "0.180.0",
-      "resolved": "https://registry.npmjs.org/three/-/three-0.180.0.tgz",
-      "integrity": "sha512-aaa",
+      "version": "0.181.0",
+      "resolved": "https://registry.npmjs.org/three/-/three-0.181.0.tgz",
+      "integrity": "sha512-bbb",
`

void describe('isVersionOnlyDiff', () => {
  void it('accepts a release bump in package.json', () => {
    assert.equal(isVersionOnlyDiff(PACKAGE_DIFF), true)
  })

  void it('accepts a release bump in package-lock.json', () => {
    assert.equal(isVersionOnlyDiff(LOCK_DIFF), true)
  })

  void it('does not accept a dependency bump', () => {
    assert.equal(isVersionOnlyDiff(DEPENDENCY_DIFF), false)
  })

  void it('does not accept a diff without a changed line', () => {
    assert.equal(isVersionOnlyDiff(''), false)
    assert.equal(isVersionOnlyDiff('--- a/package.json\n+++ b/package.json\n'), false)
  })

  void it('does not accept a version bump beside another change', () => {
    const diff = `${PACKAGE_DIFF}-  "private": true,\n+  "private": false,\n`

    assert.equal(isVersionOnlyDiff(diff), false)
  })
})
