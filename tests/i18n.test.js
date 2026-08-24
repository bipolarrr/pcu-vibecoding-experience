import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";
import { I18n, resolveLocale } from "../src/i18n/index.js";
import { en } from "../src/i18n/en.js";
import { ja } from "../src/i18n/ja.js";
import { ko } from "../src/i18n/ko.js";
import { vi } from "../src/i18n/vi.js";
import { zh } from "../src/i18n/zh.js";

const projectRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");

test("지원하는 다섯 언어 사전은 같은 번역 키를 제공한다", () => {
  const expectedKeys = Object.keys(ko).sort();
  for (const dictionary of [en, ja, vi, zh]) {
    assert.deepEqual(Object.keys(dictionary).sort(), expectedKeys);
    assert.ok(Object.values(dictionary).every((value) => typeof value === "string" && value.length > 0));
  }
});

test("URL, 저장 설정, 브라우저 언어 순서로 locale을 결정한다", () => {
  const storage = { getItem: () => "ko" };
  const navigator = { languages: ["ko-KR"], language: "ko-KR" };
  assert.equal(resolveLocale({ location: { search: "?lang=en" }, storage, navigator }), "en");
  assert.equal(resolveLocale({ location: { search: "" }, storage, navigator }), "ko");
  assert.equal(resolveLocale({ location: { search: "" }, storage: null, navigator: { language: "en-US" } }), "en");
  assert.equal(resolveLocale({ location: { search: "?lang=ja-JP" } }), "ja");
  assert.equal(resolveLocale({ location: { search: "?lang=vi-VN" } }), "vi");
  assert.equal(resolveLocale({ location: { search: "?lang=zh-CN" } }), "zh");
});

test("게임 문맥에 맞춘 일본어·베트남어·중국어 표현을 제공한다", () => {
  assert.equal(new I18n({ locale: "ja" }).t("command.hold"), "ミノをホールド");
  assert.equal(new I18n({ locale: "vi" }).t("gallery.title"), "Bạn mê phong cách nào?");
  assert.equal(new I18n({ locale: "zh" }).t("button.restart"), "再来一局");
});

test("문구 보간, 숫자 포맷, 실행 중 locale 변경을 지원한다", () => {
  const saved = new Map();
  const storage = {
    getItem: (key) => saved.get(key) ?? null,
    setItem: (key, value) => saved.set(key, value),
  };
  const i18n = new I18n({ locale: "ko", storage });
  let changed = 0;
  i18n.onChange(() => { changed += 1; });

  assert.equal(i18n.t("button.restart"), "다시 시작");
  assert.equal(i18n.t("score.delta", { score: i18n.formatNumber(1200) }), "+1,200");
  i18n.setLocale("en-US");
  assert.equal(i18n.t("button.restart"), "Restart");
  assert.equal(saved.get("show-tetris:locale"), "en");
  assert.equal(changed, 1);
  assert.throws(() => i18n.t("missing.key"), /Missing translation/);
});

test("locale 사전 밖의 실행 코드와 정적 HTML에는 한국어 UI 문구가 없다", async () => {
  const targets = [
    "src/bootstrap.js",
    "src/core/ui.js",
    "src/style-gallery.js",
    "index.html",
    "style-gallery.html",
    "tests/browser-complete.html",
  ];
  const packEntries = [
    "hard-drop", "hold", "next", "pause", "score", "lines", "level", "high-score",
    "restart-ui", "controls-help", "countdown", "fullscreen", "game-over-dialog",
    "audio-controls", "score-popup",
  ].map((id) => `.showcase/packs/${id}/index.js`);

  for (const relativePath of [...targets, ...packEntries]) {
    const source = await readFile(resolve(projectRoot, relativePath), "utf8");
    assert.doesNotMatch(source, /[가-힣]/, relativePath);
  }
});

test("정적 HTML의 사용자 노출 텍스트는 번역 키 또는 실행 시 포맷 값으로 채운다", async () => {
  for (const relativePath of ["index.html", "style-gallery.html", "tests/browser-complete.html"]) {
    const source = await readFile(resolve(projectRoot, relativePath), "utf8");
    const textNodes = [...source.matchAll(/>([^<]+)</g)]
      .map((match) => match[1].trim())
      .filter(Boolean);
    assert.deepEqual(textNodes, [], relativePath);
  }
});
