import { inject, provide, shallowRef, type InjectionKey, type ShallowRef } from 'vue'
import type { EditorShell } from './createEditorShell.ts'

/**
 * The handle of the running shell, as the components of the editor see it.
 *
 * It is a ref, because the dock creates the shell when it is mounted: the header renders before that,
 * and it has to follow the shell once it exists.
 */
export type EditorShellRef = ShallowRef<EditorShell | undefined>

/**
 * The injection key of the shell handle.
 */
const editorShellKey: InjectionKey<EditorShellRef> = Symbol('editor shell')

/**
 * Creates the shell handle and provides it to the components below the caller.
 *
 * @returns The handle, so the caller can pass it to the component that builds the shell.
 */
export function provideEditorShell(): EditorShellRef {
  const shell: EditorShellRef = shallowRef()

  provide(editorShellKey, shell)

  return shell
}

/**
 * Reads the shell handle of the closest provider.
 *
 * @returns The handle; its value is `undefined` until the dock has built the shell.
 *
 * @throws When there is no provider above the caller.
 */
export function useEditorShell(): EditorShellRef {
  const shell = inject(editorShellKey)

  if (shell === undefined) {
    throw new Error('The editor shell is not provided above this component.')
  }

  return shell
}
