import { describe, expect, it } from 'vitest'
import { base64ToBytes, bytesToBase64, fitWithin, formatBytes, grayContrast, PHOTO_MAX_SIDE, startingPhotoStatus } from './photo'

describe('bill photo helpers', () => {
  it('shrinks to the long side and never enlarges', () => {
    expect(fitWithin(4000, 3000, PHOTO_MAX_SIDE)).toEqual({ width: 1600, height: 1200 })
    expect(fitWithin(3000, 4000, PHOTO_MAX_SIDE)).toEqual({ width: 1200, height: 1600 })
    expect(fitWithin(800, 600, PHOTO_MAX_SIDE)).toEqual({ width: 800, height: 600 })
  })

  it('turns pixels grey and stretches dull paper to full contrast', () => {
    // A dim, slightly blue photo: paper at ~170, ink at ~70.
    const px = new Uint8ClampedArray(200 * 4)
    for (let i = 0; i < 200; i++) {
      const ink = i % 10 === 0
      px.set(ink ? [60, 70, 90, 255] : [160, 170, 190, 255], i * 4)
    }
    grayContrast(px)
    for (let i = 0; i < px.length; i += 4) {
      expect(px[i]).toBe(px[i + 1])
      expect(px[i + 1]).toBe(px[i + 2])
      expect(px[i + 3]).toBe(255)
    }
    expect(px[0]).toBe(0)
    expect(px[4]).toBe(255)
  })

  it('round-trips image bytes through base64, including large files', () => {
    const bytes = new Uint8Array(100_000).map((_, i) => (i * 31) % 256)
    expect(base64ToBytes(bytesToBase64(bytes))).toEqual(bytes)
  })

  it('formats sizes in Nepali digits when asked', () => {
    expect(formatBytes(512)).toBe('512 B')
    expect(formatBytes(184_321)).toBe('184 KB')
    expect(formatBytes(1_520_000)).toBe('1.5 MB')
    expect(formatBytes(184_321, (s) => s.replace(/\d/g, (d) => '०१२३४५६७८९'[Number(d)]))).toBe('१८४ KB')
  })

  it('only waits in "to enter" when there is a bill to type in', () => {
    expect(startingPhotoStatus('sale')).toBe('pending')
    expect(startingPhotoStatus('purchase')).toBe('pending')
    expect(startingPhotoStatus('other')).toBe('done')
    expect(startingPhotoStatus('sale', 'bill-1')).toBe('done')
  })
})
