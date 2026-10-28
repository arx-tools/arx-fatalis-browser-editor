import { shallowRef, type ShallowRef } from 'vue'

/**
 * Which widget kinds are on the dock, as the widgets themselves report it.
 *
 * @remarks
 * A dock widget is its own Vue app (`VueWidget` → `createApp().mount()`), so it can not reach the shell
 * context (`provide`/`inject`): this module is the way a widget tells the rest of the editor that it is
 * there. It is needed because a widget changes what another widget shows — the HUD of the walkable view
 * goes away while the camera form is on the dock (TODO 82).
 */
export interface WidgetPresence {
  /**
   * The kinds that are on the dock right now.
   *
   * @remarks
   * A new set is written on every change, so a `computed` over it updates.
   */
  readonly kinds: ShallowRef<ReadonlySet<string>>
  /**
   * Reports that a widget of the kind was mounted.
   *
   * @param kind The kind of the widget.
   */
  readonly register: (kind: string) => void
  /**
   * Reports that a widget of the kind was disposed.
   *
   * @param kind The kind of the widget.
   */
  readonly unregister: (kind: string) => void
}

/**
 * Builds a presence registry.
 *
 * @returns The state the widgets write and read.
 */
export function createWidgetPresence(): WidgetPresence {
  const kinds = shallowRef<ReadonlySet<string>>(new Set<string>())

  return {
    kinds,
    register: (kind: string): void => {
      if (kinds.value.has(kind)) {
        return
      }

      const next = new Set(kinds.value)
      next.add(kind)
      kinds.value = next
    },
    unregister: (kind: string): void => {
      if (!kinds.value.has(kind)) {
        return
      }

      const next = new Set(kinds.value)
      next.delete(kind)
      kinds.value = next
    },
  }
}

/**
 * The presence of the widgets on the dock.
 *
 * @remarks
 * A module level singleton: a dock widget is its own Vue app, so the registry can not be provided down a
 * component tree. The tests build their own with {@link createWidgetPresence}.
 */
export const widgetPresence: WidgetPresence = createWidgetPresence()
