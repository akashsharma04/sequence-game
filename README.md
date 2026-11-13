# Sequence — Online Multiplayer

React + Vite Sequence game with two-player room-code multiplayer, live board synchronization, responsive desktop/tablet/mobile layout, and Chip, an interactive rules assistant.

## Local setup

```bash
npm install
```

Copy `.env.example` to `.env.local` and fill in your Supabase Project URL and anon/publishable key:

```env
VITE_SUPABASE_URL=https://YOUR_PROJECT.supabase.co
VITE_SUPABASE_ANON_KEY=YOUR_SUPABASE_ANON_OR_PUBLISHABLE_KEY
```

Then run `npm run dev`.

## Supabase / Vercel setup

1. Create a Supabase project.
2. Copy Project URL and anon/publishable key from Project Settings → API.
3. Add the values to local `.env.local`.
4. Add the same two variables to Vercel → Project → Settings → Environment Variables for Preview and Production.
5. Redeploy after setting Vercel variables.

The MVP uses Supabase Realtime Broadcast and Presence; no database schema is needed. The host browser is authoritative and must stay connected during the match. Game state is not persisted; closing the host tab ends the session. Public Realtime channels and client-generated room codes are not strong access control, so this prototype is intended for casual play/testing rather than secure competitive play.

## Rules

- Two players, seven cards per hand, two Sequences to win.
- Two-eyed Jacks (J♦, J♣) place on any empty non-corner space.
- One-eyed Jacks (J♥, J♠) remove an unlocked opponent chip.
- Four free corners count for both players.
- A dead card can be swapped once during a turn.
- Completed Sequence chips are locked; one chip may be shared by two Sequences.


## Phase 1–4 development update

- Added Node's built-in test runner: `npm test`.
- Added regression coverage for dealing, legal/illegal moves, dead-card exchanges and turn handling.
- Host-side remote move and dead-card requests now use the shared validation functions and send a reason to the requesting player when rejected.
- Sound and speech controls now operate independently; win/lose feedback uses the explicit winner field.
- Added a local single-player mode against Chip. The AI selects legal placements and can exchange a dead card when it has no playable placement.
- Existing board-chip drop animation, legal-move highlighting, toast notices and responsive mobile layout remain in place.

## Known limitations before public competitive launch

The current online room is still a casual prototype: the host browser owns the authoritative state and broadcasts game state to the room. Reconnect after host loss, persistent room recovery, secure server-side move validation, private hand delivery and anti-cheat protection require a trusted backend (for example Supabase Edge Functions plus database-backed room state). Do not use the current public room model for ranked or prize-based play.

## Development commands

```bash
npm install
npm test
npm run build
```
