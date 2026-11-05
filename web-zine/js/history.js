// Undo/redo over whole-state snapshots. push(state) records the new current state.
export function createHistory(limit = 50) {
  let states = [];
  let i = -1;
  return {
    push(state) {
      states = states.slice(0, i + 1);
      states.push(state);
      if (states.length > limit) states.shift();
      i = states.length - 1;
    },
    undo() { if (i <= 0) return null; i -= 1; return states[i]; },
    redo() { if (i >= states.length - 1) return null; i += 1; return states[i]; },
    canUndo() { return i > 0; },
    canRedo() { return i < states.length - 1; },
  };
}
