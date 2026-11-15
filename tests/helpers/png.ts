import { inflateSync } from "node:zlib";

// テストで PNG を読む小さな道具（NORI-38。新しい部品を入れず、Node の標準の zlib だけで読む）。
// 対応：8 ビット、色の型 2（RGB）と 6（RGBA）、インターレースなし。それ以外は読まずにエラー
// 仕様：https://www.w3.org/TR/png-3/ （IHDR・IDAT・行ごとのフィルター 0〜4）

export type Png = {
  width: number;
  height: number;
  pixel: (x: number, y: number) => [number, number, number, number];
};

const SIGNATURE = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);

/** PNG の頭（IHDR）から幅と高さだけを読む */
export const pngSize = (data: Buffer): { width: number; height: number } => {
  if (!data.subarray(0, 8).equals(SIGNATURE)) throw new Error("PNG ではありません");
  if (data.toString("latin1", 12, 16) !== "IHDR") throw new Error("IHDR が最初にありません");
  return { width: data.readUInt32BE(16), height: data.readUInt32BE(20) };
};

const paeth = (a: number, b: number, c: number): number => {
  const p = a + b - c;
  const pa = Math.abs(p - a);
  const pb = Math.abs(p - b);
  const pc = Math.abs(p - c);
  return pa <= pb && pa <= pc ? a : pb <= pc ? b : c;
};

/** PNG を画素まで読む */
export const decodePng = (data: Buffer): Png => {
  const { width, height } = pngSize(data);
  const bitDepth = data[24];
  const colorType = data[25];
  const interlace = data[28];
  if (bitDepth !== 8 || (colorType !== 2 && colorType !== 6) || interlace !== 0) {
    throw new Error(
      `読めない PNG です（ビット ${bitDepth}・色の型 ${colorType}・インターレース ${interlace}）`,
    );
  }
  const channels = colorType === 6 ? 4 : 3;
  const idat: Buffer[] = [];
  for (let at = 8; at < data.length;) {
    const length = data.readUInt32BE(at);
    const type = data.toString("latin1", at + 4, at + 8);
    if (type === "IDAT") idat.push(data.subarray(at + 8, at + 8 + length));
    at += 12 + length;
  }
  const raw = inflateSync(Buffer.concat(idat));
  const stride = width * channels;
  const out = Buffer.alloc(stride * height);
  for (let y = 0; y < height; y += 1) {
    const filter = raw[y * (stride + 1)];
    for (let i = 0; i < stride; i += 1) {
      const x = raw[y * (stride + 1) + 1 + i] ?? 0;
      const a = i >= channels ? (out[y * stride + i - channels] ?? 0) : 0;
      const b = y > 0 ? (out[(y - 1) * stride + i] ?? 0) : 0;
      const c = y > 0 && i >= channels ? (out[(y - 1) * stride + i - channels] ?? 0) : 0;
      const value =
        filter === 0
          ? x
          : filter === 1
            ? x + a
            : filter === 2
              ? x + b
              : filter === 3
                ? x + Math.floor((a + b) / 2)
                : filter === 4
                  ? x + paeth(a, b, c)
                  : Number.NaN;
      if (Number.isNaN(value)) throw new Error(`知らないフィルター ${filter}（行 ${y}）`);
      out[y * stride + i] = value & 0xff;
    }
  }
  return {
    width,
    height,
    pixel: (x, y) => {
      const at = y * stride + x * channels;
      return [out[at] ?? 0, out[at + 1] ?? 0, out[at + 2] ?? 0, channels === 4 ? (out[at + 3] ?? 0) : 255];
    },
  };
};
