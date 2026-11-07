// gltf-validator（Khronos）は型を持たないので、使う部分だけを書く。
// 形は README（node_modules/gltf-validator/README.md）と validation.schema.json に合わせた。
declare module "gltf-validator" {
  type Message = { code: string; message: string; severity: number; pointer?: string };
  type Report = { issues: { numErrors: number; numWarnings: number; messages: Message[] } };
  type Options = {
    uri?: string;
    format?: "glb" | "gltf";
    maxIssues?: number;
    ignoredIssues?: string[];
    externalResourceFunction?: (uri: string) => Promise<Uint8Array>;
  };
  const validator: { validateBytes(data: Uint8Array, options?: Options): Promise<Report> };
  export default validator;
}
