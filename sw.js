/* Service worker: serves the encrypted page instantly from cache, refreshes it in the background.
   Only encrypted files pass through here; the key never leaves the page. */
const C = "mgsw-v1";
self.addEventListener("install", e => self.skipWaiting());
self.addEventListener("activate", e => e.waitUntil(self.clients.claim()));
function scopeUrl() { return self.registration.scope; }
async function refresh(cached, clientId) {
  const c = await caches.open(C);
  const n = await fetch(scopeUrl(), { cache: "no-cache" });
  if (!n.ok) return;
  const txt = await n.clone().text();
  const old = cached ? await cached.text() : null;
  if (old === txt) return;
  await c.put(scopeUrl(), n);
  const live = new Set((txt.match(/c\/[a-z]+\.[0-9a-f]+\.bin/g) || []).map(p => new URL(p, scopeUrl()).href));
  for (const r of await c.keys()) if (r.url.includes("/c/") && !live.has(r.url)) await c.delete(r);
  if (old !== null) {
    for (const cl of await self.clients.matchAll({ type: "window" })) cl.postMessage("mg-updated");
  }
}
self.addEventListener("fetch", e => {
  const req = e.request; if (req.method !== "GET") return;
  const u = new URL(req.url); const s = new URL(scopeUrl());
  if (u.origin !== s.origin || !u.pathname.startsWith(s.pathname)) return;
  if (req.mode === "navigate" && (u.pathname === s.pathname || u.pathname === s.pathname + "index.html")) {
    e.respondWith((async () => {
      const c = await caches.open(C); const cached = await c.match(scopeUrl());
      if (cached) { e.waitUntil(refresh(cached.clone(), e.resultingClientId).catch(() => {})); return cached; }
      try { const n = await fetch(req); if (n.ok) await c.put(scopeUrl(), n.clone()); return n; }
      catch (x) { return Response.error(); }
    })());
    return;
  }
  if (u.pathname.startsWith(s.pathname + "c/")) {
    e.respondWith(caches.open(C).then(c => c.match(req).then(r => r || fetch(req).then(n => { if (n.ok) c.put(req, n.clone()); return n; }))));
  }
});
