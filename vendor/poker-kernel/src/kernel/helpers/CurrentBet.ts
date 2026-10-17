// Copyright (c) 2026 Poker Infra. All rights reserved.
// SPDX-License-Identifier: AGPL-3.0-only
// Weez adaptation, 2026-10-16: include nominal short blinds and folded contributions.
import { GameState } from "../../types";

export function currentBet(state: GameState): number {
    return Math.max(state.round.betTo ?? 0, ...state.players.map(p => p.currentRoundContribution));
}
