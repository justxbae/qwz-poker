import { BetSizingOption, LastAction, PlayerAction, ValidAction } from "./action";
import { Card, HandStrength } from "./card";
import { PlayerPublicView } from "./player";
import { Pot } from "./pot";
import { PreCheck, PreChecks } from "./preChecks";
import { RoundStatePublicView } from "./round";
export interface MutationType {
    PlayerJoined: {
        player: PlayerPublicView;
    };
    PlayerLeft: {
        player: PlayerPublicView;
    };
    PlayerExit: {
        player: PlayerPublicView;
    };
    PlayerSitOut: {
        player: PlayerPublicView;
    };
    PlayerSitIn: {
        player: PlayerPublicView;
    };
    PlayerJoinedWaitingList: {
        waitingPlayers: PlayerPublicView;
    };
    PlayerLeaveInNextHand: {
        player: PlayerPublicView;
    };
    PlayerLeaveNextBB: {
        player: PlayerPublicView;
    };
    CurrentRoundContributions: {
        contributions: {
            playerId: string;
            chips: number;
            currentRoundContribution: number;
        }[];
    };
    HandStarted: {
        round: RoundStatePublicView;
    };
    PreflopBegin: {
        round: RoundStatePublicView;
    };
    FlopBegin: {
        round: RoundStatePublicView;
    };
    TurnBegin: {
        round: RoundStatePublicView;
    };
    RiverBegin: {
        round: RoundStatePublicView;
    };
    Showdown: {
        round: RoundStatePublicView;
        players: {
            id: string;
            hand: Card[];
        }[];
    };
    ShowdownByFold: {};
    HandEnded: {
        round: RoundStatePublicView;
    };
    PotUpdates: {
        pots: Pot[];
        totalPot: number;
    };
    PlayersStatesUpdates: {
        players: PlayerPublicView[];
    };
    WaitingPlayers: {
        players: PlayerPublicView[];
    };
    SitoutPlayers: {
        players: PlayerPublicView[];
    };
    DealerAssigned: {
        dealer: PlayerPublicView;
    };
    SmallBlindAssigned: {
        smallBlind: PlayerPublicView;
    };
    BigBlindAssigned: {
        bigBlind: PlayerPublicView;
    };
    HoleCardsDealt: {
        hands: {
            playerId: string;
            hand: Card[];
        }[];
    };
    LastAction: {
        action: LastAction;
    };
    DeckShuffled: {};
    CurrentPlayer: {
        playerId: string;
    };
    PostStraddle: {
        player: PlayerPublicView;
    };
    ToggleStraddle: {
        player: PlayerPublicView;
    };
    PreChecksUpdates: {
        preChecks: {
            playerId: string;
            precheck: PreChecks;
        }[];
    };
    CallAction: {
        player: PlayerPublicView;
        action: PlayerAction;
    };
    RaiseAction: {
        player: PlayerPublicView;
        action: PlayerAction;
    };
    BetAction: {
        player: PlayerPublicView;
        action: PlayerAction;
    };
    CheckAction: {
        player: PlayerPublicView;
        action: PlayerAction;
    };
    FoldAction: {
        player: PlayerPublicView;
        action: PlayerAction;
    };
    AllInAction: {
        player: PlayerPublicView;
        action: PlayerAction;
    };
    TogglePreCheck: {
        player: PlayerPublicView;
        precheck: PreCheck;
    };
    PreCheckAction: {
        player: PlayerPublicView;
        action: PlayerAction;
    };
    AutoPostBB: {
        player: PlayerPublicView;
    };
    PlayerValidAction: {
        playerId: string;
        action: ValidAction[];
    };
    WinnerDeclared: {
        player: PlayerPublicView;
        hand: string;
        name: string;
        amount: number;
        cards: Card[];
    };
    PlayerTurnTimer: {
        playerId: string;
        timerValue: number;
        timerKey: string;
        timestamp: number;
    };
    PlayerExtraTimer: {
        playerId: string;
        timerValue: number;
        timerKey: string;
        timestamp: number;
    };
    PlayerHandStrength: {
        players: {
            playerId: string;
            handStrength: HandStrength;
        }[];
    };
    BetSizingOptions: {
        playerId: string;
        options: BetSizingOption[];
    };
    RabbitDealtCards: {
        communityCards: Card[];
    };
    TopUpChips: {
        playerId: string;
        topUpAmount: number;
        totalChips: number;
        autoTopUp: boolean;
    };
    PlayersOutOfChips: {
        players: PlayerPublicView[];
    };
    PlayerRebuy: {
        player: PlayerPublicView;
    };
}
export declare enum WEIGHT {
    PlayerJoined = 50,
    PlayerExit = 50,
    PlayerSitOut = 50,
    PlayerSitIn = 50,
    PlayerJoinedWaitingList = 50,
    PlayerLeaveInNextHand = 50,
    PlayerLeaveNextBB = 50,
    PlayerRebuy = 50,
    TopUpChips = 50,
    HandStarted = 100,
    PotUpdates = 100,
    PlayersStatesUpdates = 100,
    WaitingPlayers = 100,
    SitoutPlayers = 100,
    PreChecksUpdates = 100,
    DealerAssigned = 110,
    CurrentRoundContribution = 120,
    PlayerHandStrength = 120,
    SmallBlindAssigned = 200,
    AutoPostBB = 200,
    TogglePreCheck = 200,
    BigBlindAssigned = 210,
    PostStraddle = 220,
    ToggleStraddle = 220,
    HoleCardsDealt = 300,
    PlayerValidAction = 300,
    CallAction = 300,
    RaiseAction = 300,
    BetAction = 300,
    CheckAction = 300,
    FoldAction = 300,
    AllInAction = 300,
    PreCheckAction = 300,
    RabbitDealtCards = 300,
    BetSizingOptions = 305,
    PlayerTurnTimer = 330,
    PlayerExtraTimer = 340,
    PreflopBegin = 400,
    FlopBegin = 400,
    TurnBegin = 400,
    RiverBegin = 400,
    Showdown = 400,
    ShowdownByFold = 400,
    PlayerLeft = 402,
    CurrentPlayer = 405,
    LastAction = 410,
    WinnerDeclared = 450,
    PlayersOutOfChips = 490,
    HandEnded = 500,
    DeckShuffled = 500
}
export interface Mutation<T extends keyof MutationType = keyof MutationType> {
    weight: number;
    type: T;
    payload: MutationType[T];
}
export declare class PlayerJoined implements Mutation<"PlayerJoined"> {
    payload: {
        player: PlayerPublicView;
    };
    readonly type: "PlayerJoined";
    readonly weight = WEIGHT.PlayerJoined;
    constructor(payload: {
        player: PlayerPublicView;
    });
}
export declare class PlayerLeft implements Mutation<"PlayerLeft"> {
    payload: {
        player: PlayerPublicView;
    };
    readonly type: "PlayerLeft";
    readonly weight = WEIGHT.PlayerLeft;
    constructor(payload: {
        player: PlayerPublicView;
    });
}
export declare class PlayerExit implements Mutation<"PlayerExit"> {
    payload: {
        player: PlayerPublicView;
    };
    readonly type: "PlayerExit";
    readonly weight = WEIGHT.PlayerJoined;
    constructor(payload: {
        player: PlayerPublicView;
    });
}
export declare class HandStarted implements Mutation<"HandStarted"> {
    payload: {
        round: RoundStatePublicView;
    };
    readonly type: "HandStarted";
    readonly weight = WEIGHT.HandStarted;
    constructor(payload: {
        round: RoundStatePublicView;
    });
}
export declare class DealerAssigned implements Mutation<"DealerAssigned"> {
    payload: {
        dealer: PlayerPublicView;
    };
    readonly type: "DealerAssigned";
    readonly weight = WEIGHT.DealerAssigned;
    constructor(payload: {
        dealer: PlayerPublicView;
    });
}
export declare class SmallBlindAssigned implements Mutation<"SmallBlindAssigned"> {
    payload: {
        smallBlind: PlayerPublicView;
    };
    readonly type: "SmallBlindAssigned";
    readonly weight = WEIGHT.SmallBlindAssigned;
    constructor(payload: {
        smallBlind: PlayerPublicView;
    });
}
export declare class BigBlindAssigned implements Mutation<"BigBlindAssigned"> {
    payload: {
        bigBlind: PlayerPublicView;
    };
    readonly type: "BigBlindAssigned";
    readonly weight = WEIGHT.BigBlindAssigned;
    constructor(payload: {
        bigBlind: PlayerPublicView;
    });
}
export declare class PostStraddle implements Mutation<"PostStraddle"> {
    payload: {
        player: PlayerPublicView;
    };
    readonly type: "PostStraddle";
    readonly weight = WEIGHT.PostStraddle;
    constructor(payload: {
        player: PlayerPublicView;
    });
}
export declare class ToggleStraddle implements Mutation<"ToggleStraddle"> {
    payload: {
        player: PlayerPublicView;
    };
    readonly type: "ToggleStraddle";
    readonly weight = WEIGHT.PostStraddle;
    constructor(payload: {
        player: PlayerPublicView;
    });
}
export declare class HoleCardsDealt implements Mutation<"HoleCardsDealt"> {
    payload: {
        hands: {
            playerId: string;
            hand: Card[];
        }[];
    };
    readonly type: "HoleCardsDealt";
    readonly weight = WEIGHT.HoleCardsDealt;
    constructor(payload: {
        hands: {
            playerId: string;
            hand: Card[];
        }[];
    });
}
export declare class PreflopBegin implements Mutation<"PreflopBegin"> {
    payload: {
        round: RoundStatePublicView;
    };
    readonly type: "PreflopBegin";
    readonly weight = WEIGHT.PreflopBegin;
    constructor(payload: {
        round: RoundStatePublicView;
    });
}
export declare class FlopBegin implements Mutation<"FlopBegin"> {
    payload: {
        round: RoundStatePublicView;
    };
    readonly type: "FlopBegin";
    readonly weight = WEIGHT.PreflopBegin;
    constructor(payload: {
        round: RoundStatePublicView;
    });
}
export declare class TurnBegin implements Mutation<"TurnBegin"> {
    payload: {
        round: RoundStatePublicView;
    };
    readonly type: "TurnBegin";
    readonly weight = WEIGHT.PreflopBegin;
    constructor(payload: {
        round: RoundStatePublicView;
    });
}
export declare class RiverBegin implements Mutation<"RiverBegin"> {
    payload: {
        round: RoundStatePublicView;
    };
    readonly type: "RiverBegin";
    readonly weight = WEIGHT.PreflopBegin;
    constructor(payload: {
        round: RoundStatePublicView;
    });
}
export declare class Showdown implements Mutation<"Showdown"> {
    payload: {
        round: RoundStatePublicView;
        players: {
            id: string;
            hand: Card[];
        }[];
    };
    readonly type: "Showdown";
    readonly weight = WEIGHT.PreflopBegin;
    constructor(payload: {
        round: RoundStatePublicView;
        players: {
            id: string;
            hand: Card[];
        }[];
    });
}
export declare class ShowdownByFold implements Mutation<"ShowdownByFold"> {
    payload: {};
    readonly type: "ShowdownByFold";
    readonly weight = WEIGHT.PreflopBegin;
    constructor(payload: {});
}
export declare class HandEnded implements Mutation<"HandEnded"> {
    payload: {
        round: RoundStatePublicView;
    };
    readonly type: "HandEnded";
    readonly weight = WEIGHT.HandEnded;
    constructor(payload: {
        round: RoundStatePublicView;
    });
}
export declare class LastActionChange implements Mutation<"LastAction"> {
    payload: {
        action: LastAction;
    };
    readonly type: "LastAction";
    readonly weight = WEIGHT.LastAction;
    constructor(payload: {
        action: LastAction;
    });
}
export declare class CurrentPlayer implements Mutation<"CurrentPlayer"> {
    payload: {
        playerId: string;
    };
    readonly type: "CurrentPlayer";
    readonly weight = WEIGHT.CurrentPlayer;
    constructor(payload: {
        playerId: string;
    });
}
export declare class PreChecksUpdates implements Mutation<"PreChecksUpdates"> {
    payload: {
        preChecks: {
            playerId: string;
            precheck: PreChecks;
        }[];
    };
    readonly type: "PreChecksUpdates";
    readonly weight = WEIGHT.HandStarted;
    constructor(payload: {
        preChecks: {
            playerId: string;
            precheck: PreChecks;
        }[];
    });
}
export declare class PotUpdates implements Mutation<"PotUpdates"> {
    payload: {
        pots: Pot[];
        totalPot: number;
    };
    readonly type: "PotUpdates";
    readonly weight = WEIGHT.HandStarted;
    constructor(payload: {
        pots: Pot[];
        totalPot: number;
    });
}
export declare class PlayersStatesUpdates implements Mutation<"PlayersStatesUpdates"> {
    payload: {
        players: PlayerPublicView[];
    };
    readonly type: "PlayersStatesUpdates";
    readonly weight = WEIGHT.HandStarted;
    constructor(payload: {
        players: PlayerPublicView[];
    });
}
export declare class DeckShuffled implements Mutation<"DeckShuffled"> {
    payload: {};
    readonly type: "DeckShuffled";
    readonly weight = WEIGHT.HandEnded;
    constructor(payload: {});
}
export declare class WaitingPlayers implements Mutation<"WaitingPlayers"> {
    payload: {
        players: PlayerPublicView[];
    };
    readonly type: "WaitingPlayers";
    readonly weight = WEIGHT.HandStarted;
    constructor(payload: {
        players: PlayerPublicView[];
    });
}
export declare class PlayerSitOut implements Mutation<"PlayerSitOut"> {
    payload: {
        player: PlayerPublicView;
    };
    readonly type: "PlayerSitOut";
    readonly weight = WEIGHT.PlayerJoined;
    constructor(payload: {
        player: PlayerPublicView;
    });
}
export declare class PlayerSitIn implements Mutation<"PlayerSitIn"> {
    payload: {
        player: PlayerPublicView;
    };
    readonly type: "PlayerSitIn";
    readonly weight = WEIGHT.PlayerJoined;
    constructor(payload: {
        player: PlayerPublicView;
    });
}
export declare class PlayerJoinedWaitingList implements Mutation<"PlayerJoinedWaitingList"> {
    payload: {
        waitingPlayers: PlayerPublicView;
    };
    readonly type: "PlayerJoinedWaitingList";
    readonly weight = WEIGHT.PlayerJoined;
    constructor(payload: {
        waitingPlayers: PlayerPublicView;
    });
}
export declare class PlayerLeaveInNextHand implements Mutation<"PlayerLeaveInNextHand"> {
    payload: {
        player: PlayerPublicView;
    };
    readonly type: "PlayerLeaveInNextHand";
    readonly weight = WEIGHT.PlayerJoined;
    constructor(payload: {
        player: PlayerPublicView;
    });
}
export declare class PlayerLeaveNextBB implements Mutation<"PlayerLeaveNextBB"> {
    payload: {
        player: PlayerPublicView;
    };
    readonly type: "PlayerLeaveNextBB";
    readonly weight = WEIGHT.PlayerJoined;
    constructor(payload: {
        player: PlayerPublicView;
    });
}
export declare class SitoutPlayers implements Mutation<"SitoutPlayers"> {
    payload: {
        players: PlayerPublicView[];
    };
    readonly type: "SitoutPlayers";
    readonly weight = WEIGHT.HandStarted;
    constructor(payload: {
        players: PlayerPublicView[];
    });
}
export declare class CallAction implements Mutation<"CallAction"> {
    payload: {
        player: PlayerPublicView;
        action: PlayerAction;
    };
    readonly type: "CallAction";
    readonly weight = WEIGHT.HoleCardsDealt;
    constructor(payload: {
        player: PlayerPublicView;
        action: PlayerAction;
    });
}
export declare class RaiseAction implements Mutation<"RaiseAction"> {
    payload: {
        player: PlayerPublicView;
        action: PlayerAction;
    };
    readonly type: "RaiseAction";
    readonly weight = WEIGHT.HoleCardsDealt;
    constructor(payload: {
        player: PlayerPublicView;
        action: PlayerAction;
    });
}
export declare class BetAction implements Mutation<"BetAction"> {
    payload: {
        player: PlayerPublicView;
        action: PlayerAction;
    };
    readonly type: "BetAction";
    readonly weight = WEIGHT.HoleCardsDealt;
    constructor(payload: {
        player: PlayerPublicView;
        action: PlayerAction;
    });
}
export declare class CheckAction implements Mutation<"CheckAction"> {
    payload: {
        player: PlayerPublicView;
        action: PlayerAction;
    };
    readonly type: "CheckAction";
    readonly weight = WEIGHT.HoleCardsDealt;
    constructor(payload: {
        player: PlayerPublicView;
        action: PlayerAction;
    });
}
export declare class FoldAction implements Mutation<"FoldAction"> {
    payload: {
        player: PlayerPublicView;
        action: PlayerAction;
    };
    readonly type: "FoldAction";
    readonly weight = WEIGHT.HoleCardsDealt;
    constructor(payload: {
        player: PlayerPublicView;
        action: PlayerAction;
    });
}
export declare class AllInAction implements Mutation<"AllInAction"> {
    payload: {
        player: PlayerPublicView;
        action: PlayerAction;
    };
    readonly type: "AllInAction";
    readonly weight = WEIGHT.HoleCardsDealt;
    constructor(payload: {
        player: PlayerPublicView;
        action: PlayerAction;
    });
}
export declare class PreCheckAction implements Mutation<"PreCheckAction"> {
    payload: {
        player: PlayerPublicView;
        action: PlayerAction;
    };
    readonly type: "PreCheckAction";
    readonly weight = WEIGHT.HoleCardsDealt;
    constructor(payload: {
        player: PlayerPublicView;
        action: PlayerAction;
    });
}
export declare class AutoPostBB implements Mutation<"AutoPostBB"> {
    payload: {
        player: PlayerPublicView;
    };
    readonly type: "AutoPostBB";
    readonly weight = WEIGHT.SmallBlindAssigned;
    constructor(payload: {
        player: PlayerPublicView;
    });
}
export declare class TogglePreCheck implements Mutation<"TogglePreCheck"> {
    payload: {
        player: PlayerPublicView;
        precheck: PreCheck;
    };
    readonly type: "TogglePreCheck";
    readonly weight = WEIGHT.SmallBlindAssigned;
    constructor(payload: {
        player: PlayerPublicView;
        precheck: PreCheck;
    });
}
export declare class WinnerDeclared implements Mutation<"WinnerDeclared"> {
    payload: {
        player: PlayerPublicView;
        hand: string;
        amount: number;
        name: string;
        cards: Card[];
    };
    readonly type: "WinnerDeclared";
    readonly weight = WEIGHT.WinnerDeclared;
    constructor(payload: {
        player: PlayerPublicView;
        hand: string;
        amount: number;
        name: string;
        cards: Card[];
    });
}
export declare class PlayerValidAction implements Mutation<"PlayerValidAction"> {
    payload: {
        playerId: string;
        action: ValidAction[];
    };
    readonly type: "PlayerValidAction";
    readonly weight = WEIGHT.HoleCardsDealt;
    constructor(payload: {
        playerId: string;
        action: ValidAction[];
    });
}
export declare class CurrentRoundContribution implements Mutation<"CurrentRoundContributions"> {
    payload: {
        contributions: {
            playerId: string;
            chips: number;
            currentRoundContribution: number;
        }[];
    };
    readonly type: "CurrentRoundContributions";
    readonly weight = WEIGHT.CurrentRoundContribution;
    constructor(payload: {
        contributions: {
            playerId: string;
            chips: number;
            currentRoundContribution: number;
        }[];
    });
}
export declare class PlayerTurnTimer implements Mutation<"PlayerTurnTimer"> {
    payload: {
        playerId: string;
        timerValue: number;
        timerKey: string;
        timestamp: number;
    };
    readonly type: "PlayerTurnTimer";
    readonly weight = WEIGHT.PlayerTurnTimer;
    constructor(payload: {
        playerId: string;
        timerValue: number;
        timerKey: string;
        timestamp: number;
    });
}
export declare class PlayerExtraTimer implements Mutation<"PlayerExtraTimer"> {
    payload: {
        playerId: string;
        timerValue: number;
        timerKey: string;
        timestamp: number;
    };
    readonly type: "PlayerExtraTimer";
    readonly weight = WEIGHT.PlayerExtraTimer;
    constructor(payload: {
        playerId: string;
        timerValue: number;
        timerKey: string;
        timestamp: number;
    });
}
export declare class PlayerHandStrength implements Mutation<"PlayerHandStrength"> {
    payload: {
        players: {
            playerId: string;
            handStrength: HandStrength;
        }[];
    };
    readonly type: "PlayerHandStrength";
    readonly weight = WEIGHT.CurrentRoundContribution;
    constructor(payload: {
        players: {
            playerId: string;
            handStrength: HandStrength;
        }[];
    });
}
export declare class BetSizingOptions implements Mutation<"BetSizingOptions"> {
    payload: {
        playerId: string;
        options: BetSizingOption[];
    };
    readonly type = "BetSizingOptions";
    readonly weight = WEIGHT.BetSizingOptions;
    constructor(payload: {
        playerId: string;
        options: BetSizingOption[];
    });
}
export declare class RabbitDealtCards implements Mutation<"RabbitDealtCards"> {
    payload: {
        communityCards: Card[];
    };
    readonly type = "RabbitDealtCards";
    readonly weight = WEIGHT.HoleCardsDealt;
    constructor(payload: {
        communityCards: Card[];
    });
}
export declare class TopUpChips implements Mutation<"TopUpChips"> {
    payload: {
        playerId: string;
        topUpAmount: number;
        totalChips: number;
        autoTopUp: boolean;
    };
    readonly type = "TopUpChips";
    readonly weight = WEIGHT.PlayerJoined;
    constructor(payload: {
        playerId: string;
        topUpAmount: number;
        totalChips: number;
        autoTopUp: boolean;
    });
}
export declare class PlayersOutOfChips implements Mutation<"PlayersOutOfChips"> {
    payload: {
        players: PlayerPublicView[];
    };
    readonly type: "PlayersOutOfChips";
    readonly weight = WEIGHT.PlayersOutOfChips;
    constructor(payload: {
        players: PlayerPublicView[];
    });
}
export declare class PlayerRebuy implements Mutation<"PlayerRebuy"> {
    payload: {
        player: PlayerPublicView;
    };
    readonly type: "PlayerRebuy";
    readonly weight = WEIGHT.PlayerJoined;
    constructor(payload: {
        player: PlayerPublicView;
    });
}
