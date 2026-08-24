/**
 * @typedef {Object} FeatureContext
 * @property {import('./engine.js').TetrisEngine} game
 * @property {import('./events.js').EventBus} events
 * @property {import('./commands.js').CommandRegistry} commands
 * @property {import('./capabilities.js').CapabilityRegistry} capabilities
 * @property {import('./ui.js').UiService} ui
 * @property {import('../i18n/index.js').I18n} i18n
 * @property {import('./audio.js').AudioService} audio
 * @property {import('./renderer.js').BoardRenderer} render
 * @property {Storage} storage
 * @property {Document} document
 */

/**
 * @typedef {Object} FeatureModule
 * @property {string} id
 * @property {(context: FeatureContext) => (() => void)|void} install
 */

export class FeatureHost {
  /** @param {FeatureContext} context */
  constructor(context) {
    this.context = Object.freeze(context);
    this.installed = [];
  }

  /** @param {FeatureModule[]} featureModules */
  install(featureModules) {
    for (const imported of featureModules) {
      const feature = imported.default ?? imported;
      if (!feature?.id || typeof feature.install !== "function") {
        throw new TypeError("Invalid feature module");
      }
      const dispose = feature.install(this.context) ?? (() => {});
      this.installed.push({ id: feature.id, dispose });
    }
  }

  destroy() {
    for (const feature of [...this.installed].reverse()) feature.dispose();
    this.installed = [];
  }
}
