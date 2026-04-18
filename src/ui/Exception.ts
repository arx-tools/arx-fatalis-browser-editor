import type { Logger } from './Logger.js'

export class Exception extends Error {
  constructor(message: string, logger?: Logger) {
    super(message)
    logger?.error(message)
  }
}
