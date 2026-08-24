export class CommandRegistry {
  #bindings = new Map();
  #listener;

  constructor(target = window) {
    this.#listener = (event) => {
      const binding = this.#bindings.get(event.code);
      if (!binding || binding.when?.() === false) return;
      if (binding.preventDefault) event.preventDefault();
      binding.handler(event);
    };
    target.addEventListener("keydown", this.#listener);
    this.target = target;
  }

  register(code, labelKey, handler, options = {}) {
    const previous = this.#bindings.get(code);
    this.#bindings.set(code, {
      code,
      labelKey,
      handler,
      preventDefault: options.preventDefault ?? true,
      when: options.when,
    });
    return () => {
      if (previous) this.#bindings.set(code, previous);
      else this.#bindings.delete(code);
    };
  }

  list() {
    return [...this.#bindings.values()].map(({ code, labelKey }) => ({ code, labelKey }));
  }

  destroy() {
    this.target.removeEventListener("keydown", this.#listener);
    this.#bindings.clear();
  }
}
