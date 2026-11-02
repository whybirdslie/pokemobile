import fs from "node:fs"
import path from "node:path"
import { defineConfig, type Plugin } from "vite"

function devRom(): Plugin {
  const file = path.resolve("Pokemon - Emerald Version (USA, Europe) (patched).gba")
  return {
    name: "dev-rom",
    apply: "serve",
    configureServer(server) {
      server.middlewares.use("/dev-rom", (req, res, next) => {
        if (req.method !== "GET" || !fs.existsSync(file)) {
          next()
          return
        }
        res.setHeader("Content-Type", "application/octet-stream")
        res.setHeader("Cache-Control", "no-store")
        fs.createReadStream(file).pipe(res)
      })
    },
  }
}

export default defineConfig({
  plugins: [devRom()],
  server: { host: true, port: 5173 },
})
