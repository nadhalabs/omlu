export class KitchenBoardRefreshCoordinator {
  #active = null;
  #queued = false;
  #queuedRun = null;
  #scheduled = null;
  #disposed = false;

  refresh(run, { queueIfActive = false } = {}) {
    if (this.#disposed) return Promise.resolve();
    if (this.#active) {
      if (queueIfActive) {
        this.#queued = true;
        this.#queuedRun = run;
      }
      return this.#active;
    }

    const request = Promise.resolve().then(run);
    this.#active = request;
    const finish = () => {
      if (this.#active !== request) return;
      this.#active = null;
      if (!this.#queued || this.#disposed) return;
      const queuedRun = this.#queuedRun || run;
      this.#queued = false;
      this.#queuedRun = null;
      void this.refresh(queuedRun);
    };
    void request.then(finish, finish);
    return request;
  }

  schedule(run, delayMs = 100) {
    if (this.#disposed || this.#scheduled !== null) return;
    this.#scheduled = globalThis.setTimeout(() => {
      this.#scheduled = null;
      void this.refresh(run, { queueIfActive: true });
    }, delayMs);
  }

  dispose() {
    this.#disposed = true;
    this.#queued = false;
    this.#queuedRun = null;
    if (this.#scheduled !== null) globalThis.clearTimeout(this.#scheduled);
    this.#scheduled = null;
  }
}
