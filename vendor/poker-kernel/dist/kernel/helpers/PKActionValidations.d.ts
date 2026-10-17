import { GameState, IActionValidator, Player, PlayerAction } from "../../types";
export declare class CompositeActionValidator implements IActionValidator {
    private validators;
    validate(player: Player, action: PlayerAction, gameState: GameState): boolean;
    addValidator(validator: IActionValidator): void;
}
