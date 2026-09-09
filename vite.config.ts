import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig(({ command }) => ({
  // Served from https://<user>.github.io/cutoff/, so built asset URLs need the
  // repo name in front of them. The dev server stays at the root.
  base: command === 'build' ? '/cutoff/' : '/',
  plugins: [react()],
  // 5173 is preflop-lab's port; pin this one so both can run side by side.
  server: { port: 5174, strictPort: true },
}));
