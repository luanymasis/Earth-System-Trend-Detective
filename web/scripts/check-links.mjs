// Comprueba que cada enlace de src/data/news.js responda (PLAN_FASE3 §6). Correr antes del deploy:
//   npm run check-links
// Sale con código 1 si algún enlace devuelve 4xx/5xx o no responde. Algunos medios bloquean a
// clientes automáticos (403/429): se reportan aparte para revisarlos a mano en el navegador.
import { NEWS } from '../src/data/news.js'

const UA = 'Mozilla/5.0 (link-check)'
async function check (url) {
  for (const method of ['HEAD', 'GET']) {
    try {
      const r = await fetch(url, { method, redirect: 'follow', headers: { 'user-agent': UA }, signal: AbortSignal.timeout(15000) })
      if (r.ok || method === 'GET') return r.status
    } catch (err) { if (method === 'GET') return `error: ${err.cause?.code || err.name}` }
  }
}
const rows = Object.entries(NEWS).flatMap(([ev, list]) => list.map(n => ({ ev, url: n.url })))
const res = await Promise.all(rows.map(async r => ({ ...r, status: await check(r.url) })))
let bad = 0, blocked = 0
for (const r of res) {
  const ok = typeof r.status === 'number' && r.status < 400
  const bl = r.status === 403 || r.status === 429
  if (!ok) bl ? blocked++ : bad++
  console.log(`${ok ? 'ok ' : bl ? '?? ' : 'ERR'} ${String(r.status).padEnd(14)} ${r.ev.padEnd(12)} ${r.url}`)
}
console.log(`\n${res.length} enlaces · ${bad} rotos · ${blocked} bloqueados (revisar a mano)`)
process.exit(bad ? 1 : 0)
