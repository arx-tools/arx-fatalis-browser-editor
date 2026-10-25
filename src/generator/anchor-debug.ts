/**
 * Debug payload for the F2 panel: the anchor generator's filter counters and the island analysis,
 * so a broken graph (a component cut off from the rest) can be explained without re-running the
 * generator by hand.
 *
 * The panel is provided by the editor shell: `globalThis.__debugPanel.setAnchorDebugPayload(text)`.
 */
type Component = {
  anchors: number
  bbox: [number, number, number, number]
  y: [number, number]
  nearestOutsideDistance: number | null
}

type DebugAnchor = { position: { x: number; y: number; z: number }; linkedAnchors: number[] }

// round the floats: the payload is for humans, three decimals are plenty and it keeps the JSON short
function round(_key: string, value: unknown): unknown {
  if (typeof value === 'number' && !Number.isSafeInteger(value)) {
    return Math.round(value * 1000) / 1000
  }

  return value
}

export function publishAnchorDebugPayload(polygons: unknown[], result: unknown): void {
  const graph = result as { anchors: DebugAnchor[]; stats: Record<string, unknown> }
  const panel = (globalThis as { __debugPanel?: { setAnchorDebugPayload?: (text: string) => void } }).__debugPanel
  if (typeof panel?.setAnchorDebugPayload !== 'function') {
    return
  }

  const { anchors } = graph
  const parent = anchors.map((_, index) => {
    return index
  })

  function find(index: number): number {
    if (parent[index] === index) {
      return index
    }

    const root = find(parent[index])
    parent[index] = root

    return root
  }

  for (const [index, anchor] of anchors.entries()) {
    for (const linked of anchor.linkedAnchors) {
      parent[find(index)] = find(linked)
    }
  }

  const groups = Map.groupBy(anchors.keys(), (index) => {
    return find(index)
  })

  const components = groups
    .values()
    .toArray()
    .toSorted((a, b) => {
      return b.length - a.length
    })

  function describe(indices: number[]): Component {
    const xs = indices.map((index) => {
      return anchors[index].position.x
    })
    const ys = indices.map((index) => {
      return anchors[index].position.y
    })
    const zs = indices.map((index) => {
      return anchors[index].position.z
    })

    let nearestOutsideDistance: number | null = null
    for (const index of indices) {
      for (const [otherIndex, other] of anchors.entries()) {
        if (find(otherIndex) === find(index)) {
          continue
        }

        const distance = Math.hypot(
          other.position.x - anchors[index].position.x,
          other.position.y - anchors[index].position.y,
          other.position.z - anchors[index].position.z,
        )
        if (nearestOutsideDistance === null || distance < nearestOutsideDistance) {
          nearestOutsideDistance = distance
        }
      }
    }

    return {
      anchors: indices.length,
      bbox: [Math.min(...xs), Math.min(...zs), Math.max(...xs), Math.max(...zs)],
      y: [Math.min(...ys), Math.max(...ys)],
      nearestOutsideDistance,
    }
  }

  const payload = {
    generatorVersion: graph.stats?.generatorVersion ?? null,
    polygons: polygons.length,
    anchors: anchors.length,
    stats: graph.stats,
    components: components.map((indices) => {
      return describe(indices)
    }),
  }

  panel.setAnchorDebugPayload(JSON.stringify(payload, round, 2))
}
