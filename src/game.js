// Sequence rules and validated game engine.
export const ROWS = `F 2S 3S 4S 5S 6S 7S 8S 9S F
6C 5C 4C 3C 2C AH KH QH TH TS
7C AS 2D 3D 4D 5D 6D 7D 9H QS
8C KS 6C 5C 4C 3C 2C 8D 8H KS
9C QS 7C 6H 5H 4H AH 9D 7H AS
TC TS 8C 7H 2H 3H KH TD 6H 2D
QC 9S 9C 8H 9H TH QH QD 5H 3D
KC 8S TC QC KC AC AD KD 4H 4D
AC 7S 6S 5S 4S 3S 2S 2H 3H 5D
F AD KD QD TD 9D 8D 7D 6D F`.split("\n").map((row) => row.split(" "));
export const SYM = { S: "♠", H: "♥", D: "♦", C: "♣" };
export const TEAMS = [
  { name: "Blue", color: "#3b82f6", dark: "#1d4ed8" },
  { name: "Pink", color: "#ec4899", dark: "#be185d" },
  { name: "Gold", color: "#eab308", dark: "#a16207" },
];
export const WIN = 2;
export const isCorner = (r, c) => r >= 0 && r < 10 && c >= 0 && c < 10 && ROWS[r][c] === "F";
export const isJack = (card) => typeof card === "string" && card[0] === "J";
export const twoEyed = (card) => card === "JD" || card === "JC";
export const isRed = (card) => card?.[1] === "H" || card?.[1] === "D";
export const rank = (card) => card?.[0] === "T" ? "10" : card?.[0];
const grid = (value) => Array.from({ length: 10 }, () => Array(10).fill(value));
const shuffle = (cards) => {
  const result = [...cards];
  for (let i = result.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [result[i], result[j]] = [result[j], result[i]];
  }
  return result;
};
export const teamForSeat = (state, seat) => state?.teamBySeat?.[seat] ?? seat;
export const winningTarget = (state) => state?.winTarget ?? (state?.seatCount === 3 ? 1 : 2);

export function newGame({ playerCount = 2 } = {}) {
  // One human is a solo game against Chip, so the game has two seats.
  const seatCount = playerCount === 1 ? 2 : Math.max(2, Math.min(4, playerCount));
  const teamBySeat = seatCount === 4 ? [0, 1, 0, 1] : Array.from({ length: seatCount }, (_, i) => i);
  const teamCount = Math.max(...teamBySeat) + 1;
  const cardsPerHand = seatCount === 2 ? 7 : 6;
  const deck = [];
  for (let copy = 0; copy < 2; copy++)
    for (const suit of "SHDC")
      for (const value of "A23456789TJQK") deck.push(value + suit);
  const shuffled = shuffle(deck);
  return {
    chips: grid(null), locked: grid(false),
    hands: Array.from({ length: seatCount }, () => shuffled.splice(0, cardsPerHand)),
    deck: shuffled, discard: [], turn: 0, sel: -1,
    seqs: Array.from({ length: teamCount }, () => []),
    seatCount, teamBySeat, winTarget: seatCount === 3 ? 1 : 2,
    over: false, last: null, lastMove: null, swapped: false, veil: true, toast: "", log: [],
  };
}

export function playable(state, card, player = state?.turn) {
  if (!state || !card || !Number.isInteger(player) || player < 0 || player >= state.seatCount) return [];
  const team = teamForSeat(state, player), result = [];
  for (let r = 0; r < 10; r++) for (let c = 0; c < 10; c++) {
    if (isCorner(r, c)) continue;
    const chip = state.chips[r][c];
    if (isJack(card)) {
      if (twoEyed(card) && chip === null) result.push([r, c]);
      else if (!twoEyed(card) && chip !== null && chip !== team && !state.locked[r][c]) result.push([r, c]);
    } else if (ROWS[r][c] === card && chip === null) result.push([r, c]);
  }
  return result;
}
export const isDead = (state, card, player = state?.turn) => !!card && !isJack(card) && playable(state, card, player).length === 0;

