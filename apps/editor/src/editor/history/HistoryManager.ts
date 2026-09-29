import type { Command } from './Command'

export class HistoryManager {
  private readonly undoStack: Command[] = []
  private readonly redoStack: Command[] = []

  constructor(private readonly onChange: () => void, private readonly limit = 100) {}

  get canUndo(): boolean { return this.undoStack.length > 0 }
  get canRedo(): boolean { return this.redoStack.length > 0 }

  async execute(command: Command, alreadyExecuted = false): Promise<void> {
    if (!alreadyExecuted) await command.execute()
    this.undoStack.push(command)
    if (this.undoStack.length > this.limit) this.undoStack.shift()
    this.redoStack.length = 0
    this.onChange()
  }

  async undo(): Promise<void> {
    const command = this.undoStack.pop()
    if (!command) return
    await command.undo()
    this.redoStack.push(command)
    this.onChange()
  }

  async redo(): Promise<void> {
    const command = this.redoStack.pop()
    if (!command) return
    await command.execute()
    this.undoStack.push(command)
    this.onChange()
  }

  clear(): void {
    this.undoStack.length = 0
    this.redoStack.length = 0
    this.onChange()
  }
}
