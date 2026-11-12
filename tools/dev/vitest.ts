// 使い方：npm test・npm run check から呼ぶ（package.json）。引数はそのまま Vitest に渡す。
// Windows の Git Bash から動かすと、作業フォルダのドライブ名が小文字（c:\）で Node に渡る。Vitest はファイルを
// パスの文字列で見分けるので、同じ設定ファイルを2回読み込み、全部のテストが落ちる（vitest#11011。2026-11-10・11-12 に起きた）。
// ドライブ名を大文字に直した作業フォルダで Vitest を起動して、どこから動かしても同じ結果にする。
import { spawnSync } from "node:child_process";
import { createRequire } from "node:module";
import path from "node:path";

const upperDrive = (p: string) => p.replace(/^[a-z]:/, (drive) => drive.toUpperCase());
const cwd = upperDrive(process.cwd());
const require = createRequire(import.meta.url);
const vitest = upperDrive(path.join(path.dirname(require.resolve("vitest/package.json")), "vitest.mjs"));
const run = spawnSync(process.execPath, [vitest, ...process.argv.slice(2)], { cwd, stdio: "inherit" });
process.exit(run.status ?? 1);
