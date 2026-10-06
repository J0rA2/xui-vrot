// Raydium CPMM: პულის შექმნა (ლიკვიდობის დამატება) და ლიკვიდობის მოხსნა
import {
  Raydium, TxVersion, Percent, CREATE_CPMM_POOL_PROGRAM, CREATE_CPMM_POOL_FEE_ACC,
  DEVNET_PROGRAM_ID, getCpmmPdaAmmConfigId,
} from '@raydium-io/raydium-sdk-v2'
import { NATIVE_MINT, TOKEN_PROGRAM_ID, getAssociatedTokenAddressSync } from '@solana/spl-token'
import { PublicKey } from '@solana/web3.js'
import BN from 'bn.js'
import { owner, connection, CLUSTER } from './config.js'

const isDev = CLUSTER === 'devnet'

// ყოველ ოპერაციაზე ახალი ინსტანსი — ბალანსები ყოველთვის განახლებულია
const loadRaydium = () => Raydium.load({
  owner, connection, cluster: CLUSTER,
  disableFeatureCheck: true, disableLoadToken: true, blockhashCommitment: 'finalized',
})

// "123.45" → BN ზუსტად (float-ის გარეშე)
function toBN(amount, decimals) {
  const [i, f = ''] = String(amount).split('.')
  return new BN(i + f.padEnd(decimals, '0').slice(0, decimals))
}

export async function createPool({ mint, decimals, tokenAmount, solAmount }) {
  const raydium = await loadRaydium()

  const feeConfigs = await raydium.api.getCpmmConfigs()
  if (isDev) {
    feeConfigs.forEach((c) => {
      c.id = getCpmmPdaAmmConfigId(DEVNET_PROGRAM_ID.CREATE_CPMM_POOL_PROGRAM, c.index).publicKey.toBase58()
    })
  }
  const feeConfig = feeConfigs.find((c) => c.index === 0) || feeConfigs[0]

  const { execute, extInfo } = await raydium.cpmm.createPool({
    programId: isDev ? DEVNET_PROGRAM_ID.CREATE_CPMM_POOL_PROGRAM : CREATE_CPMM_POOL_PROGRAM,
    poolFeeAccount: isDev ? DEVNET_PROGRAM_ID.CREATE_CPMM_POOL_FEE_ACC : CREATE_CPMM_POOL_FEE_ACC,
    mintA: { address: mint, programId: TOKEN_PROGRAM_ID.toBase58(), decimals },
    mintB: { address: NATIVE_MINT.toBase58(), programId: TOKEN_PROGRAM_ID.toBase58(), decimals: 9 },
    mintAAmount: toBN(tokenAmount, decimals),
    mintBAmount: toBN(solAmount, 9),
    startTime: new BN(0),
    feeConfig,
    associatedOnly: false,
    ownerInfo: { useSOLBalance: true },
    txVersion: TxVersion.V0,
  })

  const { txId } = await execute({ sendAndConfirm: true })
  return {
    txId,
    poolId: extInfo.address.poolId.toBase58(),
    lpMint: extInfo.address.lpMint.toBase58(),
  }
}

export async function removeLiquidity({ poolId, percent }) {
  const raydium = await loadRaydium()
  const { poolInfo, poolKeys } = await raydium.cpmm.getPoolInfoFromRpc(poolId)

  const lpAta = getAssociatedTokenAddressSync(new PublicKey(poolInfo.lpMint.address), owner.publicKey)
  const { value } = await connection.getTokenAccountBalance(lpAta)
  const lpAmount = new BN(value.amount).muln(percent).divn(100)
  if (lpAmount.isZero()) throw new Error('LP ტოკენების ბალანსი 0-ია')

  const { execute } = await raydium.cpmm.withdrawLiquidity({
    poolInfo, poolKeys, lpAmount,
    slippage: new Percent(5, 100),
    txVersion: TxVersion.V0,
    closeWsol: true,
  })
  const { txId } = await execute({ sendAndConfirm: true })
  return txId
}
