import type { EditorView } from '@tiptap/pm/view'
import { toast } from 'sonner'

// Shared "pick a file → upload → insert an image node" plumbing, used by the
// slash command, the mobile toolbar button, and paste/drop. Operates at the
// ProseMirror view level (not the Tiptap Editor wrapper) so paste/drop —
// which only hand us a `view` — can share the exact same code path as the
// slash menu and toolbar (which have a full `Editor` but `editor.view` *is*
// this same view instance).

export const MAX_IMAGE_BYTES = 5 * 1024 * 1024

export type UploadImageFn = (file: File) => Promise<string>

/** Opens a native file picker (accept=image/*) and uploads+inserts on selection. */
export function pickAndInsertImage(
  view: EditorView,
  uploadImage: UploadImageFn,
  range?: { from: number; to: number },
) {
  const input = document.createElement('input')
  input.type = 'file'
  input.accept = 'image/*'
  input.onchange = () => {
    const file = input.files?.[0]
    if (file) void insertImage(view, uploadImage, file, range)
  }
  input.click()
}

/**
 * Uploads `file` and inserts it as an image node — at `range` (slash command:
 * replaces the "/query" text) or otherwise at `atPos` / the current selection
 * (toolbar button, paste, drop). Never fails silently: rejects oversized/
 * non-image files and upload errors via toast.
 */
export async function insertImage(
  view: EditorView,
  uploadImage: UploadImageFn,
  file: File,
  range?: { from: number; to: number },
  atPos?: number,
) {
  if (!file.type.startsWith('image/')) {
    toast.error('只能插入圖片檔')
    return
  }
  if (file.size > MAX_IMAGE_BYTES) {
    toast.error('圖片太大，上限 5MB')
    return
  }

  const toastId = toast.loading('上傳圖片中…')
  try {
    const src = await uploadImage(file)
    const { schema } = view.state
    const node = schema.nodes.image.create({ src })
    let tr = view.state.tr
    if (range) {
      tr = tr.delete(range.from, range.to)
      tr = tr.insert(range.from, node)
    } else {
      tr = tr.insert(atPos ?? view.state.selection.from, node)
    }
    view.dispatch(tr)
    view.focus()
    toast.success('圖片已插入', { id: toastId })
  } catch (e) {
    console.error('[notebook] image insert failed', e)
    toast.error('圖片上傳失敗，請再試一次', { id: toastId })
  }
}
