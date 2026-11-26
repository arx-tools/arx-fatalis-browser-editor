<script setup lang="ts">
import { computed, reactive, shallowRef, watch } from 'vue'
import { formatCount } from '../../../modules/format.ts'
import { levelRevision } from '../../../modules/level/edit/editing.ts'
import { levelStore } from '../../../modules/level/edit/levelStore.ts'
import { entitySelectionStore } from '../../../modules/selection/entitySelectionStore.ts'
import { lightSelectionStore } from '../../../modules/selection/lightSelectionStore.ts'
import { selectionStore } from '../../../modules/selection/selectionStore.ts'
import { lightIndexLabelOf, lightRowsOf, lightSectionsOf } from '../LightInspectorWidget/lightInspector.ts'
import { ENTITY_CATEGORIES, entityRowsOf } from '../../../modules/level/entities/entityRows.ts'
import { entryOfName, loadPictures, textureGroupOfName } from '../../../modules/textures/textureCatalog.ts'
import TextureThumb from '../../TextureThumb.vue'
import WidgetHeading from '../../WidgetHeading.vue'
import AccordionRow from '../../AccordionRow.vue'
import SectionTitle from '../../SectionTitle.vue'
import { GROUP_ORDER, selectionSummaryOf, type SelectionSummary } from './selectionInspector.ts'

/**
 * The label of the widget, from the widget definition.
 */
const props = defineProps<{
  readonly label: string
}>()

/**
 * The numbers of the selection: the faces, and the textures they draw with, grouped by where they come from.
 *
 * @remarks
 * The polygons of a level are a plain list the edits change **in place**, so the selection alone would not tell the
 * widget that a face changed its texture: the summary follows the revision of the level as well (the statistics and the
 * polygon inspector do the same). A selection of indices the level no longer has (an undo moved them) counts the faces it
 * finds.
 *
 * @returns The rows and the groups of the widget.
 */
function summaryOfLevel(): SelectionSummary {
  const map = levelStore.map.value
  const faces = [...selectionStore.polygons.value]

  if (map === undefined) {
    return selectionSummaryOf({
      faces: [],
      polygons: [],
      textureNameOf: () => {
        return undefined
      },
      groupOfName: () => {
        return undefined
      },
    })
  }

  return selectionSummaryOf({
    faces,
    polygons: map.polygons,
    textureNameOf: (textureContainerId) => {
      return map.textureNameOf(textureContainerId)
    },
    groupOfName: (name) => {
      return textureGroupOfName(name)
    },
  })
}

/**
 * The numbers of the selection, as the widget shows them.
 */
const summary = shallowRef(summaryOfLevel())

/**
 * The rows that are open, by their label.
 *
 * @remarks
 * The two rows are accordions: the count opens the rows of the selected faces, the textures row opens the materials of
 * those faces. Both can be open at the same time. The textures start open (the widget used to show them), while the
 * face rows start closed: a room selection can hold thousands of indices, and the list is opt-in for the author.
 */
const openRows = reactive(new Set<string>(['Textures']))

/**
 * The faces of the selection, by their index in the level, in ascending order.
 *
 * @remarks
 * The widget shows the raw indices (the ids the delete, the export and the selection use), not a grouped number: the
 * author compares them with the index of a face. An index the level no longer has is left out, the way the summary
 * counts it.
 */
const selectedFaces = computed<number[]>(() => {
  const map = levelStore.map.value
  const polygons = map?.polygons

  return [...selectionStore.polygons.value]
    .filter((index) => {
      return polygons === undefined || polygons[index] !== undefined
    })
    .toSorted((first, second) => {
      return first - second
    })
})

/**
 * The selected lights, grouped the way the Light Inspector groups them: the static lights and the dynamic ones.
 *
 * @remarks
 * The label of a row is the one the light inspector gives the light (`light N`), and the group says which kind the light
 * is, so the author reads a pick the way the list of the lights reads it (2026-11-25, the owner). A group without a
 * selected light is left out, the way the texture groups are.
 */
