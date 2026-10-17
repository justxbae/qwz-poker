// Pure guards shared by manual actions, delayed pre-actions and snapshot rendering.
export function actionAmountBounds(viewer) {
  // HTTP raise amount means the increment after paying the call, not the
  // player's whole remaining stack. Short stacks can still make a short all-in.
  const max = Math.max(0, viewer.canBet ? viewer.stack : viewer.stack - viewer.toCall);
  const fullMinimum = viewer.canBet ? viewer.bigBlind : viewer.minRaise;
  return { min: Math.min(max, fullMinimum), max, allInOnly: max > 0 && max < fullMinimum };
}

export function matchesActionContext(context, tableId, current) {
  return Boolean(context?.turnToken && context.id === tableId
    && context.turnToken === current?.turnToken);
}

export function acceptsTableSnapshot(current, incoming, tableId) {
  if (!incoming || !tableId || incoming.id !== tableId) return false;
  if (!current || current.id !== incoming.id) return true;
  const before = Number(current.stateRevision || 0);
  const after = Number(incoming.stateRevision || 0);
  if (before !== after) return after > before;
  if (Number(incoming.handNumber || 0) !== Number(current.handNumber || 0)) {
    return Number(incoming.handNumber || 0) > Number(current.handNumber || 0);
  }
  if (Number(incoming.eventSequence || 0) !== Number(current.eventSequence || 0)) {
    return Number(incoming.eventSequence || 0) > Number(current.eventSequence || 0);
  }
  return Number(incoming.now || 0) >= Number(current.now || 0);
}
