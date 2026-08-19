/** Client-side downscale for bill photos.
 *
 *  This is not an optimisation — it is load-bearing. Vercel rejects any
 *  request body over 4.5MB before our function runs, and a modern phone
 *  camera routinely produces 4-12MB JPEGs (and HEICs, which most browsers
 *  can decode to a canvas even when they can't re-encode them). Uploading
 *  the original file would fail for a large fraction of real photos with an
 *  opaque 413, so every image goes through here first.
 *
 *  Resolution is capped rather than maximised on purpose: the vision model
 *  tiles images internally, so pixels beyond roughly this size cost upload
 *  time and quota without making the text any more legible.
 */

/** Long-edge cap in pixels. Comfortably above what the model resolves, while
 *  keeping a typical bill photo well under a megabyte. */
const MAX_EDGE = 1600

/** Re-encode quality. High enough to keep small printed digits crisp — the
 *  difference between a readable "8" and a "3" — without the size of lossless. */
const QUALITY = 0.82

/** Ceiling we aim to land under, leaving headroom below the platform's 4.5MB
 *  so the multipart envelope and other fields can never push us over. */
const TARGET_BYTES = 3.5 * 1024 * 1024

function loadImage(file: File): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file)
    const img = new Image()
    img.onload = () => {
      // Revoke only after decode, or Safari can race and draw a blank canvas.
      URL.revokeObjectURL(url)
      resolve(img)
    }
    img.onerror = () => {
      URL.revokeObjectURL(url)
      reject(new Error('Could not read that image.'))
    }
    img.src = url
  })
}

function toBlob(canvas: HTMLCanvasElement, quality: number): Promise<Blob | null> {
  return new Promise((resolve) => canvas.toBlob(resolve, 'image/jpeg', quality))
}

/** Downscales and re-encodes a photo to a JPEG small enough to upload.
 *
 *  Returns the original file untouched if it is already small and not a format
 *  we need to convert — re-encoding an already-tiny JPEG only loses detail.
 *  Falls back to the original on any canvas failure, so a browser quirk
 *  degrades to "maybe too large" rather than "cannot scan at all". */
export async function compressBillImage(file: File): Promise<File> {
  // PDFs have no canvas path and are already compact; pass them straight
  // through for the server to hand to the model.
  if (file.type === 'application/pdf') return file

  const alreadySmall = file.size <= TARGET_BYTES
  const isPlainJpeg = file.type === 'image/jpeg'
  if (alreadySmall && isPlainJpeg) return file

  try {
    const img = await loadImage(file)
    const { naturalWidth: w, naturalHeight: h } = img
    if (!w || !h) return file

    const scale = Math.min(1, MAX_EDGE / Math.max(w, h))
    const canvas = document.createElement('canvas')
    canvas.width = Math.max(1, Math.round(w * scale))
    canvas.height = Math.max(1, Math.round(h * scale))

    const ctx = canvas.getContext('2d')
    if (!ctx) return file
    ctx.drawImage(img, 0, 0, canvas.width, canvas.height)

    let blob = await toBlob(canvas, QUALITY)
    // One extra pass for the rare very dense photo that is still too big at
    // the capped resolution. Two attempts is enough in practice; looping
    // further trades visible latency for bytes that no longer matter.
    if (blob && blob.size > TARGET_BYTES) {
      blob = (await toBlob(canvas, 0.65)) ?? blob
    }
    if (!blob) return file

    // Only adopt the re-encode if it actually helped, so we never upload a
    // larger file than the user picked.
    if (blob.size >= file.size && isPlainJpeg) return file

    return new File([blob], file.name.replace(/\.[^.]+$/, '') + '.jpg', {
      type: 'image/jpeg',
      lastModified: Date.now(),
    })
  } catch {
    return file
  }
}
