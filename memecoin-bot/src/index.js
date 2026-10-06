import { Bot, InlineKeyboard } from 'grammy'
import http from 'http'
import { PublicKey } from '@solana/web3.js'
import { BOT_TOKEN, ADMIN_IDS, CLUSTER, owner } from './config.js'
import { getBalance, getTokenBalance, createToken, sendSol, U64_MAX } from './solana.js'
import { createPool, removeLiquidity } from './raydium.js'
import { uploadFile, uploadJSON } from './ipfs.js'
import { getTokens, getToken, addToken, updateToken } from './store.js'

const bot = new Bot(BOT_TOKEN)

// Render-ისთვის: პატარა HTTP სერვერი (cron-job.org ამას ეძახის, რომ ბოტს არ ეძინოს)
http.createServer((_, res) => res.end('ok')).listen(process.env.PORT || 3000)

// ---------- სესიები (ნაბიჯ-ნაბიჯ დიალოგი) ----------
const sessions = new Map()
const getS = (id) => sessions.get(id)
const setS = (id, step, data = {}) =>
  sessions.set(id, { step, data: { ...(getS(id)?.data || {}), ...data } })
const clearS = (id) => sessions.delete(id)

// ---------- დამხმარეები ----------
const HTML = { parse_mode: 'HTML', link_preview_options: { is_disabled: true } }
const esc = (s = '') => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
const q = CLUSTER === 'devnet' ? '?cluster=devnet' : ''
const txLink = (sig) => `<a href="https://solscan.io/tx/${sig}${q}">ტრანზაქცია</a>`
const tokenLink = (mint) => `<a href="https://solscan.io/token/${mint}${q}">Solscan</a>`
const isNum = (s) => /^\d+(\.\d+)?$/.test(s || '') && Number(s) > 0
const errText = (e) => esc(String(e?.message || e).slice(0, 400))
const confirmKb = (go) => new InlineKeyboard().text('✅ დადასტურება', go).text('❌ გაუქმება', 'cancel_cb')

const menu = new InlineKeyboard()
  .text('🪙 ქოინის შექმნა', 'create').row()
  .text('💧 ლიკვიდობის დამატება', 'addlp').row()
  .text('🔻 ლიკვიდობის მოხსნა', 'rmlp').row()
  .text('💸 SOL-ის გატანა', 'withdraw').row()
  .text('📋 ჩემი ქოინები', 'tokens').text('💰 ბალანსი', 'balance')

async function showMenu(ctx) {
  const bal = await getBalance()
  await ctx.reply(
    `👛 საფულე: <code>${owner.publicKey.toBase58()}</code>\n` +
    `💰 ბალანსი: <b>${bal.toFixed(4)} SOL</b>\n🌐 ქსელი: <b>${CLUSTER}</b>`,
    { ...HTML, reply_markup: menu }
  )
}

// ---------- წვდომა: მხოლოდ ADMIN_IDS ----------
bot.command('myid', (ctx) => ctx.reply(`შენი Telegram ID: ${ctx.from.id}`))
bot.use(async (ctx, next) => { if (ADMIN_IDS.includes(ctx.from?.id)) await next() })
bot.on('callback_query', async (ctx, next) => { await ctx.answerCallbackQuery().catch(() => {}); await next() })

bot.command(['start', 'menu'], async (ctx) => { clearS(ctx.from.id); await showMenu(ctx) })
bot.command('cancel', async (ctx) => { clearS(ctx.from.id); await ctx.reply('❌ გაუქმდა', { reply_markup: menu }) })
bot.callbackQuery('cancel_cb', async (ctx) => { clearS(ctx.from.id); await ctx.reply('❌ გაუქმდა', { reply_markup: menu }) })
bot.callbackQuery(['balance', 'menu_cb'], (ctx) => showMenu(ctx))

