# NORI-59：ステージ2の景色のモデル（山3種・駅）を組み立てる。専用ユーザー（noriblender）の Blender の中で実行する。
# 形はオリジナル。並び・起伏は決まった式（sin の重ね合わせ）で作り、乱数を使わない（何度作っても同じ形）。
#
# - 山（mountain-a・b・c）：底の半径 1・高さ 1 の単位の形。ゲームで今の山の半径・高さに引き伸ばす。
#   色は頂点の色（下が草の緑、中ほどが岩の灰色。mountain-c だけ上 25% が雪。高さ 60 m を超える山に使う）
# - 駅（station）：ホームの上の部分（柱・屋根・ベンチ・文字のない看板・黄色い線・柵）。原点はホームの上の面の中心。
#   線路は −X の側（ゲームの station グループと同じ向き。前は +Y＝glTF の −Z）。ホームの台と旗はゲームのまま
#
# 大きさ・名前は ASSET.landmark（docs/game-rules.md「景色と列車を増やす」）と同じ。
# 1つずつ blender-work/<名前>.blend に保存する。書き出しは export-glb.py（NAME に mountain-a などを渡す）。
#
# 使い方：blender-work/tools/ に写してから、空のファイル（read_homefile）にした**あとの別の実行**で
#   runpy.run_path(r"<リポジトリ>\blender-work\tools\build-stage2-models.py", init_globals={"REBUILD": True, "ONLY": ["mountain-a"]})
import math
import os
from pathlib import Path

import bmesh
import bpy

SIZE = {
    "mountain-a": (2.0, 1.0, 2.0),
    "mountain-b": (2.0, 1.0, 2.0),
    "mountain-c": (2.0, 1.0, 2.0),
    "station": (3.6, 3.0, 12.6),
}


def _work_dir():
    here = Path(globals().get("__file__", "")).resolve().parent
    work = here.parent if here.name == "tools" else Path.cwd()
    if work.name != "blender-work":
        raise RuntimeError("blender-work/tools/ に写してから runpy.run_path で実行する")
    return work


def srgb(hex_value):
    def lin(c):
        c = c / 255
        return c / 12.92 if c <= 0.04045 else ((c + 0.055) / 1.055) ** 2.4

    return tuple(lin((hex_value >> s) & 0xFF) for s in (16, 8, 0))


def material(name, rgb, roughness=0.8, vertex_color=False):
    mat = bpy.data.materials.get(name) or bpy.data.materials.new(name)
    mat.use_nodes = True
    nodes = mat.node_tree.nodes
    bsdf = next(n for n in nodes if n.type == "BSDF_PRINCIPLED")
    inputs = {s.identifier: s for s in bsdf.inputs}
    inputs["Base Color"].default_value = (*rgb, 1.0)
    inputs["Roughness"].default_value = roughness
    if vertex_color:
        # 頂点の色（Col）をそのまま色にする（glTF では COLOR_0 として書き出される）
        attr = nodes.new("ShaderNodeVertexColor")
        attr.layer_name = "Col"
        mat.node_tree.links.new(attr.outputs[0], inputs["Base Color"])
    return mat


def box(size, center, mat, bevel=0.0):
    bpy.ops.mesh.primitive_cube_add(size=1, location=center)
    obj = bpy.context.object
    obj.scale = size
    bpy.ops.object.transform_apply(location=False, rotation=False, scale=True)
    obj.data.materials.append(mat)
    if bevel > 0:
        mod = obj.modifiers.new("Bevel", "BEVEL")
        mod.width = bevel
        mod.segments = 2
        bpy.context.view_layer.objects.active = obj
        bpy.ops.object.modifier_apply(modifier=mod.name)
    return obj


def cylinder(radius, depth, center, mat, vertices=10):
    bpy.ops.mesh.primitive_cylinder_add(vertices=vertices, radius=radius, depth=depth, location=center)
    obj = bpy.context.object
    obj.data.materials.append(mat)
    return obj


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


