export class State<T> extends EventTarget {
  private _value: T

  constructor(value: T) {
    super()
    this._value = value
    this._setValue(undefined, value)
  }

  get currentValue(): T {
    return this._value
  }

  set currentValue(newValue: T) {
    this._setValue(this._value, newValue)
  }

  private _setValue(oldValue: T | undefined, newValue: T): void {
    this._value = newValue

    const changeEvent = new CustomEvent('change', {
      detail: {
        oldValue,
        currentValue: newValue,
      },
    })

    this.dispatchEvent(changeEvent)
  }
}
