import { defineConfig } from 'vite';
import uni from '@dcloudio/vite-plugin-uni';
export default defineConfig({ plugins: [uni()], server: { host: 'localhost', port: 5173, strictPort: true, cors: { origin: 'http://localhost:5173' }, proxy: { '/api': 'http://127.0.0.1:3000', '/uploads': 'http://127.0.0.1:3000' } } });