# ---- 山 ----
# 起伏：向き a・高さ h ごとの半径の倍率。variant ごとに係数を変える（決まった値）
MOUNTAIN = {
    "mountain-a": {"waves": [(3, 0.10, 0.4), (7, 0.05, 1.3), (12, 0.03, 2.1)], "power": 1.15, "snow": False},
    "mountain-b": {"waves": [(2, 0.14, 0.9), (5, 0.06, 0.2), (11, 0.03, 1.7)], "power": 1.35, "snow": False},
    "mountain-c": {"waves": [(4, 0.08, 1.1), (9, 0.05, 0.6), (13, 0.025, 2.5)], "power": 1.25, "snow": True},
}
RINGS, SEGMENTS = 14, 32
GRASS, ROCK, SNOW = srgb(0x6F8F4E), srgb(0x857F74), srgb(0xF4F6F8)


def build_mountain(name):
    spec = MOUNTAIN[name]
    mesh = bpy.data.meshes.new(name)
    bm = bmesh.new()
    rings = []
    for k in range(RINGS):
        h = k / RINGS
        ring = []
        for i in range(SEGMENTS):
            a = 2 * math.pi * i / SEGMENTS
            # 起伏は底（h = 0）で 0（底は半径 1 の円のまま）、上へ行くほど大きく
            bump = sum(amp * math.sin(n * a + ph + h * 3.0) for n, amp, ph in spec["waves"]) * min(1.0, h * 3)
            r = (1 - h) ** spec["power"] * (1 + bump)
            ring.append(bm.verts.new((math.cos(a) * r, math.sin(a) * r, h)))
        rings.append(ring)
    top = bm.verts.new((0.0, 0.0, 1.0))
    for k in range(RINGS - 1):
        for i in range(SEGMENTS):
            j = (i + 1) % SEGMENTS
            bm.faces.new((rings[k][i], rings[k][j], rings[k + 1][j], rings[k + 1][i]))
    for i in range(SEGMENTS):
        bm.faces.new((rings[-1][i], rings[-1][(i + 1) % SEGMENTS], top))
    bmesh.ops.triangulate(bm, faces=bm.faces[:])
    bm.normal_update()
    bm.to_mesh(mesh)
    bm.free()
    # 頂点の色：高さと、ゆらした境目で、草 → 岩 → 雪。
    # 属性の .color は線形の値を受け取る（bmesh の色の層に線形の値を入れると、sRGB とみなされて暗くなった。11/12）。
    # 書き出す色を1つに決めるため、使う色（active・render）にも指定する
    attr = mesh.color_attributes.new("Col", "BYTE_COLOR", "CORNER")
    mesh.color_attributes.active_color = attr
    mesh.color_attributes.render_color_index = mesh.color_attributes.active_color_index
    for loop in mesh.loops:
        v = mesh.vertices[loop.vertex_index].co
        a = math.atan2(v.y, v.x)
        line_rock = 0.35 + 0.08 * math.sin(a * 5)
        line_snow = 0.75 + 0.04 * math.sin(a * 7)
        c = GRASS
        if v.z > line_rock:
            c = ROCK
        if spec["snow"] and v.z > line_snow:
            c = SNOW
        attr.data[loop.index].color = (*c, 1.0)
    obj = bpy.data.objects.new("body", mesh)
    bpy.context.collection.objects.link(obj)
    obj.data.materials.append(material("mountain", (1, 1, 1), 0.95, vertex_color=True))
    # 大きさ：底の幅・奥行き 2、高さ 1（起伏で底の円からはみ出さない。底は h = 0 で起伏 0）
    bpy.context.view_layer.objects.active = obj
    obj.select_set(True)
    bpy.ops.object.shade_smooth()
    return [obj]


# ---- 駅（ホームの上） ----


