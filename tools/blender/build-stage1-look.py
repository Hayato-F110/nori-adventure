# NORI-56：ステージ1の「リアル寄りの見た目」の試作。専用ユーザー（noriblender）の Blender の中で実行する。
# ゲームと同じ配置（core の createStage1Layout を JSON に書き出したもの）に、CC0 の PBR テクスチャ・HDRI の空・
# AgX の色の処理をつけて、EEVEE（リアルタイム向けの描き方）で、ゲームのスタート地点と同じカメラから1枚描く。
#
# 座標：ゲーム（three.js）は x 右・y 上・z 手前。Blender は x 右・y 奥・z 上 → (x, -z, y)。単位は m。
# 素材はリポジトリの blender-work/assets/（noriblender が読める唯一の場所）。出所とライセンスは各フォルダの asset.json。
#
# 使い方：blender-work/tools/ に写してから import runpy; runpy.run_path(r"<リポジトリ>\blender-work\tools\build-stage1-look.py")
#   コレクション stage1_look の中だけを作り直す（ほかの物には触らない）。
import json
import math
import os

import bpy
import bmesh

from pathlib import Path


def _work_dir():
    # 作業フォルダ = このファイルの置き場所（blender-work/tools）の1つ上。パスを直接書かない
    here = Path(globals().get("__file__", "")).resolve().parent
    work = here.parent if here.name == "tools" else Path.cwd()
    if work.name != "blender-work":
        raise RuntimeError("blender-work/tools/ に写してから runpy.run_path で実行する")
    return work


WORK = _work_dir()
ASSETS = str(WORK / "assets")
OUT = str(WORK / "renders" / "stage1-after.png")
COLL = "stage1_look"
# ゲームの建物の色（src/render/city.ts の BUILDING_COLORS と同じ）。白い外壁に乗せて、色で見分けられるようにする
BUILDING_COLORS = [0xFFD166, 0x8ECAE6, 0xF4978E, 0xB5E48C, 0xCDB4DB, 0xFFFFFF]

with open(os.path.join(ASSETS, "stage1-layout.json"), encoding="utf-8") as f:
    LAYOUT = json.load(f)
STAGE = LAYOUT["stage"]
CAM = LAYOUT["camera"]


def srgb(hex_value):
    def lin(c):
        c = c / 255
        return c / 12.92 if c <= 0.04045 else ((c + 0.055) / 1.055) ** 2.4

    return (lin((hex_value >> 16) & 255), lin((hex_value >> 8) & 255), lin(hex_value & 255), 1.0)


def to_bl(x, y, z):
    return (x, -z, y)


# ---- コレクション（自分のものだけ作り直す） ----
coll = bpy.data.collections.get(COLL)
if coll is None:
    coll = bpy.data.collections.new(COLL)
    bpy.context.scene.collection.children.link(coll)
for ob in list(coll.objects):
    bpy.data.objects.remove(ob, do_unlink=True)
# ほかのコレクション（車の作業用など）は描かない
for c in bpy.context.scene.collection.children:
    if c.name != COLL:
        c.hide_render = True


def link(ob):
    coll.objects.link(ob)
    return ob


# ---- 材質 ----
def bsdf_of(mat):
    return next(n for n in mat.node_tree.nodes if n.type == "BSDF_PRINCIPLED")


def inp(node, ident):
    return next(s for s in node.inputs if s.identifier == ident)


def find(folder, suffix):
    d = os.path.join(ASSETS, folder)
    for name in os.listdir(d):
        if name.endswith(suffix):
            return os.path.join(d, name)
    return None


