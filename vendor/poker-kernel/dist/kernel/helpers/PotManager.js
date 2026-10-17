"use strict";
// Copyright (c) 2026 Poker Infra. All rights reserved.
// SPDX-License-Identifier: AGPL-3.0-only
// https://github.com/pokerinfra/poker-kernel
Object.defineProperty(exports, "__esModule", { value: true });
exports.PotManager = void 0;
class PotManager {
    static createPots(state) {
        const updatedPots = [...state.pots];
        if (!this.hasContributions(state)) {
            return updatedPots;
        }
        if (this.shouldMergeToLastPot(state, updatedPots)) {
            return this.mergeToLastPot(state, updatedPots);
        }
        return this.processContributions(state, updatedPots);
    }
    static applyRake(pots, playerCount, rakeConfig) {
        if (playerCount <= 2) {
            return pots;
        }
        let rakePercent;
        let rakeCap;
        if (playerCount === 3 || playerCount === 4) {
            rakePercent = rakeConfig.rake3or4PlayersPercent;
            rakeCap = rakeConfig.rakeCap3or4PlayersPercent;
        }
        else if (playerCount >= 5) {
            rakePercent = rakeConfig.rake5orMorePlayersPercent;
            rakeCap = rakeConfig.rakeCap5orMorePlayersPercent;
        }
        else {
            return pots;
        }
        const updatedPots = pots.map((pot) => (Object.assign({}, pot)));
        let totalRakeCollected = 0;
        for (let i = 0; i < updatedPots.length; i++) {
            const pot = updatedPots[i];
            if (pot.eligiblePlayers.length === 1) {
                continue;
            }
            const potRake = Math.round(((pot.amount * rakePercent) / 100) * 100) / 100;
            const remainingRakeCapacity = rakeCap - totalRakeCollected;
            if (remainingRakeCapacity <= 0) {
                break;
            }
            const rakeToDeduct = Math.min(potRake, remainingRakeCapacity);
            pot.amount -= rakeToDeduct;
            totalRakeCollected += rakeToDeduct;
            if (totalRakeCollected >= rakeCap) {
                break;
            }
        }
        return updatedPots;
    }
    static hasContributions(state) {
        return state.players.some((p) => p.currentRoundContribution > 0);
    }
    static shouldMergeToLastPot(state, pots) {
        if (pots.length === 0)
            return false;
        const activeContributions = state.players
            .filter((p) => p.isActive && p.currentRoundContribution > 0)
            .map((p) => p.currentRoundContribution);
        const uniqueAmounts = [...new Set(activeContributions)];
        return uniqueAmounts.length === 1;
    }
    static mergeToLastPot(state, pots) {
        const allContributors = state.players.filter((p) => p.currentRoundContribution > 0);
        const amountToMerge = allContributors.reduce((sum, p) => sum + p.currentRoundContribution, 0);
        const eligiblePlayers = allContributors.filter((p) => p.isActive).map((p) => p.id);
        state.players.forEach((p) => (p.currentRoundContribution = 0));
        const lastPot = pots[pots.length - 1];
        lastPot.amount += amountToMerge;
        lastPot.eligiblePlayers = Array.from(new Set([...lastPot.eligiblePlayers, ...eligiblePlayers]));
        return pots;
    }
    static processContributions(state, pots) {
        const updatedPots = [...pots];
        const contributions = this.getSortedContributions(state);
        const checkedPlayers = new Set();
        while (contributions.length > 0) {
            const currentMin = contributions.shift();
            const minPlayer = this.findMinContributor(state, currentMin, checkedPlayers);
            if (!(minPlayer === null || minPlayer === void 0 ? void 0 : minPlayer.isActive)) {
                checkedPlayers.add((minPlayer === null || minPlayer === void 0 ? void 0 : minPlayer.id) || "");
                continue;
            }
            const { potAmount, eligiblePlayers } = this.createPotFromContributions(state, currentMin);
            if (potAmount > 0) {
                const otherActivePlayers = state.players.filter((p) => p.isActive && p.id !== eligiblePlayers[0]);
                const isAllInRefund = eligiblePlayers.length === 1 &&
                    otherActivePlayers.length > 0 &&
                    otherActivePlayers.every((p) => p.chips === 0);
                if (isAllInRefund) {
                    const refundPlayer = state.players.find((p) => p.id === eligiblePlayers[0]);
                    if (refundPlayer) {
                        refundPlayer.chips += potAmount;
                    }
                }
                else {
                    updatedPots.push({
                        amount: potAmount,
                        eligiblePlayers,
                    });
                }
            }
            this.adjustRemainingContributions(contributions, currentMin);
        }
        return updatedPots;
    }
    static getSortedContributions(state) {
        return state.players
            .filter((p) => p.currentRoundContribution > 0)
            .map((p) => p.currentRoundContribution)
            .sort((a, b) => a - b);
    }
    static findMinContributor(state, amount, checkedPlayers) {
        return state.players.find((p) => p.currentRoundContribution === amount && !checkedPlayers.has(p.id));
    }
    static createPotFromContributions(state, minAmount) {
        let potAmount = 0;
        const eligiblePlayers = [];
        state.players.forEach((player) => {
            if (player.currentRoundContribution >= minAmount) {
                const amountToDeduct = Math.min(minAmount, player.currentRoundContribution);
                player.currentRoundContribution -= amountToDeduct;
                potAmount += amountToDeduct;
                if (player.isActive && !eligiblePlayers.includes(player.id)) {
                    eligiblePlayers.push(player.id);
                }
            }
            else if (!player.isActive) {
                potAmount += player.currentRoundContribution;
            }
        });
        return { potAmount, eligiblePlayers };
    }
    static adjustRemainingContributions(contributions, amount) {
        for (let i = 0; i < contributions.length; i++) {
            contributions[i] -= amount;
        }
    }
}
exports.PotManager = PotManager;
