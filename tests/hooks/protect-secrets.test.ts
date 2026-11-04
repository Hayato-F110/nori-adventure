import { execFileSync } from "node:child_process";
import path from "node:path";
import { describe, expect, it } from "vitest";
// @ts-expect-error -- Hook は素の JavaScript（.mjs）で、型定義を持たない
import { findPathReason, findSecretInText } from "../../.claude/hooks/protect-secrets.mjs";

const root = path.resolve(import.meta.dirname, "../..");
const hook = path.join(root, ".claude/hooks/protect-secrets.mjs");
// 秘密情報らしい文字列は、Hook 自身に止められないよう実行時に組み立てる
const dotEnv = "." + "env";
const fakeAwsKey = "AKIA" + "A".repeat(16);

const runHook = (payload: unknown): number => {
  try {
    execFileSync(process.execPath, [hook], {
      input: typeof payload === "string" ? payload : JSON.stringify(payload),
      env: { ...process.env, CLAUDE_PROJECT_DIR: root },
      stdio: "pipe",
    });
    return 0;
  } catch (error) {
    return (error as { status: number }).status;
  }
};

describe("protect-secrets: パスの判定", () => {
  it.each([dotEnv, `${dotEnv}.local`, "certs/server.pem", "~/.ssh/config", "secrets/token.txt"])(
    "%s は止める",
    (target) => {
      expect(findPathReason(target, root, root)).not.toBeNull();
    },
  );

  it.each(["src/main.ts", "docs/env.example", "README.md"])("%s は通す", (target) => {
    expect(findPathReason(target, root, root)).toBeNull();
  });
});

describe("protect-secrets: 書き込む内容の判定", () => {
  it("AWS キーらしい文字列を見つける", () => {
    expect(findSecretInText(`const key = "${fakeAwsKey}";`)).not.toBeNull();
  });
  it("ふつうのコードは通す", () => {
    expect(findSecretInText("const speed = 12;")).toBeNull();
  });
});

describe("protect-secrets: Hook として実行", () => {
  it(".env の Read は終了コード2で止める", () => {
    expect(runHook({ tool_name: "Read", tool_input: { file_path: dotEnv }, cwd: root })).toBe(2);
  });
  it("コマンドから .env を読むのも止める", () => {
    expect(runHook({ tool_name: "Bash", tool_input: { command: `cat ${dotEnv}` }, cwd: root })).toBe(2);
  });
  it("秘密情報らしい文字列の Write を止める", () => {
    const input = { file_path: "src/a.ts", content: `export const k = "${fakeAwsKey}";` };
    expect(runHook({ tool_name: "Write", tool_input: input, cwd: root })).toBe(2);
  });
  it("ふつうの Read は通す", () => {
    expect(runHook({ tool_name: "Read", tool_input: { file_path: "src/main.ts" }, cwd: root })).toBe(0);
  });
  it("入力が壊れていたら安全側に倒して止める", () => {
    expect(runHook("not json")).toBe(2);
  });
});
