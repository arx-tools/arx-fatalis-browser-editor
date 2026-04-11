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
