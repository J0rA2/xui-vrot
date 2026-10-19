# Memecoin Bot (Solana · Telegram)

ქოინის შექმნა → Raydium პული → ლიკვიდობის მოხსნა → SOL-ის გატანა, ყველაფერი ტელეგრამიდან.

## გაშვება
1. `@BotFather` → ახალი ბოტი → token
2. Phantom-ში **ახალი** საფულე → Settings → Export Private Key
3. pinata.cloud → უფასო ანგარიში → API Key → JWT
4. helius.dev → უფასო RPC URL
5. `.env.example` → `.env`, შეავსე
6. `npm install && npm start`
7. ბოტში `/myid` → ID ჩაწერე `ADMIN_IDS`-ში → რესტარტი → `/start`

## უფასო ჰოსტინგი: Render + cron-job.org + Upstash
- render.com → New → Web Service → GitHub repo → Build: `npm install`, Start: `npm start`, Instance: **Free**
- Environment-ში ჩაწერე `.env`-ის ყველა ცვლადი
- upstash.com → Redis → Create (Free) → REST URL და Token ჩაწერე Render-ის Environment-ში
- cron-job.org → Create cronjob → შენი `https://xxx.onrender.com` → ყოველ 10 წუთში
- შემოწმება: ლინკი ბრაუზერში უნდა აჩვენებდეს `storage=redis`. თუ წერს `storage=file`, Upstash-ის ცვლადები არასწორია

## ქოინები გაქრა?
ბოტში `/recover` ან ♻️ ღილაკი: საფულიდან და ბლოკჩეინიდან პოულობს ყველა ქოინს, რომელიც ამ საფულემ შექმნა, და მათ Raydium პულებს.

## 🚀 Pump.fun
მენიუ → 🚀 ქოინის შექმნა (Pump.fun). ქოინი იქმნება მხოლოდ Pump.fun-ზე; ლიკვიდობის ფუნქციები ძველი Raydium ქოინებისთვის დარჩა. მუშაობს PumpPortal-ის API-ით (ტრანზაქციას ბოტი თავად აწერს ხელს, private key არსად იგზავნება). Supply ფიქსირებულია: 1B, decimals 6. მხოლოდ mainnet-ზე მუშაობს.

## ტესტი devnet-ზე
`CLUSTER=devnet`, SOL აიღე faucet.solana.com-დან. მუშაობს? → `CLUSTER=mainnet`.

## ხარჯები (დაახლ.)
- Pump.fun გაშვება: ~0.02–0.03 SOL + dev buy (dev buy-ზე სტანდარტული საკომისიო)
- ქოინის შექმნა (Raydium): ~0.02 SOL
- Raydium პული: ~0.2 SOL + რასაც ლიკვიდობაში ჩადებ
