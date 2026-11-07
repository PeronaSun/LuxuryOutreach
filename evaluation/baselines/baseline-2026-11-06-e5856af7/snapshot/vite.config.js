import { defineConfig, loadEnv } from "vite";
export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), "");
  return {
    server: {
      host: "127.0.0.1",
      proxy: { "/api": `http://127.0.0.1:${env.PORT || 3001}` },
    },
  };
});
