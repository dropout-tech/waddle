import { isNative } from '@/lib/platform'

// File export helpers that branch web vs native. On web we use the standard
// blob-download / clipboard APIs; inside the Capacitor WebView those are
// unreliable (no real download folder, clipboard image write is restricted), so
// we write to the app cache and open the native iOS share sheet instead.

/** Base64-encode a Blob without the `data:<mime>;base64,` prefix. */
function blobToBase64(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onloadend = () => resolve(String(reader.result).split(',')[1] ?? '')
    reader.onerror = reject
    reader.readAsDataURL(blob)
  })
}

/**
 * Save or share a generated file. Native writes to the cache directory and
 * opens the share sheet; web triggers a normal download.
 */
export async function saveOrShareBlob(blob: Blob, filename: string): Promise<void> {
  if (isNative()) {
    const [{ Filesystem, Directory }, { Share }] = await Promise.all([
      import('@capacitor/filesystem'),
      import('@capacitor/share'),
    ])
    const written = await Filesystem.writeFile({
      path: filename,
      data: await blobToBase64(blob),
      directory: Directory.Cache,
    })
    await Share.share({ url: written.uri })
    return
  }

  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  a.click()
  URL.revokeObjectURL(url)
}

export type CopyImageResult = 'copied' | 'shared' | 'unsupported'

/**
 * Copy an image to the clipboard. On web uses the async Clipboard API; on native
 * the clipboard only handles text/URLs, so image-copy degrades to the share
 * sheet. The return value tells the caller which toast to show.
 */
export async function copyImageToClipboard(
  blob: Blob,
  shareFilename: string,
): Promise<CopyImageResult> {
  if (isNative()) {
    await saveOrShareBlob(blob, shareFilename)
    return 'shared'
  }

  if (typeof navigator !== 'undefined' && navigator.clipboard && 'write' in navigator.clipboard) {
    await navigator.clipboard.write([new ClipboardItem({ 'image/png': blob })])
    return 'copied'
  }

  return 'unsupported'
}
