import { ArxPolygonFlags } from 'arx-convert/types'

export function percentOf(percentage: number, maxValue: number): number {
  return (maxValue / 100) * percentage
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
