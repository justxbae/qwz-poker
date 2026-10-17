import solver from "../vendor/pokersolver/pokersolver.js";
const { Hand } = solver;

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
