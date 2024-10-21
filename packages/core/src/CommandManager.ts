import { EditorState, Transaction } from '@tiptap/pm/state'

import { Editor } from './Editor.js'
import { createChainableState } from './helpers/createChainableState.js'
import {
  AnyCommands, CanCommands, ChainedCommands, CommandProps, SingleCommands,
} from './types.js'
import { isFunction } from './utilities/index.js'

const alwaysReturnFalse = () => false as const

export class CommandManager {
  editor: Editor

  rawCommands: AnyCommands

  customState?: EditorState

  constructor(props: { editor: Editor; state?: EditorState }) {
    this.editor = props.editor
    this.rawCommands = this.editor.extensionManager.commands
    this.customState = props.state
  }

  get hasCustomState(): boolean {
    return !!this.customState
  }

  get state(): EditorState {
    return this.customState || this.editor.state
  }

  get commands(): SingleCommands {
    const { rawCommands, editor, state } = this
    const { view } = editor
    const { tr } = state
    const props = this.buildProps(tr)

    return Object.fromEntries(
      Object.entries(rawCommands).map(([name, command]) => {
        const method = (...args: any[]) => {
          const callback = command(...args)(props)

          if (!tr.getMeta('preventDispatch') && !this.hasCustomState) {
            view.dispatch(tr)
          }

          return callback
        }

        return [name, method]
      }),
    ) as unknown as SingleCommands
  }

  get chain(): () => ChainedCommands {
    return () => this.createChain()
  }

  get can(): () => CanCommands {
    return () => this.createCan()
  }

  public createChain(startTr?: Transaction, shouldDispatch = true): ChainedCommands {
    const { rawCommands, editor, state } = this
    const { view } = editor
    const callbacks: (boolean | 'commandError' | 'commandNotFound')[] = []
    const hasStartTransaction = !!startTr
    const tr = startTr || state.tr

    const run = () => {
      if (
        !hasStartTransaction
        && shouldDispatch
        && !tr.getMeta('preventDispatch')
        && !this.hasCustomState
        && !callbacks.includes('commandError')
        && !callbacks.includes('commandNotFound')
      ) {
        view.dispatch(tr)
      }

      return callbacks.every(callback => callback === true)
    }

    const chain = new Proxy({} as ChainedCommands, {
      get: (_, prop: keyof ChainedCommands, receiver) => {
        if (prop === 'run') {
          return run
        }

        const command = Reflect.get(rawCommands, prop, receiver)

        const chainedCommand = (...args: never[]) => {
          const props = this.buildProps(tr, shouldDispatch)

          if (!isFunction(command)) {
            callbacks.push('commandNotFound')

            return chain
          }

          try {
            const callback = command(...args)(props)

            callbacks.push(callback)
          } catch {
            callbacks.push('commandError')
          }

          return chain
        }

        return chainedCommand
      },
    })

    return chain
  }

  public createCan(startTr?: Transaction): CanCommands {
    const { rawCommands, state } = this
    const dispatch = false
    const tr = startTr || state.tr
    const props = this.buildProps(tr, dispatch)

    return new Proxy({} as CanCommands, {
      get: (_, prop: keyof CanCommands, receiver) => {
        if (prop === 'chain') {
          return () => this.createChain(tr, dispatch)
        }

        const command = Reflect.get(rawCommands, prop, receiver)

        if (!isFunction(command)) {
          return alwaysReturnFalse
        }

        return (...args: any[]) => {
          try {
            return command(...args)({ ...props, dispatch: undefined })
          } catch {
            // If a command execution will result in an exception,
            // then that command should not be executed.
            return false
          }
        }
      },
      ownKeys: () => {
        return Object.keys(rawCommands).concat('chain')
      },
      has: (_, prop) => {
        return prop === 'chain' || prop in rawCommands
      },
    })
  }

  public buildProps(tr: Transaction, shouldDispatch = true): CommandProps {
    const { rawCommands, editor, state } = this
    const { view } = editor

    const props: CommandProps = {
      tr,
      editor,
      view,
      state: createChainableState({
        state,
        transaction: tr,
      }),
      dispatch: shouldDispatch ? () => undefined : undefined,
      chain: () => this.createChain(tr, shouldDispatch),
      can: () => this.createCan(tr),
      get commands() {
        return Object.fromEntries(
          Object.entries(rawCommands).map(([name, command]) => {
            return [name, (...args: never[]) => command(...args)(props)]
          }),
        ) as unknown as SingleCommands
      },
    }

    return props
  }
}
