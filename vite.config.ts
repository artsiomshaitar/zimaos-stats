import { defineConfig } from "vite"
import { devtools } from "@tanstack/devtools-vite"
import { tanstackStart } from "@tanstack/react-start/plugin/vite"
import viteReact from "@vitejs/plugin-react"
import tailwindcss from "@tailwindcss/vite"

const config = defineConfig({
  resolve: { tsconfigPaths: true },
  // bun:sqlite is a Bun runtime builtin — never bundle it.
  ssr: { external: ["bun:sqlite"] },
  build: { rollupOptions: { external: [/^bun:/] } },
  plugins: [devtools(), tailwindcss(), tanstackStart(), viteReact()],
})

export default config
