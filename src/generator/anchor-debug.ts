/**
 * Debug payload for the F2 panel: the anchor generator's filter counters and the island analysis,
 * so a broken graph (a component cut off from the rest) can be explained without re-running the
 * generator by hand.
 *
 * The panel is provided by the editor shell: `globalThis.__debugPanel.setAnchorDebugPayload(text)`.
 */
type Component = { anchors: number; bbox: [number, number, number, number]; y: [number, number]; nearestOutsideDistance: number | null }

type DebugAnchor = { position: { x: number; y: number; z: number }; linkedAnchors: number[] }

export function publishAnchorDebugPayload(polygons: unknown[], result: unknown): void {
  const graph = result as { anchors: DebugAnchor[]; stats: Record<string, unknown> }
  const panel = (globalThis as { __debugPanel?: { setAnchorDebugPayload?: (text: string) => void } }).__debugPanel
  if (typeof panel?.setAnchorDebugPayload !== 'function') {
    return
  }

  const anchors = graph.anchors
  const parent = anchors.map((_, index) => index)
  const find = (index: number): number => (parent[index] === index ? index : (parent[index] = find(parent[index])))

  for (const [index, anchor] of anchors.entries()) {
    for (const linked of anchor.linkedAnchors) {
      parent[find(index)] = find(linked)
    }
  }

  const groups = new Map<number, number[]>()
  anchors.forEach((_, index) => {
    const root = find(index)
    const list = groups.get(root) ?? []
    list.push(index)
    groups.set(root, list)
  })

  const components = [...groups.values()].sort((a, b) => b.length - a.length)

  const describe = (indices: number[]): Component => {
    const xs = indices.map((index) => anchors[index].position.x)
    const ys = indices.map((index) => anchors[index].position.y)
    const zs = indices.map((index) => anchors[index].position.z)

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
    components: components.map((indices) => describe(indices)),
  }

  // round the floats: the payload is for humans, three decimals are plenty and it keeps the JSON short
  const round = (_key: string, value: unknown): unknown => {
    return typeof value === 'number' && !Number.isInteger(value) ? Math.round(value * 1000) / 1000 : value
  }

  panel.setAnchorDebugPayload(JSON.stringify(payload, round, 2))
}
