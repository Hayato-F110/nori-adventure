# NORI-20〜23：車のほかの4台（列車・飛行機・潜水艇・ローバー）を組み立てる。専用ユーザー（noriblender）の Blender の中で実行する。
# 形：車（build-car.py）と同じ、角を丸めたおもちゃのような形。すべてオリジナル（既存の作品に似せない。顔は付けない）。
# 色：背景で見分けやすい色（山の緑・空の青・海の青・月の灰色の中で目立つ）。
# 大きさ・名前・向きは docs/game-rules.md「車のほかの4台」に合わせる（数値は下の SIZE。ゲーム側の ASSET.vehicles と同じ）。
#
# Blender の座標：前 +Y、左 −X、上 +Z（書き出すと glTF の前 −Z・上 +Y）。原点は底の中心。
# 回る部品（wheel_*・propeller）は、原点を回る軸の上に置き、回転は適用して 0 にする（回すのはゲーム）。
# 1台ずつ blender-work/<名前>.blend に保存する（名前が一意なので、1つのファイルに4台は入れられない）。書き出しは export-glb.py（NAME に train などを渡す）。
#
# 使い方：blender-work/tools/ に写してから
#   runpy.run_path(r"<リポジトリ>\blender-work\tools\build-vehicles.py", init_globals={"REBUILD": True, "ONLY": ["train"]})
#   すでに <名前>.blend があれば、REBUILD = True のときだけ作り直す。ONLY を省くと4台すべて（最後の1台のファイルが開いたまま）
import math
import os
from pathlib import Path

import bpy

# ASSET.vehicles.<名前>.size（幅・高さ・長さ）
SIZE = {
    "train": (2.2, 2.6, 6.0),
    "plane": (4.4, 1.4, 3.6),
    "sub": (1.8, 1.8, 3.2),
    "rover": (2.0, 1.6, 2.8),
}


def _work_dir():
    # 作業フォルダ = このファイルの置き場所（blender-work/tools）の1つ上。パスを直接書かない
    here = Path(globals().get("__file__", "")).resolve().parent
    work = here.parent if here.name == "tools" else Path.cwd()
    if work.name != "blender-work":
        raise RuntimeError("blender-work/tools/ に写してから runpy.run_path で実行する")
    return work





# ---- 部品を作る道具（build-car.py と同じ） ----


def material(name, rgb, roughness=0.55, emission=None, metallic=0.0):
    mat = bpy.data.materials.get(name) or bpy.data.materials.new(name)
    mat.use_nodes = True
    # ノードの名前は Blender の言語で翻訳されることがある。種類と識別子で探す
    bsdf = next(n for n in mat.node_tree.nodes if n.type == "BSDF_PRINCIPLED")
    inputs = {s.identifier: s for s in bsdf.inputs}
    inputs["Base Color"].default_value = (*rgb, 1.0)
    inputs["Roughness"].default_value = roughness
    inputs["Metallic"].default_value = metallic
    if emission is not None:
        inputs["Emission Color"].default_value = (*emission, 1.0)
        inputs["Emission Strength"].default_value = 1.0
    return mat


def srgb(hex_value):
    # 16進の色（sRGB）を Blender の線形の値に直す
    def lin(c):
        c = c / 255
        return c / 12.92 if c <= 0.04045 else ((c + 0.055) / 1.055) ** 2.4

    return tuple(lin((hex_value >> s) & 0xFF) for s in (16, 8, 0))


def finish(obj, mat, bevel=0.0, segments=3):
    obj.data.materials.append(mat)
    if bevel > 0:
        mod = obj.modifiers.new("Bevel", "BEVEL")
        mod.width = bevel
        mod.segments = segments
        mod.limit_method = "ANGLE"
        bpy.context.view_layer.objects.active = obj
        bpy.ops.object.modifier_apply(modifier=mod.name)
    bpy.ops.object.shade_smooth_by_angle()
    return obj


def box(size, center, mat, bevel=0.0, segments=3):
    bpy.ops.mesh.primitive_cube_add(size=1, location=center)
    obj = bpy.context.object
    obj.scale = size
    bpy.ops.object.transform_apply(location=False, rotation=False, scale=True)
    return finish(obj, mat, bevel, segments)


