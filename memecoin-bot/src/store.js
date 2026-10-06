// შექმნილი ქოინების შენახვა: Upstash Redis (უფასო) ან ლოკალური ფაილი
import fs from 'fs'
import path from 'path'

const URL = process.env.UPSTASH_REDIS_REST_URL
const TOKEN = process.env.UPSTASH_REDIS_REST_TOKEN
const FILE = path.resolve('data/tokens.json')

async function redis(cmd) {
  const r = await fetch(URL, {
    method: 'POST',
    headers: { Authorization: `Bearer ${TOKEN}` },
    body: JSON.stringify(cmd),
  })
  const j = await r.json()
  if (j.error) throw new Error(`Upstash: ${j.error}`)
  return j.result
}

async function load() {
  if (URL) { const v = await redis(['GET', 'tokens']); return v ? JSON.parse(v) : [] }
  try { return JSON.parse(fs.readFileSync(FILE, 'utf8')) } catch { return [] }
}

async function save(list) {
  if (URL) return redis(['SET', 'tokens', JSON.stringify(list)])
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
