/**
 * Sleeps for the given time, used by the loading sequence to let the browser paint the progress.
 *
 * @param delayInMs The time to wait in milliseconds.
 */
export async function wait(delayInMs: number): Promise<void> {
  await new Promise<void>((resolve) => {
    setTimeout(() => {
      resolve()
    }, delayInMs)
  })
}
