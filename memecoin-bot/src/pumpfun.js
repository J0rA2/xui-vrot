// Pump.fun-ზე ქოინის შექმნა PumpPortal-ის Local Transaction API-ით
// ტრანზაქციას PumpPortal აწყობს, ხელს ჩვენ ვაწერთ — private key არსად იგზავნება
import { Keypair, VersionedTransaction } from '@solana/web3.js'
import { owner, connection, CLUSTER } from './config.js'

export const PUMP_SUPPLY = '1000000000' // Pump.fun-ზე ფიქსირებულია: 1B, decimals 6
export const PUMP_DECIMALS = 6

export async function createPumpToken({ name, symbol, uri, devBuySol }) {
  if (CLUSTER !== 'mainnet') throw new Error('Pump.fun მხოლოდ mainnet-ზე მუშაობს (CLUSTER=mainnet)')
  const mint = Keypair.generate()

  const r = await fetch('https://pumpportal.fun/api/trade-local', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      publicKey: owner.publicKey.toBase58(),
      action: 'create',
      tokenMetadata: { name, symbol, uri },
      mint: mint.publicKey.toBase58(),
      denominatedInSol: 'true',
      amount: Number(devBuySol),
      slippage: 10,
      priorityFee: 0.0005,
      pool: 'pump',
    }),
  })
  if (r.status !== 200) throw new Error(`PumpPortal ${r.status}: ${(await r.text()).slice(0, 300)}`)

  const tx = VersionedTransaction.deserialize(new Uint8Array(await r.arrayBuffer()))
  tx.sign([mint, owner])
  const signature = await connection.sendTransaction(tx, { maxRetries: 5 })
  const conf = await connection.confirmTransaction(signature, 'confirmed')
  if (conf.value.err) throw new Error(`ტრანზაქცია ჩავარდა: ${JSON.stringify(conf.value.err)}`)
  return { mint: mint.publicKey.toBase58(), signature }
}
