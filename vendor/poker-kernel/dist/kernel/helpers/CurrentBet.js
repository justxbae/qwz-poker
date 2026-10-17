"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.currentBet = currentBet;
function currentBet(state) {
    var _a;
    return Math.max((_a = state.round.betTo) !== null && _a !== void 0 ? _a : 0, ...state.players.map(p => p.currentRoundContribution));
}
