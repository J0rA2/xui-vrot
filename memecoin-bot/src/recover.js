// დაკარგული ქოინების აღდგენა ბლოკჩეინიდან:
// საფულის ტოკენ-ანგარიშები → Metaplex მეტადატა (update authority = ჩვენი საფულე) → Raydium CPMM პული
import { createUmi } from '@metaplex-foundation/umi-bundle-defaults'
import { publicKey } from '@metaplex-foundation/umi'
import { findMetadataPda, safeFetchAllMetadata } from '@metaplex-foundation/mpl-token-metadata'
import {
  CREATE_CPMM_POOL_PROGRAM, DEVNET_PROGRAM_ID, getCpmmPdaAmmConfigId, getCpmmPdaPoolId, getPdaLpMint,
} from '@raydium-io/raydium-sdk-v2'
import { NATIVE_MINT, TOKEN_PROGRAM_ID } from '@solana/spl-token'
import { PublicKey } from '@solana/web3.js'
import { owner, connection, CLUSTER, RPC_URL } from './config.js'

const umi = createUmi(RPC_URL)
const CPMM = CLUSTER === 'devnet' ? DEVNET_PROGRAM_ID.CREATE_CPMM_POOL_PROGRAM : CREATE_CPMM_POOL_PROGRAM
const clean = (s = '') => s.replace(/\0/g, '').trim()

// CPMM პულის მისამართი დეტერმინისტულია: [pool, config, mintA, mintB] (მინტები დალაგებული)
export async function findPool(mint) {
  const m = new PublicKey(mint)
  const [a, b] = Buffer.compare(m.toBuffer(), NATIVE_MINT.toBuffer()) <= 0 ? [m, NATIVE_MINT] : [NATIVE_MINT, m]
  const ids = [0, 1, 2, 3].map((i) =>
    getCpmmPdaPoolId(CPMM, getCpmmPdaAmmConfigId(CPMM, i).publicKey, a, b).publicKey)
  const infos = await connection.getMultipleAccountsInfo(ids)
  const k = infos.findIndex((x) => x && x.owner.equals(CPMM))
  if (k < 0) return null
  return { poolId: ids[k].toBase58(), lpMint: getPdaLpMint(CPMM, ids[k]).publicKey.toBase58() }
}

export async function recoverTokens() {
  const { value } = await connection.getParsedTokenAccountsByOwner(owner.publicKey, { programId: TOKEN_PROGRAM_ID })
  const accounts = new Map()
  for (const { account } of value) {
    const info = account.data.parsed.info
    accounts.set(info.mint, info.tokenAmount)
  }
  const mints = [...accounts.keys()]
  if (!mints.length) return []

  const me = owner.publicKey.toBase58()
  const found = []
  for (let i = 0; i < mints.length; i += 50) {
    const chunk = mints.slice(i, i + 50)
    const pdas = chunk.map((m) => findMetadataPda(umi, { mint: publicKey(m) })[0])
    const metas = await safeFetchAllMetadata(umi, pdas)
    for (const md of metas) {
      if (md.updateAuthority.toString() !== me) continue // სხვისი ტოკენი ან LP — გამოვტოვოთ
      const mint = md.mint.toString()
      found.push({
        mint,
        name: clean(md.name),
        symbol: clean(md.symbol),
        decimals: accounts.get(mint).decimals,
        uri: clean(md.uri),
        recovered: true,
      })
    }
  }

  for (const t of found) Object.assign(t, await findPool(t.mint))
  return found
}
