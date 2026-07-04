/// <reference types="vite/client" />

import type { ExposedApi } from '@qiming/shared';

declare global {
  interface Window {
    /** Preload 经 contextBridge 暴露的受限 API。 */
    qiming: ExposedApi;
  }
}