const selectedLightGroups = computed(() => {
  const map = levelStore.map.value
  const lights = lightSelectionStore.lights.value

  if (map === undefined || lights.size === 0) {
    return []
  }

  return lightSectionsOf(lightRowsOf(map.lights, map.scenePosition))
    .map((section) => {
      return {
        ...section,
        rows: section.rows.filter((row) => {
          return lights.has(row.index)
        }),
      }
    })
    .filter((section) => {
      return section.rows.length > 0
    })
})

/**
 * The selected entities, grouped by the folder of the entity list.
 *
 * @remarks
 * An entity is named by its model and its identifier (`light_door_0113`), the way the entity list names it: the row is
 * read from the level, and an index the level no longer has is left out. The group is the folder of the list (the
 * `system` of a `marker_0098`), so a pick reads with the category it came from (2026-11-25, the owner).
 */
const selectedEntityGroups = computed(() => {
  const map = levelStore.map.value
  const selected = entitySelectionStore.entity.value

  if (map === undefined || selected === undefined) {
    return []
  }

  const rows = entityRowsOf(map).filter((row) => {
    return row.index === selected
  })

  return ENTITY_CATEGORIES.map((category) => {
    return {
      category: category.id,
      label: category.label,
      rows: rows.filter((row) => {
        return row.category === category.id
      }),
    }
  }).filter((group) => {
    return group.rows.length > 0
  })
})

/**
 * How many lights the selection holds.
 */
const selectedLightCount = computed(() => {
  return lightSelectionStore.lights.value.size
})

/**
 * How many entities the selection holds (one: the store keeps a single entity).
 */
const selectedEntityCount = computed(() => {
  return selectedEntityGroups.value.reduce((count, group) => {
    return count + group.rows.length
  }, 0)
})

/**
 * Picks a light of the list: the view gets the white ring of it.
 *
 * @param index The index of the light in `map.lights`.
 */
function selectLight(index: number): void {
  lightSelectionStore.selectOnly(index)
}

/**
 * Picks an entity of the list: the view gets the white ring of it.
 *
 * @param index The index of the entity in the DLF list.
 */
function selectEntity(index: number): void {
  entitySelectionStore.select(index)
}

/**
 * One row of the inspector: what it counts, and what the fold under it lists.
 */
type InspectorRow = {
  readonly kind: 'textures' | 'lights' | 'entities' | 'faces'
  readonly label: string
  readonly value: string
  readonly empty: boolean
}

/**
 * The rows of the inspector, in the order they are read.
 *
 * @remarks
 * The textures come first, then the two picks of the view (the lights and the entities), and the ids of the faces close
 * the list: the indices are the raw read the author compares with a face, not the head of the list (2026-11-24, the
 * owner). The labels carry no `selected` word, they follow the `Textures` row.
 */
const rows = computed<InspectorRow[]>(() => {
  return [
    {
      kind: 'textures',
      label: 'Textures',
      value: formatCount(summary.value.textureCount),
      empty: summary.value.textureCount === 0,
    },
    {
      kind: 'lights',
      label: 'Lights',
      value: String(selectedLightCount.value),
      empty: selectedLightCount.value === 0,
    },
    {
      kind: 'entities',
      label: 'Entities',
      value: String(selectedEntityCount.value),
      empty: selectedEntityCount.value === 0,
    },
    {
      kind: 'faces',
      label: 'Face Indices',
      value: formatCount(summary.value.count),
      empty: summary.value.count === 0,
    },
  ]
})

/**
 * The groups of the textures of the selection, with the groups it has none of.
 *
 * @remarks
 * The slots follow {@link GROUP_ORDER}: every group has a section in the DOM, and the ones the selection has no texture
 * of are hidden. The change of a selection that moves from one group to another then hides and shows a section instead of
 * building the list again (2026-11-26, the owner: the whole list was rebuilt on every click).
 */
