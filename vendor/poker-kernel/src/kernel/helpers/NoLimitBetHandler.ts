// Copyright (c) 2026 Poker Infra. All rights reserved.
// SPDX-License-Identifier: AGPL-3.0-only
// https://github.com/pokerinfra/poker-kernel

import { IVariantBetHandler, Player, GameState } from "../../types";
import { currentBet } from "./CurrentBet";

export class NoLimitBetHandler implements IVariantBetHandler {
    getMinBet(state: GameState, player: Player): number {
        return state.config.blinds.big;
    }

    getMaxBet(state: GameState, player: Player): number {
        return player.chips;
    }

    getMinRaise(state: GameState, player: Player): number {
        const currentHighestBet = currentBet(state);

        const callAmount = currentHighestBet - player.currentRoundContribution;

        if (player.chips <= callAmount) {
            return player.chips;
        }

        const raiseIncrement = state.round.lastRaiseAmount ?? state.config.blinds.big;
        return callAmount + raiseIncrement;
    }

    getMaxRaise(state: GameState, player: Player): number {
        return player.chips;
    }
}
