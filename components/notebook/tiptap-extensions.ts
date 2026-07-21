import StarterKit from '@tiptap/starter-kit'
import TaskList from '@tiptap/extension-task-list'
import TaskItem from '@tiptap/extension-task-item'
import Placeholder from '@tiptap/extension-placeholder'
import Image from '@tiptap/extension-image'
import { Details, DetailsSummary, DetailsContent } from '@tiptap/extension-details'
import type { Extensions } from '@tiptap/react'
import { t } from '@/lib/i18n'
import { SlashCommand } from './slash-command'
import type { UploadImageFn } from './upload-image'

// Shared editor vocabulary for the notebook. StarterKit (v3) already bundles
// bold / italic / underline / strike / code / headings / bullet+ordered lists /
// blockquote / code-block / horizontal-rule / link, so we only add the pieces it
// doesn't: checkable todo lists (task-list), Notion-style collapsible toggles
// (details), block images (image, uploaded to Supabase Storage — never
// base64 into the JSON column), and the empty-state placeholder.
// `placeholder` is resolved via t() *inside* the Placeholder decoration
// callback (called by ProseMirror on every relevant transaction, not once at
// construction) so the empty-state copy follows a live language switch even
// though the Tiptap editor instance itself isn't recreated when the app
// language changes.
export function notebookExtensions(uploadImage: UploadImageFn): Extensions {
  return [
    StarterKit.configure({
      heading: { levels: [1, 2, 3] },
      // Don't navigate away mid-edit when a link is clicked; the toolbar/marks
      // own link behaviour instead.
      link: { openOnClick: false, autolink: true },
    }),
    TaskList,
    TaskItem.configure({ nested: true }),
    Details.configure({ persist: true, HTMLAttributes: { class: 'nb-details' } }),
    DetailsSummary,
    DetailsContent,
    Image.configure({ allowBase64: false, HTMLAttributes: { class: 'nb-image' } }),
    SlashCommand.configure({ uploadImage }),
    Placeholder.configure({
      placeholder: ({ node }) => {
        if (node.type.name === 'heading') return t('標題')
        if (node.type.name === 'detailsSummary') return t('收合標題')
        return t('輸入文字，或輸入「/」加入區塊…')
      },
      includeChildren: true,
    }),
  ]
}
