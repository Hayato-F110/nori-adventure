# NORI-61：ステージ1の街をにぎやかにするモデル7種類を組み立てる。専用ユーザー（noriblender）の Blender の中で実行する。
# ほかの車・バス・パトカー・消防車・人・自転車・バイク。すべてオリジナル（実在の会社の色・文字・マークを使わない。顔は付けない）。
# 大きさは docs/game-rules.md「街をにぎやかに」の表（下の SIZE。ゲーム側の ASSET.city と同じ）。
# 形は build-vehicles.py と同じ、角を丸めたおもちゃのような形。部品は1つの body にまとめる（回る部品はない）。
# ランプ（パトカー・消防車）は素材の名前 lamp_red・lamp_blue で、ゲームが光らせ方を変える。人の服は素材 shirt を塗りかえる。
#
# Blender の座標：前 +Y、左 −X、上 +Z（書き出すと glTF の前 −Z・上 +Y）。原点は底の中心。
# 1種類ずつ blender-work/<名前>.blend に保存する。書き出しは export-glb.py（NAME に bus などを渡す）。
#
# 使い方：blender-work/tools/ に写してから
#   runpy.run_path(r"<リポジトリ>\blender-work\tools\build-city-models.py", init_globals={"REBUILD": True, "ONLY": ["bus"]})
import math
import os
from pathlib import Path

import bpy
from mathutils import Vector

# ASSET.city.sizes.<名前>（幅・高さ・長さ）
SIZE = {
    "traffic-car": (1.8, 1.5, 4.2),
    "bus": (2.5, 3.2, 10.0),
    "police": (1.8, 1.6, 4.4),
    "fire-truck": (2.4, 3.0, 8.0),
    "person": (0.6, 1.6, 0.4),
    "bicycle": (0.6, 1.6, 1.7),
    "motorbike": (0.8, 1.6, 2.0),
}


def _work_dir():
    # 作業フォルダ = このファイルの置き場所（blender-work/tools）の1つ上。パスを直接書かない
    here = Path(globals().get("__file__", "")).resolve().parent
    work = here.parent if here.name == "tools" else Path.cwd()
    if work.name != "blender-work":
        raise RuntimeError("blender-work/tools/ に写してから runpy.run_path で実行する")
    return work


# ---- 部品を作る道具（build-vehicles.py と同じ） ----


def material(name, rgb, roughness=0.55, emission=None):
    mat = bpy.data.materials.get(name) or bpy.data.materials.new(name)
    mat.use_nodes = True
    # ノードの名前は Blender の言語で翻訳されることがある。種類と識別子で探す
    bsdf = next(n for n in mat.node_tree.nodes if n.type == "BSDF_PRINCIPLED")
    inputs = {s.identifier: s for s in bsdf.inputs}
    inputs["Base Color"].default_value = (*rgb, 1.0)
    inputs["Roughness"].default_value = roughness
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


def finish(obj, mat, bevel=0.0, segments=2):
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


def box(size, center, mat, bevel=0.0):
    bpy.ops.mesh.primitive_cube_add(size=1, location=center)
    obj = bpy.context.object
    obj.scale = size
    bpy.ops.object.transform_apply(location=False, rotation=False, scale=True)
    return finish(obj, mat, bevel)


def cylinder(radius, depth, center, rotation, mat, vertices=16):
    bpy.ops.mesh.primitive_cylinder_add(vertices=vertices, radius=radius, depth=depth, location=center, rotation=rotation)
    obj = bpy.context.object
    bpy.ops.object.transform_apply(location=False, rotation=True, scale=True)
    return finish(obj, mat)


def sphere(radius, center, mat, segments=12, rings=8):
    bpy.ops.mesh.primitive_uv_sphere_add(segments=segments, ring_count=rings, radius=radius, location=center)
    obj = bpy.context.object
    bpy.ops.object.transform_apply(location=False, rotation=False, scale=True)
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


X_AXIS = (0, math.pi / 2, 0)  # 円柱の軸を左右（X）に


def wheels(radius, width, x, ys, tire):
    """左右の車輪（回さないので body に入れる）。x は中心から車輪の真ん中まで"""
    return [cylinder(radius, width, (sx * x, y, radius), X_AXIS, tire) for y in ys for sx in (-1, 1)]


