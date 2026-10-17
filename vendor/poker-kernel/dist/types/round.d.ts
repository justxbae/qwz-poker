import { LastAction } from "./action";
import { Card } from "./card";
export type RoundStage = "waiting" | "preflop" | "flop" | "turn" | "river" | "showdown" | "ended";
export interface RoundState {
    stage: RoundStage;
    communityCards: Card[];
    currentPlayer: string;
    lastAction?: LastAction;
    deck: Card[];
    hasRaised: boolean;
    lastRaiseAmount?: number;
    betTo?: number;
}
export type RoundStatePublicView = Omit<RoundState, "deck" | "hasRaised">;
