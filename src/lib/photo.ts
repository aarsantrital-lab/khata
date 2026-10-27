/** Long side of a stored bill photo. Handwriting stays readable and files stay around 150–400 KB. */
export const PHOTO_MAX_SIDE = 1600
export const PHOTO_QUALITY = 0.62
export const THUMB_MAX_SIDE = 240
/** The sync server refuses larger images (see supabase/schema.sql). */
export const PHOTO_MAX_BYTES = 1_500_000

export function fitWithin(width: number, height: number, maxSide: number): { width: number; height: number } {
  const scale = Math.min(1, maxSide / Math.max(width, height, 1))
  return { width: Math.max(1, Math.round(width * scale)), height: Math.max(1, Math.round(height * scale)) }
}

/**
 * Turns RGBA pixels grey and stretches the contrast so ink stands out from paper. The
 * darkest and brightest 1% are clipped, which also removes most of a phone camera's shadow.
 */
export function grayContrast(px: Uint8ClampedArray, contrast = 1.15): void {
  const hist = new Uint32Array(256)
  const n = px.length / 4
  for (let i = 0; i < px.length; i += 4) {
    const lum = Math.round(0.299 * px[i] + 0.587 * px[i + 1] + 0.114 * px[i + 2])
    px[i] = lum
    hist[lum]++
  }
  const clip = Math.floor(n * 0.01)
  let lo = 0
  for (let acc = 0; lo < 255 && acc + hist[lo] <= clip; lo++) acc += hist[lo]
  let hi = 255
  for (let acc = 0; hi > lo && acc + hist[hi] <= clip; hi--) acc += hist[hi]
  const range = Math.max(1, hi - lo)
  const lut = new Uint8ClampedArray(256)
  for (let v = 0; v < 256; v++) lut[v] = (((v - lo) * 255) / range - 128) * contrast + 128
  for (let i = 0; i < px.length; i += 4) {
    const v = lut[px[i]]
    px[i] = v
    px[i + 1] = v
    px[i + 2] = v
  }
}

export function formatBytes(bytes: number, digits: (s: string) => string = (s) => s): string {
  if (bytes < 1000) return digits(`${bytes} B`)
  if (bytes < 1_000_000) return digits(`${Math.round(bytes / 1000)} KB`)
  return digits(`${(bytes / 1_000_000).toFixed(1)} MB`)
}

export function bytesToBase64(bytes: Uint8Array): string {
  let s = ''
  for (let i = 0; i < bytes.length; i += 0x8000) s += String.fromCharCode(...bytes.subarray(i, i + 0x8000))
  return btoa(s)
}

export function base64ToBytes(b64: string): Uint8Array {
  const s = atob(b64)
  const out = new Uint8Array(s.length)
  for (let i = 0; i < s.length; i++) out[i] = s.charCodeAt(i)
  return out
}

export interface CompressedPhoto {
  data: Uint8Array
  type: string
  width: number
  height: number
  thumb: string
}

async function decode(file: Blob): Promise<CanvasImageSource & { width: number; height: number }> {
  if (typeof createImageBitmap === 'function') {
    try {
      return await createImageBitmap(file, { imageOrientation: 'from-image' })
    } catch {
      // Some browsers cannot decode every format this way; fall back to an <img>.
    }
  }
  const url = URL.createObjectURL(file)
  try {
    const img = new Image()
    img.src = url
    await img.decode()
    return img
  } finally {
    URL.revokeObjectURL(url)
  }
}

const toBlob = (canvas: HTMLCanvasElement, type: string, quality: number) =>
  new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, type, quality))

/** Shrinks a camera photo of a bill, turns it grey with extra contrast, and makes a tiny preview. */
export async function compressPhoto(file: Blob): Promise<CompressedPhoto> {
  const source = await decode(file)
  const { width, height } = fitWithin(source.width, source.height, PHOTO_MAX_SIDE)
  const canvas = document.createElement('canvas')
  canvas.width = width
  canvas.height = height
  const ctx = canvas.getContext('2d', { willReadFrequently: true })
  if (!ctx) throw new Error('photo_err')
  ctx.drawImage(source, 0, 0, width, height)
  if ('close' in source && typeof source.close === 'function') source.close()
  const pixels = ctx.getImageData(0, 0, width, height)
  grayContrast(pixels.data)
  ctx.putImageData(pixels, 0, 0)

  // Browsers without WebP encoding hand back a PNG instead; JPEG is the smaller fallback.
  let blob = await toBlob(canvas, 'image/webp', PHOTO_QUALITY)
  if (!blob || blob.type !== 'image/webp') blob = await toBlob(canvas, 'image/jpeg', 0.7)
  if (!blob) throw new Error('photo_err')

  const t = fitWithin(width, height, THUMB_MAX_SIDE)
  const thumbCanvas = document.createElement('canvas')
  thumbCanvas.width = t.width
  thumbCanvas.height = t.height
  thumbCanvas.getContext('2d')!.drawImage(canvas, 0, 0, t.width, t.height)

  return {
    data: new Uint8Array(await blob.arrayBuffer()),
    type: blob.type,
    width,
    height,
    thumb: thumbCanvas.toDataURL('image/jpeg', 0.55),
  }
}

export function photoKindKey(kind: 'sale' | 'purchase' | 'other') {
  return kind === 'other' ? ('photo_kind_other' as const) : kind
}

/** A cheque or letter has nothing to type in, and a photo added to a bill is already entered. */
export function startingPhotoStatus(kind: 'sale' | 'purchase' | 'other', billId?: string): 'pending' | 'done' {
  return billId || kind === 'other' ? 'done' : 'pending'
}

/** Where "Enter this bill" goes: a new bill of the photo's kind with the photo shown beside the form. */
export function enterBillPath(photo: { id: string; kind: 'sale' | 'purchase' | 'other'; partyId?: string }): string {
  const kind = photo.kind === 'purchase' ? 'purchase' : 'sale'
  return `/bills/new/${kind}?photo=${photo.id}${photo.partyId ? `&party=${photo.partyId}` : ''}`
}
