"use strict";
// Copyright (c) 2026 Poker Infra. All rights reserved.
// SPDX-License-Identifier: AGPL-3.0-only
// https://github.com/pokerinfra/poker-kernel
Object.defineProperty(exports, "__esModule", { value: true });
exports.ShowdownHandlerManager = void 0;
class StandardShowdownHandler {
    shouldApply(_state) {
        return true;
    }
    handleShowdown(activePlayers, state, evaluateHand, distributePots) {
        const playerEvaluations = activePlayers.map((player) => ({
            player,
            hand: evaluateHand(player.hand, state.round.communityCards, state.gameVariant),
        }));
        distributePots(playerEvaluations);
    }
}
class RITShowdownHandler {
    shouldApply(state) {
        const ritPlayers = state.players.filter((p) => p.rit && p.isActive);
        const activePlayers = state.players.filter((p) => p.isActive);
        return (ritPlayers.length === activePlayers.length && state.round.communityCards.length === 10);
    }
    handleShowdown(activePlayers, state, evaluateHand, distributePots) {
        const hasMultiplePots = state.pots.length > 1;
        if (hasMultiplePots) {
            this.handleMultiplePots(activePlayers, state, evaluateHand, distributePots);
        }
        else {
            this.handleSinglePot(activePlayers, state, evaluateHand, distributePots);
        }
    }
    handleMultiplePots(activePlayers, state, evaluateHand, distributePots) {
        const [pot1, pot2] = state.pots;
        const board1 = state.round.communityCards.slice(0, 5);
        const evaluateBoard1 = activePlayers.map((player) => ({
            player,
            hand: evaluateHand(player.hand, board1, state.gameVariant),
        }));
        distributePots(evaluateBoard1, [Object.assign({}, pot1)]);
        const board2 = state.round.communityCards.slice(5, 10);
        const evaluateBoard2 = activePlayers.map((player) => ({
            player,
            hand: evaluateHand(player.hand, board2, state.gameVariant),
        }));
        distributePots(evaluateBoard2, [Object.assign({}, pot2)]);
    }
    handleSinglePot(activePlayers, state, evaluateHand, distributePots) {
        const onlyPot = state.pots[0];
        if (!onlyPot || !Array.isArray(onlyPot.eligiblePlayers)) {
            return;
        }
        const half = Math.round((onlyPot.amount / 2) * 100) / 100;
        const potA = {
            amount: half,
            eligiblePlayers: [...onlyPot.eligiblePlayers],
        };
        const potB = {
            amount: Math.round((onlyPot.amount - half) * 100) / 100,
            eligiblePlayers: [...onlyPot.eligiblePlayers],
        };
        const board1 = state.round.communityCards.slice(0, 5);
        const eval1 = activePlayers.map((player) => ({
            player,
            hand: evaluateHand(player.hand, board1, state.gameVariant),
        }));
        distributePots(eval1, [potA]);
        const board2 = state.round.communityCards.slice(5, 10);
        const eval2 = activePlayers.map((player) => ({
            player,
            hand: evaluateHand(player.hand, board2, state.gameVariant),
        }));
        distributePots(eval2, [potB]);
    }
}
class ShowdownHandlerManager {
    constructor() {
        this.strategies = [];
        this.strategies.push(new RITShowdownHandler());
        this.strategies.push(new StandardShowdownHandler());
    }
    executeShowdown(activePlayers, state, evaluateHand, distributePots) {
        const strategy = this.strategies.find((s) => s.shouldApply(state));
        if (!strategy) {
            throw new Error("No applicable showdown strategy found");
        }
        strategy.handleShowdown(activePlayers, state, evaluateHand, distributePots);
    }
}
exports.ShowdownHandlerManager = ShowdownHandlerManager;
