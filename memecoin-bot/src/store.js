// შექმნილი ქოინების შენახვა: Upstash Redis (უფასო) ან ლოკალური ფაილი
import fs from 'fs'
import path from 'path'

const URL = (process.env.UPSTASH_REDIS_REST_URL || '').trim().replace(/\/+$/, '')
const TOKEN = (process.env.UPSTASH_REDIS_REST_TOKEN || '').trim()
const FILE = path.resolve('data/tokens.json')

// 'redis' = მუდმივი შენახვა · 'file' = Render-ზე ყოველ რესტარტზე იშლება
export const STORAGE = URL && TOKEN ? 'redis' : 'file'
export const ON_RENDER = !!process.env.RENDER

if (URL && !TOKEN) console.error('⚠️ UPSTASH_REDIS_REST_URL არის, მაგრამ UPSTASH_REDIS_REST_TOKEN აკლია')
console.log(STORAGE === 'redis'
  ? '💾 შენახვა: Upstash Redis'
  : `💾 შენახვა: ლოკალური ფაილი${ON_RENDER ? ' — ⚠️ Render-ზე რესტარტისას წაიშლება! ჩაწერე UPSTASH_REDIS_REST_URL და UPSTASH_REDIS_REST_TOKEN' : ''}`)

async function redis(cmd) {
  const r = await fetch(URL, {
    method: 'POST',
    headers: { Authorization: `Bearer ${TOKEN}` },
    body: JSON.stringify(cmd),
  })
  const j = await r.json().catch(() => ({ error: `HTTP ${r.status}` }))
  if (j.error) throw new Error(`Upstash: ${j.error}`)
  return j.result
}

// Redis-ის კავშირის შემოწმება გაშვებისას
export async function checkStorage() {
  if (STORAGE !== 'redis') return
  await redis(['PING'])
  console.log('💾 Upstash კავშირი OK')
}

async function load() {
  if (STORAGE === 'redis') { const v = await redis(['GET', 'tokens']); return v ? JSON.parse(v) : [] }
  try { return JSON.parse(fs.readFileSync(FILE, 'utf8')) } catch { return [] }
}

async function save(list) {
  if (STORAGE === 'redis') return redis(['SET', 'tokens', JSON.stringify(list)])
  fs.mkdirSync(path.dirname(FILE), { recursive: true })
  fs.writeFileSync(FILE, JSON.stringify(list, null, 2))
}

export const getTokens = () => load()
export const getToken = async (mint) => (await load()).find((t) => t.mint === mint)
export async function addToken(t) { const l = await load(); l.push(t); await save(l) }
export async function updateToken(mint, patch) {
  const l = await load(); const i = l.findIndex((t) => t.mint === mint)
  if (i >= 0) { l[i] = { ...l[i], ...patch }; await save(l) }
}

// აღდგენილი ქოინების შერწყმა: ახალს ამატებს, არსებულს უვსებს poolId-ს
export async function mergeTokens(found) {
  const l = await load()
  let added = 0, updated = 0
  for (const t of found) {
    const i = l.findIndex((x) => x.mint === t.mint)
    if (i < 0) { l.push(t); added++ }
    else if (!l[i].poolId && t.poolId) { l[i] = { ...l[i], poolId: t.poolId, lpMint: t.lpMint }; updated++ }
  }
  if (added || updated) await save(l)
  return { added, updated, total: l.length }
}
