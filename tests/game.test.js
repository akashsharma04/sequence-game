import test from "node:test";
import assert from "node:assert/strict";
import { ROWS, newGame, playable, validateMove, playCard, isDead, validateDeadSwap, swapDead } from "../src/game.js";

test("new game deals seven cards to each player and keeps a complete deck", () => {
  const state = newGame();
  assert.equal(state.hands[0].length, 7);
  assert.equal(state.hands[1].length, 7);
  assert.equal(state.deck.length + state.hands[0].length + state.hands[1].length, 104);
  assert.deepEqual(state.seqs, [[], []]);
});

test("a legal move validates and consumes the selected card", () => {
  const state = newGame();
  const cardIndex = state.hands[0].findIndex(card => playable(state, card, 0).length > 0);
  assert.notEqual(cardIndex, -1);
  const [r, c] = playable(state, state.hands[0][cardIndex], 0)[0];
  state.sel = cardIndex;
  assert.equal(validateMove(state, { player: 0, cardIndex, r, c }).valid, true);
  const next = playCard(state, r, c, 0);
  assert.equal(next.chips[r][c], 0);
  assert.equal(next.hands[0].length, 7);
  assert.equal(next.turn, 1);
  assert.equal(next.discard.length, 1);
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
  const card = "AS";
  const locations = [];
  ROWS.forEach((row, r) => row.forEach((value, c) => { if (value === card) locations.push([r, c]); }));
  assert.ok(locations.length > 0);
  locations.forEach(([r, c]) => { state.chips[r][c] = 1; });
  state.hands[0][0] = card;
  state.sel = 0;
  assert.equal(isDead(state, card), true);
  assert.equal(validateDeadSwap(state, { player: 0, cardIndex: 0 }).valid, true);
  const next = swapDead(state, 0);
  assert.equal(next.turn, 0);
  assert.equal(next.swapped, true);
  assert.equal(next.hands[0].length, 7);
  assert.ok(next.discard.includes(card));
  assert.equal(validateDeadSwap(next, { player: 0, cardIndex: 0 }).valid, false);
});
