// Character formatting (colour / marker / size marks) must never blank a
// document in an older build: Tiptap replaces a document holding an unknown
// mark with an empty one. Stored documents are therefore "packed" — see
// lib/styled-doc.ts. Plain whiteboard cards keep text in `content` and the
// formatting in metadata.inline, used only while the text still matches.
import test from 'node:test'
import assert from 'node:assert/strict'
import { getSchema } from '@tiptap/react'
import StarterKit from '@tiptap/starter-kit'
import {
  cardInlineDoc,
  documentRuns,
  hasInlineFormatting,
  packStyledDoc,
  paragraphsToText,
  removeMarks,
  textToParagraphs,
  unpackStyledDoc,
} from '../../lib/styled-doc.ts'

const red = { type: 'textColor', attrs: { color: 'red' } }
const styled = {
  type: 'doc',
  content: [
    { type: 'paragraph', content: [{ type: 'text', text: '本週' }, { type: 'text', text: '重點', marks: [{ type: 'bold' }, red] }] },
    { type: 'paragraph', content: [{ type: 'text', text: '大字', marks: [{ type: 'textSize', attrs: { size: 'xl' } }] }] },
  ],
}

// An older build's schema: StarterKit only, no colour / marker / size marks.
const oldSchema = getSchema([StarterKit])

test('an older build cannot parse the raw styled document (why packing exists)', () => {
  assert.throws(() => oldSchema.nodeFromJSON(styled))
})

test('an older build parses the packed document and keeps every character', () => {
  const packed = packStyledDoc(styled)
  const parsed = oldSchema.nodeFromJSON(packed)
  assert.equal(parsed.textContent, '本週重點大字')
  // Bold is a mark every build knows, so it survives in the visible content.
  assert.deepEqual(parsed.toJSON().content[0].content[1].marks, [{ type: 'bold' }])
  // The styled copy lives in doc attrs, which ProseMirror drops on parse.
  assert.equal(parsed.toJSON().attrs, undefined)
})

test('pack → unpack round-trips the formatting', () => {
  assert.deepEqual(unpackStyledDoc(packStyledDoc(styled)), styled)
})

test('documents without colour / marker / size are stored unchanged', () => {
  const plain = { type: 'doc', content: [{ type: 'paragraph', content: [{ type: 'text', text: 'hi', marks: [{ type: 'bold' }] }] }] }
  assert.deepEqual(packStyledDoc(plain), plain)
  assert.deepEqual(unpackStyledDoc(plain), plain)
})

test('unpack survives jsonb key reordering', () => {
  const packed = JSON.parse(JSON.stringify(packStyledDoc(styled), (key, value) =>
    value && typeof value === 'object' && !Array.isArray(value) ? Object.fromEntries(Object.entries(value).reverse()) : value))
  assert.deepEqual(unpackStyledDoc(packed).content[0].content[1].marks.map(m => m.type).sort(), ['bold', 'textColor'])
})

test('an older build that rewrote the text wins over the stale styled copy', () => {
  const packed = packStyledDoc(styled)
  const edited = { ...packed, content: [{ type: 'paragraph', content: [{ type: 'text', text: '改過了' }] }] }
  assert.deepEqual(unpackStyledDoc(edited), { type: 'doc', content: edited.content })
  // An old build's save drops the attrs entirely: plain doc, still readable.
  assert.deepEqual(unpackStyledDoc({ type: 'doc', content: edited.content }), { type: 'doc', content: edited.content })
})

test('null / missing documents pass through', () => {
  assert.equal(unpackStyledDoc(null), null)
  assert.equal(unpackStyledDoc(undefined), undefined)
})

test('removeMarks clears one kind of formatting only', () => {
  const next = removeMarks(styled, ['textColor'])
  assert.deepEqual(next.content[0].content[1].marks, [{ type: 'bold' }])
  assert.deepEqual(next.content[1].content[0].marks, [{ type: 'textSize', attrs: { size: 'xl' } }])
})

test('card text ↔ paragraphs round-trip, empty lines included', () => {
  for (const text of ['', 'one', 'a\nb', 'a\n\nb\n', '120*3=360']) assert.equal(paragraphsToText(textToParagraphs(text)), text)
})

test('metadata.inline is used only while it matches the card text', () => {
  const inline = { type: 'doc', content: styled.content }
  assert.equal(cardInlineDoc({ content: '本週重點\n大字', metadata: { inline } }), inline)
  // An older build edited `content` only: fall back to the plain text.
  assert.equal(cardInlineDoc({ content: '本週重點\n大字！', metadata: { inline } }), null)
  assert.equal(cardInlineDoc({ content: 'x' }), null)
  assert.equal(cardInlineDoc({ content: 'x', metadata: { inline: { type: 'nope' } } }), null)
})

test('hasInlineFormatting sees StarterKit and style marks, not plain text', () => {
  assert.equal(hasInlineFormatting(textToParagraphs('plain')), false)
  assert.equal(hasInlineFormatting(styled), true)
})

test('documentRuns renders the same text as the plain-text mirror', () => {
  const runs = documentRuns(styled)
  assert.equal(runs.map(r => r.text).join(''), '本週重點\n大字')
  assert.deepEqual(runs[1].marks, [{ type: 'bold' }, red])
  // Hard breaks and trailing blank lines behave like whiteboardDocumentText.
  const doc = { type: 'doc', content: [{ type: 'paragraph', content: [{ type: 'text', text: 'a' }, { type: 'hardBreak' }, { type: 'text', text: 'b ' }] }, { type: 'paragraph' }] }
  assert.equal(documentRuns(doc).map(r => r.text).join(''), 'a\nb')
})
