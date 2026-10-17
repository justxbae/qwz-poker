"use strict";
// Copyright (c) 2026 Poker Infra. All rights reserved.
// SPDX-License-Identifier: AGPL-3.0-only
// https://github.com/pokerinfra/poker-kernel
Object.defineProperty(exports, "__esModule", { value: true });
exports.PokerVariantFactory = void 0;
const NoLimitBetHandler_1 = require("./NoLimitBetHandler");
const PotLimitBetHandler_1 = require("./PotLimitBetHandler");
class PokerVariantFactory {
    static create(bettingStructure) {
        switch (bettingStructure) {
            case "No Limit":
                return new NoLimitBetHandler_1.NoLimitBetHandler();
            case "Pot Limit":
                return new PotLimitBetHandler_1.PotLimitBetHandler();
            default:
                throw new Error(`Unsupported betting structure: ${bettingStructure}`);
        }
    }
}
exports.PokerVariantFactory = PokerVariantFactory;
