export const KITCHEN_ORDER_ALERT_PATH = "/sounds/kitchen-order-alert.mp3";

export class NewKitchenTicketTracker {
  #known = new Set();
  #initialized = false;

  observe(orders) {
    const pendingTokens = orders
      .filter((order) => order.status === "pending")
      .map((order) => order.public_token);
    if (!this.#initialized) {
      pendingTokens.forEach((token) => this.#known.add(token));
      this.#initialized = true;
      return false;
    }
    let hasNewTicket = false;
    for (const token of pendingTokens) {
      if (this.#known.has(token)) continue;
      this.#known.add(token);
      hasNewTicket = true;
    }
    return hasNewTicket;
  }
}

export class KitchenOrderAlert {
  #audio = null;
  #lastPlayedAt = Number.NEGATIVE_INFINITY;

  constructor({
    src = KITCHEN_ORDER_ALERT_PATH,
    cooldownMs = 2_000,
    createAudio = () => new globalThis.Audio(src),
    now = () => Date.now(),
    onFailure = (_error) => undefined,
  } = {}) {
    this.src = src;
    this.cooldownMs = cooldownMs;
    this.createAudio = createAudio;
    this.now = now;
    this.onFailure = onFailure;
  }

  preload() {
    try {
      if (!this.#audio) {
        this.#audio = this.createAudio();
        this.#audio.preload = "auto";
        this.#audio.volume = 1.0;
        this.#audio.load?.();
      }
      return this.#audio;
    } catch (error) {
      this.onFailure(error);
      return null;
    }
  }

  async unlock() {
    const audio = this.preload();
    if (!audio) return;
    try {
      audio.muted = true;
      await audio.play();
      audio.pause();
      audio.currentTime = 0;
    } catch (error) {
      this.onFailure(error);
    } finally {
      audio.muted = false;
    }
  }

  play() {
    const now = this.now();
    if (now - this.#lastPlayedAt < this.cooldownMs) return false;
    const audio = this.preload();
    if (!audio) return false;
    this.#lastPlayedAt = now;
    try {
      audio.muted = false;
      audio.volume = 1.0;
      audio.currentTime = 0;
      void Promise.resolve(audio.play()).catch((error) => this.onFailure(error));
    } catch (error) {
      this.onFailure(error);
    }
    return true;
  }

  dispose() {
    try {
      this.#audio?.pause();
    } catch {}
    this.#audio = null;
  }
}
