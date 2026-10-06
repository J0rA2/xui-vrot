import bs58 from 'bs58';
import 'dotenv/config'
import { Connection, Keypair } from '@solana/web3.js'

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

const _k = bs58.decode(need('PRIVATE_KEY'));
console.log('KEY chars:', need('PRIVATE_KEY').length, 'bytes:', _k.length);
export const owner = Keypair.fromSecretKey(_k);

export const connection = new Connection(RPC_URL, 'confirmed')
function loadKeypair(value) {
  const raw = (value || '').trim().replace(/^["']|["']$/g, '');
  const secret = raw.startsWith('[')
    ? Uint8Array.from(JSON.parse(raw))
    : bs58.decode(raw);
  console.log('key length:', secret.length);
  return secret.length === 32
    ? Keypair.fromSeed(secret)
    : Keypair.fromSecretKey(secret);
}
