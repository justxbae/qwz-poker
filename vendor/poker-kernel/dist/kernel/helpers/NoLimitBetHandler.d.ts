import { IVariantBetHandler, Player, GameState } from "../../types";
export declare class NoLimitBetHandler implements IVariantBetHandler {
    getMinBet(state: GameState, player: Player): number;
    getMaxBet(state: GameState, player: Player): number;
    getMinRaise(state: GameState, player: Player): number;
    getMaxRaise(state: GameState, player: Player): number;
}
