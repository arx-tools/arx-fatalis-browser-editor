import { watch } from 'vue'
import { onMetadataStep } from '../history/history.ts'
import { onKeyboardAction } from '../keyboard/keyboard.ts'
import { levelRevision } from '../level/edit/editing.ts'
import { levelStore } from '../level/edit/levelStore.ts'
import { currentMapId, levelOpened } from '../level/source/maps.ts'
import { faceGroupCommandOf, groupOrUngroupTheSelection } from './groupCommands.ts'
import { refreshPresentPolygons } from './groupDerived.ts'
import { loadGroupsOf, saveOpenLevel } from './groupPersistence.ts'
import { activeFaceGroups, groupState, groupsOnAnotherVersion, storedGroups } from './groupState.ts'
import { readStoredGroups } from './groupStorage.ts'

/**
 * Starts the groups of the editor: the storage, the level that opens, and the steps that move the faces.
 *
 * @remarks
 * The groups of the level are read when the level is whole ({@link levelOpened}): the map lands before its stored steps
 * are replayed, and an index of a group only points at its face after the replay. A step of the level and every change of
 * a group write the storage, so a reload and a visit to another level find the same groups.
 */
export function startFaceGroups(): void {
  onMetadataStep(faceGroupCommandOf)
  storedGroups.value = readStoredGroups()
  refreshPresentPolygons()

  watch(levelStore.map, (map) => {
    if (map === groupState.activeMap) {
      return
    }

    groupState.isLoaded = false
    groupState.activeMap = map
    groupState.activeMapId = currentMapId.value
    activeFaceGroups.value = []
    groupsOnAnotherVersion.value = false
    refreshPresentPolygons()
  })

  // the level is whole only when its stored steps are on it: the counter says when, and the map and the id are the ones
  // of the level the counter belongs to
  watch(
    levelOpened,
    () => {
      const map = levelStore.map.value

      if (map === undefined) {
        return
      }

      loadGroupsOf(currentMapId.value, map)
      refreshPresentPolygons()
    },
    { immediate: true },
  )

  watch(levelRevision, () => {
    if (!groupState.isLoaded) {
      return
    }

    refreshPresentPolygons()
    saveOpenLevel()
  })

  onKeyboardAction('createFaceGroup', groupOrUngroupTheSelection)
}
