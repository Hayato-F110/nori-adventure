import { describe, expect, it } from "vitest";
// @ts-expect-error -- Hook は素の JavaScript（.mjs）で、型定義を持たない
import * as hook_ from "../../.claude/hooks/plain-terms.mjs";

const { findUndefinedTerms, loadTerms } = hook_ as {
  findUndefinedTerms: (text: string, terms: string[]) => string[];
  loadTerms: () => string[];
};

// 2026-11-14 にオーナーが決めた：一般的でない用語を、意味の説明なしで使ったら止める（CLAUDE.md「一般的でない用語を使わない」）
describe("Hook：一般的でない用語を説明なしで使ったら止める", () => {
  const terms = ["掃引", "HUD"];
  it("説明なしの用語を返す", () => {
    expect(findUndefinedTerms("1回の掃引で表にします。", terms)).toEqual(["掃引"]);
    expect(findUndefinedTerms("HUD を直しました。", terms)).toEqual(["HUD"]);
  });
  it.each([
    ["掃引（値を段階的に変えてまとめて測ること）を流します。あとで掃引の表を出します。"],
    ["掃引(sweep) を流します。"],
    ["掃引とは、値を段階的に変えて測ることです。掃引を流します。"],
    ["`掃引` はコードの中なので調べない。"],
    ["用語を使っていない文。"],
  ])("通す：%s", (text) => {
    expect(findUndefinedTerms(text, terms)).toEqual([]);
  });
  it("一覧（plain-terms.json）に、11/13 の HUD と 11/14 の掃引がある", () => {
    expect(loadTerms()).toEqual(expect.arrayContaining(["HUD", "掃引"]));
  });
});
