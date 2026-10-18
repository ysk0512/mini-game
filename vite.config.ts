import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  // GitHub Pages는 /<저장소 이름>/ 아래에서 열리므로 상대 경로로 빌드한다
  base: './',
});
