export class UiService {
  #styleLinks = new Map();
  #cleanups = new WeakMap();

  constructor(root = document, i18n) {
    this.root = root;
    this.i18n = i18n;
  }

  mount(slotName, node) {
    const slot = this.root.querySelector(`[data-slot="${slotName}"]`);
    if (!slot) throw new Error(`Unknown UI slot: ${slotName}`);
    slot.append(node);
    return () => {
      this.#cleanupTree(node);
      node.remove();
    };
  }

  addStyles(id, url) {
    if (this.#styleLinks.has(id)) return () => {};
    const link = document.createElement("link");
    link.rel = "stylesheet";
    link.href = String(url);
    link.dataset.featureStyle = id;
    document.head.append(link);
    this.#styleLinks.set(id, link);
    return () => {
      link.remove();
      this.#styleLinks.delete(id);
    };
  }

  text(node, key, parameters = {}) {
    const render = () => { node.textContent = this.i18n.t(key, parameters); };
    render();
    return this.#track(node, this.i18n.onChange(render));
  }

  attribute(node, name, key, parameters = {}) {
    const render = () => node.setAttribute(name, this.i18n.t(key, parameters));
    render();
    return this.#track(node, this.i18n.onChange(render));
  }

  panel(titleKey, className = "") {
    const panel = document.createElement("section");
    panel.className = `feature-panel ${className}`.trim();
    const heading = document.createElement("h2");
    this.text(heading, titleKey);
    panel.append(heading);
    return panel;
  }

  #track(node, cleanup) {
    const cleanups = this.#cleanups.get(node) ?? [];
    cleanups.push(cleanup);
    this.#cleanups.set(node, cleanups);
    return cleanup;
  }

  #cleanupTree(root) {
    for (const node of [root, ...root.querySelectorAll("*")]) {
      for (const cleanup of this.#cleanups.get(node) ?? []) cleanup();
      this.#cleanups.delete(node);
    }
  }
}
