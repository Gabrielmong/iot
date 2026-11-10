/** Runs tasks one at a time, in order. A failing task does not stop the queue. */
export class SerialQueue {
  private tail: Promise<void> = Promise.resolve();

  constructor(private readonly onError: (err: unknown) => void) {}

  /** Queues a task and returns its result; a failure rejects to the caller. */
  run<T>(task: () => Promise<T>): Promise<T> {
    const result = this.tail.then(task);
    this.tail = result.then(
      () => undefined,
      () => undefined,
    );
    return result;
  }

  /** Queues a task whose failure is reported to `onError`. */
  push(task: () => Promise<void>): void {
    this.run(task).catch(this.onError);
  }

  /** Resolves once the queue is empty, including tasks pushed while waiting. */
  async idle(): Promise<void> {
    let tail: Promise<void>;
    do {
      tail = this.tail;
      await tail;
    } while (tail !== this.tail);
  }
}
