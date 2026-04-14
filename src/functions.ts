import { ArxPolygonFlags, type ArxVector3 } from 'arx-convert/types'
import { Vector3 } from 'three'

export async function wait(delayInMs: number): Promise<void> {
  await new Promise<void>((resolve, reject) => {
    setTimeout(() => {
      resolve()
    }, delayInMs)
  })
}

export function randomIntBetween(a: number, b: number): number {
  return a + Math.floor(Math.random() * (b - a))
}

export function percentOf(percentage: number, maxValue: number): number {
  return (maxValue / 100) * percentage
}

export function arxVector3toVector3({ x, y, z }: ArxVector3): Vector3 {
  return new Vector3(x, y, z)
}

export function isTransparent(flags: ArxPolygonFlags): boolean {
  return (flags & ArxPolygonFlags.Transparent) !== 0
}

export function isDoubleSided(flags: ArxPolygonFlags): boolean {
  return (flags & ArxPolygonFlags.DoubleSided) !== 0
}

export function isNoDraw(flags: ArxPolygonFlags): boolean {
  return (flags & ArxPolygonFlags.NoDraw) !== 0
}