// ---------- ჩემი ქოინები ----------
bot.callbackQuery('tokens', async (ctx) => {
  const list = (await getTokens()).slice(-15)
  if (!list.length) return ctx.reply('ჯერ ქოინი არ შეგიქმნია.')
  const lines = await Promise.all(list.map(async (t) => {
    const bal = await getTokenBalance(t.mint)
    return `• <b>${esc(t.name)}</b> ($${esc(t.symbol)})\n<code>${t.mint}</code>\n` +
      `ბალანსი: ${bal.ui} · ${tokenLink(t.mint)}\n` +
      (t.poolId ? `💧 პული: <code>${t.poolId}</code>` : '— პული არ აქვს')
  }))
  await ctx.reply(lines.join('\n\n'), HTML)
})

// ================= 1. ქოინის შექმნა =================
bot.callbackQuery('create', async (ctx) => {
  clearS(ctx.from.id); setS(ctx.from.id, 'name')
  await ctx.reply('🪙 ახალი ქოინი (გაუქმება: /cancel)\n\n1/7 ✏️ სახელი (მაგ: Georgian Doge):')
})

bot.callbackQuery(/^dec:(6|9)$/, async (ctx) => {
  const id = ctx.from.id; const s = getS(id)
  if (s?.step !== 'decimals') return
  const decimals = Number(ctx.match[1])
  if (BigInt(s.data.supply) * 10n ** BigInt(decimals) > U64_MAX) {
    return ctx.reply('⚠️ ეს supply ამ decimals-ისთვის ძალიან დიდია. აირჩიე 6.')
  }
  setS(id, 'revoke', { decimals })
  await ctx.reply('🔒 Authority-ების გაუქმება (revoke) — მყიდველები ამას ამოწმებენ:', {
    reply_markup: new InlineKeyboard()
      .text('✅ Mint + Freeze (რეკომენდებული)', 'rv:both').row()
      .text('მხოლოდ Freeze', 'rv:freeze').row()
      .text('არცერთი', 'rv:none'),
  })
})

bot.callbackQuery(/^rv:(both|freeze|none)$/, async (ctx) => {
  const id = ctx.from.id
  if (getS(id)?.step !== 'revoke') return
  const r = ctx.match[1]
  setS(id, 'confirm_create', { revokeMint: r === 'both', revokeFreeze: r !== 'none' })
  const d = getS(id).data
  const links = Object.values(d.socials).map(esc).join('\n') || '—'
  await ctx.reply(
    `📋 <b>შეამოწმე:</b>\n\nსახელი: <b>${esc(d.name)}</b>\nსიმბოლო: <b>$${esc(d.symbol)}</b>\n` +
    `Supply: ${BigInt(d.supply).toLocaleString('en-US')}\nDecimals: ${d.decimals}\n` +
    `Revoke: Mint ${d.revokeMint ? '✅' : '❌'} · Freeze ${d.revokeFreeze ? '✅' : '❌'}\n` +
    `ლინკები:\n${links}\n\n💸 ხარჯი: ~0.02 SOL`,
    { ...HTML, reply_markup: confirmKb('create_go') }
  )
})

bot.callbackQuery('create_go', async (ctx) => {
  const id = ctx.from.id; const s = getS(id)
  if (s?.step !== 'confirm_create') return
  const d = s.data; clearS(id)
  const msg = await ctx.reply('⏳ ლოგოს ატვირთვა IPFS-ზე...')
  const edit = (t, extra = {}) => ctx.api.editMessageText(msg.chat.id, msg.message_id, t, { ...HTML, ...extra })
  try {
    const file = await ctx.api.getFile(d.imageFileId)
    const res = await fetch(`https://api.telegram.org/file/bot${BOT_TOKEN}/${file.file_path}`)
    const buf = Buffer.from(await res.arrayBuffer())
    const ext = file.file_path.split('.').pop() || 'png'
    const image = await uploadFile(buf, `${d.symbol}.${ext}`, d.imageMime)
    const uri = await uploadJSON({
      name: d.name, symbol: d.symbol, description: d.description, image,
      ...d.socials, extensions: d.socials,
    }, d.symbol)

    await edit('⏳ ტოკენის შექმნა Solana-ზე...')
    const { mint, signature } = await createToken({ ...d, uri })
    await addToken({
      mint, name: d.name, symbol: d.symbol, decimals: d.decimals, supply: d.supply,
      uri, image, createdAt: new Date().toISOString(),
    })
    await edit(
      `✅ <b>${esc(d.name)}</b> ($${esc(d.symbol)}) შეიქმნა!\n\nCA: <code>${mint}</code>\n${tokenLink(mint)} · ${txLink(signature)}`,
      { reply_markup: new InlineKeyboard().text('💧 ლიკვიდობის დამატება', `lp:${mint}`).row().text('🏠 მენიუ', 'menu_cb') }
    )
  } catch (e) {
    console.error(e)
    await edit(`❌ შეცდომა: ${errText(e)}`)
  }
})