def build_station(_name):
    W, H, L = SIZE["station"]
    roof = material("station_roof", srgb(0xD8574A), 0.7)
    pole = material("station_pole", srgb(0xF4F1EA), 0.6)
    wood = material("station_bench", srgb(0x9C6B43), 0.8)
    metal = material("station_metal", srgb(0x5B6470), 0.5)
    sign = material("station_sign", srgb(0x2F6FB5), 0.5)
    signb = material("station_sign_border", srgb(0xFFFFFF), 0.5)
    line = material("station_line", srgb(0xF2C232), 0.6)
    parts = []
    # 柱（4本）と屋根（少し山形。2枚の板）
    for x in (-1.1, 1.1):
        for y in (-5.0, 5.0):
            parts.append(cylinder(0.08, 2.6, (x, y, 1.3), pole))
    for s in (-1, 1):
        plate = box((W / 2 + 0.05, L, 0.14), (s * W / 4, 0, 2.75), roof, bevel=0.03)
        # Y 軸まわりに +θ 回すと、+X の端が下がる（x' = x cosθ + z sinθ、z' = −x sinθ + z cosθ）
        plate.rotation_euler = (0, s * 0.12, 0)
        bpy.context.view_layer.objects.active = plate
        bpy.ops.object.transform_apply(location=False, rotation=True, scale=False)
        parts.append(plate)
    parts.append(box((0.2, L, 0.12), (0, 0, H - 0.06), roof))  # 棟
    # ベンチ（2つ。ホームの奥側）
    for y in (-2.5, 2.5):
        parts.append(box((0.5, 1.6, 0.08), (0.7, y, 0.45), wood, bevel=0.02))
        parts.append(box((0.08, 1.6, 0.45), (0.95, y, 0.72), wood, bevel=0.02))
        for dy in (-0.7, 0.7):
            parts.append(box((0.4, 0.06, 0.42), (0.7, y + dy, 0.21), metal))
    # 看板（文字なし）：屋根から下げた青い板と白い縁
    parts.append(box((0.06, 1.8, 0.6), (0, 0, 2.15), signb))
    parts.append(box((0.08, 1.6, 0.44), (0, 0, 2.15), sign))
    for y in (-0.7, 0.7):
        parts.append(cylinder(0.02, 0.3, (0, y, 2.55), metal, vertices=6))
    # 黄色い線（線路の側の縁）と、奥の柵
    parts.append(box((0.25, L - 0.4, 0.02), (-1.2, 0, 0.01), line))
    parts.append(box((0.05, L - 0.4, 0.05), (1.45, 0, 0.9), metal))
    parts.append(box((0.05, L - 0.4, 0.05), (1.45, 0, 0.5), metal))
    for y in range(-6, 7, 2):
        parts.append(box((0.06, 0.06, 0.9), (1.45, y * 0.95, 0.45), metal))
    return [join(parts, "body")]


BUILDERS = {
    "mountain-a": build_mountain,
    "mountain-b": build_mountain,
    "mountain-c": build_mountain,
    "station": build_station,
}


def triangles(objs):
    depsgraph = bpy.context.evaluated_depsgraph_get()
    total = 0
    for o in objs:
        m = o.evaluated_get(depsgraph).to_mesh()
        m.calc_loop_triangles()
        total += len(m.loop_triangles)
        o.evaluated_get(depsgraph).to_mesh_clear()
    return total


def bounds(objs):
    pts = [o.matrix_world @ v.co for o in objs for v in o.data.vertices]
    lo = [min(p[i] for p in pts) for i in range(3)]
    hi = [max(p[i] for p in pts) for i in range(3)]
    return {"width": round(hi[0] - lo[0], 3), "length": round(hi[1] - lo[1], 3), "height": round(hi[2] - lo[2], 3), "minZ": round(lo[2], 3)}


def clear_scene():
    current = Path(bpy.data.filepath).name if bpy.data.filepath else ""
    allowed = {""} | {f"{n}.blend" for n in BUILDERS}
    if current not in allowed:
        raise RuntimeError(f"開いているファイル {current!r} は消さない。新しいファイルにしてから実行する")
    for o in list(bpy.data.objects):
        bpy.data.objects.remove(o, do_unlink=True)
    for c in list(bpy.data.collections):
        bpy.data.collections.remove(c)
    bpy.data.orphans_purge(do_recursive=True)


def build_one(name):
    clear_scene()
    save_path = str(_work_dir() / f"{name}.blend")
    if os.path.exists(save_path) and not globals().get("REBUILD", False):
        return {"ok": False, "error": f"{save_path} がある。作り直すなら REBUILD = True"}
    col = bpy.data.collections.new(name)
    bpy.context.scene.collection.children.link(col)
    bpy.context.view_layer.active_layer_collection = bpy.context.view_layer.layer_collection.children[col.name]
    objs = BUILDERS[name](name)
    bpy.ops.wm.save_as_mainfile(filepath=save_path)
    return {"ok": True, "objects": sorted(o.name for o in col.objects), "triangles": triangles(objs), "bounds": bounds(objs), "saved": save_path}


result = {name: build_one(name) for name in (globals().get("ONLY") or list(BUILDERS))}
print(result)
