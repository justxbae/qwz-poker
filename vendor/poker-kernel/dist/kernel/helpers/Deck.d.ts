import { Card } from "../../types";
export declare class Deck {
    private rng;
    private deck;
    constructor(initialDeck?: Card[], excludeCards?: Card[], rng?: (min: number, max: number) => number);
    private freshDeck;
    shuffle(): void;
    drawCards(count: number): Card[];
    get remainingCards(): Card[];
    private remainingDeck;
}