def lamps(z, y, gap, size=(0.34, 0.26, 0.16)):
    """屋根のランプ2つ（左が赤、右が青）。素材の名前でゲームが光らせ方を変える"""
    red = material("lamp_red", srgb(0xFF3B3B), 0.3, emission=srgb(0x5A0A0A))
    blue = material("lamp_blue", srgb(0x3B7BFF), 0.3, emission=srgb(0x0A1F5A))
    base = material("lamp_base", srgb(0x2B2B33), 0.6)
    w, d, h = size
    return [
        box((gap * 2 + w * 2 + 0.1, d + 0.06, 0.06), (0, y, z + 0.03), base),
        box((w, d, h), (-gap - w / 2, y, z + 0.06 + h / 2), red, bevel=0.04),
        box((w, d, h), (gap + w / 2, y, z + 0.06 + h / 2), blue, bevel=0.04),
    ]


ARM_WIDTH = 0.1  # 腕の太さ（人の腕と同じ。乗る人は RIDER_SCALE 倍）


def arms(m, shoulder, hand, hand_x):
    """肩（y, z）から手（y, z）までの左右2本の腕。肩は胴の幅の内側、手はハンドルの左右（±hand_x）。
    箱を Y 向きに作り、肩 → 手の向きに回す（11/13：1枚の板に見えたので2本に分けた）"""
    s = RIDER_SCALE
    w = ARM_WIDTH * s
    shoulder_x = 0.21 * s - w / 2  # 胴の幅 0.42 の半分から腕の半分を引く
    (y0, z0), (y1, z1) = shoulder, hand
    objs = []
    for sx in (-1, 1):
        a = Vector((sx * shoulder_x, y0, z0))
        b = Vector((sx * hand_x, y1, z1))
        d = b - a
        obj = box((w, d.length, w), tuple((a + b) / 2), m["shirt"], bevel=0.03)
        obj.rotation_euler = Vector((0, 1, 0)).rotation_difference(d.normalized()).to_euler()
        bpy.ops.object.select_all(action="DESELECT")
        obj.select_set(True)
        bpy.context.view_layer.objects.active = obj
        bpy.ops.object.transform_apply(location=False, rotation=True, scale=False)
        objs.append(obj)
    return objs


def fork(axle, handle, mat, width=0.05):
    """前の車輪の軸（y, z）からハンドル（y, z）までの棒"""
    (y0, z0), (y1, z1) = axle, handle
    length = math.hypot(y1 - y0, z1 - z0)
    obj = box((width, width, length), (0, (y0 + y1) / 2, (z0 + z1) / 2), mat)
    obj.rotation_euler = (-math.atan2(y1 - y0, z1 - z0), 0, 0)
    bpy.ops.object.transform_apply(location=False, rotation=True, scale=False)
    return obj


RIDER_SCALE = 0.85  # 乗る人は少し小さく（自転車・バイクの高さ 1.6 m に収める。人の高さ 1.6 m の 0.85 倍で座る）


def rider(m, seat_z, seat_y, lean, handle, hand_x, helmet=False):
    """自転車・バイクに乗る人（座った形）。seat_z は座る面の高さ。大きさと位置は RIDER_SCALE 倍。
    腕は肩からハンドル（handle = (y, z)、左右は ±hand_x）まで伸ばす"""
    s = RIDER_SCALE
    shirt = m["shirt"]

    def at(dy, dz):
        return (0, seat_y + dy * s, seat_z + dz * s)

    def sz(w, d, h):
        return (w * s, d * s, h * s)

    parts = [
        # 太もも（前へ）・すね（下へ）
        box(sz(0.34, 0.42, 0.14), at(0.18, 0.07), m["pants"], bevel=0.04),
        box(sz(0.3, 0.14, 0.42), at(0.36, -0.2), m["pants"], bevel=0.04),
        # 胴（少し前へ傾ける）
        box(sz(0.42, 0.24, 0.5), at(lean, 0.37), shirt, bevel=0.05),
        # 腕（肩からハンドルまで）。肩は胴の前の上
        *arms(m, (seat_y + (lean + 0.12) * s, seat_z + 0.55 * s), handle, hand_x),
        # 頭
        sphere(0.14 * s, at(lean + 0.02, 0.78), m["skin"]),
    ]
    if helmet:
        parts.append(sphere(0.17 * s, at(lean + 0.02, 0.82), m["helmet"]))
    else:
        parts.append(sphere(0.145 * s, at(lean, 0.83), m["hair"]))
    return parts


# ---- 7種類 ----