def cylinder(radius, depth, center, rotation, mat, vertices=24, bevel=0.0):
    bpy.ops.mesh.primitive_cylinder_add(vertices=vertices, radius=radius, depth=depth, location=center, rotation=rotation)
    obj = bpy.context.object
    bpy.ops.object.transform_apply(location=False, rotation=True, scale=True)
    return finish(obj, mat, bevel)


def cone(r1, r2, depth, center, rotation, mat, vertices=20):
    bpy.ops.mesh.primitive_cone_add(vertices=vertices, radius1=r1, radius2=r2, depth=depth, location=center, rotation=rotation)
    obj = bpy.context.object
    bpy.ops.object.transform_apply(location=False, rotation=True, scale=True)
    return finish(obj, mat)


def join(parts, name):
    bpy.ops.object.select_all(action="DESELECT")
    for p in parts:
        p.select_set(True)
    bpy.context.view_layer.objects.active = parts[0]
    bpy.ops.object.join()
    obj = bpy.context.object
    obj.name = name
    obj.data.name = name
    return obj


def place(obj, location):
    # 部品は原点（回る軸）で作ってから置く。回転は入れない
    obj.location = location
    return obj


Y_AXIS = (math.pi / 2, 0, 0)  # 円柱の軸を前後（Y）に
X_AXIS = (0, math.pi / 2, 0)  # 円柱の軸を左右（X）に


def wheel(name, radius, width, tire, accent, location):
    # 原点はタイヤの中心（回す軸は X）。build-car.py と同じ模様（トレッドの4面に1面を明るく、ハブの横棒）
    t = cylinder(radius, width, (0, 0, 0), X_AXIS, tire)
    t.data.materials.append(accent)
    tread = [p for p in t.data.polygons if abs(p.normal.x) < 0.5]
    tread.sort(key=lambda p: math.atan2(p.center.z, p.center.y))
    for k, p in enumerate(tread):
        if k % 4 == 0:
            p.material_index = 1
    hub = cylinder(radius * 0.48, width + 0.02, (0, 0, 0), X_AXIS, accent, vertices=16)
    bar = box((width + 0.04, 0.06, radius * 0.8), (0, 0, 0), accent)
    return place(join([t, hub, bar], name), location)


def propeller(blade_span, hub_r, color_blade, color_hub, location, facing):
    # 原点は回る軸の中心。軸は前後（Y）。facing = +1 なら前（+Y）向き、−1 なら後ろ向き
    hub = cone(hub_r, hub_r * 0.25, hub_r * 1.6, (0, facing * hub_r * 0.5, 0), (-facing * math.pi / 2, 0, 0), color_hub)
    blades = [box((0.16, 0.05, blade_span), (0, 0, 0), color_blade, bevel=0.05)]
    blade2 = box((blade_span, 0.05, 0.16), (0, 0, 0), color_blade, bevel=0.05)
    blades.append(blade2)
    return place(join([hub, *blades], "propeller"), location)


# ---- 4台 ----


