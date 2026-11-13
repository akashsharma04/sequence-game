// Pure game logic: no React in here, so it is easy to reuse on a server later.

export const ROWS = `F 2S 3S 4S 5S 6S 7S 8S 9S F
6C 5C 4C 3C 2C AH KH QH TH TS
7C AS 2D 3D 4D 5D 6D 7D 9H QS
8C KS 6C 5C 4C 3C 2C 8D 8H KS
9C QS 7C 6H 5H 4H AH 9D 7H AS
TC TS 8C 7H 2H 3H KH TD 6H 2D
QC 9S 9C 8H 9H TH QH QD 5H 3D
KC 8S TC QC KC AC AD KD 4H 4D
AC 7S 6S 5S 4S 3S 2S 2H 3H 5D
F AD KD QD TD 9D 8D 7D 6D F`
  .split("\n")
  .map((r) => r.split(" "));

export const SYM = { S: "♠", H: "♥", D: "♦", C: "♣" };
export const TEAMS = [
  { name: "Blue", color: "#3b82f6", dark: "#1d4ed8" },
  { name: "Pink", color: "#ec4899", dark: "#be185d" },
];
export const WIN = 2;

export const isCorner = (r, c) => ROWS[r][c] === "F";
export const isJack = (k) => k[0] === "J";
export const twoEyed = (k) => k === "JD" || k === "JC";
export const isRed = (k) => k[1] === "H" || k[1] === "D";
export const rank = (k) => (k[0] === "T" ? "10" : k[0]);

const grid = (v) => Array.from({ length: 10 }, () => Array(10).fill(v));

export function newGame() {
  const deck = [];
  for (let d = 0; d < 2; d++)
    for (const s of "SHDC") for (const r of "A23456789TJQK") deck.push(r + s);
  for (let i = deck.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [deck[i], deck[j]] = [deck[j], deck[i]];
  }
  return {
    chips: grid(null),
    locked: grid(false),
    hands: [deck.splice(0, 7), deck.splice(0, 7)],
    deck,
    turn: 0,
    sel: -1,
    seqs: [[], []],
    over: false,
    last: null,
    swapped: false,
    veil: true,
    toast: "",
    log: [],
  };
}

export function playable(s, k) {
  const out = [];
  for (let r = 0; r < 10; r++)
    for (let c = 0; c < 10; c++) {
      if (isCorner(r, c)) continue;
      const chip = s.chips[r][c];
      if (isJack(k)) {
        if (twoEyed(k) && chip === null) out.push([r, c]);
        if (!twoEyed(k) && chip === 1 - s.turn && !s.locked[r][c]) out.push([r, c]);
      } else if (ROWS[r][c] === k && chip === null) out.push([r, c]);
    }
  return out;
}

export const isDead = (s, k) => !isJack(k) && playable(s, k).length === 0;

// Finds new 5-in-a-row lines for team t. Two sequences may share one chip.
function findSeqs(s, t) {
  let found = 0;
  const mine = (r, c) => isCorner(r, c) || s.chips[r][c] === t;
  for (let r = 0; r < 10; r++)
    for (let c = 0; c < 10; c++)
      for (const [dr, dc] of [[0, 1], [1, 0], [1, 1], [1, -1]]) {
        const cells = [];
        for (let i = 0; i < 5; i++) {
          const rr = r + dr * i,
            cc = c + dc * i;
          if (rr < 0 || rr > 9 || cc < 0 || cc > 9 || !mine(rr, cc)) break;
          cells.push(rr * 10 + cc);
        }
        if (cells.length < 5) continue;
        if (s.seqs[t].every((q) => q.filter((x) => cells.includes(x)).length <= 1)) {
          s.seqs[t].push(cells);
          found++;
          cells.forEach((x) => {
            const rr = Math.floor(x / 10),
              cc = x % 10;
            if (!isCorner(rr, cc)) s.locked[rr][cc] = true;
          });
        }
      }
  return found;
}

export function playCard(s, r, c) {
  const n = structuredClone(s);
  const t = n.turn;
  const k = n.hands[t][n.sel];
  const remove = isJack(k) && !twoEyed(k);
  n.chips[r][c] = remove ? null : t;
  n.last = [r, c];
  const found = remove ? 0 : findSeqs(n, t);
  n.log.unshift(`${TEAMS[t].name}: ${remove ? "removed a chip with" : "played"} ${rank(k)}${SYM[k[1]]}`);
  n.hands[t].splice(n.sel, 1);
  if (n.deck.length) n.hands[t].push(n.deck.pop());
  n.sel = -1;
  n.swapped = false;
  n.toast = found ? "Sequence!" : "";
  if (n.seqs[t].length >= WIN) n.over = true;
  else n.turn = 1 - t;
  n.veil = true;
  return n;
}

export function swapDead(s) {
  const n = structuredClone(s);
  const k = n.hands[n.turn][n.sel];
  n.hands[n.turn].splice(n.sel, 1);
  if (n.deck.length) n.hands[n.turn].push(n.deck.pop());
  n.log.unshift(`${TEAMS[n.turn].name}: swapped dead ${rank(k)}${SYM[k[1]]}`);
  n.sel = -1;
  n.swapped = true;
  return n;
}
