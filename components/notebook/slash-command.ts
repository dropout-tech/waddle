import { Extension, ReactRenderer } from '@tiptap/react'
import { Suggestion, exitSuggestion } from '@tiptap/suggestion'
import { SlashMenu, filterSlashItems, type SlashItem, type SlashMenuHandle } from './slash-command-menu'
import type { UploadImageFn } from './upload-image'

// Notion's "/" block picker, wired through Tiptap's Suggestion utility.
// Positioning is hand-rolled (fixed + clientRect-based, flips above the caret
// near the bottom of the viewport) instead of pulling in @floating-ui/dom
// directly — that package isn't a direct dependency here and pnpm's strict
// node_modules layout will break on an un-declared import.
const MENU_HEIGHT = 320
const MENU_WIDTH = 240
const GAP = 8

export interface SlashCommandOptions {
  /** Passed through to the "圖片" item so it can upload + insert on pick. */
  uploadImage?: UploadImageFn
}

export const SlashCommand = Extension.create<SlashCommandOptions>({
  name: 'slashCommand',

  addOptions() {
    return { uploadImage: undefined }
  },

  addProseMirrorPlugins() {
    const { uploadImage } = this.options
    return [
      Suggestion<SlashItem, SlashItem>({
        editor: this.editor,
        char: '/',
        startOfLine: false,
        allowSpaces: false,
        items: ({ query }) => filterSlashItems(query, uploadImage),
        command: ({ editor, range, props }) => {
          props.run(editor, range)
        },
        render: () => {
          let component: ReactRenderer<
            SlashMenuHandle,
            { items: SlashItem[]; command: (item: SlashItem) => void }
          > | null = null
          let popup: HTMLDivElement | null = null
          let caretRect: (() => DOMRect | null) | null | undefined = null

          // Room the menu may use: the visible viewport minus the phone's
          // keyboard-docked formatting bar (EditorToolbar). Without the bar
          // the menu opened below a mid-screen caret and slid under it.
          const bounds = () => {
            const vv = window.visualViewport
            const top = vv ? vv.offsetTop : 0
            let bottom = vv ? vv.offsetTop + vv.height : window.innerHeight
            const bar = document.querySelector('[data-nb-keyboard-bar]')?.getBoundingClientRect()
            if (bar && bar.height > 0 && bar.top > top) bottom = Math.min(bottom, bar.top)
            return { top, bottom }
          }

          const position = (rect: DOMRect | null | undefined) => {
            if (!popup || !rect) return
            const list = popup.querySelector<HTMLElement>('[role="listbox"]')
            if (list) list.style.maxHeight = ''
            const natural = Math.min(list?.offsetHeight || MENU_HEIGHT, MENU_HEIGHT)
            const { top, bottom } = bounds()
            // A caret hidden behind the bar still anchors the menu above the bar.
            const anchorTop = Math.min(rect.top, bottom)
            const spaceBelow = bottom - rect.bottom - GAP * 2
            const spaceAbove = anchorTop - top - GAP * 2
            // Below if it fits, else above if it fits, else the roomier side
            // with the list capped to that room (it scrolls).
            const flipUp = spaceBelow < natural && (spaceAbove >= natural || spaceAbove > spaceBelow)
            const room = flipUp ? spaceAbove : spaceBelow
            if (list && room < natural) list.style.maxHeight = `${Math.max(room, 96)}px`
            popup.style.left = `${Math.max(GAP, Math.min(rect.left, window.innerWidth - MENU_WIDTH - GAP))}px`
            if (flipUp) {
              popup.style.top = 'auto'
              popup.style.bottom = `${window.innerHeight - anchorTop + GAP}px`
            } else {
              popup.style.bottom = 'auto'
              popup.style.top = `${rect.bottom + GAP}px`
            }
          }
          // The keyboard (and the bar riding on it) can move while the menu
          // is open — e.g. it finishes sliding up after "/" was typed.
          const reposition = () => position(caretRect?.())

          return {
            onStart: (props) => {
              component = new ReactRenderer(SlashMenu, {
                props: { items: props.items, command: (item: SlashItem) => props.command(item) },
                editor: props.editor,
              })
              popup = document.createElement('div')
              popup.className = 'nb-slash-menu fixed z-50'
              popup.style.display = props.items.length === 0 ? 'none' : ''
              popup.appendChild(component.element)
              // Whiteboard uses a focused document layer. Keep its menu within
              // the dialog so modal pointer/focus guards permit interaction.
              const overlay = props.editor.view.dom.closest('[data-whiteboard-detail]')
              ;(overlay ?? document.body).appendChild(popup)
              caretRect = props.clientRect
              position(props.clientRect?.())
              // The list renders a frame later; measure and cap it then.
              requestAnimationFrame(reposition)
              window.visualViewport?.addEventListener('resize', reposition)
              window.visualViewport?.addEventListener('scroll', reposition)
            },
            onUpdate: (props) => {
              component?.updateProps({
                items: props.items,
                command: (item: SlashItem) => props.command(item),
              })
              if (popup) popup.style.display = props.items.length === 0 ? 'none' : ''
              caretRect = props.clientRect
              position(props.clientRect?.())
            },
            onKeyDown: (props) => {
              if (props.event.key === 'Escape') {
                exitSuggestion(props.view)
                return true
              }
              return component?.ref?.onKeyDown({ event: props.event }) ?? false
            },
            onExit: () => {
              window.visualViewport?.removeEventListener('resize', reposition)
              window.visualViewport?.removeEventListener('scroll', reposition)
              caretRect = null
              popup?.remove()
              popup = null
              component?.destroy()
              component = null
            },
          }
        },
      }),
    ]
  },
})