def build_traffic_car(m):
    W, H, L = SIZE["traffic-car"]
    paint = material("traffic_car_body", srgb(0x4A90D9), 0.45)  # 空より濃い青。子どもの車（赤）と違う色
    R = 0.33
    parts = [
        box((W, L, 0.62), (0, 0, 0.2 + 0.31), paint, bevel=0.12),
        box((W - 0.24, 2.1, 0.5), (0, -0.25, 0.82 + 0.25), m["glass"], bevel=0.1),
        box((W - 0.3, 2.0, 0.08), (0, -0.25, H - 0.04), paint, bevel=0.03),
        box((W - 0.3, 0.08, 0.14), (0, L / 2 - 0.04, 0.6), m["light"]),
        box((W - 0.3, 0.08, 0.14), (0, -L / 2 + 0.04, 0.6), m["tail"]),
        *wheels(R, 0.26, W / 2 - 0.13, (1.35, -1.35), m["tire"]),
    ]
    return join(parts, "body")


def build_bus(m):
    W, H, L = SIZE["bus"]
    paint = material("bus_body", srgb(0x3FAE8C), 0.5)  # 若葉色（実在の会社の色に寄せない）
    white = material("bus_band", srgb(0xF4F1E8), 0.6)
    R = 0.5
    parts = [
        box((W, L, 2.5), (0, 0, 0.45 + 1.25), paint, bevel=0.15),
        box((W - 0.2, L - 0.4, 0.25), (0, 0, H - 0.125), white, bevel=0.08),
        # 窓の帯（左右と前）。文字は付けない
        box((W + 0.02, L - 1.6, 0.8), (0, -0.3, 2.0), m["glass"]),
        box((W - 0.3, 0.06, 0.9), (0, L / 2, 1.95), m["glass"]),
        # 左側（−X）の乗り口
        box((0.04, 1.0, 1.6), (-W / 2 - 0.01, L / 2 - 2.0, 1.25), m["dark"]),
        box((W - 0.4, 0.06, 0.16), (0, L / 2 + 0.01, 0.75), m["light"]),
        box((W - 0.4, 0.06, 0.16), (0, -L / 2 - 0.01, 0.75), m["tail"]),
        *wheels(R, 0.32, W / 2 - 0.18, (3.4, -3.2), m["tire"]),
    ]
    return join(parts, "body")


def build_police(m):
    W, H, L = SIZE["police"]
    white = material("police_white", srgb(0xF4F6F8), 0.45)
    navy = material("police_navy", srgb(0x24345C), 0.5)
    R = 0.33
    parts = [
        box((W, L, 0.3), (0, 0, 0.2 + 0.15), navy, bevel=0.1),
        box((W, L, 0.34), (0, 0, 0.5 + 0.17), white, bevel=0.1),
        box((W - 0.24, 2.2, 0.48), (0, -0.2, 0.84 + 0.24), m["glass"], bevel=0.1),
        box((W - 0.3, 2.1, 0.06), (0, -0.2, 1.35), white, bevel=0.02),
        *lamps(1.38, -0.1, 0.06),
        box((W - 0.3, 0.08, 0.12), (0, L / 2 - 0.04, 0.62), m["light"]),
        box((W - 0.3, 0.08, 0.12), (0, -L / 2 + 0.04, 0.62), m["tail"]),
        *wheels(R, 0.26, W / 2 - 0.13, (1.45, -1.45), m["tire"]),
    ]
    return join(parts, "body")


def build_fire_truck(m):
    W, H, L = SIZE["fire-truck"]
    red = material("fire_red", srgb(0xD8343A), 0.45)
    metal = material("fire_metal", srgb(0xC9CCD3), 0.35)
    R = 0.5
    cab_l = 2.2
    parts = [
        # 運転台（前）と荷台（後ろ）
        # 運転台の屋根 0.45 + 2.3 = 2.75。ランプの上 2.75 + 0.06 + 0.16 = 2.97（高さ 3.0 m）
        box((W, cab_l, 2.3), (0, L / 2 - cab_l / 2, 0.45 + 1.15), red, bevel=0.15),
        box((W - 0.2, 0.06, 0.8), (0, L / 2, 2.0), m["glass"]),
        box((W + 0.02, 1.2, 0.7), (0, L / 2 - 0.9, 2.0), m["glass"]),
        box((W, L - cab_l - 0.2, 1.7), (0, -cab_l / 2 - 0.1, 0.45 + 0.85), red, bevel=0.12),
        # 横の白い線（文字なし）
        box((W + 0.02, L - cab_l - 0.6, 0.12), (0, -cab_l / 2 - 0.1, 1.2), metal),
        *lamps(2.75, L / 2 - cab_l / 2, 0.1),
        # はしご（2本のレールと横木）
        box((0.08, L - 2.6, 0.08), (-0.45, -0.6, 2.25), metal),
        box((0.08, L - 2.6, 0.08), (0.45, -0.6, 2.25), metal),
        *[box((0.9, 0.06, 0.06), (0, -0.6 + y, 2.25), metal) for y in (-2.0, -1.2, -0.4, 0.4, 1.2, 2.0)],
        box((W - 0.4, 0.06, 0.16), (0, L / 2 + 0.01, 0.75), m["light"]),
        *wheels(R, 0.34, W / 2 - 0.2, (2.6, -1.6, -2.7), m["tire"]),
    ]
    return join(parts, "body")