def build_train(m):
    W, H, L = SIZE["train"]
    R, TW = 0.42, 0.3
    wx, wy = W / 2 - TW / 2, 1.9
    body_color = material("train_body", srgb(0x1FA88E))  # 山の緑より青寄りの、明るい青緑
    trim = material("train_trim", srgb(0xFFF3D6), 0.6)
    roof = material("train_roof", srgb(0xE84A5F), 0.5)  # 屋根と煙突は赤みのある色（上から見て目立つ）
    chassis = material("train_chassis", srgb(0x34343E), 0.8)
    glass = m["glass"]
    deck_top = 0.86
    parts = [
        # 台車（床）。長さいっぱい。前後のバンパーを兼ねる
        box((W - 0.3, L - 0.1, 0.34), (0, 0, deck_top - 0.17), chassis, bevel=0.06),
        box((W - 0.26, L, 0.1), (0, 0, deck_top - 0.03), trim, bevel=0.04),
        # ボイラー（前の丸い胴）
        cylinder(0.78, 3.0, (0, 1.25, deck_top + 0.78), Y_AXIS, body_color, vertices=28, bevel=0.08),
        # ボイラーの帯（2本）
        cylinder(0.81, 0.12, (0, 0.5, deck_top + 0.78), Y_AXIS, trim, vertices=28),
        cylinder(0.81, 0.12, (0, 2.0, deck_top + 0.78), Y_AXIS, trim, vertices=28),
        # 運転室（後ろの箱）
        box((W - 0.2, 2.1, 1.55), (0, -1.75, deck_top + 0.775), body_color, bevel=0.14),
        # 屋根（運転室の上。高さ H まで）
        box((W, 2.3, 0.16), (0, -1.75, H - 0.08), roof, bevel=0.06),
        # 煙突（高さ H まで）
        cylinder(0.24, H - (deck_top + 1.4), (0, 2.25, (deck_top + 1.4 + H) / 2), (0, 0, 0), roof, vertices=20, bevel=0.03),
    ]
    # 運転室の窓（左右と前）
    for x in (-(W - 0.2) / 2, (W - 0.2) / 2):
        parts.append(box((0.06, 1.2, 0.6), (x, -1.75, deck_top + 1.05), glass, bevel=0.05))
    parts.append(box((1.2, 0.06, 0.5), (0, -0.69, deck_top + 1.15), glass, bevel=0.05))
    # 前のライト（丸。+Y）と後ろのライト（横長。−Y）
    parts.append(cylinder(0.22, 0.1, (0, 2.78, deck_top + 0.78), Y_AXIS, m["light"], vertices=20))
    for x in (-0.6, 0.6):
        parts.append(box((0.36, 0.08, 0.16), (x, -L / 2 + 0.01, deck_top + 0.5), m["tail"], bevel=0.04))
    body = join(parts, "body")
    wheels = [
        wheel("wheel_FL", R, TW, m["tire"], trim, (-wx, wy, R)),
        wheel("wheel_FR", R, TW, m["tire"], trim, (wx, wy, R)),
        wheel("wheel_RL", R, TW, m["tire"], trim, (-wx, -wy, R)),
        wheel("wheel_RR", R, TW, m["tire"], trim, (wx, -wy, R)),
    ]
    return [body, *wheels]


def build_plane(m):
    W, H, L = SIZE["plane"]
    body_color = material("plane_body", srgb(0xFF6B5B))  # 空の青の中で目立つ、さんご色
    wing_color = material("plane_wing", srgb(0xFFD23F))  # 翼は黄色（傾きが分かる）
    trim = material("plane_trim", srgb(0xFFF3D6), 0.6)
    fz = 0.62  # 胴体の中心の高さ
    parts = [
        # 胴体（丸い箱）。前 1.55・後ろ −1.6
        box((0.95, 3.1, 0.95), (0, -0.02, fz), body_color, bevel=0.4, segments=4),
        # 主翼（幅いっぱい）
        box((W, 1.0, 0.14), (0, 0.25, fz - 0.1), wing_color, bevel=0.06),
        # 翼の先の白（左右の区別。どちらも同じ色で、傾きを見せる）
        box((0.3, 1.02, 0.16), (-W / 2 + 0.15, 0.25, fz - 0.1), trim, bevel=0.06),
        box((0.3, 1.02, 0.16), (W / 2 - 0.15, 0.25, fz - 0.1), trim, bevel=0.06),
        # 水平尾翼・垂直尾翼（高さ H まで）
        box((1.7, 0.5, 0.1), (0, -1.45, fz + 0.15), wing_color, bevel=0.04),
        box((0.1, 0.6, H - (fz + 0.2)), (0, -1.45, (fz + 0.2 + H) / 2), body_color, bevel=0.04),
        # 操縦席の窓
        box((0.62, 0.9, 0.36), (0, 0.25, fz + 0.48), m["glass"], bevel=0.15),
        # 胴体の帯
        box((0.97, 0.12, 0.97), (0, -0.6, fz), trim, bevel=0.4, segments=4),
    ]
    # 後ろのライト（尾翼の後ろ）
    parts.append(box((0.2, 0.06, 0.12), (0, -1.76, fz + 0.15), m["tail"], bevel=0.03))
    # 車輪（飾り。回さない。地面に置いたときの底）
    for x, y in ((-0.6, 0.6), (0.6, 0.6), (0, -1.3)):
        parts.append(cylinder(0.12, 0.08, (x, y, 0.12), X_AXIS, m["tire"], vertices=12))
    parts.append(box((1.2, 0.06, 0.06), (0, 0.6, 0.2), trim))
    body = join(parts, "body")
    # プロペラ：前（+Y。ゲームの −Z）の、左右の中心。翼の幅に入る大きさ
    prop = propeller(1.1, 0.16, m["dark"], trim, (0, 1.65, fz), +1)
    return [body, prop]


