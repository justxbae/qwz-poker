"use strict";
// Copyright (c) 2026 Poker Infra. All rights reserved.
// SPDX-License-Identifier: AGPL-3.0-only
// https://github.com/pokerinfra/poker-kernel
Object.defineProperty(exports, "__esModule", { value: true });
exports.PlayersOutOfChips = exports.TopUpChips = exports.RabbitDealtCards = exports.BetSizingOptions = exports.PlayerHandStrength = exports.PlayerExtraTimer = exports.PlayerTurnTimer = exports.CurrentRoundContribution = exports.PlayerValidAction = exports.WinnerDeclared = exports.TogglePreCheck = exports.AutoPostBB = exports.PreCheckAction = exports.AllInAction = exports.FoldAction = exports.CheckAction = exports.BetAction = exports.RaiseAction = exports.CallAction = exports.SitoutPlayers = exports.PlayerLeaveNextBB = exports.PlayerLeaveInNextHand = exports.PlayerJoinedWaitingList = exports.PlayerSitIn = exports.PlayerSitOut = exports.WaitingPlayers = exports.DeckShuffled = exports.PlayersStatesUpdates = exports.PotUpdates = exports.PreChecksUpdates = exports.CurrentPlayer = exports.LastActionChange = exports.HandEnded = exports.ShowdownByFold = exports.Showdown = exports.RiverBegin = exports.TurnBegin = exports.FlopBegin = exports.PreflopBegin = exports.HoleCardsDealt = exports.ToggleStraddle = exports.PostStraddle = exports.BigBlindAssigned = exports.SmallBlindAssigned = exports.DealerAssigned = exports.HandStarted = exports.PlayerExit = exports.PlayerLeft = exports.PlayerJoined = exports.WEIGHT = void 0;
exports.PlayerRebuy = void 0;
var WEIGHT;
(function (WEIGHT) {
    WEIGHT[WEIGHT["PlayerJoined"] = 50] = "PlayerJoined";
    WEIGHT[WEIGHT["PlayerExit"] = 50] = "PlayerExit";
    WEIGHT[WEIGHT["PlayerSitOut"] = 50] = "PlayerSitOut";
    WEIGHT[WEIGHT["PlayerSitIn"] = 50] = "PlayerSitIn";
    WEIGHT[WEIGHT["PlayerJoinedWaitingList"] = 50] = "PlayerJoinedWaitingList";
    WEIGHT[WEIGHT["PlayerLeaveInNextHand"] = 50] = "PlayerLeaveInNextHand";
    WEIGHT[WEIGHT["PlayerLeaveNextBB"] = 50] = "PlayerLeaveNextBB";
    WEIGHT[WEIGHT["PlayerRebuy"] = 50] = "PlayerRebuy";
    WEIGHT[WEIGHT["TopUpChips"] = 50] = "TopUpChips";
    WEIGHT[WEIGHT["HandStarted"] = 100] = "HandStarted";
    WEIGHT[WEIGHT["PotUpdates"] = 100] = "PotUpdates";
    WEIGHT[WEIGHT["PlayersStatesUpdates"] = 100] = "PlayersStatesUpdates";
    WEIGHT[WEIGHT["WaitingPlayers"] = 100] = "WaitingPlayers";
    WEIGHT[WEIGHT["SitoutPlayers"] = 100] = "SitoutPlayers";
    WEIGHT[WEIGHT["PreChecksUpdates"] = 100] = "PreChecksUpdates";
    WEIGHT[WEIGHT["DealerAssigned"] = 110] = "DealerAssigned";
    WEIGHT[WEIGHT["CurrentRoundContribution"] = 120] = "CurrentRoundContribution";
    WEIGHT[WEIGHT["PlayerHandStrength"] = 120] = "PlayerHandStrength";
    WEIGHT[WEIGHT["SmallBlindAssigned"] = 200] = "SmallBlindAssigned";
    WEIGHT[WEIGHT["AutoPostBB"] = 200] = "AutoPostBB";
    WEIGHT[WEIGHT["TogglePreCheck"] = 200] = "TogglePreCheck";
    WEIGHT[WEIGHT["BigBlindAssigned"] = 210] = "BigBlindAssigned";
    WEIGHT[WEIGHT["PostStraddle"] = 220] = "PostStraddle";
    WEIGHT[WEIGHT["ToggleStraddle"] = 220] = "ToggleStraddle";
    WEIGHT[WEIGHT["HoleCardsDealt"] = 300] = "HoleCardsDealt";
    WEIGHT[WEIGHT["PlayerValidAction"] = 300] = "PlayerValidAction";
    WEIGHT[WEIGHT["CallAction"] = 300] = "CallAction";
    WEIGHT[WEIGHT["RaiseAction"] = 300] = "RaiseAction";
    WEIGHT[WEIGHT["BetAction"] = 300] = "BetAction";
    WEIGHT[WEIGHT["CheckAction"] = 300] = "CheckAction";
    WEIGHT[WEIGHT["FoldAction"] = 300] = "FoldAction";
    WEIGHT[WEIGHT["AllInAction"] = 300] = "AllInAction";
    WEIGHT[WEIGHT["PreCheckAction"] = 300] = "PreCheckAction";
    WEIGHT[WEIGHT["RabbitDealtCards"] = 300] = "RabbitDealtCards";
    WEIGHT[WEIGHT["BetSizingOptions"] = 305] = "BetSizingOptions";
    WEIGHT[WEIGHT["PlayerTurnTimer"] = 330] = "PlayerTurnTimer";
    WEIGHT[WEIGHT["PlayerExtraTimer"] = 340] = "PlayerExtraTimer";
    WEIGHT[WEIGHT["PreflopBegin"] = 400] = "PreflopBegin";
    WEIGHT[WEIGHT["FlopBegin"] = 400] = "FlopBegin";
    WEIGHT[WEIGHT["TurnBegin"] = 400] = "TurnBegin";
    WEIGHT[WEIGHT["RiverBegin"] = 400] = "RiverBegin";
    WEIGHT[WEIGHT["Showdown"] = 400] = "Showdown";
    WEIGHT[WEIGHT["ShowdownByFold"] = 400] = "ShowdownByFold";
    WEIGHT[WEIGHT["PlayerLeft"] = 402] = "PlayerLeft";
    WEIGHT[WEIGHT["CurrentPlayer"] = 405] = "CurrentPlayer";
    WEIGHT[WEIGHT["LastAction"] = 410] = "LastAction";
    WEIGHT[WEIGHT["WinnerDeclared"] = 450] = "WinnerDeclared";
    WEIGHT[WEIGHT["PlayersOutOfChips"] = 490] = "PlayersOutOfChips";
    WEIGHT[WEIGHT["HandEnded"] = 500] = "HandEnded";
    WEIGHT[WEIGHT["DeckShuffled"] = 500] = "DeckShuffled";
})(WEIGHT || (exports.WEIGHT = WEIGHT = {}));
class PlayerJoined {
    constructor(payload) {
        this.payload = payload;
        this.type = "PlayerJoined";
        this.weight = WEIGHT.PlayerJoined;
    }
}
exports.PlayerJoined = PlayerJoined;
class PlayerLeft {
    constructor(payload) {
        this.payload = payload;
        this.type = "PlayerLeft";
        this.weight = WEIGHT.PlayerLeft;
    }
}
exports.PlayerLeft = PlayerLeft;
class PlayerExit {
    constructor(payload) {
        this.payload = payload;
        this.type = "PlayerExit";
        this.weight = WEIGHT.PlayerExit;
    }
}
exports.PlayerExit = PlayerExit;
class HandStarted {
    constructor(payload) {
        this.payload = payload;
        this.type = "HandStarted";
        this.weight = WEIGHT.HandStarted;
    }
}
exports.HandStarted = HandStarted;
class DealerAssigned {
    constructor(payload) {
        this.payload = payload;
        this.type = "DealerAssigned";
        this.weight = WEIGHT.DealerAssigned;
    }
}
exports.DealerAssigned = DealerAssigned;
class SmallBlindAssigned {
    constructor(payload) {
        this.payload = payload;
        this.type = "SmallBlindAssigned";
        this.weight = WEIGHT.SmallBlindAssigned;
    }
}
exports.SmallBlindAssigned = SmallBlindAssigned;
class BigBlindAssigned {
    constructor(payload) {
        this.payload = payload;
        this.type = "BigBlindAssigned";
        this.weight = WEIGHT.BigBlindAssigned;
    }
}
exports.BigBlindAssigned = BigBlindAssigned;
class PostStraddle {
    constructor(payload) {
        this.payload = payload;
        this.type = "PostStraddle";
        this.weight = WEIGHT.PostStraddle;
    }
}
exports.PostStraddle = PostStraddle;
class ToggleStraddle {
    constructor(payload) {
        this.payload = payload;
        this.type = "ToggleStraddle";
        this.weight = WEIGHT.ToggleStraddle;
    }
}
exports.ToggleStraddle = ToggleStraddle;
class HoleCardsDealt {
    constructor(payload) {
        this.payload = payload;
        this.type = "HoleCardsDealt";
        this.weight = WEIGHT.HoleCardsDealt;
    }
}
exports.HoleCardsDealt = HoleCardsDealt;
class PreflopBegin {
    constructor(payload) {
        this.payload = payload;
        this.type = "PreflopBegin";
        this.weight = WEIGHT.PreflopBegin;
    }
}
exports.PreflopBegin = PreflopBegin;
class FlopBegin {
    constructor(payload) {
        this.payload = payload;
        this.type = "FlopBegin";
        this.weight = WEIGHT.FlopBegin;
    }
}
exports.FlopBegin = FlopBegin;
class TurnBegin {
    constructor(payload) {
        this.payload = payload;
        this.type = "TurnBegin";
        this.weight = WEIGHT.TurnBegin;
    }
}
exports.TurnBegin = TurnBegin;
class RiverBegin {
    constructor(payload) {
        this.payload = payload;
        this.type = "RiverBegin";
        this.weight = WEIGHT.RiverBegin;
    }
}
exports.RiverBegin = RiverBegin;
class Showdown {
    constructor(payload) {
        this.payload = payload;
        this.type = "Showdown";
        this.weight = WEIGHT.Showdown;
    }
}
exports.Showdown = Showdown;
class ShowdownByFold {
    constructor(payload) {
        this.payload = payload;
        this.type = "ShowdownByFold";
        this.weight = WEIGHT.ShowdownByFold;
    }
}
exports.ShowdownByFold = ShowdownByFold;
class HandEnded {
    constructor(payload) {
        this.payload = payload;
        this.type = "HandEnded";
        this.weight = WEIGHT.HandEnded;
    }
}
exports.HandEnded = HandEnded;
class LastActionChange {
    constructor(payload) {
        this.payload = payload;
        this.type = "LastAction";
        this.weight = WEIGHT.LastAction;
    }
}
exports.LastActionChange = LastActionChange;
class CurrentPlayer {
    constructor(payload) {
        this.payload = payload;
        this.type = "CurrentPlayer";
        this.weight = WEIGHT.CurrentPlayer;
    }
}
exports.CurrentPlayer = CurrentPlayer;
class PreChecksUpdates {
    constructor(payload) {
        this.payload = payload;
        this.type = "PreChecksUpdates";
        this.weight = WEIGHT.PreChecksUpdates;
    }
}
exports.PreChecksUpdates = PreChecksUpdates;
class PotUpdates {
    constructor(payload) {
        this.payload = payload;
        this.type = "PotUpdates";
        this.weight = WEIGHT.PotUpdates;
    }
}
exports.PotUpdates = PotUpdates;
class PlayersStatesUpdates {
    constructor(payload) {
        this.payload = payload;
        this.type = "PlayersStatesUpdates";
        this.weight = WEIGHT.PlayersStatesUpdates;
    }
}
exports.PlayersStatesUpdates = PlayersStatesUpdates;
class DeckShuffled {
    constructor(payload) {
        this.payload = payload;
        this.type = "DeckShuffled";
        this.weight = WEIGHT.DeckShuffled;
    }
}
exports.DeckShuffled = DeckShuffled;
class WaitingPlayers {
    constructor(payload) {
        this.payload = payload;
        this.type = "WaitingPlayers";
        this.weight = WEIGHT.WaitingPlayers;
    }
}
exports.WaitingPlayers = WaitingPlayers;
class PlayerSitOut {
    constructor(payload) {
        this.payload = payload;
        this.type = "PlayerSitOut";
        this.weight = WEIGHT.PlayerSitOut;
    }
}
exports.PlayerSitOut = PlayerSitOut;
class PlayerSitIn {
    constructor(payload) {
        this.payload = payload;
        this.type = "PlayerSitIn";
        this.weight = WEIGHT.PlayerSitIn;
    }
}
exports.PlayerSitIn = PlayerSitIn;
class PlayerJoinedWaitingList {
    constructor(payload) {
        this.payload = payload;
        this.type = "PlayerJoinedWaitingList";
        this.weight = WEIGHT.PlayerJoinedWaitingList;
    }
}
exports.PlayerJoinedWaitingList = PlayerJoinedWaitingList;
class PlayerLeaveInNextHand {
    constructor(payload) {
        this.payload = payload;
        this.type = "PlayerLeaveInNextHand";
        this.weight = WEIGHT.PlayerLeaveInNextHand;
    }
}
exports.PlayerLeaveInNextHand = PlayerLeaveInNextHand;
class PlayerLeaveNextBB {
    constructor(payload) {
        this.payload = payload;
        this.type = "PlayerLeaveNextBB";
        this.weight = WEIGHT.PlayerLeaveInNextHand;
    }
}
exports.PlayerLeaveNextBB = PlayerLeaveNextBB;
class SitoutPlayers {
    constructor(payload) {
        this.payload = payload;
        this.type = "SitoutPlayers";
        this.weight = WEIGHT.SitoutPlayers;
    }
}
exports.SitoutPlayers = SitoutPlayers;
class CallAction {
    constructor(payload) {
        this.payload = payload;
        this.type = "CallAction";
        this.weight = WEIGHT.CallAction;
    }
}
exports.CallAction = CallAction;
class RaiseAction {
    constructor(payload) {
        this.payload = payload;
        this.type = "RaiseAction";
        this.weight = WEIGHT.RaiseAction;
    }
}
exports.RaiseAction = RaiseAction;
class BetAction {
    constructor(payload) {
        this.payload = payload;
        this.type = "BetAction";
        this.weight = WEIGHT.BetAction;
    }
}
exports.BetAction = BetAction;
class CheckAction {
    constructor(payload) {
        this.payload = payload;
        this.type = "CheckAction";
        this.weight = WEIGHT.CheckAction;
    }
}
exports.CheckAction = CheckAction;
class FoldAction {
    constructor(payload) {
        this.payload = payload;
        this.type = "FoldAction";
        this.weight = WEIGHT.FoldAction;
    }
}
exports.FoldAction = FoldAction;
class AllInAction {
    constructor(payload) {
        this.payload = payload;
        this.type = "AllInAction";
        this.weight = WEIGHT.AllInAction;
    }
}
exports.AllInAction = AllInAction;
class PreCheckAction {
    constructor(payload) {
        this.payload = payload;
        this.type = "PreCheckAction";
        this.weight = WEIGHT.PreCheckAction;
    }
}
exports.PreCheckAction = PreCheckAction;
class AutoPostBB {
    constructor(payload) {
        this.payload = payload;
        this.type = "AutoPostBB";
        this.weight = WEIGHT.AutoPostBB;
    }
}
exports.AutoPostBB = AutoPostBB;
class TogglePreCheck {
    constructor(payload) {
        this.payload = payload;
        this.type = "TogglePreCheck";
        this.weight = WEIGHT.TogglePreCheck;
    }
}
exports.TogglePreCheck = TogglePreCheck;
class WinnerDeclared {
    constructor(payload) {
        this.payload = payload;
        this.type = "WinnerDeclared";
        this.weight = WEIGHT.WinnerDeclared;
    }
}
exports.WinnerDeclared = WinnerDeclared;
class PlayerValidAction {
    constructor(payload) {
        this.payload = payload;
        this.type = "PlayerValidAction";
        this.weight = WEIGHT.PlayerValidAction;
    }
}
exports.PlayerValidAction = PlayerValidAction;
class CurrentRoundContribution {
    constructor(payload) {
        this.payload = payload;
        this.type = "CurrentRoundContributions";
        this.weight = WEIGHT.CurrentRoundContribution;
    }
}
exports.CurrentRoundContribution = CurrentRoundContribution;
class PlayerTurnTimer {
    constructor(payload) {
        this.payload = payload;
        this.type = "PlayerTurnTimer";
        this.weight = WEIGHT.PlayerTurnTimer;
    }
}
exports.PlayerTurnTimer = PlayerTurnTimer;
class PlayerExtraTimer {
    constructor(payload) {
        this.payload = payload;
        this.type = "PlayerExtraTimer";
        this.weight = WEIGHT.PlayerExtraTimer;
    }
}
exports.PlayerExtraTimer = PlayerExtraTimer;
class PlayerHandStrength {
    constructor(payload) {
        this.payload = payload;
        this.type = "PlayerHandStrength";
        this.weight = WEIGHT.PlayerHandStrength;
    }
}
exports.PlayerHandStrength = PlayerHandStrength;
class BetSizingOptions {
    constructor(payload) {
        this.payload = payload;
        this.type = "BetSizingOptions";
        this.weight = WEIGHT.BetSizingOptions;
    }
}
exports.BetSizingOptions = BetSizingOptions;
class RabbitDealtCards {
    constructor(payload) {
        this.payload = payload;
        this.type = "RabbitDealtCards";
        this.weight = WEIGHT.RabbitDealtCards;
    }
}
exports.RabbitDealtCards = RabbitDealtCards;
class TopUpChips {
    constructor(payload) {
        this.payload = payload;
        this.type = "TopUpChips";
        this.weight = WEIGHT.TopUpChips;
    }
}
exports.TopUpChips = TopUpChips;
class PlayersOutOfChips {
    constructor(payload) {
        this.payload = payload;
        this.type = "PlayersOutOfChips";
        this.weight = WEIGHT.PlayersOutOfChips;
    }
}
exports.PlayersOutOfChips = PlayersOutOfChips;
class PlayerRebuy {
    constructor(payload) {
        this.payload = payload;
        this.type = "PlayerRebuy";
        this.weight = WEIGHT.PlayerRebuy;
    }
}
exports.PlayerRebuy = PlayerRebuy;
