"use strict";
// Copyright (c) 2026 Poker Infra. All rights reserved.
// SPDX-License-Identifier: AGPL-3.0-only
// https://github.com/pokerinfra/poker-kernel
Object.defineProperty(exports, "__esModule", { value: true });
exports.Deck = void 0;
const crypto_1 = require("crypto");
class Deck {
    constructor(initialDeck, excludeCards = [], rng = crypto_1.randomInt) {
        this.rng = rng;
        this.deck = initialDeck
            ? this.remainingDeck([...initialDeck], excludeCards)
            : this.freshDeck();
        if (!initialDeck)
            this.shuffle();
    }
    freshDeck() {
        const suits = ["hearts", "diamonds", "clubs", "spades"];
        const ranks = ["2", "3", "4", "5", "6", "7", "8", "9", "10", "J", "Q", "K", "A"];
        return suits.flatMap((suit) => ranks.map((rank) => ({ suit, rank })));
    }
    shuffle() {
        for (let i = this.deck.length - 1; i > 0; i--) {
            const j = this.rng(0, i + 1);
            [this.deck[i], this.deck[j]] = [this.deck[j], this.deck[i]];
        }
    }
    drawCards(count) {
        if (count > this.deck.length) {
            throw new Error(`Cannot draw ${count} cards. Only ${this.deck.length} remaining.`);
        }
        return this.deck.splice(0, count);
    }
    get remainingCards() {
        return [...this.deck];
    }
    remainingDeck(deck, excludeCards) {
        return deck.filter((card) => !excludeCards.some((excluded) => card.rank === excluded.rank && card.suit === excluded.suit));
    }
}
exports.Deck = Deck;