def pbr(name, folder, size_m, tint=None, roughness_scale=1.0, roughness_const=None):
    """box 投影（物体の座標 = m）で、size_m ごとに1枚くり返す PBR の材質"""
    mat = bpy.data.materials.get(name) or bpy.data.materials.new(name)
    mat.use_nodes = True
    nt = mat.node_tree
    for n in list(nt.nodes):
        if n.type != "OUTPUT_MATERIAL":
            nt.nodes.remove(n)
    out = next(n for n in nt.nodes if n.type == "OUTPUT_MATERIAL")
    bsdf = nt.nodes.new("ShaderNodeBsdfPrincipled")
    nt.links.new(bsdf.outputs[0], out.inputs[0])
    coord = nt.nodes.new("ShaderNodeTexCoord")
    mapping = nt.nodes.new("ShaderNodeMapping")
    s = 1.0 / size_m
    inp(mapping, "Scale").default_value = (s, s, s)
    nt.links.new(coord.outputs["Object"], mapping.inputs["Vector"])

    def tex(suffix, non_color):
        path = find(folder, suffix)
        if path is None:
            return None
        t = nt.nodes.new("ShaderNodeTexImage")
        t.image = bpy.data.images.load(path, check_existing=True)
        if non_color:
            t.image.colorspace_settings.name = "Non-Color"
        t.projection = "BOX"
        t.projection_blend = 0.2
        nt.links.new(mapping.outputs["Vector"], t.inputs["Vector"])
        return t

    color = tex("_Color.jpg", False)
    if color is not None:
        if tint is not None:
            mix = nt.nodes.new("ShaderNodeMix")
            mix.data_type = "RGBA"
            mix.blend_type = "MULTIPLY"
            inp(mix, "Factor_Float").default_value = 1.0
            nt.links.new(color.outputs["Color"], inp(mix, "A_Color"))
            inp(mix, "B_Color").default_value = tint
            nt.links.new(next(o for o in mix.outputs if o.identifier == "Result_Color"), inp(bsdf, "Base Color"))
        else:
            nt.links.new(color.outputs["Color"], inp(bsdf, "Base Color"))
    rough = None if roughness_const is not None else tex("_Roughness.jpg", True)
    if roughness_const is not None:
        inp(bsdf, "Roughness").default_value = roughness_const
    if rough is not None:
        if roughness_scale != 1.0:
            m = nt.nodes.new("ShaderNodeMath")
            m.operation = "MULTIPLY"
            m.inputs[1].default_value = roughness_scale
            nt.links.new(rough.outputs["Color"], m.inputs[0])
            nt.links.new(m.outputs[0], inp(bsdf, "Roughness"))
        else:
            nt.links.new(rough.outputs["Color"], inp(bsdf, "Roughness"))
    normal = tex("_NormalGL.jpg", True)
    if normal is not None:
        nm = nt.nodes.new("ShaderNodeNormalMap")
        nm.inputs["Strength"].default_value = 0.8
        nt.links.new(normal.outputs["Color"], nm.inputs["Color"])
        nt.links.new(nm.outputs["Normal"], inp(bsdf, "Normal"))
    metal = tex("_Metalness.jpg", True)
    if metal is not None:
        nt.links.new(metal.outputs["Color"], inp(bsdf, "Metallic"))
    return mat


def flat(name, rgba, roughness):
    mat = bpy.data.materials.get(name) or bpy.data.materials.new(name)
    mat.use_nodes = True
    b = bsdf_of(mat)
    inp(b, "Base Color").default_value = rgba
    inp(b, "Roughness").default_value = roughness
    return mat


# ---- 形（頂点の位置 = m。box 投影の大きさがそろう） ----
def box(name, cx, cz, hw, hd, h, mat, y0=0.0):
    me = bpy.data.meshes.new(name)
    bm = bmesh.new()
    bmesh.ops.create_cube(bm, size=1.0)
    for v in bm.verts:
        v.co.x *= hw * 2
        v.co.y *= hd * 2
        v.co.z = (v.co.z + 0.5) * h
    bm.to_mesh(me)
    bm.free()
    ob = link(bpy.data.objects.new(name, me))
    ob.location = to_bl(cx, y0, cz)
    ob.data.materials.append(mat)
    return ob


