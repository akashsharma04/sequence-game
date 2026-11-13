import { useEffect, useState } from "react";
import {
  ROWS, SYM, TEAMS, WIN,
  isCorner, isJack, twoEyed, isRed, rank,
  newGame, playable, isDead, playCard, swapDead,
} from "./game.js";

const KEY = "sequence-save-v1";

function load() {
  try {
    const raw = localStorage.getItem(KEY);
    if (raw) return JSON.parse(raw);
  } catch {}
  return newGame();
}

function Card({ k, small, selected, dead, onClick }) {
  return (
    <button
      type="button"
      className={`hc${isRed(k) ? " red" : ""}${selected ? " sel" : ""}${dead ? " dead" : ""}`}
      onClick={onClick}
      aria-pressed={selected}
      aria-label={`${rank(k)} of ${k[1]}`}
    >
      <span className="corner-idx">{rank(k)}<br />{SYM[k[1]]}</span>
      <span className="big">{SYM[k[1]]}</span>
      {small && <em>{small}</em>}
    </button>
  );
}

export default function App() {
  const [s, setS] = useState(load);

  useEffect(() => {
    try { localStorage.setItem(KEY, JSON.stringify(s)); } catch {}
  }, [s]);

  const team = TEAMS[s.turn];
  const card = s.sel >= 0 ? s.hands[s.turn][s.sel] : null;
  const ok = card && !s.over ? playable(s, card) : [];
  const canSwap = !!card && !s.swapped && isDead(s, card);
  const seqCells = new Set(s.seqs.flat().flat());

  let hint = `${team.name}: pick a card from your hand.`;
  if (s.over) hint = `${team.name} wins!`;
  else if (card && isDead(s, card)) hint = "Both spaces for this card are taken. Swap it.";
  else if (card && isJack(card))
    hint = twoEyed(card)
      ? "Wild jack: place a chip on any open space."
      : "One-eyed jack: remove an opponent chip that isn’t in a sequence.";
  else if (card) hint = "Tap a glowing space to place your chip.";

  return (
    <div className="app" style={{ "--team": team.color }}>
      <header className="top">
        {TEAMS.map((t, i) => (
          <div key={t.name} className={`team${i === s.turn ? " on" : ""}`} style={{ "--c": t.color }}>
            <span className="dot" />
            <b>{t.name}</b>
            <div className="pips" aria-label={`${s.seqs[i].length} of ${WIN} sequences`}>
              {Array.from({ length: WIN }, (_, p) => (
                <span key={p} className={p < s.seqs[i].length ? "pip full" : "pip"} />
              ))}
            </div>
          </div>
        ))}
      </header>

      <div className="frame">
        <div className="board">
          {ROWS.map((row, r) =>
            row.map((code, c) => {
              const hit = ok.some((p) => p[0] === r && p[1] === c);
              const chip = s.chips[r][c];
              const id = r * 10 + c;
              const cls = [
                "cell",
                isCorner(r, c) ? "wild" : isRed(code) ? "red" : "",
                hit ? "ok" : "",
                s.last && s.last[0] === r && s.last[1] === c ? "last" : "",
                seqCells.has(id) ? "inseq" : "",
              ].join(" ");
              return (
                <button
                  key={id}
                  type="button"
                  className={cls}
                  disabled={!hit}
                  onClick={() => setS(playCard(s, r, c))}
                  aria-label={isCorner(r, c) ? "Free corner" : `${rank(code)} of ${code[1]}`}
                >
                  {isCorner(r, c) ? (
                    <span className="star">★</span>
                  ) : (
                    <>
                      <span className="rk">{rank(code)}</span>
                      <span className="st">{SYM[code[1]]}</span>
                    </>
                  )}
                  {chip !== null && (
                    <i
                      className={`chip${s.locked[r][c] ? " lock" : ""}`}
                      style={{ "--c": TEAMS[chip].color, "--d": TEAMS[chip].dark }}
                    />
                  )}
                </button>
              );
            })
          )}
        </div>
      </div>

      <p className="hint" role="status">{hint}</p>

      <div className="hand">
        {s.hands[s.turn].map((k, i) => (
          <Card
            key={k + i}
            k={k}
            selected={i === s.sel}
            dead={isDead(s, k)}
            small={isJack(k) ? (twoEyed(k) ? "wild" : "remove") : isDead(s, k) ? "dead" : ""}
            onClick={() => setS({ ...s, sel: s.sel === i ? -1 : i })}
          />
        ))}
      </div>

      <div className="actions">
        <button className="btn" disabled={!canSwap} onClick={() => setS(swapDead(s))}>Swap dead card</button>
        <button className="btn ghost" onClick={() => setS(newGame())}>New game</button>
      </div>

      <details className="log">
        <summary>Move history</summary>
        <ol>{s.log.slice(0, 12).map((l, i) => <li key={i}>{l}</li>)}</ol>
      </details>

      {s.veil && (
        <div className="veil" role="dialog" aria-modal="true">
          {s.toast && <div className="toast">{s.toast}</div>}
          <h2>{s.over ? `${team.name} wins!` : `${team.name}’s turn`}</h2>
          <p>
            {s.over
              ? `${WIN} sequences complete.`
              : `Pass the phone to ${team.name}, then tap to see your hand.`}
          </p>
          <button onClick={() => (s.over ? setS(newGame()) : setS({ ...s, veil: false, toast: "" }))}>
            {s.over ? "Play again" : "Show my cards"}
          </button>
        </div>
      )}
    </div>
  );
}
