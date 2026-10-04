import { defineConfig } from 'vite';
export default defineConfig({base:'/Mech-idle/',build:{target:'es2022',sourcemap:false,rollupOptions:{output:{manualChunks:(id:string)=>id.includes('node_modules/three')?'three':undefined}}}});
