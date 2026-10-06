// ტოკენის შექმნა (SPL + Metaplex მეტადატა), ბალანსები, SOL-ის გატანა
import { createUmi } from '@metaplex-foundation/umi-bundle-defaults'
import { mplTokenMetadata, createAndMint, TokenStandard } from '@metaplex-foundation/mpl-token-metadata'
import { generateSigner, percentAmount, keypairIdentity } from '@metaplex-foundation/umi'
import {
  PublicKey, LAMPORTS_PER_SOL, SystemProgram, Transaction, sendAndConfirmTransaction,
} from '@solana/web3.js'
import { setAuthority, AuthorityType, getMint, getAssociatedTokenAddressSync } from '@solana/spl-token'
import bs58 from 'bs58'
import { owner, connection, RPC_URL } from './config.js'

const umi = createUmi(RPC_URL).use(mplTokenMetadata())
umi.use(keypairIdentity(umi.eddsa.createKeypairFromSecretKey(owner.secretKey)))

export const U64_MAX = 18446744073709551615n

export async function getBalance() {
  return (await connection.getBalance(owner.publicKey)) / LAMPORTS_PER_SOL
}

export async function getTokenBalance(mint) {
  try {
    const ata = getAssociatedTokenAddressSync(new PublicKey(mint), owner.publicKey)
    const { value } = await connection.getTokenAccountBalance(ata)
    return { raw: value.amount, ui: value.uiAmountString }
  } catch {
    return { raw: '0', ui: '0' }
  }
}

export async function createToken({ name, symbol, uri, decimals, supply, revokeMint, revokeFreeze }) {
  const mint = generateSigner(umi)
  const amount = BigInt(supply) * 10n ** BigInt(decimals)

  const { signature } = await createAndMint(umi, {
    mint,
    authority: umi.identity,
    name,
    symbol,
    uri,
    sellerFeeBasisPoints: percentAmount(0),
    decimals,
    amount,
    tokenOwner: umi.identity.publicKey,
    tokenStandard: TokenStandard.Fungible,
  }).sendAndConfirm(umi)

  const mintPk = new PublicKey(mint.publicKey.toString())
  const info = await getMint(connection, mintPk)
  if (revokeMint && info.mintAuthority) {
    await setAuthority(connection, owner, mintPk, owner, AuthorityType.MintTokens, null)
  }
  if (revokeFreeze && info.freezeAuthority) {
    await setAuthority(connection, owner, mintPk, owner, AuthorityType.FreezeAccount, null)
  }
  return { mint: mintPk.toBase58(), signature: bs58.encode(Buffer.from(signature)) }
}

// amount: SOL-ის რაოდენობა ან 'max'
export async function sendSol(to, amount) {
  const balance = await connection.getBalance(owner.publicKey)
  const lamports = amount === 'max' ? balance - 5000 : Math.round(Number(amount) * LAMPORTS_PER_SOL)
  if (lamports <= 0 || lamports > balance - 5000) throw new Error('არასაკმარისი ბალანსი')
  const tx = new Transaction().add(
    SystemProgram.transfer({ fromPubkey: owner.publicKey, toPubkey: new PublicKey(to), lamports })
  )
  const sig = await sendAndConfirmTransaction(connection, tx, [owner])
  return { sig, sol: lamports / LAMPORTS_PER_SOL }
}
