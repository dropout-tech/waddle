import { Extension, ReactRenderer } from '@tiptap/react'
import { Suggestion, exitSuggestion } from '@tiptap/suggestion'
import { SlashMenu, filterSlashItems, type SlashItem, type SlashMenuHandle } from './slash-command-menu'

// Notion's "/" block picker, wired through Tiptap's Suggestion utility.
// Positioning is hand-rolled (fixed + clientRect-based, flips above the caret
// near the bottom of the viewport) instead of pulling in @floating-ui/dom
// directly — that package isn't a direct dependency here and pnpm's strict
// node_modules layout will break on an un-declared import.
const MENU_HEIGHT = 320
const MENU_WIDTH = 240
const GAP = 8

export const SlashCommand = Extension.create({
  name: 'slashCommand',

  addProseMirrorPlugins() {
    return [
      Suggestion<SlashItem, SlashItem>({
        editor: this.editor,
        char: '/',
        startOfLine: false,
        allowSpaces: false,
        items: ({ query }) => filterSlashItems(query),
        command: ({ editor, range, props }) => {
          props.run(editor, range)
        },
        render: () => {
          let component: ReactRenderer<
            SlashMenuHandle,
            { items: SlashItem[]; command: (item: SlashItem) => void }
          > | null = null
          let popup: HTMLDivElement | null = null

          const position = (rect: DOMRect | null | undefined) => {
            if (!popup || !rect) return
            const spaceBelow = window.innerHeight - rect.bottom
            const flipUp = spaceBelow < MENU_HEIGHT + GAP && rect.top > MENU_HEIGHT
            popup.style.left = `${Math.max(GAP, Math.min(rect.left, window.innerWidth - MENU_WIDTH - GAP))}px`
            if (flipUp) {
              popup.style.top = 'auto'
              popup.style.bottom = `${window.innerHeight - rect.top + GAP}px`
            } else {
              popup.style.bottom = 'auto'
              popup.style.top = `${rect.bottom + GAP}px`
            }
          }

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
              document.body.appendChild(popup)
              position(props.clientRect?.())
            },
            onUpdate: (props) => {
              component?.updateProps({
                items: props.items,
                command: (item: SlashItem) => props.command(item),
              })
              if (popup) popup.style.display = props.items.length === 0 ? 'none' : ''
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
