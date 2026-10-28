import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { createWidgetPresence } from '../../../../src/editor/modules/layout/widgetPresence.ts'

void describe('createWidgetPresence', () => {
  void it('starts empty', () => {
    const presence = createWidgetPresence()

    assert.deepEqual([...presence.kinds.value], [])
  })

  void it('reports a mounted widget', () => {
    const presence = createWidgetPresence()

    presence.register('camera-controls')

    assert.deepEqual([...presence.kinds.value], ['camera-controls'])
  })

  void it('reports a disposed widget', () => {
    const presence = createWidgetPresence()

    presence.register('camera-controls')
    presence.unregister('camera-controls')

    assert.deepEqual([...presence.kinds.value], [])
  })

  void it('survives a second register and a second unregister', () => {
    const presence = createWidgetPresence()

    presence.register('camera-controls')
    presence.register('camera-controls')
    presence.unregister('camera-controls')
    presence.unregister('camera-controls')

    assert.deepEqual([...presence.kinds.value], [])
  })

  void it('keeps the other kinds', () => {
    const presence = createWidgetPresence()

    presence.register('camera-controls')
    presence.register('3d-view')
    presence.unregister('camera-controls')

    assert.deepEqual([...presence.kinds.value], ['3d-view'])
  })

  void it('writes a new set on every change, so a computed follows it', () => {
    const presence = createWidgetPresence()
    const before = presence.kinds.value

    presence.register('camera-controls')

    assert.notEqual(presence.kinds.value, before)
  })
})
