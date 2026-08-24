export class EventBus {
  #listeners = new Map();

  on(type, listener) {
    const listeners = this.#listeners.get(type) ?? new Set();
    listeners.add(listener);
    this.#listeners.set(type, listeners);
    return () => {
      listeners.delete(listener);
      if (listeners.size === 0) this.#listeners.delete(type);
    };
  }

  emit(type, payload = {}) {
    for (const listener of [...(this.#listeners.get(type) ?? [])]) {
      listener(Object.freeze({ ...payload, type }));
    }
  }

  clear() {
    this.#listeners.clear();
  }
}
