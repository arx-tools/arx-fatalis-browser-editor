import assert from 'node:assert/strict'
import { beforeEach, describe, it } from 'node:test'
import type { Widget as LuminoWidget } from '@lumino/widgets'
import type { WidgetOverlayOptions } from '../../../../src/editor/modules/layout/layoutEditor.ts'
import type { WidgetDefinition } from '../../../../src/editor/modules/layout/widgetDefinition.ts'
import { installDom } from '../../../support/dom.ts'

installDom()

// the dom has to be in place before these modules load (vue and lumino read the document on import)
const { DockLayout, Widget } = await import('@lumino/widgets')
const { flexSizes } = await import('../../../../src/editor/modules/layout/layoutNode.ts')
const { dockWidgets } = await import('../../../../src/editor/modules/layout/dockWidgets.ts')
const { clearPersistedRefRegistry } = await import('../../../../src/editor/modules/persistedRef/persistedRef.ts')
const { createEditorShell } = await import('../../../../src/editor/modules/shell/createEditorShell.ts')

// the layout is a shared persisted ref (one `layout` key), so every test starts with an empty storage
// and a fresh registry: otherwise the previous test's layout would come back
beforeEach((): void => {
  localStorage.clear()
  clearPersistedRefRegistry()
})

/**
 * The widget kinds of the test: plain lumino widgets instead of the real (vue) ones.
 */
const definitions: readonly WidgetDefinition[] = [
  {
    kind: 'map-statistics',
    label: 'Map Statistics',
    group: 'info',
    create: (): LuminoWidget => {
      return new Widget()
    },
  },
  {
    kind: '3d-view',
    label: '3D View',
    group: 'rendering',
    create: (): LuminoWidget => {
      return new Widget()
    },
  },
  {
    kind: 'keyboard-shortcuts',
    label: 'Controls',
    group: 'info',
    create: (): LuminoWidget => {
      return new Widget()
    },
  },
  {
    kind: 'camera-controls',
    label: '3D Camera',
    group: 'controls',
    create: (): LuminoWidget => {
      return new Widget()
    },
  },
  {
    kind: 'top-view',
    label: 'Top View',
    group: 'rendering',
    create: (): LuminoWidget => {
      return new Widget()
    },
  },
  {
    kind: 'left-view',
    label: 'Left View',
    group: 'rendering',
    create: (): LuminoWidget => {
      return new Widget()
    },
  },
  {
    kind: 'front-view',
    label: 'Front View',
    group: 'rendering',
    create: (): LuminoWidget => {
      return new Widget()
    },
  },
  {
    kind: 'jump-to-location',
    label: 'Jump to Location',
    group: 'controls',
    create: (): LuminoWidget => {
      return new Widget()
    },
  },
  {
    kind: 'polygon-inspector',
    label: 'Polygon Inspector',
    group: 'info',
    create: (): LuminoWidget => {
      return new Widget()
    },
  },
  {
    kind: 'right-view',
    label: 'Right View',
    group: 'rendering',
    create: (): LuminoWidget => {
      return new Widget()
    },
  },
]

/**
 * A stand-in for the Vue overlay: it marks the element it is mounted into.
 *
 * @param host The element the overlay is mounted into.
 * @param options The label and the remove callback of the overlay.
 *
 * @returns The teardown of the overlay.
 */
function mountFakeOverlay(host: HTMLElement, options: WidgetOverlayOptions): () => void {
  host.dataset.overlay = options.label

  return () => {
    host.dataset.unmounted = options.label
  }
}

/**
 * Builds a shell on a host element that is in the document.
 *
 * @returns The shell and its host element.
 */
function buildShell(): {
  shell: ReturnType<typeof createEditorShell>
  host: HTMLElement
} {
  const host = document.createElement('div')
  document.body.append(host)

  return { shell: createEditorShell(host, definitions, mountFakeOverlay), host }
}

void describe('dockWidgets', () => {
  void it('lists the widgets of the dock (the `dock.widgets` getter would be empty)', () => {
    const { shell } = buildShell()
    const widgets = dockWidgets(shell.dock)

    assert.equal(widgets.length, 4)
    assert.deepEqual(
      widgets
        .map((widget) => {
          return widget.title.label
        })
        .toSorted(),
      ['3D View', 'Controls', 'Jump to Location', 'Top View'],
    )
    shell.dispose()
  })
})

/**
 * Waits for the step of a layout change on a preset: the shell records a step when the pass of the sizes settled (a
 * quarter of a second, and the pass waits for a frame), and the polls make the wait independent of the load of the
 * machine.
 *
 * @param shell The shell to wait on.
 * @param id The preset the step belongs to.
 */
async function settled(shell: ReturnType<typeof createEditorShell>, id: string): Promise<void> {
  const deadline = Date.now() + 3000

  while (Date.now() < deadline) {
    const preset = shell.presets.value.find((candidate) => {
      return candidate.id === id
    })

    if (preset?.canUndo === true) {
      return
    }

    await new Promise((resolve) => {
      setTimeout(resolve, 25)
    })
  }

  throw new Error(`the layout change of ${id} did not become a step`)
}

