# アセットの流れ（Blender → GLB → ゲーム）

NORI-18。決まりの数値は [game-rules.md「3D モデル（アセット）」](../game-rules.md)、出所の記録は [`public/models/manifest.json`](../../public/models/manifest.json)。

```
Blender（noriblender・隔離）                      オーナーのユーザー                         ゲーム
 コレクション car に作る                →   npm run assets:import car           →   models/manifest.json を見て
 tools/blender/export-glb.py で書き出し      ① glTF-Validator（Khronos）             models/car.glb を読む
 C:\NoriBlender\work\export\car.glb          ② 決まりの検査（tools/assets/inspect.ts）  読めなければ箱の車のまま
                                             ③ public/models/ に置き、manifest を更新
```

## 手順

1. Blender を手順書④（[blender-mcp-isolation.md](../security/blender-mcp-isolation.md)）のコマンドで開く（noriblender として。ダブルクリックでは開かない）
2. 作業ファイルは `C:\NoriBlender\work\<名前>.blend`。書き出すものは、名前と同じコレクションに入れる
   - Blender では **前が +Y**、左が −X、上が +Z（書き出すと glTF の前 −Z・上 +Y になる）。原点は車体の底の中心
   - 車のオブジェクトの名前：`body`・`wheel_FL`・`wheel_FR`・`wheel_RL`・`wheel_RR`。タイヤの回転は適用しておく（Ctrl+A）
   - 画像（テクスチャ）は使わない。色は材質の色で付ける
3. Blender の中で `tools/blender/export-glb.py` を実行する（`NAME = "car"` を先に決める）
4. オーナーのユーザーで `npm run assets:import car`。合格しなければ、理由が日本語で出る。直して 3 から
5. `npm run e2e` で、ゲームに出ることを確かめる（`e2e/car-model.spec.ts`。スクリーンショットは `test-results/`）
6. PR で `public/models/` の差分と manifest を見せる

## 守っていること

| 決まり                                       | 確かめ方                                                                                                     |
| -------------------------------------------- | ------------------------------------------------------------------------------------------------------------ |
| 外部の素材を使わない（S-05）                 | manifest の `externalAssets` は「なし」。画像を書き出さない。外部・data: の URI があれば取り込まない         |
| 壊れた・大きすぎるファイルを読まない（S-06） | glTF-Validator のエラー 0、大きさ・三角形の上限                                                              |
| CSP を緩めない                               | 復号の WASM が要る拡張（Draco・meshopt・Basis）を取り込まない（許可した拡張だけ）                            |
| 出所が分かる                                 | manifest の SHA-256・作者・作り方・元の .blend。`tests/assets/manifest.test.ts` がファイルとの一致を確かめる |
| 読み込みに失敗しても止まらない               | 箱の車で続ける（`tests/render/carModel.test.ts`）                                                            |
