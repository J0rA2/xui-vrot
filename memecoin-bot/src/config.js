import 'dotenv/config'
import { Connection, Keypair } from '@solana/web3.js'
import bs58 from 'bs58'

const need = (k) => {
  if (!process.env[k]) throw new Error(`.env-ში აკლია ${k}`)
  return process.env[k]
}

export const BOT_TOKEN = need('BOT_TOKEN')
export const PINATA_JWT = need('PINATA_JWT')
export const ADMIN_IDS = (process.env.ADMIN_IDS || '')
  .split(',').map((s) => Number(s.trim())).filter(Boolean)

export const CLUSTER = process.env.CLUSTER === 'devnet' ? 'devnet' : 'mainnet'
export const RPC_URL = process.env.RPC_URL ||
  (CLUSTER === 'devnet' ? 'https://api.devnet.solana.com' : 'https://api.mainnet-beta.solana.com')

export const owner = Keypair.fromSecretKey(bs58.decode(need('PRIVATE_KEY')))
export const connection = new Connection(RPC_URL, 'confirmed')
