# Sequence

Two-team Sequence board game (pass-and-play) built with React + Vite.

## Run locally
    npm install
    npm run dev

## Deploy free on Vercel
1. Push this folder to a GitHub repo.
2. On vercel.com choose Add New, Project, then import the repo.
3. Keep the defaults (Vite, build `npm run build`, output `dist`) and deploy.

## Files
- `src/game.js`  pure game rules (board, deck, jacks, sequences)
- `src/App.jsx`  UI (board, hand, hand-over screen, move history)
- `src/styles.css` look and animations
- The game auto-saves to the browser (localStorage).

## Next: online play
Keep the state from `game.js` on a server (Supabase Realtime, Firebase or PartyKit)
and send each move as `{ r, c, cardIndex }`. Both clients run `playCard`.
