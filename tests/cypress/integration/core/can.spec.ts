/// <reference types="cypress" />

import { Editor, Extension } from '@tiptap/core'
import Bold from '@tiptap/extension-bold'
import Code from '@tiptap/extension-code'
import CodeBlock from '@tiptap/extension-code-block'
import Document from '@tiptap/extension-document'
import History from '@tiptap/extension-history'
import Paragraph from '@tiptap/extension-paragraph'
import Text from '@tiptap/extension-text'
import StarterKit from '@tiptap/starter-kit'

declare module '@tiptap/core' {
  interface Commands<ReturnType> {
    __errorCommandCheck__: {
      /**
       * A command for test.
       * @internal
       * @throws always throw an error when called.
       */
      throwErrorIfCalled: () => ReturnType,
    }
  }
}

describe('can', () => {
  const ErrorCommandExtension = Extension.create({
    addCommands() {
      return {
        throwErrorIfCalled: () => {
          return (): boolean => {
            throw new Error('I am a test error')
          }
        },
      }
    },
  })

  it('not undo', () => {
    const editor = new Editor({
      extensions: [Document, Paragraph, Text, History],
    })

    const canUndo = editor.can().undo()

    expect(canUndo).to.eq(false)
  })

  it('undo', () => {
    const editor = new Editor({
      extensions: [Document, Paragraph, Text, History],
    })

    editor.commands.setContent('foo')

    const canUndo = editor.can().undo()

    expect(canUndo).to.eq(true)
  })

  it('not chain undo', () => {
    const editor = new Editor({
      extensions: [Document, Paragraph, Text, History],
    })

    const canUndo = editor.can().chain().undo().run()

    expect(canUndo).to.eq(false)
  })

  it('chain undo', () => {
    const editor = new Editor({
      extensions: [Document, Paragraph, Text, History],
    })

    editor.commands.setContent('foo')

    const canUndo = editor.can().chain().undo().run()

    expect(canUndo).to.eq(true)
  })

  it('returns false for non-applicable marks when selection contains node in conflict', () => {
    const editor = new Editor({
      extensions: [Document, Paragraph, Text, History, CodeBlock, Bold],
    })

    editor
      .chain()
      .setCodeBlock()
      .insertContent('Test code block')
      .setTextSelection({ from: 2, to: 3 })
      .selectAll()
      .run()

    const canSetMarkToBold = editor.can().setMark('bold')

    expect(canSetMarkToBold).to.eq(false)
  })

  it('returns false for non-applicable marks when selection contains marks in conflict', () => {
    const editor = new Editor({
      extensions: [Document, Paragraph, Text, History, Code, Bold],
    })

    editor.chain().setContent('<code>test</code>').setTextSelection({ from: 2, to: 3 }).run()

    const canSetMarkToBold = editor.can().setMark('bold')

    expect(canSetMarkToBold).to.eq(false)
  })

  it('returns false for non-applicable marks when stored marks in conflict', () => {
    const editor = new Editor({
      extensions: [Document, Paragraph, Text, History, Code, Bold],
    })

    editor.chain().setContent('<code>test</code>').run()

    const canSetMarkToBold = editor.can().setMark('bold')

    expect(canSetMarkToBold).to.eq(false)
  })

  it('returns false for non-applicable marks when selecting multiple nodes in conflict', () => {
    const editor = new Editor({
      extensions: [Document, Paragraph, Text, History, Code, Bold],
    })

    editor.chain().setContent('<code>test</code><code>123</code>').selectAll().run()

    const canSetMarkToBold = editor.can().setMark('bold')

    expect(canSetMarkToBold).to.eq(false)
  })

  it('returns true for applicable marks when selection does not contain nodes in conflict', () => {
    const editor = new Editor({
      extensions: [Document, Paragraph, Text, History, CodeBlock, Bold],
    })

    editor
      .chain()
      .setCodeBlock()
      .insertContent('Test code block')
      .exitCode()
      .insertContent('Additional paragraph node')
      .selectAll()
      .run()

    const canSetMarkToBold = editor.can().setMark('bold')

    expect(canSetMarkToBold).to.eq(true)
  })

  it('returns true for applicable marks when stored marks are not in conflict', () => {
    const editor = new Editor({
      extensions: [Document, Paragraph, Text, History, Code, Bold],
    })

    editor.chain().setContent('<code>test</code>').toggleCode().run()

    const canSetMarkToBold = editor.can().setMark('bold')

    expect(canSetMarkToBold).to.eq(true)
  })

  it('returns true for applicable marks when selection does not contain marks in conflict', () => {
    const editor = new Editor({
      extensions: [Document, Paragraph, Text, History, Code, Bold],
    })

    editor
      .chain()
      .setContent('<code>test</code>')
      .setTextSelection({ from: 2, to: 3 })
      .toggleCode()
      .run()

    const canSetMarkToBold = editor.can().setMark('bold')

    expect(canSetMarkToBold).to.eq(true)
  })

  it('returns true for applicable marks if at least one node in selection has no marks in conflict', () => {
    const editor = new Editor({
      extensions: [Document, Paragraph, Text, History, Code, Bold],
    })

    editor.chain().setContent('<code>test</code><i>123</i>').selectAll().run()

    const canSetMarkToBold = editor.can().setMark('bold')

    expect(canSetMarkToBold).to.eq(true)
  })

  it('builds and passes down an undefined dispatch for nested "can" chain', () => {
    const editor = new Editor({
      extensions: [Document, Paragraph, Text, History],
    })

    let capturedOuterDispatch: ((args?: any) => any) | undefined
    let capturedInnerDispatch: ((args?: any) => any) | undefined

    editor
      .can()
      .chain()
      .command(({ chain, dispatch: outterDispatch }) => {
        capturedOuterDispatch = outterDispatch
        return chain()
          .command(({ dispatch: innerDispatch }) => {
            capturedInnerDispatch = innerDispatch
            return true
          })
          .run()
      })
      .run()

    // eslint-disable-next-line no-unused-expressions
    expect(capturedOuterDispatch).to.be.undefined
    // eslint-disable-next-line no-unused-expressions
    expect(capturedInnerDispatch).to.be.undefined
  })

  it('return false if a command throws an exception', () => {
    const editor = new Editor({
      extensions: [StarterKit, ErrorCommandExtension],
      content: '<p>tiptap</p>',
      autofocus: 'start',
    })

    // eslint-disable-next-line no-unused-expressions
    expect(editor.can().throwErrorIfCalled()).to.be.false
    // eslint-disable-next-line no-unused-expressions
    expect(editor.can().chain().throwErrorIfCalled().run()).to.be.false
    // eslint-disable-next-line no-unused-expressions
    expect(editor.can().chain().throwErrorIfCalled().toggleHeading({ level: 1 })
      .run()).to.be.false
  })
})