export function validateMove(state, { player = state?.turn, cardIndex = state?.sel, r, c } = {}) {
  if (!state) return { valid: false, reason: "No active game." };
  if (state.over) return { valid: false, reason: "This game has already finished." };
  if (!Number.isInteger(player) || player < 0 || player >= state.seatCount || player !== state.turn)
    return { valid: false, reason: "It is not your turn." };
  if (!Number.isInteger(cardIndex) || cardIndex < 0 || cardIndex >= state.hands[player]?.length)
    return { valid: false, reason: "Select a card from your hand first." };
  if (!Number.isInteger(r) || !Number.isInteger(c) || r < 0 || r > 9 || c < 0 || c > 9)
    return { valid: false, reason: "That board position is not valid." };
  const card = state.hands[player][cardIndex];
  if (isCorner(r, c)) return { valid: false, reason: "Corner spaces are already free for everyone." };
  if (!playable(state, card, player).some(([row, col]) => row === r && col === c))
    return { valid: false, reason: "That card cannot be played on this space." };
  return { valid: true, card };
}
function drawReplacement(state, player) {
  if (!state.deck.length && state.discard.length) { state.deck = shuffle(state.discard); state.discard = []; }
  if (state.deck.length) state.hands[player].push(state.deck.pop());
}
function findSeqs(state, team) {
  let found = 0; const newSequences = [];
  const belongs = (r, c) => isCorner(r, c) || state.chips[r][c] === team;
  for (let r = 0; r < 10; r++) for (let c = 0; c < 10; c++) {
    for (const [dr, dc] of [[0, 1], [1, 0], [1, 1], [1, -1]]) {
      const cells = [];
      for (let step = 0; step < 5; step++) {
        const rr = r + dr * step, cc = c + dc * step;
        if (rr < 0 || rr > 9 || cc < 0 || cc > 9 || !belongs(rr, cc)) break;
        cells.push(rr * 10 + cc);
      }
      if (cells.length !== 5) continue;
      const overlapsExisting = state.seqs[team].some(sequence => sequence.filter(cell => cells.includes(cell)).length > 1);
      if (!overlapsExisting) {
        state.seqs[team].push(cells); newSequences.push(cells); found++;
        cells.forEach(cell => { const rr = Math.floor(cell / 10), cc = cell % 10; if (!isCorner(rr, cc)) state.locked[rr][cc] = true; });
      }
    }
  }
  return { found, newSequences };
}
export function playCard(state, r, c, player = state?.turn) {
  const validation = validateMove(state, { player, cardIndex: state?.sel, r, c });
  if (!validation.valid) throw new Error(validation.reason);
  const next = structuredClone(state), team = teamForSeat(next, player);
  const card = next.hands[player][next.sel], remove = isJack(card) && !twoEyed(card);
  next.chips[r][c] = remove ? null : team;
  next.last = [r, c];
  const result = remove ? { found: 0, newSequences: [] } : findSeqs(next, team);
  const action = remove ? "removed an opponent chip with" : "played";
  const detail = `${TEAMS[team].name}: ${action} ${rank(card)}${SYM[card[1]]} at ${String.fromCharCode(65 + c)}${r + 1}`;
  next.lastMove = { seat: player, team, card, row: r, col: c, action: remove ? "removed" : "placed", detail };
  next.log.unshift(detail);
  next.hands[player].splice(next.sel, 1); next.discard.push(card); drawReplacement(next, player);
  next.sel = -1; next.swapped = false;
  next.toast = result.found ? (result.found === 1 ? "Sequence completed!" : `${result.found} Sequences completed!`) : remove ? "Opponent chip removed!" : "Chip placed!";
  if (next.seqs[team].length >= winningTarget(next)) {
    next.over = true; next.winner = team;
    next.winningSequences = next.seqs[team].slice(0, next.winTarget);
    next.winReason = `completed ${next.winTarget} ${next.winTarget === 1 ? "Sequence" : "Sequences"}`;
  } else next.turn = (player + 1) % next.seatCount;
  next.veil = true;
  return next;
}
export function validateDeadSwap(state, { player = state?.turn, cardIndex = state?.sel } = {}) {
  if (!state) return { valid: false, reason: "No active game." };
  if (state.over) return { valid: false, reason: "This game has already finished." };
  if (player !== state.turn) return { valid: false, reason: "It is not your turn." };
  if (state.swapped) return { valid: false, reason: "You have already swapped a dead card this turn." };
  const card = state.hands[player]?.[cardIndex];
  if (!card || !isDead(state, card, player)) return { valid: false, reason: "Only a dead card can be exchanged." };
  return { valid: true, card };
}
export function swapDead(state, player = state?.turn) {
  const validation = validateDeadSwap(state, { player, cardIndex: state?.sel });
  if (!validation.valid) throw new Error(validation.reason);
  const next = structuredClone(state), card = next.hands[player].splice(next.sel, 1)[0];
  next.discard.push(card); drawReplacement(next, player);
  const team = teamForSeat(next, player);
  next.log.unshift(`${TEAMS[team].name}: exchanged dead ${rank(card)}${SYM[card[1]]}`);
  next.sel = -1; next.swapped = true; next.toast = "Dead card exchanged. Now play a card.";
  return next;
}