// ================= 2. ლიკვიდობის დამატება =================
bot.callbackQuery('addlp', async (ctx) => {
  const list = (await getTokens()).filter((t) => !t.poolId).slice(-10)
  if (!list.length) return ctx.reply('პულის გარეშე ქოინი არ გაქვს. ჯერ შექმენი ქოინი.')
  const kb = new InlineKeyboard()
  list.forEach((t) => kb.text(`${t.name} ($${t.symbol})`, `lp:${t.mint}`).row())
  await ctx.reply('რომელ ქოინს დავუმატო ლიკვიდობა?', { reply_markup: kb })
})

bot.callbackQuery(/^lp:(.+)$/, async (ctx) => {
  const t = await getToken(ctx.match[1])
  if (!t) return ctx.reply('ქოინი ვერ ვიპოვე.')
  if (t.poolId) return ctx.reply('ამ ქოინს პული უკვე აქვს.')
  const bal = await getTokenBalance(t.mint)
  clearS(ctx.from.id)
  setS(ctx.from.id, 'lp_tokens', { mint: t.mint, decimals: t.decimals, tokenBal: bal.ui })
  await ctx.reply(
    `💧 <b>${esc(t.name)}</b> — Raydium პული (TOKEN/SOL)\n\nბალანსი: <b>${bal.ui}</b> ${esc(t.symbol)}\n\n` +
    `რამდენი ტოკენი ჩავდო? (რიცხვი ან <code>all</code>)`,
    HTML
  )
})

// ================= 3. ლიკვიდობის მოხსნა =================
bot.callbackQuery('rmlp', async (ctx) => {
  const list = (await getTokens()).filter((t) => t.poolId).slice(-10)
  if (!list.length) return ctx.reply('პულიანი ქოინი არ გაქვს.')
  const kb = new InlineKeyboard()
  list.forEach((t) => kb.text(`${t.name} ($${t.symbol})`, `rm:${t.mint}`).row())
  await ctx.reply('რომელი პულიდან მოვხსნა ლიკვიდობა?', { reply_markup: kb })
})

bot.callbackQuery(/^rm:(.+)$/, async (ctx) => {
  const t = await getToken(ctx.match[1])
  if (!t?.poolId) return ctx.reply('პული ვერ ვიპოვე.')
  clearS(ctx.from.id); setS(ctx.from.id, 'rm_pct', { mint: t.mint })
  await ctx.reply(`🔻 ${esc(t.name)} — რამდენი პროცენტი მოვხსნა?`, {
    reply_markup: new InlineKeyboard().text('25%', 'rp:25').text('50%', 'rp:50').text('100%', 'rp:100'),
  })
})

bot.callbackQuery(/^rp:(25|50|100)$/, async (ctx) => {
  const id = ctx.from.id
  if (getS(id)?.step !== 'rm_pct') return
  setS(id, 'confirm_rm', { percent: Number(ctx.match[1]) })
  const d = getS(id).data; const t = await getToken(d.mint)
  await ctx.reply(`მოვხსნა ${d.percent}% ლიკვიდობა <b>${esc(t.name)}</b>-დან?`, { ...HTML, reply_markup: confirmKb('rm_go') })
})

