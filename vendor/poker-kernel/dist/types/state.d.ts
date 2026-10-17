import { GameType } from "./primitives";
import { GameConfig } from "./config";
import { Player } from "./player";
import { RoundState } from "./round";
import { Pot } from "./pot";
import { Stakes } from "./primitives";
import { GameVariation } from "./primitives";
export interface GameState {
    gameType: GameType;
    gameVariant: GameVariation;
    bettingStructure: Stakes;
    config: GameConfig;
    players: Player[];
    round: RoundState;
    pots: Pot[];
    dealerPosition: number;
    turnTimer?: number;
    extraTimer?: number;
    disconTimer?: number;
    waitingPlayers: Player[];
    sitOutPlayers: Player[];
    outOfChipsPlayers: Player[];
    currentHandId?: string;
    handIds?: string[];
    version: number;
}
