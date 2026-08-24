import { en } from "./en.js";
import { ja } from "./ja.js";
import { ko } from "./ko.js";
import { vi } from "./vi.js";
import { zh } from "./zh.js";

export const DEFAULT_LOCALE = "ko";
export const LOCALE_STORAGE_KEY = "show-tetris:locale";
export const messages = Object.freeze({ en, ja, ko, vi, zh });

function normalizeLocale(locale) {
  const language = String(locale ?? "").trim().toLowerCase().split(/[-_]/)[0];
  return Object.hasOwn(messages, language) ? language : null;
}

function readStoredLocale(storage) {
  try {
    return storage?.getItem(LOCALE_STORAGE_KEY);
  } catch {
    return null;
  }
}

function writeStoredLocale(storage, locale) {
  try {
    storage?.setItem(LOCALE_STORAGE_KEY, locale);
  } catch {
    // The UI can still change language when storage is unavailable.
  }
}

function localeFromUrl(location) {
  try {
    return new URLSearchParams(location?.search ?? "").get("lang");
  } catch {
    return null;
  }
}

export function resolveLocale({ locale, location, storage, navigator } = {}) {
  const candidates = [
    locale,
    localeFromUrl(location),
    readStoredLocale(storage),
    ...(navigator?.languages ?? []),
    navigator?.language,
    DEFAULT_LOCALE,
  ];
  return candidates.map(normalizeLocale).find(Boolean) ?? DEFAULT_LOCALE;
}

export class I18n {
  #listeners = new Set();

  constructor({ locale = DEFAULT_LOCALE, storage = null, document = null } = {}) {
    this.locale = normalizeLocale(locale) ?? DEFAULT_LOCALE;
    this.storage = storage;
    this.document = document;
  }

  t(key, parameters = {}) {
    const template = messages[this.locale][key] ?? messages[DEFAULT_LOCALE][key];
    if (template === undefined) throw new Error(`Missing translation: ${key}`);
    return template.replace(/\{(\w+)\}/g, (match, name) => (
      Object.hasOwn(parameters, name) ? String(parameters[name]) : match
    ));
  }

  formatNumber(value, options = {}) {
    return new Intl.NumberFormat(this.locale, options).format(value);
  }

  setLocale(locale) {
    const nextLocale = normalizeLocale(locale);
    if (!nextLocale) throw new RangeError(`Unsupported locale: ${locale}`);
    if (nextLocale === this.locale) return;
    this.locale = nextLocale;
    writeStoredLocale(this.storage, nextLocale);
    this.localizeDocument();
    for (const listener of [...this.#listeners]) listener(nextLocale);
  }

  onChange(listener) {
    this.#listeners.add(listener);
    return () => this.#listeners.delete(listener);
  }

  localizeDocument(root = this.document) {
    if (!root) return;
    const documentElement = root.documentElement ?? root.ownerDocument?.documentElement;
    if (documentElement) documentElement.lang = this.locale;
    for (const node of root.querySelectorAll("[data-i18n]")) {
      node.textContent = this.t(node.dataset.i18n);
    }
    for (const node of root.querySelectorAll("[data-i18n-aria-label]")) {
      node.setAttribute("aria-label", this.t(node.dataset.i18nAriaLabel));
    }
  }
}

export function createI18n(environment = globalThis) {
  const storage = environment.localStorage ?? null;
  const document = environment.document ?? null;
  const locale = resolveLocale({
    locale: environment.locale,
    location: environment.location,
    navigator: environment.navigator,
    storage,
  });
  const i18n = new I18n({ locale, storage, document });
  i18n.localizeDocument();
  return i18n;
}
