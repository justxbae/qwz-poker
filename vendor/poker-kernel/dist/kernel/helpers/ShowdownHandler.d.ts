import { Card, GameState, GameVariation, Player } from "../../types";
export declare class ShowdownHandlerManager {
    private strategies;
    constructor();
    executeShowdown(activePlayers: Player[], state: GameState, evaluateHand: (hand: Card[], board: Card[], variant: GameVariation) => any, distributePots: (evaluations: {
        player: Player;
        hand: any;
    }[], pots?: any[]) => void): void;
}
