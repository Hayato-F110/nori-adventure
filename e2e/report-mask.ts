// E2E の記録（docs/evidence/ にコミットすることがある）から、PC を特定しやすい値を消す。
// GPU の名前の「(0x000015E7)」のような識別子だけを消し、型の名前は性能の比較のために残す。
export const maskGpu = (renderer: string): string => renderer.replace(/\s*\(0x[0-9a-f]+\)/gi, "");