def plane(name, cx, cz, sx, sz, y, mat):
    me = bpy.data.meshes.new(name)
    bm = bmesh.new()
    bmesh.ops.create_grid(bm, x_segments=1, y_segments=1, size=0.5)
    for v in bm.verts:
        v.co.x *= sx
        v.co.y *= sz
    bm.to_mesh(me)
    bm.free()
    ob = link(bpy.data.objects.new(name, me))
    ob.location = to_bl(cx, y, cz)
    ob.data.materials.append(mat)
    return ob


# 芝は光を返さない（草の葉の向きがばらばら）。粗さの画像は使わず、ほぼ 1 にする
ground_mat = pbr("look_grass", "Grass004", 2.5, tint=(0.75, 1.0, 0.55, 1.0), roughness_const=0.95)
# 道路は暗くして、車・白線との差をつける（「どこを走るか」を分かりやすく。いまのゲームの道路の明るさに近づける）
road_mat = pbr("look_asphalt", "Asphalt031", 4.0, tint=(0.35, 0.36, 0.40, 1.0))
line_mat = flat("look_line", srgb(0xFFF1A8), 0.6)
brick_mat = pbr("look_facade_brick", "Facade018A", 13.0)
white_mats = [pbr(f"look_facade_{i}", "Facade006", 12.0, tint=srgb(c)) for i, c in enumerate(BUILDING_COLORS)]

size = STAGE["groundSize"]
plane("ground", 0, 0, size, size, 0.0, ground_mat)
road_len = STAGE["boundsHalfSize"] * 2 + STAGE["roadWidth"]
for p in LAYOUT["roadLines"]:
    plane(f"road_x_{p}", 0, p, road_len, STAGE["roadWidth"], 0.01, road_mat)
    plane(f"road_z_{p}", p, 0, STAGE["roadWidth"], road_len, 0.011, road_mat)
    plane(f"line_x_{p}", 0, p, road_len, 0.3, 0.02, line_mat)
    plane(f"line_z_{p}", p, 0, 0.3, road_len, 0.021, line_mat)

for i, b in enumerate(LAYOUT["buildings"]):
    mat = brick_mat if i % 3 == 0 else white_mats[i % len(white_mats)]
    box(f"building_{i}", b["x"], b["z"], b["halfWidth"], b["halfDepth"], b["height"], mat)

# ---- 木（Poly Haven tree_small_02、CC0）。1本読み込んで、残りは同じ形を共有する ----
tree_gltf = find("tree_small_02", ".gltf")
before = set(bpy.data.objects)
bpy.ops.import_scene.gltf(filepath=tree_gltf)
tree_parts = [o for o in bpy.data.objects if o not in before]
for o in tree_parts:
    for c in list(o.users_collection):
        c.objects.unlink(o)
    coll.objects.link(o)
tree_meshes = [o for o in tree_parts if o.type == "MESH"]
for t_index, t in enumerate(LAYOUT["trees"]):
    for o in tree_meshes:
        ob = o if t_index == 0 else link(bpy.data.objects.new(f"{o.name}_{t_index}", o.data))
        ob.parent = None
        ob.location = to_bl(t["x"], 0, t["z"])
        ob.scale = (1.0, 1.0, 1.0)

# ---- 車（ゲームと同じ GLB）。材質だけ、塗装のつや・ゴム・ガラスに寄せる ----
before = set(bpy.data.objects)
bpy.ops.import_scene.gltf(filepath=os.path.join(ASSETS, "car.glb"))
car_parts = [o for o in bpy.data.objects if o not in before]
for o in car_parts:
    for c in list(o.users_collection):
        c.objects.unlink(o)
    coll.objects.link(o)
    if o.type != "MESH":
        continue
    for slot in o.material_slots:
        m = slot.material
        if m is None or not m.use_nodes:
            continue
        b = bsdf_of(m)
        name = m.name.lower()
        if "body" in name or "orange" in name:
            inp(b, "Roughness").default_value = 0.25
            inp(b, "Coat Weight").default_value = 0.6
            inp(b, "Coat Roughness").default_value = 0.05
        elif "window" in name or "glass" in name:
            inp(b, "Roughness").default_value = 0.05
            inp(b, "Coat Weight").default_value = 1.0
        elif "tire" in name or "tyre" in name or "wheel" in name:
            inp(b, "Roughness").default_value = 0.85
