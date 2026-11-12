# NORI-56：見た目の素材（CC0）を、ゲーム用に縮小して書き出す。専用ユーザー（noriblender）の Blender の中で実行する。
# 決まり（docs/game-rules.md「見た目」）：テクスチャは 1辺 512 px の WebP、HDRI は横 512 px の .hdr（Radiance）。
# 入力：blender-work/assets/<素材>/（ambientCG の Color・NormalGL・Roughness）、blender-work/assets/hdri/（Poly Haven）
# 出力：blender-work/export/textures/<素材>_<color|normal|roughness>.webp、sky.hdr、sources.json（出所の写し）
# 取り込み：オーナーのユーザーで `npm run textures:import`（大きさの検査をして public/textures/ へ）
#
# 使い方：blender-work/tools/ に写してから
#   runpy.run_path(r"<リポジトリ>\blender-work\tools\export-textures.py")
import json
from pathlib import Path

import bpy

SIZE = 512  # LOOK.textureSize
HDRI_WIDTH = 512  # LOOK.hdriWidth
QUALITY = 80  # WebP の品質（大きさの上限に収まらなければ下げる）
TEXTURES = ["Grass004", "Asphalt031", "Facade018A", "Facade006", "Bark001", "Ground054"]  # LOOK.surfaces と同じ
MAPS = {"Color": "color", "NormalGL": "normal", "Roughness": "roughness"}


def _work_dir() -> Path:
    here = Path(globals().get("__file__", "")).resolve().parent
    work = here.parent if here.name == "tools" else Path.cwd()
    if work.name != "blender-work":
        raise RuntimeError("blender-work/tools/ に写してから runpy.run_path で実行する")
    return work


def _find(folder: Path, suffix: str) -> Path:
    hits = sorted(p for p in folder.iterdir() if p.name.endswith(suffix))
    if not hits:
        raise FileNotFoundError(f"{folder.name} に *{suffix} がない")
    return hits[0]


def _shrink(src: Path, dst: Path, width: int, height: int, fmt: str, quality: int, non_color: bool) -> int:
    img = bpy.data.images.load(str(src), check_existing=False)
    out = None
    try:
        if non_color:
            # 法線・粗さは色ではない値。色の変換をしない
            img.colorspace_settings.name = "Non-Color"
        img.scale(width, height)
        if fmt == "HDR":
            img.file_format = fmt
            img.save(filepath=str(dst), quality=quality)
        else:
            # 白黒の JPG（粗さ）は WebP に書けない（11/11 に失敗した）。カラーの新しい画像に画素を写してから保存する
            out = bpy.data.images.new(dst.stem, width, height, alpha=False)
            out.colorspace_settings.name = img.colorspace_settings.name
            pixels = [0.0] * (width * height * 4)
            img.pixels.foreach_get(pixels)
            out.pixels.foreach_set(pixels)
            out.file_format = fmt
            out.save(filepath=str(dst), quality=quality)
    finally:
        bpy.data.images.remove(img)
        if out is not None:
            bpy.data.images.remove(out)
    return dst.stat().st_size


def export() -> dict:
    work = _work_dir()
    assets = work / "assets"
    out = work / "export" / "textures"
    out.mkdir(parents=True, exist_ok=True)
    files = {}
    sources = {}
    for name in TEXTURES:
        folder = assets / name
        sources[name] = json.loads((folder / "asset.json").read_text(encoding="utf-8"))
        for key, short in MAPS.items():
            src = _find(folder, f"_{key}.jpg")
            dst = out / f"{name}_{short}.webp"
            files[dst.name] = _shrink(src, dst, SIZE, SIZE, "WEBP", QUALITY, non_color=short != "color")
    hdri = assets / "hdri"
    sources["sky"] = json.loads((hdri / "asset.json").read_text(encoding="utf-8"))
    dst = out / "sky.hdr"
    files[dst.name] = _shrink(_find(hdri, ".hdr"), dst, HDRI_WIDTH, HDRI_WIDTH // 2, "HDR", 0, non_color=False)
    (out / "sources.json").write_text(json.dumps(sources, ensure_ascii=False, indent=2), encoding="utf-8")
    return {"ok": True, "dir": str(out), "files": files, "total": sum(files.values())}


result = export()
print(result)
