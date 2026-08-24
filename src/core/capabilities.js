export class CapabilityRegistry {
  #values = new Map();

  provide(name, value) {
    if (this.#values.has(name)) throw new Error(`Capability already provided: ${name}`);
    this.#values.set(name, value);
    return () => {
      if (this.#values.get(name) === value) this.#values.delete(name);
    };
  }

  get(name) {
    return this.#values.get(name);
  }

  has(name) {
    return this.#values.has(name);
  }
}
