import { Extension, InputRule } from '@tiptap/react'
import { solveBeforeEquals } from '@/lib/inline-math'

// Typing "=" after a calculation appends the answer: "120*3=" → "120*3=360".
// Tiptap's input-rule runner already skips code blocks / inline code and
// waits out IME composition, and a Backspace right after the rule fires
// undoes it (core's undoInputRule), leaving just "120*3=".
export const InlineMath = Extension.create({
  name: 'inlineMath',

  addInputRules() {
    return [
      new InputRule({
        find: /([^\n]*)([=＝])$/,
        handler: ({ state, range, match }) => {
          const result = solveBeforeEquals(match[1])
          if (result === null) return null
          // range.to is where the typed "=" would land; insert it ourselves
          // together with the result.
          state.tr.insertText(match[2] + result, range.to)
        },
      }),
    ]
  },
})
