import { computed, nextTick, shallowRef, useTemplateRef, watch, type ComputedRef, type ShallowRef } from 'vue'

/**
 * How the widget picks a corner: the button, the list it opens, and the focus that walks it.
 *
 * @remarks
 * The list is a `listbox` under a button: the button opens it on a click or on an arrow, the arrows walk the items, the
 * escape and a press outside close it, and the focus goes back to the button when it closes. All of it is one gesture,
 * so it lives here, and the widget keeps the corners it edits.
 */
export type CornerList = {
  readonly activeCornerNumber: ComputedRef<number>
  readonly chooseCorner: (index: number) => void
  readonly closeCornerList: () => void
  readonly cornerList: ReturnType<typeof useTemplateRef<HTMLDivElement>>
  readonly cornerListOpen: ShallowRef<boolean>
  readonly cornerTrigger: ReturnType<typeof useTemplateRef<HTMLButtonElement>>
  readonly focusCornerItem: (index: number) => void
  readonly onCornerEscape: () => void
  readonly openCornerList: () => Promise<void>
  readonly toggleCornerList: () => void
}

/**
 * Builds the picker of a corner.
 *
 * @param options The corner the fields hold, and what to do when the pick changes.
 * @param options.active The corner the fields edit, as the widget holds it.
 * @param options.reframe The reframe of the square, after the pick.
 *
 * @returns The state of the list and the gestures of it.
 */
export function useCornerList(options: {
  readonly active: ShallowRef<number | undefined>
  readonly reframe: () => void
}): CornerList {
  const { active, reframe } = options
  const activeCornerNumber = computed((): number => {
    return active.value ?? 0
  })

  /**
   * Whether the list of the corners is open.
   */
  const cornerListOpen = shallowRef(false)

  /**
   * The list of the corners, when it is open.
   */
  const cornerList = useTemplateRef<HTMLDivElement>('cornerList')

  /**
   * The button that opens the list: the focus goes back to it when the list closes.
   */
  const cornerTrigger = useTemplateRef<HTMLButtonElement>('cornerTrigger')

  /**
   * Puts the focus on an item of the list, the way the arrows walk it.
   *
   * @param index The position of the item to focus; it stays inside the list when the walk runs over an end.
   */
  function focusCornerItem(index: number): void {
    const items = cornerList.value?.querySelectorAll<HTMLElement>('.corner-item')

    if (items === undefined) {
      return
    }

    const at = Math.min(Math.max(index, 0), items.length - 1)

    items[at]?.focus()
  }

  /**
   * Opens the list, with the focus on the corner the fields hold.
   */
  async function openCornerList(): Promise<void> {
    cornerListOpen.value = true

    await nextTick()
    focusCornerItem(activeCornerNumber.value)
  }

  /**
   * Closes the list.
   */
  function closeCornerList(): void {
    cornerListOpen.value = false
  }

  /**
   * Opens the list, or closes it when it is open.
   */
  function toggleCornerList(): void {
    if (cornerListOpen.value) {
      closeCornerList()

      return
    }

    void openCornerList()
  }

  /**
   * Takes a corner from the list, and gives the focus back to the button.
   *
   * @param index The corner the list offered.
   */
  function chooseCorner(index: number): void {
    active.value = index
    closeCornerList()
    reframe()
    cornerTrigger.value?.focus()
  }

  /**
   * Closes the list on the escape key, and gives the focus back to the button.
   */
  function onCornerEscape(): void {
    if (!cornerListOpen.value) {
      return
    }

    closeCornerList()
    cornerTrigger.value?.focus()
  }

  /**
   * Closes the list when the pointer lands outside the button and the list.
   *
   * @remarks
   * The listener is on the document, in the capture phase, so a press anywhere closes the list before the page handles it:
   * a corner of the square, a field, or the walkable view.
   *
   * @param event The press of the pointer, anywhere on the page.
   */
  function onDocumentPointerDown(event: PointerEvent): void {
    const { target } = event

    if (!(target instanceof Node)) {
      return
    }

    if (cornerList.value?.contains(target) === true || cornerTrigger.value?.contains(target) === true) {
      return
    }

    closeCornerList()
  }

  // the listener of the outside click only lives while the list is open
  watch(cornerListOpen, (open) => {
    if (open) {
      document.addEventListener('pointerdown', onDocumentPointerDown, { capture: true })

      return
    }

    document.removeEventListener('pointerdown', onDocumentPointerDown, { capture: true })
  })

  return {
    activeCornerNumber,
    chooseCorner,
    closeCornerList,
    cornerList,
    cornerListOpen,
    cornerTrigger,
    focusCornerItem,
    onCornerEscape,
    openCornerList,
    toggleCornerList,
  }
}
