/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_GROUNDTRUTH_API_URL?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}

declare module "virtual:stylex:runtime";