void describe('the layout of the shell', () => {
  void it('starts on the viewer layout, with the factory presets and no step', () => {
    const { shell } = buildShell()

    assert.equal(shell.selectedPreset.value, 'viewer')
    assert.deepEqual(
      shell.presets.value.map((preset) => {
        return preset.label
      }),
      ['Viewer', 'Editor', 'Painter'],
    )
    assert.deepEqual(
      shell.presets.value.map((preset) => {
        return [preset.canUndo, preset.canRedo]
      }),
      [
        [false, false],
        [false, false],
        [false, false],
      ],
    )
    assert.deepEqual([...shell.placedKinds.value].toSorted(), [
      '3d-view',
      'jump-to-location',
      'keyboard-shortcuts',
      'top-view',
    ])
    shell.dispose()
  })

  void it('keeps the preset of the dock when a widget is added, and gives it one step', async () => {
    const { shell } = buildShell()

    shell.addWidget('camera-controls')
    await settled(shell, 'viewer')
    assert.equal(shell.selectedPreset.value, 'viewer')
    assert.deepEqual(
      shell.presets.value.map((preset) => {
        return [preset.id, preset.canUndo, preset.canRedo]
      }),
      [
        ['viewer', true, false],
        ['editor', false, false],
        ['painter', false, false],
      ],
    )
    shell.dispose()
  })

  void it('puts the editor layout on the dock', () => {
    const { shell } = buildShell()

    shell.applyPreset('editor')

    assert.equal(shell.selectedPreset.value, 'editor')
    assert.deepEqual([...shell.placedKinds.value].toSorted(), [
      '3d-view',
      'camera-controls',
      'front-view',
      'jump-to-location',
      'keyboard-shortcuts',
      'left-view',
      'map-statistics',
      'polygon-inspector',
      'top-view',
    ])
    shell.dispose()
  })

  void it('keeps the history of every layout when the preset changes', async () => {
    const { shell } = buildShell()

    shell.addWidget('camera-controls')
    await settled(shell, 'viewer')
    shell.applyPreset('editor')
    shell.addWidget('right-view')
    await settled(shell, 'editor')

    assert.deepEqual(
      shell.presets.value.map((preset) => {
        return [preset.id, preset.canUndo]
      }),
      [
        ['viewer', true],
        ['editor', true],
        ['painter', false],
      ],
    )

    // the viewer comes back as it was left: the camera form of the tweak is still there
    shell.applyPreset('viewer')

    assert.equal(shell.placedKinds.value.includes('camera-controls'), true)
    assert.equal(shell.placedKinds.value.includes('right-view'), false)

    shell.applyPreset('editor')

    assert.equal(shell.placedKinds.value.includes('right-view'), true)
    shell.dispose()
  })

  void it('takes the active layout a step back and makes it again', async () => {
    const { shell } = buildShell()

    shell.addWidget('camera-controls')
    await settled(shell, 'viewer')

    shell.undoPreset('viewer')

    assert.deepEqual([...shell.placedKinds.value].toSorted(), [
      '3d-view',
      'jump-to-location',
      'keyboard-shortcuts',
      'top-view',
    ])

    shell.redoPreset('viewer')

    assert.equal(shell.placedKinds.value.includes('camera-controls'), true)
    shell.dispose()
  })

  void it('shows the step of a layout that is not on the screen, and switches to it when it is taken', async () => {
    const { shell } = buildShell()

    shell.addWidget('camera-controls')
    await settled(shell, 'viewer')
    shell.applyPreset('editor')
    shell.addWidget('right-view')
    await settled(shell, 'editor')

    // the row of the viewer is not the active one, but the menu shows that it has a step
    assert.deepEqual(
      shell.presets.value.map((preset) => {
        return [preset.id, preset.canUndo]
      }),
      [
        ['viewer', true],
        ['editor', true],
        ['painter', false],
      ],
    )

    shell.undoPreset('viewer')

    // the step of the viewer takes the dock to the viewer, a step back
    assert.equal(shell.selectedPreset.value, 'viewer')
    assert.equal(shell.placedKinds.value.includes('camera-controls'), false)
    shell.dispose()
  })

  void it('starts from the histories of the browser, at the state each one is on', async () => {
    const tweak = {
      type: 'split',
      orientation: 'vertical',
      sizes: flexSizes(0.7, 0.3),
      children: [
        { type: 'widget', kind: 'keyboard-shortcuts' },
        { type: 'widget', kind: 'camera-controls' },
      ],
    }

    localStorage.setItem('layoutPreset', JSON.stringify('viewer'))
    localStorage.setItem(
      'layoutHistories',
      JSON.stringify({
        viewer: {
          states: [{ type: 'widget', kind: 'keyboard-shortcuts' }, tweak],
          index: 1,
        },
      }),
    )

    const { shell } = buildShell()

    await settled(shell, 'viewer')

    assert.equal(shell.selectedPreset.value, 'viewer')
    assert.deepEqual([...shell.placedKinds.value].toSorted(), ['camera-controls', 'keyboard-shortcuts'])
    assert.equal(
      shell.presets.value.find((preset) => {
        return preset.id === 'viewer'
      })?.canUndo,
      true,
    )
    shell.dispose()
  })

  void it('falls back to the factory trees for a broken history value', () => {
    localStorage.setItem('layoutHistories', 'not json at all')

    const { shell } = buildShell()

    assert.deepEqual([...shell.placedKinds.value].toSorted(), [
      '3d-view',
      'jump-to-location',
      'keyboard-shortcuts',
      'top-view',
    ])
    assert.equal(shell.selectedPreset.value, 'viewer')
    shell.dispose()
  })

  void it('ignores the layout of the old model', () => {
    localStorage.setItem(
      'layout',
      JSON.stringify({
        type: 'split',
        orientation: 'vertical',
        sizes: flexSizes(0.7, 0.3),
        children: [
          { type: 'widget', kind: 'keyboard-shortcuts' },
          { type: 'widget', kind: 'camera-controls' },
        ],
      }),
    )

    const { shell } = buildShell()

    // the owner's decision: a layout starts from the presets, with its own history — the old key is not read
    assert.deepEqual([...shell.placedKinds.value].toSorted(), [
      '3d-view',
      'jump-to-location',
      'keyboard-shortcuts',
      'top-view',
    ])
    shell.dispose()
  })
})

