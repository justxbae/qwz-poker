"use strict";
// Copyright (c) 2026 Poker Infra. All rights reserved.
// SPDX-License-Identifier: AGPL-3.0-only
// https://github.com/pokerinfra/poker-kernel
Object.defineProperty(exports, "__esModule", { value: true });
exports.NoLimitBetHandler = void 0;
const CurrentBet_1 = require("./CurrentBet");
class NoLimitBetHandler {
    getMinBet(state, player) {
        return state.config.blinds.big;
    }
    getMaxBet(state, player) {
        return player.chips;
    }
    getMinRaise(state, player) {
        var _a;
        const currentHighestBet = (0, CurrentBet_1.currentBet)(state);
        const callAmount = currentHighestBet - player.currentRoundContribution;
        if (player.chips <= callAmount) {
            return player.chips;
        }
        const raiseIncrement = (_a = state.round.lastRaiseAmount) !== null && _a !== void 0 ? _a : state.config.blinds.big;
        return callAmount + raiseIncrement;
    }
    getMaxRaise(state, player) {
        return player.chips;
    }
}
exports.NoLimitBetHandler = NoLimitBetHandler;
