import { Pot, GameState } from "../../types";
interface RakeConfig {
    rake3or4PlayersPercent: number;
    rakeCap3or4PlayersPercent: number;
    rake5orMorePlayersPercent: number;
    rakeCap5orMorePlayersPercent: number;
}
export declare class PotManager {
    static createPots(state: GameState): Pot[];
    static applyRake(pots: Pot[], playerCount: number, rakeConfig: RakeConfig): Pot[];
    private static hasContributions;
    private static shouldMergeToLastPot;
    private static mergeToLastPot;
    private static processContributions;
    private static getSortedContributions;
    private static findMinContributor;
    private static createPotFromContributions;
    private static adjustRemainingContributions;
}
export {};
