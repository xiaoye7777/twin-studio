export interface Command {
  readonly label: string
  execute(): void | Promise<void>
  undo(): void | Promise<void>
}