def build_person(m):
    W, H, L = SIZE["person"]
    parts = [
        # 脚（2本）と靴（前へ出して、前後の長さ 0.38 m）
        box((0.16, 0.2, 0.74), (-0.1, 0, 0.37), m["pants"], bevel=0.05),
        box((0.16, 0.2, 0.74), (0.1, 0, 0.37), m["pants"], bevel=0.05),
        box((0.17, 0.38, 0.1), (-0.1, 0.03, 0.05), m["dark"], bevel=0.03),
        box((0.17, 0.38, 0.1), (0.1, 0.03, 0.05), m["dark"], bevel=0.03),
        # 胴と腕
        box((0.4, 0.26, 0.56), (0, 0, 0.74 + 0.28), m["shirt"], bevel=0.07),
        box((0.1, 0.16, 0.52), (-0.25, 0, 0.74 + 0.28), m["shirt"], bevel=0.04),
        box((0.1, 0.16, 0.52), (0.25, 0, 0.74 + 0.28), m["shirt"], bevel=0.04),
        # 頭と髪
        sphere(0.14, (0, 0.01, 1.44), m["skin"]),
        sphere(0.145, (0, -0.02, 1.47), m["hair"]),
    ]
    return join(parts, "body")


def build_bicycle(m):
    W, H, L = SIZE["bicycle"]
    frame = material("bicycle_frame", srgb(0xFF9F1C), 0.4)
    R = 0.34
    parts = [
        cylinder(R, 0.06, (0, 0.5, R), X_AXIS, m["tire"], vertices=20),
        cylinder(R, 0.06, (0, -0.5, R), X_AXIS, m["tire"], vertices=20),
        box((0.06, 1.0, 0.06), (0, 0, 0.62), frame),
        box((0.06, 0.06, 0.5), (0, -0.1, 0.55), frame),
        fork((0.5, R), (0.45, 0.88), frame),  # 前の車輪からハンドルまで
        box((0.6, 0.06, 0.05), (0, 0.45, 0.88), m["dark"]),  # ハンドル（幅 0.6 m）
        box((0.16, 0.26, 0.05), (0, -0.12, 0.725), m["dark"]),  # サドル（上の面 0.75 m に人が座る）
        *rider(m, 0.75, -0.12, 0.08, (0.45, 0.88), hand_x=0.25),  # 手はハンドル（幅 0.6）の端から 0.05 内側
    ]
    return join(parts, "body")


def build_motorbike(m):
    W, H, L = SIZE["motorbike"]
    paint = material("motorbike_body", srgb(0x7C5CE0), 0.4)
    R = 0.33
    parts = [
        cylinder(R, 0.14, (0, 0.62, R), X_AXIS, m["tire"], vertices=20),
        cylinder(R, 0.16, (0, -0.62, R), X_AXIS, m["tire"], vertices=20),
        box((0.36, 1.1, 0.34), (0, 0, 0.58), paint, bevel=0.1),
        box((0.3, 0.5, 0.2), (0, 0.38, 0.82), paint, bevel=0.08),  # 燃料タンク
        fork((0.62, R), (0.55, 0.98), m["dark"], width=0.08),  # 前の車輪からハンドルまで
        box((0.8, 0.06, 0.06), (0, 0.55, 0.98), m["dark"]),  # ハンドル
        box((0.16, 0.08, 0.14), (0, 0.66, 0.8), m["light"]),  # ライト（フォークの前）
        box((0.3, 0.5, 0.08), (0, -0.2, 0.8), m["dark"]),  # 座席（上の面 0.84 m に人が座る）
        *rider(m, 0.84, -0.2, 0.12, (0.55, 0.98), hand_x=0.33, helmet=True),  # 手はハンドル（幅 0.8）の端から 0.07 内側
    ]
    return join(parts, "body")


