// ლოგოსა და მეტადატის ატვირთვა IPFS-ზე (Pinata)
import { PINATA_JWT } from './config.js'

const GATEWAY = 'https://gateway.pinata.cloud/ipfs/'
const auth = { Authorization: `Bearer ${PINATA_JWT}` }

export async function uploadFile(buffer, filename, mime = 'image/png') {
  const form = new FormData()
  form.append('file', new Blob([buffer], { type: mime }), filename)
  const r = await fetch('https://api.pinata.cloud/pinning/pinFileToIPFS', { method: 'POST', headers: auth, body: form })
  if (!r.ok) throw new Error(`Pinata (ფაილი): ${await r.text()}`)
  return GATEWAY + (await r.json()).IpfsHash
}

export async function uploadJSON(obj, name) {
  const r = await fetch('https://api.pinata.cloud/pinning/pinJSONToIPFS', {
    method: 'POST',
    headers: { ...auth, 'Content-Type': 'application/json' },
    body: JSON.stringify({ pinataContent: obj, pinataMetadata: { name: `${name}-metadata` } }),
  })
  if (!r.ok) throw new Error(`Pinata (JSON): ${await r.text()}`)
  return GATEWAY + (await r.json()).IpfsHash
}
