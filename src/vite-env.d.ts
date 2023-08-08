/// <reference types="vite/client" />

declare module "preact-ssr-prepass" {
  const t: (input: any) => Promise<void>;
  export default t;
}
