import { GameState, IValidActionProvider, ValidAction } from "../../types";
export declare class ValidActionProvider implements IValidActionProvider {
    getValidActions(playerId: string, gameState: GameState): ValidAction[];
    private getCurrentHighestBet;
    private getCallAmount;
    private addCheckAction;
    private addCallAction;
    private addBetOrRaiseActions;
    private addRaiseActions;
    private addBetActions;
}
