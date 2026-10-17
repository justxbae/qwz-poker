"use strict";
// Copyright (c) 2026 Poker Infra. All rights reserved.
// SPDX-License-Identifier: AGPL-3.0-only
// https://github.com/pokerinfra/poker-kernel
Object.defineProperty(exports, "__esModule", { value: true });
exports.CompositeActionValidator = void 0;
const PokerVariantFactory_1 = require("./PokerVariantFactory");
const CurrentBet_1 = require("./CurrentBet");
class BaseActionValidator {
}
class PlayerExistsValidator extends BaseActionValidator {
    validate(player, _action, gameState) {
        return gameState.players.some((p) => p.id === player.id);
    }
}
class PlayerActiveValidator extends BaseActionValidator {
    validate(player, _action, _gameState) {
        return player.isActive;
    }
}
class CurrentPlayerValidator extends BaseActionValidator {
    validate(player, _action, gameState) {
        return gameState.round.currentPlayer === player.id;
    }
}
class SufficientChipsValidator extends BaseActionValidator {
    validate(player, action, _gameState) {
        if (action.type === "call" || action.type === "bet" || action.type === "raise") {
            return player.chips >= (action.amount || 0);
        }
        return true;
    }
}
class CallAmountValidator extends BaseActionValidator {
    validate(player, action, gameState) {
        if (action.type === "call") {
            const currentHighestBet = (0, CurrentBet_1.currentBet)(gameState);
            const callAmount = currentHighestBet - player.currentRoundContribution;
            return action.amount === Math.min(callAmount, player.chips);
        }
        return true;
    }
}
class BetAmountValidator extends BaseActionValidator {
    validate(player, action, gameState) {
        if (action.type === "bet") {
            if (action.amount === undefined)
                return false;
            const strategy = PokerVariantFactory_1.PokerVariantFactory.create(gameState.bettingStructure);
            const minBet = strategy.getMinBet(gameState, player);
            const maxBet = strategy.getMaxBet(gameState, player);
            return (action.amount >= minBet && action.amount <= maxBet && action.amount <= player.chips);
        }
        return true;
    }
}
class RaiseAmountValidator extends BaseActionValidator {
    validate(player, action, gameState) {
        if (action.type === "raise") {
            if (action.amount === undefined)
                return false;
            const strategy = PokerVariantFactory_1.PokerVariantFactory.create(gameState.bettingStructure);
            const minRaise = strategy.getMinRaise(gameState, player);
            const maxRaise = strategy.getMaxRaise(gameState, player);
            return (action.amount >= minRaise &&
                action.amount <= maxRaise &&
                action.amount <= player.chips);
        }
        return true;
    }
}
class AllInAmountValidator extends BaseActionValidator {
    validate(player, action, _gameState) {
        if (action.type === "all-in") {
            return action.amount === player.chips && player.chips > 0;
        }
        return true;
    }
}
class ValidActionValidator {
    constructor() {
        this.validTypes = new Set(["fold", "check", "call", "bet", "raise", "all-in"]);
    }
    validate(_player, action, _gameState) {
        return this.validTypes.has(action.type);
    }
}
class CheckActionValidator extends BaseActionValidator {
    validate(player, action, gameState) {
        if (action.type !== "check")
            return true;
        const currentHighestBet = (0, CurrentBet_1.currentBet)(gameState);
        const callAmount = currentHighestBet - player.currentRoundContribution;
        return callAmount === 0;
    }
}
class CompositeActionValidator {
    constructor() {
        this.validators = [
            new ValidActionValidator(),
            new PlayerExistsValidator(),
            new PlayerActiveValidator(),
            new CurrentPlayerValidator(),
            new SufficientChipsValidator(),
            new CallAmountValidator(),
            new BetAmountValidator(),
            new RaiseAmountValidator(),
            new AllInAmountValidator(),
            new CheckActionValidator(),
        ];
    }
    validate(player, action, gameState) {
        return this.validators.every((validator) => validator.validate(player, action, gameState));
    }
    addValidator(validator) {
        this.validators.push(validator);
    }
}
exports.CompositeActionValidator = CompositeActionValidator;
