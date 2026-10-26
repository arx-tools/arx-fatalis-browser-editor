export class Logger {
  private readonly target: HTMLDivElement

  constructor(target: HTMLDivElement) {
    this.target = target
  }

  log(text: string, appendLogTo?: HTMLDivElement): HTMLDivElement {
    return this.addLine('log', text, appendLogTo)
  }

  error(text: string, appendLogTo?: HTMLDivElement): HTMLDivElement {
    return this.addLine('error', 'Error: ' + text, appendLogTo)
  }

  private addLine(className: string, text: string, appendLogTo?: HTMLDivElement): HTMLDivElement {
    if (appendLogTo !== undefined) {
      appendLogTo.textContent = appendLogTo.textContent + ' ' + text
      return appendLogTo
    }

    const line = document.createElement('div')
    line.classList.add(className)
    line.textContent = text

    this.target.append(line)
    this.target.scrollTo({
      top: 100_000,
      left: 0,
      behavior: 'instant',
    })

    return line
  }
}
