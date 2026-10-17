"use strict";
// Copyright (c) 2026 Poker Infra. All rights reserved.
// SPDX-License-Identifier: AGPL-3.0-only
// https://github.com/pokerinfra/poker-kernel
Object.defineProperty(exports, "__esModule", { value: true });
exports.PotLimitBetHandler = void 0;
class PotLimitBetHandler {
    getMinBet(state, player) {
        return state.config.blinds.big;
    }
    getMaxBet(state, player) {
        const totalPotAmount = state.pots.reduce((acc, pot) => acc + pot.amount, 0);
        const playerWithLowerStack = state.players.find((p) => p.chips <= totalPotAmount);
        if (playerWithLowerStack) {
            return playerWithLowerStack.chips;
        }
        return totalPotAmount;
    }
    getMinRaise(state, player) {
        var _a;
        const currentHighestBet = Math.max(...state.players.filter((p) => p.isActive).map((p) => p.currentRoundContribution), 0);
        const callAmount = currentHighestBet - player.currentRoundContribution;
        if (player.chips <= callAmount) {
            return player.chips;
        }
        const raiseIncrement = (_a = state.round.lastRaiseAmount) !== null && _a !== void 0 ? _a : state.config.blinds.big;
        return callAmount + raiseIncrement;
    }
    getMaxRaise(state, player) {
        const activePlayers = state.players.filter((p) => p.isActive);
        const currentHighestBet = Math.max(...activePlayers.map((p) => p.currentRoundContribution), 0);
        const callAmount = currentHighestBet - player.currentRoundContribution;
        const totalBetsOnTable = state.players.reduce((acc, p) => acc + p.currentRoundContribution, 0);
        const totalPotAmount = state.pots.reduce((acc, pot) => acc + pot.amount, 0);
        let rawMax;
        if (activePlayers.length === 2) {
            rawMax = totalPotAmount + totalBetsOnTable + callAmount + callAmount;
        }
        else {
            rawMax = totalPotAmount + totalBetsOnTable + callAmount + currentHighestBet;
        }
        return Math.min(rawMax, player.chips);
    }
}
exports.PotLimitBetHandler = PotLimitBetHandler;
