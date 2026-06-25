import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const { Hand } = require("../vendor/pokersolver/pokersolver.js");

export function resolveShowdown(contenders, communityCards) {
  const solved = contenders.map((seat) => ({
    seat,
    hand: Hand.solve([...seat.cards, ...communityCards])
  }));
  const winningHands = Hand.winners(solved.map((result) => result.hand));
  const winners = solved.filter((result) => winningHands.includes(result.hand));
  const bestHand = winners[0]?.hand;

  return {
    winners,
    handName: bestHand?.name || "",
    handDescription: bestHand?.descr || bestHand?.name || ""
  };
}
