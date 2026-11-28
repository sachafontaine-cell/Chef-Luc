// Photos picked on the phone, shrunk before they go anywhere.

async function draw(file: Blob, w: number, h: number, cover: boolean): Promise<HTMLCanvasElement> {
  const img = await createImageBitmap(file)
  const scale = cover ? Math.max(w / img.width, h / img.height) : Math.min(1, w / img.width, h / img.height)
  const cw = cover ? w : Math.round(img.width * scale), ch = cover ? h : Math.round(img.height * scale)
  const c = document.createElement('canvas')
  c.width = cw; c.height = ch
  const g = c.getContext('2d')!
  const dw = img.width * scale, dh = img.height * scale
  g.drawImage(img, (cw - dw) / 2, (ch - dh) / 2, dw, dh)
  img.close?.()
  return c
}

/** A page or screen photo for Luc to read: longest side 1600 px, JPEG, base64 without the prefix. */
export async function forReading(file: Blob): Promise<{ mime: string; data: string }> {
  const c = await draw(file, 1600, 1600, false)
  return { mime: 'image/jpeg', data: c.toDataURL('image/jpeg', 0.82).split(',')[1] }
}

/** The dish photo shown in the list: 240 × 180, like the card thumbnails (about 10 KB). */
export async function thumbnail(file: Blob): Promise<string> {
  const c = await draw(file, 240, 180, true)
  return c.toDataURL('image/jpeg', 0.72)
}
