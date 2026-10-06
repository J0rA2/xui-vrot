import bs58 from 'bs58'
import 'dotenv/config'
import { Connection, Keypair } from '@solana/web3.js'

const need = (k) => {
  const v = (process.env[k] || '').trim()
  if (!v) throw new Error(`env-ში აკლია ${k}`)
  return v
}

function loadKeypair(value) {
  const raw = value.replace(/^["']|["']$/g, '')
  const secret = raw.startsWith('[')
    ? Uint8Array.from(JSON.parse(raw))
    : bs58.decode(raw)
  if (secret.length === 32) return Keypair.fromSeed(secret)
  if (secret.length === 64) return Keypair.fromSecretKey(secret)
  throw new Error(`PRIVATE_KEY არასწორია (${secret.length} ბაიტი, უნდა იყოს 64)`)
}

export const BOT_TOKEN = need('BOT_TOKEN').replace(/\s+/g, '').replace(/^bot/i, '')
if (!/^\d+:[\w-]{30,}$/.test(BOT_TOKEN)) {
  throw new Error('BOT_TOKEN არასწორი ფორმატისაა (უნდა იყოს 123456:ABC...)')
}
export const PINATA_JWT = need('PINATA_JWT')
export const ADMIN_IDS = (process.env.ADMIN_IDS || '')
  .split(',').map((s) => Number(s.trim())).filter(Boolean)

export const CLUSTER = process.env.CLUSTER === 'devnet' ? 'devnet' : 'mainnet'
export const RPC_URL = process.env.RPC_URL ||
  (CLUSTER === 'devnet' ? 'https://api.devnet.solana.com' : 'https://api.mainnet-beta.solana.com')

export const owner = loadKeypair(need('PRIVATE_KEY'))
console.log('Wallet:', owner.publicKey.toBase58(), '| cluster:', CLUSTER)

export const connection = new Connection(RPC_URL, 'confirmed')
