/**
 * Module-level undo/redo stack.
 *
 * Each mutation that wants to be undoable captures its "before" state and
 * pushes an UndoableAction onto the stack. Cmd+Z / the toolbar Undo button
 * calls `performUndo()` which pops and runs `action.undo()`. The popped
 * action moves onto the redo stack so Cmd+Shift+Z can replay it via
 * `action.redo()`.
 *
 * The stack is module-level (not React Context) so:
 *   - useWaddleData mutations can push without prop-drilling.
 *   - UI components subscribe via useSyncExternalStore for cheap re-renders.
 *
 * Lifecycle: in-memory, session-scoped. A page reload clears everything —
 * intentional, since restoring deleted rows after a reload would race with
 * Supabase refetch and surprise the user.
 */
import { useSyncExternalStore } from 'react'

export interface UndoableAction {
  /** Short human-readable label. Shown in toasts and the toolbar tooltip. */
  label: string
  /** Reverts the action. Should call the corresponding mutation with the
   *  pre-action state and `recordUndo=false` to avoid re-recording. */
  undo: () => void | Promise<void>
  /** Re-applies the action (after an undo). Same recordUndo=false rule. */
  redo: () => void | Promise<void>
}

/** Cap so a long session doesn't grow the stack unboundedly. */
const MAX_STACK = 10

let undoStack: UndoableAction[] = []
let redoStack: UndoableAction[] = []

const listeners = new Set<() => void>()

// useSyncExternalStore requires getSnapshot() to return a stable reference
// when nothing has changed — otherwise React re-renders forever. We mutate
// the stacks in place and rebuild `snapshot` once per change in `emit()`.
let snapshot: {
  undoLen: number
  redoLen: number
  topUndoLabel: string | null
  topRedoLabel: string | null
} = { undoLen: 0, redoLen: 0, topUndoLabel: null, topRedoLabel: null }

function emit() {
  snapshot = {
    undoLen: undoStack.length,
    redoLen: redoStack.length,
    topUndoLabel: undoStack[undoStack.length - 1]?.label ?? null,
    topRedoLabel: redoStack[redoStack.length - 1]?.label ?? null,
  }
  listeners.forEach((l) => l())
}

/**
 * Push a new action onto the undo stack. Clears the redo stack — once the
 * user takes a new action, the previous redo branch becomes stale.
 */
export function pushUndoableAction(action: UndoableAction) {
  undoStack.push(action)
  if (undoStack.length > MAX_STACK) undoStack.shift()
  redoStack = []
  emit()
}

/**
 * Pop the most recent action, run its undo(), and move it to the redo stack.
 * Returns the action that ran (so callers can show a toast), or null if the
 * stack was empty / the undo threw.
 *
 * If the undo() throws, the action is re-pushed so the user can retry. We
 * deliberately don't swallow the error here — let the calling toast surface it.
 */
export async function performUndo(): Promise<UndoableAction | null> {
  const action = undoStack.pop()
  if (!action) return null
  emit()
  try {
    await action.undo()
    redoStack.push(action)
    if (redoStack.length > MAX_STACK) redoStack.shift()
    emit()
    return action
  } catch (e) {
    undoStack.push(action)
    emit()
    throw e
  }
}

export async function performRedo(): Promise<UndoableAction | null> {
  const action = redoStack.pop()
  if (!action) return null
  emit()
  try {
    await action.redo()
    undoStack.push(action)
    if (undoStack.length > MAX_STACK) undoStack.shift()
    emit()
    return action
  } catch (e) {
    redoStack.push(action)
    emit()
    throw e
  }
}

/** For tests or "fresh session" boundaries (e.g. user logout). */
export function clearUndoStacks() {
  undoStack = []
  redoStack = []
  emit()
}

function subscribe(cb: () => void) {
  listeners.add(cb)
  return () => {
    listeners.delete(cb)
  }
}

function getSnapshot() {
  return snapshot
}

/**
 * Hook for UI: re-renders when stack lengths or the top labels change.
 * Returns enough info to (a) enable/disable buttons and (b) show a tooltip
 * with the action that's about to be undone/redone.
 */
export function useUndoStack() {
  return useSyncExternalStore(subscribe, getSnapshot, getSnapshot)
}
