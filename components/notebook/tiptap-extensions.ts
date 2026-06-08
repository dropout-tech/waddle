import StarterKit from '@tiptap/starter-kit'
import TaskList from '@tiptap/extension-task-list'
import TaskItem from '@tiptap/extension-task-item'
import Placeholder from '@tiptap/extension-placeholder'
import { Details, DetailsSummary, DetailsContent } from '@tiptap/extension-details'
import type { Extensions } from '@tiptap/react'

// Shared editor vocabulary for the notebook. StarterKit (v3) already bundles
// bold / italic / underline / strike / code / headings / bullet+ordered lists /
// blockquote / code-block / horizontal-rule / link, so we only add the pieces it
// doesn't: checkable todo lists (task-list), Notion-style collapsible toggles
// (details), and the empty-state placeholder.
export function notebookExtensions(placeholder: string): Extensions {
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
    Placeholder.configure({
      placeholder: ({ node }) => {
        if (node.type.name === 'heading') return '標題'
        if (node.type.name === 'detailsSummary') return '收合標題'
        return placeholder
      },
      includeChildren: true,
    }),
  ]
}
