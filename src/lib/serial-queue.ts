/**
 * Runs async tasks one after another, in the order they were enqueued, whether or not an earlier
 * task failed. Troll Run uses it so a death report is delivered before the clear/finish report
 * that follows it: the server advances progress on the clear, and a death arriving after the
 * runner is finished is rejected as ignored, so unordered requests could lose a real death.
 */
export function createSerialQueue() {
  let tail: Promise<unknown> = Promise.resolve()
  return function enqueue<T>(task: () => Promise<T>): Promise<T> {
    const run = tail.then(task, task)
    tail = run.catch(() => undefined)
    return run
  }
}
