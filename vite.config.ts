import { defineConfig } from 'vite';

// base './' : Electron(file://) 과 Capacitor 에서도 그대로 동작하도록 상대 경로로 빌드
export default defineConfig({
  base: './',
  build: { chunkSizeWarningLimit: 900 },
});