BUILDERS = {
    "traffic-car": build_traffic_car,
    "bus": build_bus,
    "police": build_police,
    "fire-truck": build_fire_truck,
    "person": build_person,
    "bicycle": build_bicycle,
    "motorbike": build_motorbike,
}


def triangles(obj):
    depsgraph = bpy.context.evaluated_depsgraph_get()
    mesh = obj.evaluated_get(depsgraph).to_mesh()
    mesh.calc_loop_triangles()
    total = len(mesh.loop_triangles)
    obj.evaluated_get(depsgraph).to_mesh_clear()
    return total


def bounds(obj):
    pts = [obj.matrix_world @ v.co for v in obj.data.vertices]
    lo = [min(p[i] for p in pts) for i in range(3)]
    hi = [max(p[i] for p in pts) for i in range(3)]
    return {
        "width": round(hi[0] - lo[0], 3),
        "length": round(hi[1] - lo[1], 3),
        "height": round(hi[2] - lo[2], 3),
        "minZ": round(lo[2], 3),
        "centerX": round((hi[0] + lo[0]) / 2, 3),
        "centerY": round((hi[1] + lo[1]) / 2, 3),
    }


def clear_scene():
    # 消してよいのは、まだ保存していない新しいファイルか、このスクリプトや乗り物のスクリプトが作ったファイルだけ
    current = Path(bpy.data.filepath).name if bpy.data.filepath else ""
    known = set(BUILDERS) | {"train", "train-commuter", "train-bullet", "plane", "sub", "rover"}
    known |= {"mountain-a", "mountain-b", "mountain-c", "station", "stage2-models"}
    allowed = {""} | {f"{n}.blend" for n in known}
    if current not in allowed:
        raise RuntimeError(f"開いているファイル {current!r} は消さない。新しいファイルにしてから実行する")
    for o in list(bpy.data.objects):
        bpy.data.objects.remove(o, do_unlink=True)
    for c in list(bpy.data.collections):
        bpy.data.collections.remove(c)
    bpy.data.orphans_purge(do_recursive=True)


def build_one(name):
    save_path = str(_work_dir() / f"{name}.blend")
    if os.path.exists(save_path) and not globals().get("REBUILD", False):
        return {"ok": False, "error": f"{save_path} がある。作り直すなら REBUILD = True"}
    clear_scene()
    common = {
        "glass": material("veh_glass", srgb(0x6FC8FF), 0.15),
        "tire": material("veh_tire", srgb(0x2B2B33), 0.9),
        "dark": material("veh_dark", srgb(0x3A3A46), 0.6),
        "light": material("veh_light", srgb(0xFFF7A8), 0.3, emission=srgb(0x665C10)),
        "tail": material("veh_tail", srgb(0xFF5C93), 0.4, emission=srgb(0x5A1430)),
        # 人：服（shirt）はゲームが6色に塗りかえる。ここでは見本の色
        "shirt": material("shirt", srgb(0xF2B33D), 0.7),
        "pants": material("pants", srgb(0x3C4A6B), 0.8),
        "skin": material("skin", srgb(0xE0B48A), 0.7),
        "hair": material("hair", srgb(0x3B2A20), 0.8),
        "helmet": material("helmet", srgb(0xF4F6F8), 0.3),
    }
    col = bpy.data.collections.new(name)
    bpy.context.scene.collection.children.link(col)
    bpy.context.view_layer.active_layer_collection = bpy.context.view_layer.layer_collection.children[col.name]
    body = BUILDERS[name](common)
    bpy.ops.wm.save_as_mainfile(filepath=save_path)
    want = dict(zip(("width", "height", "length"), SIZE[name]))
    got = bounds(body)
    return {
        "ok": True,
        "triangles": triangles(body),
        "bounds": got,
        "want": want,
        "within10pct": all(abs(got[k] - want[k]) <= want[k] * 0.1 for k in want),
        "materials": sorted({s.material.name for s in body.material_slots if s.material}),
        "saved": save_path,
    }


def build():
    if bpy.context.object is not None and bpy.context.object.mode != "OBJECT":
        bpy.ops.object.mode_set(mode="OBJECT")
    return {name: build_one(name) for name in globals().get("ONLY") or list(BUILDERS)}


result = build()