bot.callbackQuery('rm_go', async (ctx) => {
  const id = ctx.from.id; const s = getS(id)
  if (s?.step !== 'confirm_rm') return
  const { mint, percent } = s.data; clearS(id)
  const t = await getToken(mint)
  const msg = await ctx.reply('⏳ ლიკვიდობის მოხსნა...')
  const edit = (txt) => ctx.api.editMessageText(msg.chat.id, msg.message_id, txt, HTML)
  try {
    const txId = await removeLiquidity({ poolId: t.poolId, percent })
    const [sol, tok] = await Promise.all([getBalance(), getTokenBalance(mint)])
    await edit(
      `✅ ${percent}% მოიხსნა · ${txLink(txId)}\n\n💰 SOL: <b>${sol.toFixed(4)}</b>\n🪙 ${esc(t.symbol)}: ${tok.ui}\n\n` +
      `SOL-ის გასატანად: მენიუ → 💸 SOL-ის გატანა`
    )
  } catch (e) {
    console.error(e)
    await edit(`❌ შეცდომა: ${errText(e)}`)
  }
})

// ================= 4. SOL-ის გატანა =================
bot.callbackQuery('withdraw', async (ctx) => {
  clearS(ctx.from.id); setS(ctx.from.id, 'wd_addr')
  await ctx.reply('💸 მიმღების Solana მისამართი (მაგ: შენი Phantom):')
})

bot.callbackQuery('wd_go', async (ctx) => {
  const id = ctx.from.id; const s = getS(id)
  if (s?.step !== 'confirm_wd') return
  const { to, amount } = s.data; clearS(id)
  try {
    const { sig, sol } = await sendSol(to, amount)
    await ctx.reply(`✅ გაიგზავნა ${sol} SOL · ${txLink(sig)}`, HTML)
  } catch (e) {
    console.error(e)
    await ctx.reply(`❌ შეცდომა: ${errText(e)}`, HTML)
  }
})