def build_sub(m):
    W, H, L = SIZE["sub"]
    hull = material("sub_hull", srgb(0xFFC02E))  # 海の青の中で目立つ黄色
    trim = material("sub_trim", srgb(0xFFF3D6), 0.6)
    accent = material("sub_accent", srgb(0x2E86DE), 0.5)
    cz = 0.69  # 胴の中心の高さ（胴の底が 0）
    lid = 0.08  # 塔のふたの厚さ
    parts = [
        # 胴（角を大きく丸めた箱。カプセルに近い）
        box((1.45, 2.75, 1.38), (0, 0.05, cz), hull, bevel=0.62, segments=5),
        # 上の塔（ふたの下まで。面が重なってちらつかないよう、ふたと高さを分ける）
        box((0.72, 0.95, H - lid - (cz + 0.55)), (0, 0.15, (cz + 0.55 + H - lid) / 2), hull, bevel=0.2),
        # 塔のふた（高さ H まで）
        box((0.76, 0.99, lid), (0, 0.15, H - lid / 2), accent, bevel=0.03),
        # 横の安定板（幅いっぱい。後ろ寄り）
        box((W, 0.45, 0.08), (0, -1.05, cz), accent, bevel=0.03),
        # 縦の安定板
        box((0.08, 0.45, 1.1), (0, -1.05, cz), accent, bevel=0.03),
        # 前の大きな窓
        # 胴の前の平らな面より前に出す（中で面が重なると、四角く透けて見える）
        cylinder(0.36, 0.12, (0, 1.42, cz + 0.12), Y_AXIS, m["glass"], vertices=24),
    ]
    # 横の丸窓（左右に2つずつ）
    for x in (-0.73, 0.73):
        for y in (0.45, -0.25):
            parts.append(cylinder(0.17, 0.06, (x, y, cz + 0.1), X_AXIS, m["glass"], vertices=16))
            parts.append(cylinder(0.21, 0.04, (x * 0.99, y, cz + 0.1), X_AXIS, trim, vertices=16))
    body = join(parts, "body")
    # ライト：前の下。霧の中で光を出す位置（ゲームが光を付ける）
    light = place(
        # 胴の前の面から少し出して、斜め前から見えるようにする（丸い胴の外へ 0.08 m）
        join([cylinder(0.17, 0.14, (0, 0, 0), Y_AXIS, m["light"], vertices=16), cylinder(0.21, 0.08, (0, -0.05, 0), Y_AXIS, accent, vertices=16)], "light"),
        (0, 1.36, cz - 0.3),
    )
    # プロペラ：後ろ（−Y。ゲームの +Z）の、左右の中心
    prop = propeller(0.9, 0.14, accent, trim, (0, -1.48, cz), -1)
    return [body, prop, light]


def build_rover(m):
    W, H, L = SIZE["rover"]
    R, TW = 0.4, 0.34
    wx, wy = W / 2 - TW / 2, 0.92
    white = material("rover_body", srgb(0xF4F4F0), 0.5)
    teal = material("rover_panel", srgb(0x29B6C5), 0.45)  # 月の灰色の中で目立つ、水色
    solar = material("rover_solar", srgb(0x2A3F8F), 0.25, metallic=0.3)
    trim = material("rover_trim", srgb(0xFF8A1F), 0.5)  # 前の目印はオレンジ
    top = 1.02
    parts = [
        # 車体（底を上げて、タイヤを見せる）
        box((W - 0.5, L - 0.15, 0.5), (0, 0, top - 0.25), white, bevel=0.14),
        box((W - 0.46, L - 0.1, 0.1), (0, 0, top - 0.42), teal, bevel=0.04),
        # 前のバンパー（オレンジ）と後ろのバンパー（水色）で前後が分かる
        box((W - 0.6, 0.12, 0.2), (0, L / 2 - 0.05, top - 0.3), trim, bevel=0.05),
        box((W - 0.6, 0.12, 0.2), (0, -L / 2 + 0.05, top - 0.3), teal, bevel=0.05),
        # 丸い窓（キャビン。前寄り）
        box((1.0, 0.95, 0.46), (0, 0.45, top + 0.2), m["glass"], bevel=0.2),
        # 太陽電池の板（後ろ寄り）
        box((1.4, 0.8, 0.06), (0, -0.7, top + 0.05), solar, bevel=0.02),
        # アンテナ（高さ H まで）
        cylinder(0.04, 0.45, (0.45, -0.85, top + 0.3), (0, 0, 0), white, vertices=8),
        cylinder(0.22, 0.06, (0.45, -0.85, H - 0.03), (0, 0, 0), teal, vertices=20),
    ]
    # 前のライト（丸）と後ろのライト（横長）
    for x in (-0.45, 0.45):
        parts.append(cylinder(0.12, 0.08, (x, L / 2 - 0.08, top - 0.12), Y_AXIS, m["light"], vertices=16))
        parts.append(box((0.3, 0.08, 0.12), (x, -L / 2 + 0.08, top - 0.12), m["tail"], bevel=0.03))
    body = join(parts, "body")
    wheels = [
        wheel("wheel_FL", R, TW, m["tire"], teal, (-wx, wy, R)),
        wheel("wheel_FR", R, TW, m["tire"], teal, (wx, wy, R)),
        wheel("wheel_RL", R, TW, m["tire"], teal, (-wx, -wy, R)),
        wheel("wheel_RR", R, TW, m["tire"], teal, (wx, -wy, R)),
    ]
    return [body, *wheels]


