import { GameState, IPreCheckHandler, Player, PlayerAction, PreCheck } from "../../types";
export declare class PreCheckHandler implements IPreCheckHandler {
    getValidPreCheckAction(player: Player, gameState: GameState): PlayerAction | null;
    updatePreChecks(gameState: GameState): void;
    togglePreCheck(playerId: string, selectedPreCheck: PreCheck, gameState: GameState): void;
}
