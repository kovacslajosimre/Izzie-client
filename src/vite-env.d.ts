/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_IZZIE_URL: string;
  readonly VITE_IZZIE_TOKEN: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
