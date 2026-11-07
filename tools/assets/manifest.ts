// public/models/manifest.json：取り込んだモデルの出所の記録（アセット版の SBOM。脅威分析 S-05）。
// ゲームも、このファイルを見て、どのモデルを読むかを決める（ないモデルを読みに行って 404 を出さない）。

export type ModelEntry = {
  name: string;
  file: string;
  sha256: string;
  bytes: number;
  triangles: number;
  size: { width: number; height: number; length: number };
  /** 作った道具と版、作り方 */
  createdWith: string;
  /** 元の .blend（隔離した作業フォルダの中の場所） */
  source: string;
  author: string;
  license: string;
  /** 外部の素材（テクスチャ・モデル）。使わない決まりなので「なし」 */
  externalAssets: "なし";
  /** 取り込んだ日（YYYY-MM-DD） */
  importedAt: string;
};

export type Manifest = { models: ModelEntry[] };

export const REQUIRED_TEXT_FIELDS = ["createdWith", "source", "author", "license", "importedAt"] as const;

/** 同じ名前の記録を置き換え、名前の順に並べる（差分を読みやすくするため） */
export const upsertEntry = (manifest: Manifest, entry: ModelEntry): Manifest => ({
  models: [...manifest.models.filter((m) => m.name !== entry.name), entry].sort((a, b) =>
    a.name.localeCompare(b.name),
  ),
});
