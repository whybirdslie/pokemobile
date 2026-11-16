const MAX_BYTES = 262144
const PHRASE = /^[a-z]{3,12}(-[a-z]{3,12}){1,3}$/

function allowedOrigin(origin) {
  if (!origin) return ""
  let url
  try {
    url = new URL(origin)
  } catch {
    return ""
  }
  const host = url.hostname
  if (host === "pokemobile.pages.dev" || host.endsWith(".pokemobile.pages.dev")) return origin
  if (host === "localhost" || host === "127.0.0.1") return origin
  return ""
}

function withCors(response, origin) {
  const headers = new Headers(response.headers)
  if (origin) {
    headers.set("access-control-allow-origin", origin)
    headers.set("vary", "Origin")
  }
  headers.set("access-control-expose-headers", "x-sha256, x-updated-at")
  return new Response(response.body, { status: response.status, headers })
}

function phraseFrom(pathname) {
  const key = decodeURIComponent(pathname.replace(/^\/saves\//, "")).toLowerCase()
  return PHRASE.test(key) ? key : null
}

export default {
  async fetch(request, env) {
    const origin = allowedOrigin(request.headers.get("origin") || "")
    if (request.method === "OPTIONS") {
      return withCors(
        new Response(null, {
          status: 204,
          headers: {
            "access-control-allow-methods": "GET, PUT, OPTIONS",
            "access-control-allow-headers": "content-type, x-sha256",
            "access-control-max-age": "86400",
          },
        }),
        origin,
      )
    }

    const url = new URL(request.url)
    const key = phraseFrom(url.pathname)
    if (!key) return withCors(new Response("Bad phrase", { status: 400 }), origin)

    if (request.method === "GET") {
      const found = await env.SAVES.getWithMetadata(key, { type: "arrayBuffer" })
      if (!found.value) return withCors(new Response(null, { status: 404 }), origin)
      const headers = new Headers()
      headers.set("content-type", "application/octet-stream")
      headers.set("x-sha256", found.metadata?.sha256 || "")
      headers.set("x-updated-at", found.metadata?.updatedAt || "0")
      return withCors(new Response(found.value, { headers }), origin)
    }

    if (request.method === "PUT") {
      const bytes = await request.arrayBuffer()
      if (bytes.byteLength > MAX_BYTES) {
        return withCors(new Response("Save is too large", { status: 413 }), origin)
      }
      if (bytes.byteLength < 64) {
        return withCors(new Response("Save is the wrong size", { status: 400 }), origin)
      }
      const digest = await crypto.subtle.digest("SHA-256", bytes)
      const sha256 = [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, "0")).join("")
      const updatedAt = String(Date.now())
      await env.SAVES.put(key, bytes, { metadata: { sha256, updatedAt } })
      return withCors(
        new Response(null, {
          status: 204,
          headers: { "x-sha256": sha256, "x-updated-at": updatedAt },
        }),
        origin,
      )
    }

    return withCors(new Response("Method not allowed", { status: 405 }), origin)
  },
}
