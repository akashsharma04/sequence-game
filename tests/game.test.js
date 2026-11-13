import test from "node:test";
import assert from "node:assert/strict";
import { ROWS, newGame, playable, validateMove, playCard, isDead, validateDeadSwap, swapDead, teamForSeat, winningTarget } from "../src/game.js";

test("two-player game deals seven cards each", () => {
  const state = newGame({ playerCount: 2 });
  assert.deepEqual(state.hands.map(hand => hand.length), [7, 7]);
  assert.equal(state.deck.length + state.hands.flat().length, 104);
  assert.equal(winningTarget(state), 2);
});

test("three-player game deals six cards each and needs one sequence", () => {
  const state = newGame({ playerCount: 3 });
  assert.deepEqual(state.hands.map(hand => hand.length), [6, 6, 6]);
  assert.equal(state.seqs.length, 3);
  assert.equal(winningTarget(state), 1);
  assert.deepEqual([0, 1, 2].map(seat => teamForSeat(state, seat)), [0, 1, 2]);
});

test("four-player game deals six cards each and pairs seats into two teams", () => {
  const state = newGame({ playerCount: 4 });
  assert.deepEqual(state.hands.map(hand => hand.length), [6, 6, 6, 6]);
  assert.equal(state.seqs.length, 2);
  assert.deepEqual([0, 1, 2, 3].map(seat => teamForSeat(state, seat)), [0, 1, 0, 1]);
  assert.equal(winningTarget(state), 2);
});

test("one-player selection creates a human-vs-AI two-seat game", () => {
  const state = newGame({ playerCount: 1 });
  assert.deepEqual(state.hands.map(hand => hand.length), [7, 7]);
  assert.equal(state.seatCount, 2);
});

test("a legal move consumes the selected card and rotates through seats", () => {
  const state = newGame({ playerCount: 3 });
  const cardIndex = state.hands[0].findIndex(card => playable(state, card, 0).length > 0);
  const [r, c] = playable(state, state.hands[0][cardIndex], 0)[0];
  state.sel = cardIndex;
  assert.equal(validateMove(state, { player: 0, cardIndex, r, c }).valid, true);
  const next = playCard(state, r, c, 0);
  assert.equal(next.chips[r][c], 0);
  assert.equal(next.hands[0].length, 6);
  assert.equal(next.turn, 1);
  assert.equal(next.lastMove.seat, 0);
  assert.match(next.lastMove.detail, /at [A-J](?:[1-9]|10)$/);
});

test("four-player teammate places chips for their shared team", () => {
  const state = newGame({ playerCount: 4 });
  state.turn = 2;
  const cardIndex = state.hands[2].findIndex(card => playable(state, card, 2).length > 0);
  const [r, c] = playable(state, state.hands[2][cardIndex], 2)[0];
  state.sel = cardIndex;
  const next = playCard(state, r, c, 2);
  assert.equal(next.chips[r][c], 0);
  assert.equal(next.turn, 3);
});

test("move validation rejects wrong turns, invalid coordinates and free corners", () => {
  const state = newGame();
  const cardIndex = state.hands[0].findIndex(card => playable(state, card, 0).length > 0);
  const [r, c] = playable(state, state.hands[0][cardIndex], 0)[0];
  assert.equal(validateMove(state, { player: 1, cardIndex, r, c }).valid, false);
  assert.equal(validateMove(state, { player: 0, cardIndex, r: -1, c }).valid, false);
  assert.equal(validateMove(state, { player: 0, cardIndex, r: 0, c: 0 }).valid, false);
});

test("dead cards can be exchanged once without advancing the turn", () => {
  const state = newGame();
  const card = "AS", locations = [];
  ROWS.forEach((row, r) => row.forEach((value, c) => { if (value === card) locations.push([r, c]); }));
  locations.forEach(([r, c]) => { state.chips[r][c] = 1; });
  state.hands[0][0] = card; state.sel = 0;
  assert.equal(isDead(state, card), true);
  assert.equal(validateDeadSwap(state, { player: 0, cardIndex: 0 }).valid, true);
  const next = swapDead(state, 0);
  assert.equal(next.turn, 0);
  assert.equal(next.swapped, true);
  assert.equal(next.hands[0].length, 7);
  assert.ok(next.discard.includes(card));
  assert.equal(validateDeadSwap(next, { player: 0, cardIndex: 0 }).valid, false);
});
