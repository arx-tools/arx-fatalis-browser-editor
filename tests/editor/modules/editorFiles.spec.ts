import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import {
  editorGroupsJsonOf,
  editorRoomsJsonOf,
  groupsOfEditorFile,
  roomNamesOfEditorFile,
} from '../../../src/editor/modules/editorFiles.ts'

void describe('the rooms file', () => {
  void it('writes the names, and reads them back', () => {
    const file = editorRoomsJsonOf({ '1': 'The yard' })

    assert.deepEqual(file, { version: 1, roomNames: { '1': 'The yard' } })
    assert.deepEqual(roomNamesOfEditorFile(file), { '1': 'The yard' })
  })

  void it('writes an empty file when the level has no name', () => {
    assert.deepEqual(editorRoomsJsonOf(undefined), { version: 1, roomNames: {} })
  })

  void it('reads nothing from a file of another version', () => {
    assert.equal(roomNamesOfEditorFile({ version: 2, roomNames: {} }), undefined)
  })
})

void describe('the groups file', () => {
  void it('writes the groups, and reads them back', () => {
    const groups = [{ id: 1, name: 'the floor', faces: [2, 4] }]
    const file = editorGroupsJsonOf(groups)

    assert.deepEqual(file, { version: 1, groups })
    assert.deepEqual(groupsOfEditorFile(file), groups)
  })

  void it('skips a group of another shape, and keeps the rest', () => {
    const groups = groupsOfEditorFile({
      version: 1,
      groups: [
        { id: 1, name: 'ok', faces: [0] },
        { id: 'nope', name: 'bad', faces: [] },
      ],
    })

    assert.deepEqual(groups, [{ id: 1, name: 'ok', faces: [0] }])
  })

  void it('reads nothing from a file of another version', () => {
    assert.equal(groupsOfEditorFile({ version: 2, groups: [] }), undefined)
  })
})