const textureGroupSlots = computed(() => {
  return GROUP_ORDER.map((source) => {
    return {
      source,
      group: summary.value.groups.find((group) => {
        return group.source === source
      }),
    }
  })
})

/**
 * Tells whether a row is open.
 *
 * @param label The caption of the row, like `Faces`.
 *
 * @returns True when its content is shown.
 */
function isRowOpen(label: string): boolean {
  return openRows.has(label)
}

/**
 * Opens or closes a row.
 *
 * @param label The caption of the row to open or close.
 */
function toggleRow(label: string): void {
  if (openRows.has(label)) {
    openRows.delete(label)
  } else {
    openRows.add(label)
  }
}

// a pick of the view opens the fold that lists it (2026-11-25, the owner): the lights and the entities are what the
// author looks at, so the rows of them are on the screen. The faces stay closed: their indices are a debug read, and a
// room selection is thousands of them.
watch(lightSelectionStore.lights, (lights) => {
  if (lights.size > 0) {
    openRows.add('Lights')
  }
})

watch(
  () => {
    return entitySelectionStore.entity.value
  },
  (entity) => {
    if (entity !== undefined) {
      openRows.add('Entities')
    }
  },
)

/**
 * Reads the pictures of the textures of the selection.
 *
 * @remarks
 * The tiles of the groups need the pictures of the texture list: it is the same cache, so a texture the list showed is
 * free here, and a texture of a level without a data directory stays a placeholder.
 */
async function loadSelectionPictures(): Promise<void> {
  const entries = summary.value.groups.flatMap((group) => {
    return group.textures.flatMap((texture) => {
      const entry = entryOfName(texture.name)

      if (entry === undefined) {
        return []
      }

      return [entry]
    })
  })

  await loadPictures(entries)
}

watch(
  [
    (): number => {
      return levelRevision.value
    },
    (): ReadonlySet<number> => {
      return selectionStore.polygons.value
    },
    (): unknown => {
      return levelStore.map.value
    },
  ],
  async () => {
    summary.value = summaryOfLevel()
    await loadSelectionPictures()
  },
  { immediate: true },
)
</script>

<template>
  <div class="SelectionInspectorWidget">
    <WidgetHeading :label="props.label" />

    <div class="rows">
      <AccordionRow
        v-for="row in rows"
        :key="row.kind"
        :label="row.label"
        :value="row.value"
        :empty="row.empty"
        :open="isRowOpen(row.label)"
        @toggle="toggleRow(row.label)"
      >
        <ul v-if="row.kind === 'faces'" class="faces">
          <li v-for="face in selectedFaces" :key="face">{{ face }}</li>
        </ul>

        <div v-else-if="row.kind === 'lights'" class="groups">
          <section v-for="group in selectedLightGroups" :key="group.section" class="group">
            <SectionTitle :value="`${formatCount(group.rows.length)} ${group.rows.length === 1 ? 'light' : 'lights'}`">
              {{ group.label }}
            </SectionTitle>
            <ul class="faces">
              <li v-for="light in group.rows" :key="light.index" @click="selectLight(light.index)">
                {{ lightIndexLabelOf(light.index) }}
              </li>
            </ul>
          </section>
        </div>

        <div v-else-if="row.kind === 'entities'" class="groups">
          <section v-for="group in selectedEntityGroups" :key="group.category" class="group">
            <SectionTitle
              :value="`${formatCount(group.rows.length)} ${group.rows.length === 1 ? 'entity' : 'entities'}`"
            >
              {{ group.label }}
            </SectionTitle>
            <ul class="faces">
              <li v-for="entity in group.rows" :key="entity.index" @click="selectEntity(entity.index)">
                {{ entity.entityName }}
              </li>
            </ul>
          </section>
        </div>

        <div v-else class="groups">
          <section v-for="slot in textureGroupSlots" :key="slot.source" v-show="slot.group !== undefined" class="group">
            <SectionTitle
              v-if="slot.group !== undefined"
              :value="`${formatCount(slot.group.faces)} ${slot.group.faces === 1 ? 'face' : 'faces'}`"
            >
              {{ slot.group.label }}
            </SectionTitle>
            <ul class="textures">
              <li v-for="texture in slot.group?.textures ?? []" :key="texture.name">
                <TextureThumb class="thumb" :entry="entryOfName(texture.name)" />
                <span class="name">{{ texture.name }}</span>
                <span class="count">{{ formatCount(texture.count) }}</span>
              </li>
            </ul>
          </section>
        </div>
      </AccordionRow>
    </div>
  </div>