void describe('the edit mode of the shell', () => {
  void it('starts locked', () => {
    const { shell } = buildShell()

    assert.equal(shell.isEditing.value, false)
    assert.equal(shell.editor.isUnlocked, false)
    shell.dispose()
  })

  void it('mounts the overlay of every widget when the lock opens', () => {
    const { shell, host } = buildShell()

    shell.setEditing(true)

    assert.equal(shell.isEditing.value, true)
    assert.equal(shell.editor.isUnlocked, true)
    assert.equal(host.querySelectorAll('.WidgetOverlay-host').length, 4)
    shell.dispose()
  })

  void it('closes the picker before the edit mode with the escape key', () => {
    const { shell } = buildShell()

    shell.setEditing(true)
    shell.setPickerOpen(true)

    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }))

    assert.equal(shell.pickerOpen.value, false)
    assert.equal(shell.isEditing.value, true)

    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }))

    assert.equal(shell.isEditing.value, false)
    shell.dispose()
  })

  void it('closes the edit mode with the escape key', () => {
    const { shell } = buildShell()

    shell.setEditing(true)
    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }))

    assert.equal(shell.isEditing.value, false)
    shell.dispose()
  })

  void it('unmounts the overlays when the lock closes', () => {
    const { shell, host } = buildShell()

    shell.setEditing(true)
    shell.setEditing(false)

    assert.equal(host.querySelectorAll('.WidgetOverlay-host').length, 0)
    shell.dispose()
  })

  void it('decorates a widget added in edit mode', () => {
    const { shell, host } = buildShell()

    shell.setEditing(true)
    shell.addWidget('keyboard-shortcuts')

    assert.equal(host.querySelectorAll('.WidgetOverlay-host').length, 5)
    shell.dispose()
  })
})

void describe('createEditorShell', () => {
  void it('attaches the dock node to the host', () => {
    const { shell, host } = buildShell()

    assert.equal(shell.dock.node.parentElement, host)
    shell.dispose()
  })

  void it('puts the starting layout on the dock as a split', () => {
    const { shell } = buildShell()
    const { layout } = shell.dock

    assert.ok(layout instanceof DockLayout)
    assert.equal(layout.saveLayout().main?.type, 'split-area')
    shell.dispose()
  })

  void it('lists the kinds that are on the dock', () => {
    const { shell } = buildShell()

    assert.deepEqual([...shell.placedKinds.value].toSorted(), [
      '3d-view',
      'jump-to-location',
      'keyboard-shortcuts',
      'top-view',
    ])

    shell.addWidget('keyboard-shortcuts')

    assert.equal(shell.placedKinds.value.length, 5)
    shell.dispose()
  })

  void it('removes a widget by its kind', () => {
    const { shell } = buildShell()

    shell.removeWidgetByKind('map-statistics')

    assert.equal(dockWidgets(shell.dock).length, 4)

    shell.removeWidgetByKind('nope')

    assert.equal(dockWidgets(shell.dock).length, 4)
    shell.dispose()
  })

  void it('adds a widget of a known kind', () => {
    const { shell } = buildShell()
    const widget = shell.addWidget('keyboard-shortcuts')

    assert.equal(dockWidgets(shell.dock).length, 5)
    assert.equal(widget.title.label, 'Controls')
    shell.dispose()
  })

  void it('refuses an unknown kind', () => {
    const { shell } = buildShell()

    assert.throws(() => {
      shell.addWidget('nope')
    }, /Unknown widget kind: nope/u)
    shell.dispose()
  })

  void it('disposes the widgets of the dock', () => {
    const { shell } = buildShell()
    const widgets = dockWidgets(shell.dock)

    shell.dispose()

    assert.equal(dockWidgets(shell.dock).length, 0)
    assert.ok(
      widgets.every((widget) => {
        return widget.isDisposed
      }),
    )
  })
})
