"use strict";
// Copyright (c) 2026 Poker Infra. All rights reserved.
// SPDX-License-Identifier: AGPL-3.0-only
// https://github.com/pokerinfra/poker-kernel
Object.defineProperty(exports, "__esModule", { value: true });
exports.ValidActionProvider = void 0;
const PokerVariantFactory_1 = require("./PokerVariantFactory");
class ValidActionProvider {
    getValidActions(playerId, gameState) {
        const player = gameState.players.find((p) => p.id === playerId);
        if (!player || !player.isActive)
            return [];
        const strategy = PokerVariantFactory_1.PokerVariantFactory.create(gameState.bettingStructure);
        const currentHighestBet = this.getCurrentHighestBet(gameState);
        const callAmount = this.getCallAmount(player, currentHighestBet);
        const actions = [{ type: "fold" }];
        const activePlayers = gameState.players.filter((p) => p.isActive);
        const isHeadsUp = activePlayers.length === 2;
        const opponent = activePlayers.find((p) => p.id !== player.id);
        const isOpponentAllIn = opponent && opponent.chips === 0;
        this.addCheckAction(actions, callAmount);
        this.addCallAction(actions, player, callAmount, strategy, gameState);
        if (!(isHeadsUp && isOpponentAllIn)) {
            this.addBetOrRaiseActions(actions, player, strategy, currentHighestBet, gameState);
        }
        return actions;
    }
    getCurrentHighestBet(gameState) {
        return Math.max(...gameState.players.filter((p) => p.isActive).map((p) => p.currentRoundContribution), 0);
    }
    getCallAmount(player, currentHighestBet) {
        return currentHighestBet - player.currentRoundContribution;
    }
    addCheckAction(actions, callAmount) {
        if (callAmount === 0) {
            actions.push({ type: "check" });
        }
    }
    addCallAction(actions, player, callAmount, _strategy, _gameState) {
        if (callAmount > 0 &&
            player.chips > 0 &&
            player.chips !== callAmount &&
            player.chips > callAmount) {
            actions.push({
                type: "call",
                amount: Math.min(callAmount, player.chips),
            });
        }
        else if (player.chips === callAmount || player.chips < callAmount) {
            actions.push({
                type: "all-in",
                amount: player.chips,
            });
        }
    }
    addBetOrRaiseActions(actions, player, strategy, currentHighestBet, gameState) {
        const isBetPlaced = currentHighestBet > 0;
        if (isBetPlaced) {
            this.addRaiseActions(actions, player, strategy, gameState);
        }
        else {
            this.addBetActions(actions, player, strategy, gameState);
        }
    }
    addRaiseActions(actions, player, strategy, gameState) {
        const minRaise = strategy.getMinRaise(gameState, player);
        const maxRaise = strategy.getMaxRaise(gameState, player);
        const currentHighestBet = Math.max(...gameState.players.filter((p) => p.isActive).map((p) => p.currentRoundContribution), 0);
        const callAmount = currentHighestBet - player.currentRoundContribution;
        if (minRaise < player.chips) {
            actions.push({
                type: "raise",
                min: minRaise,
                max: maxRaise,
            });
        }
        else if (player.chips > 0 && player.chips > callAmount) {
            actions.push({
                type: "all-in",
                amount: player.chips,
            });
        }
    }
    addBetActions(actions, player, strategy, gameState) {
        const minBet = strategy.getMinBet(gameState, player);
        const maxBet = strategy.getMaxBet(gameState, player);
        if (minBet < player.chips) {
            actions.push({ type: "bet", min: minBet, max: maxBet });
        }
        else if (player.chips > 0) {
            actions.push({ type: "all-in", amount: player.chips });
        }
    }
}
exports.ValidActionProvider = ValidActionProvider;