# 位置は GLB のまま（原点 = 車体の底の中心 = スタート地点。タイヤは車体の外の別の部品なので動かさない）

# ---- 空と光：HDRI（kloofendal、CC0）と太陽 ----
scene = bpy.context.scene
world = scene.world or bpy.data.worlds.new("World")
scene.world = world
world.use_nodes = True
wn = world.node_tree
for n in list(wn.nodes):
    if n.type != "OUTPUT_WORLD":
        wn.nodes.remove(n)
wout = next(n for n in wn.nodes if n.type == "OUTPUT_WORLD")
bg = wn.nodes.new("ShaderNodeBackground")
env = wn.nodes.new("ShaderNodeTexEnvironment")
env.image = bpy.data.images.load(find("hdri", ".hdr"), check_existing=True)
bg.inputs["Strength"].default_value = 1.0
wn.links.new(env.outputs["Color"], bg.inputs["Color"])
wn.links.new(bg.outputs["Background"], wout.inputs["Surface"])

sun_data = bpy.data.lights.new("look_sun", "SUN")
sun_data.energy = 3.5
sun_data.angle = math.radians(2.0)
sun = link(bpy.data.objects.new("look_sun", sun_data))
sun.rotation_euler = (math.radians(50), 0, math.radians(35))

# ---- カメラ：ゲームの追従カメラと同じ（後ろ followDistance・高さ height、前 lookAhead の lookHeight を見る） ----
cam_data = bpy.data.cameras.new("look_cam")
cam_data.sensor_fit = "VERTICAL"
cam_data.angle = math.radians(CAM["fov"])
cam_data.clip_end = 400
cam = link(bpy.data.objects.new("look_cam", cam_data))
cam.location = to_bl(0, CAM["height"], CAM["followDistance"])
target = link(bpy.data.objects.new("look_target", None))
target.location = to_bl(0, CAM["lookHeight"], -CAM["lookAhead"])
track = cam.constraints.new("TRACK_TO")
track.target = target
track.track_axis = "TRACK_NEGATIVE_Z"
track.up_axis = "UP_Y"
scene.camera = cam

# ---- 描き方：EEVEE、AgX、1280×720 ----
engines = {e.identifier for e in bpy.types.RenderSettings.bl_rna.properties["engine"].enum_items}
scene.render.engine = "BLENDER_EEVEE" if "BLENDER_EEVEE" in engines else "BLENDER_EEVEE_NEXT"
scene.render.resolution_x, scene.render.resolution_y = 1280, 720
scene.render.resolution_percentage = 100
scene.view_settings.view_transform = "AgX"
# 子ども向けに色をはっきりさせる（AgX は色を落ち着かせるので、Punchy で彩度と明暗の差を戻す）
scene.view_settings.look = "AgX - Punchy"
eevee = scene.eevee
for attr, value in (("taa_render_samples", 64), ("use_raytracing", True), ("use_shadows", True)):
    if hasattr(eevee, attr):
        setattr(eevee, attr, value)
scene.render.filepath = OUT
os.makedirs(os.path.dirname(OUT), exist_ok=True)
bpy.ops.render.render(write_still=True)

result = {
    "engine": scene.render.engine,
    "buildings": len(LAYOUT["buildings"]),
    "trees": len(LAYOUT["trees"]),
    "car_parts": len(car_parts),
    "car_materials": sorted({s.material.name for o in car_parts if o.type == "MESH" for s in o.material_slots if s.material}),
    "out": OUT,
}
