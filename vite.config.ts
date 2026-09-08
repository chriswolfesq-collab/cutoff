import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// 5173 is preflop-lab's port; pin this one so both can run side by side.
export default defineConfig({
  plugins: [react()],
  server: { port: 5174, strictPort: true },
});
