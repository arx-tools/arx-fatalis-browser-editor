export class State<T> extends EventTarget {
  private value: T

  constructor(value: T) {
    super()
    this.value = value
    this.changeValue(undefined, value)
  }

  get currentValue(): T {
    return this.value
  }

  set currentValue(newValue: T) {
    this.changeValue(this.value, newValue)
  }

  private changeValue(oldValue: T | undefined, newValue: T): void {
    this.value = newValue

    const changeEvent = new CustomEvent('change', {
      detail: {
        oldValue,
        currentValue: newValue,
      },
    })

    this.dispatchEvent(changeEvent)
  }
}