</template>

<style scoped lang="scss">
@use '../../../palette' as *;
@use '../shared/infoRows' as *;

// The selection, read as an inspector: the count of the faces and the textures under the title, both as accordions.
// The count opens the ids of the selected faces, the textures row opens the materials they draw with. The widget fills
// the space it is given and scrolls: a selection may hold thousands of faces or forty textures, and the columns of the
// dock must not grow for them.
.SelectionInspectorWidget {
  display: flex;
  flex-direction: column;
  height: 100%;
  padding: 0 8px 8px;
  overflow: hidden;

  @include info-list;
}

// the rows and their content: the part that scrolls when the selection is a big one
.rows {
  flex: 1;
  min-height: 0;
  padding-right: 10px;
  overflow-y: auto;
  // the head of a fold sticks to the top of the box while its rows scroll under it, with the color of the widget behind
  // it (2026-11-25, the owner: the fold of a big selection kept its head out of the screen)
  --row-head-color: #{$surface-app};

  :deep(.AccordionRow > .head) {
    position: sticky;
    top: 0;
    z-index: 1;
  }

  // the fold is indented under its head, so the author reads what belongs to which row (2026-11-25, the owner)
  :deep(.AccordionRow > .content) {
    padding-left: 14px;
  }
}

.faces {
  display: flex;
  flex-direction: column;
  gap: 1px;
  margin: 0;
  padding: 0;
  color: $text;
  font-size: 12px;
  font-variant-numeric: tabular-nums;
  list-style: none;

  // the rows of the fold read like the rows of the entity list: a stripe keeps the eye on the line
  li {
    padding: 1px 4px;

    &:nth-child(even) {
      background: rgba($surface-panel, 0.45);
    }
  }
}

.groups {
  padding-top: 2px;
}

// the rows of a group are one step deeper than the group's own word, with a faint line from it to them: the accent of a
// pushed row is not the only thing that says where it belongs (2026-11-25, the owner)
.group .faces,
.group .textures {
  margin-left: 6px;
  padding-left: 6px;
  border-left: 1px solid rgba($text-strong, 0.1);
}

.group {
  margin-top: 8px;

  // the caption of the group is the shared SectionTitle, so a group of the selection reads like the groups of the other
  // widgets; the number it carries is the count of its rows (2026-11-25, the owner)
  :deep(.SectionTitle) {
    margin-bottom: 3px;
  }
}

.textures {
  display: flex;
  flex-direction: column;
  gap: 2px;
  margin: 0;
  padding: 0;
  list-style: none;

  // the list is a read of the selection, not a control: a row has no hover, it can not be picked, and the name is not
  // a text to select and copy (2026-11-26, the owner)
  li {
    display: flex;
    align-items: center;
    gap: 6px;
    min-width: 0;
    padding: 1px 4px;
    border-radius: 3px;
    user-select: none;
  }

  .thumb {
    flex: 0 0 auto;
    width: 20px;
    height: 20px;
    border-radius: 2px;
  }

  .name {
    flex: 1;
    overflow: hidden;
    color: $text;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .count {
    flex: 0 0 auto;
    color: $text-muted;
    font-variant-numeric: tabular-nums;
  }
}
</style>
