import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

const env = (globalThis as typeof globalThis & { process?: { env?: Record<string, string | undefined> } }).process?.env ?? {};

export default defineConfig({
  plugins: [react()],
  base: env.GITHUB_ACTIONS ? `/${env.GITHUB_REPOSITORY?.split('/')[1] ?? ''}/` : '/',
});