// ================= ტექსტური ნაბიჯები =================
bot.on('message', async (ctx) => {
  const id = ctx.from.id
  const s = getS(id)
  if (!s) return showMenu(ctx)
  const text = ctx.message.text?.trim()

  switch (s.step) {
    // --- ქოინის შექმნა ---
    case 'name':
      if (!text || text.length > 32) return ctx.reply('სახელი უნდა იყოს 1–32 სიმბოლო.')
      setS(id, 'symbol', { name: text })
      return ctx.reply('2/7 🔤 სიმბოლო / ticker (მაგ: GDOGE, მაქს. 10):')

    case 'symbol': {
      const symbol = (text || '').replace('$', '').toUpperCase()
      if (!symbol || symbol.length > 10) return ctx.reply('სიმბოლო უნდა იყოს 1–10 სიმბოლო.')
      setS(id, 'desc', { symbol })
      return ctx.reply('3/7 📝 აღწერა (ან "-" გამოსატოვებლად):')
    }

    case 'desc':
      if (!text) return ctx.reply('დაწერე აღწერა ან "-".')
      setS(id, 'image', { description: text === '-' ? '' : text })
      return ctx.reply('4/7 🖼 გამომიგზავნე ლოგო (კვადრატული სურათი):')

    case 'image': {
      const photo = ctx.message.photo?.at(-1)
      const doc = ctx.message.document
      const fileId = photo?.file_id || (doc?.mime_type?.startsWith('image/') ? doc.file_id : null)
      if (!fileId) return ctx.reply('გამომიგზავნე სურათი.')
      setS(id, 'socials', { imageFileId: fileId, imageMime: doc?.mime_type || 'image/jpeg' })
      return ctx.reply('5/7 🔗 ლინკები — Website, X, Telegram (თითო ხაზზე) ან "-":')
    }

    case 'socials': {
      const socials = {}
      if (text && text !== '-') {
        for (const u of text.split(/\s+/).filter((x) => /^https?:\/\//i.test(x))) {
          if (/(x\.com|twitter\.com)/i.test(u)) socials.twitter = u
          else if (/t\.me\//i.test(u)) socials.telegram = u
          else socials.website = u
        }
      }
      setS(id, 'supply', { socials })
      return ctx.reply('6/7 🔢 რაოდენობა (supply), მაგ: 1000000000')
    }

    case 'supply': {
      const n = (text || '').replace(/[_,\s]/g, '')
      if (!/^\d+$/.test(n) || BigInt(n) <= 0n) return ctx.reply('მხოლოდ მთელი რიცხვი, მაგ: 1000000000')
      setS(id, 'decimals', { supply: n })
      return ctx.reply('7/7 Decimals (pump.fun სტილი = 6):', {
        reply_markup: new InlineKeyboard().text('6', 'dec:6').text('9', 'dec:9'),
      })
    }

    // --- ლიკვიდობის დამატება ---
    case 'lp_tokens': {
      const amt = text?.toLowerCase() === 'all' ? s.data.tokenBal : text
      if (!isNum(amt) || Number(amt) > Number(s.data.tokenBal)) return ctx.reply('არასწორი რაოდენობა.')
      setS(id, 'lp_sol', { tokenAmount: amt })
      const bal = await getBalance()
      return ctx.reply(
        `რამდენი SOL ჩავდო? (ბალანსი: ${bal.toFixed(4)} SOL)\n` +
        `⚠️ პულის შექმნას დამატებით დაახლ. 0.2 SOL სჭირდება (Raydium-ის საკომისიო + rent).`
      )
    }

    case 'lp_sol': {
      if (!isNum(text)) return ctx.reply('ჩაწერე რიცხვი, მაგ: 1.5')
      setS(id, 'confirm_lp', { solAmount: text })
      const d = getS(id).data; const t = await getToken(d.mint)
      const price = Number(text) / Number(d.tokenAmount)
      return ctx.reply(
        `📋 <b>პული:</b>\n${d.tokenAmount} ${esc(t.symbol)} + ${text} SOL\n` +
        `საწყისი ფასი: ${price.toExponential(4)} SOL / ${esc(t.symbol)}`,
        { ...HTML, reply_markup: confirmKb('lp_go') }
      )
    }

    // --- SOL-ის გატანა ---
    case 'wd_addr':
      try { new PublicKey(text) } catch { return ctx.reply('არასწორი მისამართი.') }
      setS(id, 'wd_amt', { to: text })
      return ctx.reply(`რამდენი SOL? (ბალანსი: ${(await getBalance()).toFixed(4)})\nან <code>max</code>`, HTML)

    case 'wd_amt': {
      const amount = text?.toLowerCase() === 'max' ? 'max' : text
      if (amount !== 'max' && !isNum(amount)) return ctx.reply('ჩაწერე რიცხვი ან max')
      setS(id, 'confirm_wd', { amount })
      return ctx.reply(
        `გავგზავნო <b>${amount === 'max' ? 'მთელი ბალანსი' : amount + ' SOL'}</b>\n→ <code>${esc(s.data.to)}</code>?`,
        { ...HTML, reply_markup: confirmKb('wd_go') }
      )
    }

    default:
      return ctx.reply('გამოიყენე ღილაკები ან /cancel')
  }
})

bot.callbackQuery('lp_go', async (ctx) => {
  const id = ctx.from.id; const s = getS(id)
  if (s?.step !== 'confirm_lp') return
  const d = s.data; clearS(id)
  const t = await getToken(d.mint)
  const msg = await ctx.reply('⏳ Raydium პულის შექმნა...')
  const edit = (txt, extra = {}) => ctx.api.editMessageText(msg.chat.id, msg.message_id, txt, { ...HTML, ...extra })
  try {
    const { txId, poolId, lpMint } = await createPool(d)
    await updateToken(d.mint, { poolId, lpMint })
    const links = [
      `<a href="https://raydium.io/swap/?inputMint=sol&outputMint=${d.mint}">Raydium</a>`,
      CLUSTER === 'mainnet' ? `<a href="https://dexscreener.com/solana/${poolId}">DexScreener</a>` : null,
      txLink(txId),
    ].filter(Boolean).join(' · ')
    await edit(`✅ პული შეიქმნა — <b>${esc(t.symbol)}</b> უკვე იყიდება!\n\nPool: <code>${poolId}</code>\n${links}`)
  } catch (e) {
    console.error(e)
    await edit(`❌ შეცდომა: ${errText(e)}`)
  }
})

bot.catch((err) => console.error('Bot error:', err))

await bot.api.setMyCommands([
  { command: 'start', description: 'მთავარი მენიუ' },
  { command: 'cancel', description: 'მიმდინარე მოქმედების გაუქმება' },
  { command: 'myid', description: 'ჩემი Telegram ID' },
])
bot.start({ onStart: (me) => console.log(`✅ @${me.username} გაეშვა (${CLUSTER})`) })