BUILDERS = {"train": build_train, "plane": build_plane, "sub": build_sub, "rover": build_rover}


def triangles(objs):
    depsgraph = bpy.context.evaluated_depsgraph_get()
    total = 0
    for o in objs:
        mesh = o.evaluated_get(depsgraph).to_mesh()
        mesh.calc_loop_triangles()
        total += len(mesh.loop_triangles)
        o.evaluated_get(depsgraph).to_mesh_clear()
    return total


def bounds(objs):
    pts = [o.matrix_world @ v.co for o in objs for v in o.data.vertices]
    lo = [min(p[i] for p in pts) for i in range(3)]
    hi = [max(p[i] for p in pts) for i in range(3)]
    return {"width": round(hi[0] - lo[0], 3), "length": round(hi[1] - lo[1], 3), "height": round(hi[2] - lo[2], 3), "minZ": round(lo[2], 3)}


def clear_scene():
    # オブジェクトの名前はファイル全体で一意（2台目の body が body.001 になる）。そのため1台ずつ別のファイルで作る。
    # 消してよいのは、まだ保存していない新しいファイル（起動時の Cube など）か、このスクリプトが作った乗り物のファイルだけ
    current = Path(bpy.data.filepath).name if bpy.data.filepath else ""
    allowed = {"", "stage1-bake.blend"} | {f"{n}.blend" for n in BUILDERS}
    if current not in allowed:
        raise RuntimeError(f"開いているファイル {current!r} は消さない。新しいファイルにしてから実行する")
    for o in list(bpy.data.objects):
        bpy.data.objects.remove(o, do_unlink=True)
    for c in list(bpy.data.collections):
        bpy.data.collections.remove(c)
    bpy.data.orphans_purge(do_recursive=True)


def build():
    if bpy.context.object is not None and bpy.context.object.mode != "OBJECT":
        bpy.ops.object.mode_set(mode="OBJECT")
    out = {}
    for name in globals().get("ONLY") or list(BUILDERS):
        out[name] = build_one(name)
    return out


def build_one(name):
    clear_scene()
    common = {
        "glass": material("veh_glass", srgb(0x6FC8FF), 0.15),
        "tire": material("veh_tire", srgb(0x2B2B33), 0.9),
        "dark": material("veh_dark", srgb(0x3A3A46), 0.6),
        "light": material("veh_light", srgb(0xFFF7A8), 0.3, emission=srgb(0x665C10)),
        "tail": material("veh_tail", srgb(0xFF5C93), 0.4, emission=srgb(0x5A1430)),
    }
    save_path = str(_work_dir() / f"{name}.blend")
    if os.path.exists(save_path) and not globals().get("REBUILD", False):
        return {"ok": False, "error": f"{save_path} がある。作り直すなら REBUILD = True"}
    col = bpy.data.collections.new(name)
    bpy.context.scene.collection.children.link(col)
    bpy.context.view_layer.active_layer_collection = bpy.context.view_layer.layer_collection.children[col.name]
    objs = BUILDERS[name](common)
    bpy.ops.wm.save_as_mainfile(filepath=save_path)
    return {
        "ok": True,
        "objects": sorted(o.name for o in col.objects),
        "triangles": triangles(objs),
        "bounds": bounds(objs),
        "rotations_zero": all(tuple(o.rotation_euler) == (0.0, 0.0, 0.0) for o in objs),
        "saved": save_path,
    }


result = build()
print(result)
