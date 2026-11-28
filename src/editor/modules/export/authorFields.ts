import { ref, type Ref } from 'vue'

/**
 * The name of the author of the archive.
 *
 * @remarks
 * It is a field of the **dialog**, not a fact of the browser: it starts empty at every open, and only a level that came
 * from a zip fills it with the author of that zip (2026-11-28, the owner: a flat level kept the name and the page of the
 * custom map exported before it). The value is written nowhere but the archive it is typed for: the next open starts
 * again from the level on the screen.
 */
export const authorName: Ref<string> = ref('')

/**
 * The homepage of the project of the archive.
 *
 * @remarks
 * It is where the **level** is published (a mod site, a website of its own), and it comes from the manifest of the zip
 * the level was opened from, the same way the author does: the field is empty for a level that has no zip behind it.
 */
export const projectHomepage: Ref<string> = ref('')
