import { JSDOM } from 'jsdom'

/**
 * Installs a jsdom document into the node globals, so the modules that touch the DOM can be tested
 * with `node --test`.
 *
 * @remarks
 * - the call has to happen **before** the tested modules are imported, because vue and lumino read
 * the document when they are loaded: the spec files import their subject with a dynamic `import()`,
 * after this function ran
 * - jsdom has no layout engine, no `ResizeObserver` and no drag and drop api, so the observers are
 * stubbed out and the drag types are faked, just enough for the widgets to be built: the tests assert
 * the structure and the calls, they can not measure pixels
 */
export function installDom(): void {
  // the url is not optional: without a real origin the web storage is blocked, and a module that
  // reaches for the localStorage while it loads would throw
  const dom = new JSDOM('<!doctype html><html><body></body></html>', {
    pretendToBeVisual: true,
    url: 'https://localhost/',
  })
  const view = dom.window as unknown as Record<string, unknown>

  // every dom interface (constructors like `HTMLElement`, `SVGElement`, `Event`) plus the few globals
  // that are values and not constructors
  const valueGlobals = new Set([
    'window',
    'document',
    'navigator',
    'getComputedStyle',
    'requestAnimationFrame',
    'cancelAnimationFrame',
    'matchMedia',
    'localStorage',
    'sessionStorage',
  ])

  // `Object.entries` would miss the interfaces: jsdom defines them as non enumerable properties
  for (const name of Object.getOwnPropertyNames(view)) {
    const value = view[name]
    const isInterface = typeof value === 'function' && /^\p{Uppercase_Letter}/u.test(name)

    if (!isInterface && !valueGlobals.has(name)) {
      continue
    }

    Object.defineProperty(globalThis, name, { value, configurable: true, writable: true })
  }

  // jsdom has no drag and drop api, but lumino's dragdrop module reads them while it loads
  if (view.DragEvent === undefined) {
    class DragEventStub extends dom.window.Event {}

    Object.defineProperty(globalThis, 'DragEvent', { value: DragEventStub, configurable: true, writable: true })
  }

  if (view.DataTransfer === undefined) {
    class DataTransferStub {
      readonly effectAllowed = 'none'
      readonly dropEffect = 'none'
      readonly files: unknown[] = []
      readonly types: string[] = []

      setData(): void {
        // the stub keeps no data: nothing in the shell reads it back
      }

      getData(): string {
        return ''
      }
    }

    Object.defineProperty(globalThis, 'DataTransfer', { value: DataTransferStub, configurable: true, writable: true })
  }

  // jsdom does not implement the resize observers, and the shell only needs them to refit the layout
  class ResizeObserverStub {
    observe(): void {
      // the dome has no layout, so nothing to observe
    }

    unobserve(): void {
      // nothing to unobserve
    }

    disconnect(): void {
      // nothing to disconnect
    }
  }

  Object.defineProperty(globalThis, 'ResizeObserver', {
    value: ResizeObserverStub,
    configurable: true,
    writable: true,
  })
}
