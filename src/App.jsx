import { useEffect, useMemo, useRef, useState } from "react";
import { createClient } from "@supabase/supabase-js";
import { ROWS, SYM, TEAMS, WIN, isCorner, isJack, twoEyed, isRed, rank, newGame, playable, isDead, playCard, swapDead, validateMove, validateDeadSwap, teamForSeat } from "./game.js";
import "./multiplayer.css";

const URL = import.meta.env.VITE_SUPABASE_URL;
const KEY = import.meta.env.VITE_SUPABASE_ANON_KEY;
const supabase = URL && KEY ? createClient(URL, KEY) : null;
const playerId = (() => {
  let id = localStorage.getItem("sequence-player-id");
  if (!id) { id = crypto.randomUUID(); localStorage.setItem("sequence-player-id", id); }
  return id;
})();
const roomCode = () => Math.random().toString(36).slice(2, 8).toUpperCase();

function playCelebration(kind) {
  try {
    const AudioContextClass = window.AudioContext || window.webkitAudioContext;
    if (AudioContextClass) {
      const context = new AudioContextClass();
      const notes = kind === "win" ? [523, 659, 784, 1047] : kind === "lose" ? [392, 330, 262] : [659, 784, 988];
      notes.forEach((frequency, index) => {
        const oscillator = context.createOscillator();
        const gain = context.createGain();
        const start = context.currentTime + index * (kind === "sequence" ? 0.11 : 0.2);
        oscillator.type = "sine";
        oscillator.frequency.value = frequency;
        gain.gain.setValueAtTime(0.0001, start);
        gain.gain.exponentialRampToValueAtTime(0.16, start + 0.025);
        gain.gain.exponentialRampToValueAtTime(0.0001, start + 0.24);
        oscillator.connect(gain);
        gain.connect(context.destination);
        oscillator.start(start);
        oscillator.stop(start + 0.26);
      });
      window.setTimeout(() => context.close(), 1600);
    }
  } catch (error) {
    // Sound is an enhancement; gameplay should continue if audio is unavailable.
  }
}

function speakGameMessage(message) {
  if (!("speechSynthesis" in window) || !("SpeechSynthesisUtterance" in window)) return;
  window.speechSynthesis.cancel();
  const utterance = new SpeechSynthesisUtterance(message);
  utterance.lang = "en-US";
  utterance.rate = 0.95;
  utterance.pitch = 1.05;
  window.speechSynthesis.speak(utterance);
}

const RULES = [
  ["Goal", "Be the first player to make two Sequences: an unbroken line of five chips horizontally, vertically or diagonally."],
  ["Play a card", "Choose a card, then place your chip on an unoccupied matching space. Most cards appear twice on the board."],
  ["Two-eyed Jacks (J♦, J♣)", "Wild cards. Place a chip on any unoccupied non-corner space."],
  ["One-eyed Jacks (J♥, J♠)", "Remove one opponent chip, unless it belongs to a completed Sequence."],
  ["Free corners", "All four corners are wild spaces shared by both players. They count toward a Sequence."],
  ["Dead cards", "If both matching spaces are occupied, select the card and choose Swap dead card to draw a replacement."],
  ["Completed Sequences", "Chips in a completed Sequence are locked. One chip may be shared between two Sequences."],
];

function Card({ value, selected, dead, disabled, onClick }) {
  return <button className={`hc ${isRed(value) ? "red" : ""} ${selected ? "sel" : ""} ${dead ? "dead" : ""}`} onClick={onClick} disabled={disabled} aria-pressed={selected}>
    <span className="corner-idx">{rank(value)}<br/>{SYM[value[1]]}</span><span className="big">{SYM[value[1]]}</span>
    {isJack(value) && <em>{twoEyed(value) ? "WILD" : "REMOVE"}</em>}
    {dead && <em>DEAD</em>}
  </button>;
}
function Rules() {
  return <div className="seq-rules">{RULES.map(([title, body]) => <details key={title}><summary>{title}</summary><p>{body}</p></details>)}</div>;
}

function chooseAiMove(state, difficulty = "medium") {
  const candidates = [];
  state.hands[1].forEach((card, cardIndex) => {
    playable(state, card, 1).forEach(([r, c]) => {
      let score = Math.random() * (difficulty === "easy" ? 8 : 1);
      if (difficulty !== "easy") {
        const next = playCard({ ...state, sel: cardIndex }, r, c, 1);
        score += (next.seqs[1].length - state.seqs[1].length) * 100;
        score += (next.seqs[0].length - state.seqs[0].length) * -65;
        const centerDistance = Math.abs(4.5 - r) + Math.abs(4.5 - c);
        score -= centerDistance * (difficulty === "hard" ? 1.4 : 0.35);
        if (card === "JD" || card === "JC") score -= difficulty === "hard" ? 2 : 0.5;
        if (difficulty === "hard") {
          const adjacent = [[0,1],[0,-1],[1,0],[-1,0],[1,1],[-1,-1],[1,-1],[-1,1]]
            .filter(([dr,dc]) => state.chips[r+dr]?.[c+dc] === 1).length;
          score += adjacent * 1.8;
        }
      }
      candidates.push({ cardIndex, r, c, score });
    });
  });
  candidates.sort((a, b) => b.score - a.score);
  return candidates[0] || null;
}

export default function App() {
  const [mode, setMode] = useState("lobby");
  const [gameMode, setGameMode] = useState("online");
  const [difficulty, setDifficulty] = useState(localStorage.getItem("sequence-ai-difficulty") || "medium");
  const [playerName, setPlayerName] = useState(localStorage.getItem("sequence-player-name") || "Player");
  const [profileOpen, setProfileOpen] = useState(false);
  const [stats, setStats] = useState(() => {
    try { return JSON.parse(localStorage.getItem("sequence-stats") || '{"played":0,"wins":0,"losses":0}'); }
    catch { return { played: 0, wins: 0, losses: 0 }; }
  });
  const [room, setRoom] = useState("");
  const [codeInput, setCodeInput] = useState("");
  const [playerCount, setPlayerCount] = useState(2);
  const [chatMessages, setChatMessages] = useState([]);
  const [chatInput, setChatInput] = useState("");
  const [aiThought, setAiThought] = useState("");
  const [seat, setSeat] = useState(-1);
  const [host, setHost] = useState(false);
  const [state, setState] = useState(null);
  const [players, setPlayers] = useState([]);
  const playersRef = useRef([]);
  const [connected, setConnected] = useState(false);
  const [notice, setNotice] = useState("");
  const [chipOpen, setChipOpen] = useState(false);
  const [rulesOpen, setRulesOpen] = useState(false);
  const [soundEnabled, setSoundEnabled] = useState(true);
  const [voiceEnabled, setVoiceEnabled] = useState(true);
  const [micOn, setMicOn] = useState(false);
  const [voiceError, setVoiceError] = useState("");
  const localStreamRef = useRef(null);
  const peerConnectionsRef = useRef({});
  const remoteAudioRef = useRef({});
  const [remoteStreams, setRemoteStreams] = useState({});
  const previousToastRef = useRef("");
  const previousOverRef = useRef(false);
  const statsRecordedRef = useRef(false);
  const channelRef = useRef(null);
  const stateRef = useRef(null);
  const hostRef = useRef(false);
  const hostIdRef = useRef(null);
  const joinRequestedRef = useRef(false);

  useEffect(() => { stateRef.current = state; }, [state]);
  useEffect(() => { hostRef.current = host; }, [host]);

  useEffect(() => {
    if (gameMode !== "ai" || !state || state.over || state.turn !== 1) return;
    const timer = window.setTimeout(() => {
      const current = stateRef.current;
      if (!current || current.over || current.turn !== 1) return;
      const move = chooseAiMove(current, difficulty);
      if (move) {
        publish(playCard({ ...current, sel: move.cardIndex }, move.r, move.c, 1));
        return;
      }
      const deadIndex = current.hands[1].findIndex(card => isDead(current, card));
      if (deadIndex >= 0 && !current.swapped) {
        publish(swapDead({ ...current, sel: deadIndex }, 1));
      }
    }, 650);
    return () => window.clearTimeout(timer);
  }, [gameMode, state, difficulty]);

  useEffect(() => {
    if (!state) {
      previousToastRef.current = "";
      previousOverRef.current = false;
      return;
    }
    if (state.toast?.includes("Sequence") && previousToastRef.current !== state.toast && !state.over) {
      if (soundEnabled) playCelebration("sequence");
      if (voiceEnabled) speakGameMessage("Sequence completed!");
    }
    if (state.over && !previousOverRef.current) {
      const won = seat === state.winner;
      if (soundEnabled) playCelebration(won ? "win" : "lose");
      if (voiceEnabled) speakGameMessage(won ? "Congratulations! You won!" : "Better luck next time!");
      if (!statsRecordedRef.current) {
        setStats(previous => {
          const next = { played: previous.played + 1, wins: previous.wins + (won ? 1 : 0), losses: previous.losses + (won ? 0 : 1) };
          localStorage.setItem("sequence-stats", JSON.stringify(next));
          return next;
        });
        statsRecordedRef.current = true;
      }
    }
    previousToastRef.current = state.toast;
    previousOverRef.current = state.over;
  }, [state, seat, soundEnabled, voiceEnabled]);

  const send = (event, payload = {}) => channelRef.current?.send({
    type: "broadcast", event, payload: { ...payload, sender: playerId }
  });
  const publish = (next) => {
    stateRef.current = next;
    setState(next);
    send("game_state", { state: next });
  };

  const leave = async () => {
    if (channelRef.current && supabase) await supabase.removeChannel(channelRef.current);
    channelRef.current = null; stateRef.current = null; hostIdRef.current = null;
    setState(null); setRoom(""); setSeat(-1); setHost(false); setPlayers([]);
    setConnected(false); setMode("lobby"); setChipOpen(false);
  };

  const connect = async (code, isHost) => {
    if (!supabase) { setNotice("Online play needs Supabase. Add the two environment variables from .env.example."); return false; }
    const channel = supabase.channel(`sequence-${code}`, {
      config: { broadcast: { self: false }, presence: { key: playerId } }
    });
    channelRef.current = channel;
    channel.on("broadcast", { event: "join_request" }, ({ payload }) => {
      if (hostRef.current && payload.sender !== playerId && stateRef.current) send("game_state", { state: stateRef.current });
    });
    channel.on("broadcast", { event: "game_notice" }, ({ payload }) => {
      if (payload.target === playerId) setNotice(payload.message || "Move could not be completed.");
    });
    channel.on("broadcast", { event: "game_state" }, ({ payload }) => {
      if (!hostRef.current && payload.sender === hostIdRef.current && payload.state) {
        stateRef.current = payload.state; setState(payload.state); setMode("game");
      }
    });
    channel.on("broadcast", { event: "move_request" }, ({ payload }) => {
      if (!hostRef.current || payload.sender === playerId) return;
      const current = stateRef.current;
      const validation = validateMove(current, { player: 1, cardIndex: payload.cardIndex, r: payload.r, c: payload.c });
      if (!validation.valid) {
        send("game_notice", { target: payload.sender, message: validation.reason });
        return;
      }
      publish(playCard({ ...current, sel: payload.cardIndex }, payload.r, payload.c, 1));
    });
    channel.on("broadcast", { event: "swap_request" }, ({ payload }) => {
      if (!hostRef.current || payload.sender === playerId) return;
      const current = stateRef.current;
      const validation = validateDeadSwap(current, { player: 1, cardIndex: payload.cardIndex });
      if (!validation.valid) {
        send("game_notice", { target: payload.sender, message: validation.reason });
        return;
      }
      publish(swapDead({ ...current, sel: payload.cardIndex }, 1));
    });
    channel.on("presence", { event: "sync" }, () => {
      const members = Object.entries(channel.presenceState()).flatMap(([key, list]) => list.map(p => ({ ...p, key })));
      const admitted = members.slice(0, 2);
      setPlayers(admitted);
      const hostMember = members.find(p => p.seat === 0);
      if (hostMember) hostIdRef.current = hostMember.key;
      if (members.length > 2 && !members.some(p => p.key === playerId)) {
        setNotice("This room already has two players.");
        supabase.removeChannel(channel); channelRef.current = null;
        setConnected(false); setRoom(""); setSeat(-1); setMode("lobby");
      }
      if (!isHost && hostIdRef.current && !joinRequestedRef.current) {
        joinRequestedRef.current = true;
        send("join_request");
      }
    });
    const result = await new Promise(resolve => {
      channel.subscribe(async status => {
        if (status === "SUBSCRIBED") {
          setConnected(true);
          await channel.track({ label: isHost ? "Blue player" : "Pink player", seat: isHost ? 0 : 1 });
          resolve(true);
        } else if (status === "CHANNEL_ERROR" || status === "TIMED_OUT") resolve(false);
      });
    });
    if (!result) {
      await supabase.removeChannel(channel); channelRef.current = null;
      setConnected(false); setNotice("Could not connect. Check your Supabase URL, key and Realtime settings.");
      return false;
    }
    setRoom(code); setMode(isHost ? "game" : "waiting");
    return true;
  };

  const createAiGame = () => {
    if (channelRef.current && supabase) supabase.removeChannel(channelRef.current);
    const initial = newGame(); initial.veil = false; initial.toast = "";
    statsRecordedRef.current = false;
    stateRef.current = initial; setState(initial); setRoom("SOLO"); setSeat(0);
    setHost(true); hostRef.current = true; setPlayers([{ key: playerId, seat: 0 }, { key: "chip-ai", seat: 1 }]);
    setConnected(true); setGameMode("ai"); setMode("game");
  };

  const createRoom = async () => {
    setGameMode("online");
    if (!supabase) { setNotice("Add VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY to .env.local to enable online play."); return; }
    const code = roomCode();
    const initial = newGame(); initial.veil = false; initial.toast = "";
    stateRef.current = initial; setState(initial);
    hostIdRef.current = playerId; joinRequestedRef.current = false;
    setHost(true); hostRef.current = true; setSeat(0);
    await connect(code, true);
  };
  const joinRoom = async () => {
    const code = codeInput.trim().toUpperCase();
    if (code.length !== 6) { setNotice("Enter the six-character room code."); return; }
    setGameMode("online");
    hostIdRef.current = null; joinRequestedRef.current = false;
    setHost(false); hostRef.current = false; setSeat(1);
    await connect(code, false);
  };

  const team = state ? TEAMS[state.turn] : TEAMS[0];
  const selected = state && state.sel >= 0 ? state.hands[state.turn][state.sel] : null;
  const myTurn = !!state && seat === state.turn && !state.over && players.length >= 2;
  const moves = myTurn && selected ? playable(state, selected) : [];
  const canSwap = myTurn && !!selected && !state.swapped && isDead(state, selected);
  const sequenceCells = useMemo(() => new Set(state ? state.seqs.flat().flat() : []), [state]);
  const hint = !state ? "I’m Chip! I can explain the rules and help you choose a move."
    : players.length < 2 ? "Waiting for your opponent to join the room…"
    : state.over ? `${team.name} wins! Two Sequences completed.`
    : myTurn ? !selected ? "Your turn. Pick a card from your hand."
    : isDead(state, selected) ? "Both spaces for this card are occupied. Swap it for a new card."
    : isJack(selected) ? twoEyed(selected) ? "Wild Jack! Choose any empty space on the board." : "One-eyed Jack! Remove an opponent chip that is not in a completed Sequence."
    : "Tap one of the glowing spaces to place your chip."
    : gameMode === "ai" && state.turn === 1 ? "Chip is thinking…" : `Waiting for ${team.name} to play…`;

  const chooseCard = index => {
    if (!myTurn) return;
    setState(prev => ({ ...prev, sel: prev.sel === index ? -1 : index }));
  };
  const playAt = (r,c) => {
    if (!myTurn || !selected) return;
    if (host) publish(playCard(state, r, c));
    else send("move_request", { r, c, cardIndex: state.sel });
  };
  const swap = () => {
    if (!canSwap) return;
    if (host) publish(swapDead(state));
    else send("swap_request", { cardIndex: state.sel });
  };
  const restart = () => {
    if (!host) return;
    const next = newGame(); next.veil = false; next.toast = "";
    statsRecordedRef.current = false;
    publish(next);
  };

  const saveProfile = () => {
    const clean = playerName.trim().slice(0, 18) || "Player";
    setPlayerName(clean);
    localStorage.setItem("sequence-player-name", clean);
    localStorage.setItem("sequence-ai-difficulty", difficulty);
    setProfileOpen(false);
  };

  if (mode === "lobby") return <main className="seq-lobby">
    <div className="seq-logo">♠</div><p className="seq-eyebrow">THE CLASSIC BOARD GAME</p>
    <h1>Sequence<span>.</span></h1><p className="seq-subtitle">Think ahead. Play together. Make your Sequence.</p>
    <section className="seq-lobby-card">
      <h2>Play Sequence</h2>
      <button className="seq-link seq-profile-link" onClick={() => setProfileOpen(value => !value)}>Player profile · {playerName} · {stats.wins} wins</button>
      {profileOpen && <div className="seq-profile">
        <label htmlFor="seq-player-name">Display name</label>
        <input id="seq-player-name" maxLength={18} value={playerName} onChange={event => setPlayerName(event.target.value)} />
        <label htmlFor="seq-ai-level">AI difficulty</label>
        <select id="seq-ai-level" value={difficulty} onChange={event => setDifficulty(event.target.value)}>
          <option value="easy">Easy</option><option value="medium">Medium</option><option value="hard">Hard</option>
        </select>
        <p>{stats.played} games · {stats.wins} wins · {stats.losses} losses</p>
        <button className="seq-primary" onClick={saveProfile}>Save profile</button>
      </div>}
      <button className="seq-primary" onClick={createAiGame}>♟ Play against Chip (AI)</button>
      <button className="seq-primary seq-secondary" onClick={createRoom}>＋ Play with a friend · Create room</button>
      <div className="seq-or"><span/>OR<span/></div>
      <label htmlFor="sequence-room">Join with a room code</label>
      <div className="seq-join"><input id="sequence-room" value={codeInput} maxLength={6} placeholder="ABC123" onChange={e => setCodeInput(e.target.value.toUpperCase().replace(/[^A-Z0-9]/g, ""))}/><button className="seq-primary" onClick={joinRoom}>Join</button></div>
      {!supabase && <p className="seq-note">Online play requires Supabase setup. See README.md for the quick setup.</p>}
      {notice && <p className="seq-note">{notice}</p>}
    </section>
    <button className="seq-link" onClick={() => setRulesOpen(v => !v)}>How to play · Rules</button>
    {rulesOpen && <Rules/>}
    <p className="seq-footer">A little strategy goes a long way.</p>
  </main>;

  if (mode === "waiting") return <main className="seq-lobby">
    <div className="seq-logo">♠</div><p className="seq-eyebrow">ROOM CREATED</p><h1>Room <span>{room}</span></h1>
    <section className="seq-lobby-card"><div className="seq-spinner"/><h2>Waiting for your friend</h2><p>Share this code so they can join your game.</p>
      <div className="seq-room-code">{room}</div><button className="seq-primary" onClick={() => navigator.clipboard?.writeText(room)}>Copy room code</button>
      <button className="seq-link" onClick={leave}>Leave room</button>
    </section>
  </main>;

  if (!state) return null;
  return <main className="app seq-app" style={{ "--team": team.color }}>
    <header className="seq-header"><div><p className="seq-eyebrow">SEQUENCE · ONLINE</p><h1>Game table</h1></div>
      <div className="seq-room-meta"><span className={connected ? "seq-live" : ""}/>{connected ? "Connected" : "Connecting"}<button onClick={() => setSoundEnabled(value => !value)} aria-pressed={soundEnabled}>{soundEnabled ? "🔊 Sound on" : "🔇 Sound off"}</button><button onClick={() => setVoiceEnabled(value => !value)} aria-pressed={voiceEnabled}>{voiceEnabled ? "🗣 Voice on" : "🗣 Voice off"}</button><button onClick={() => navigator.clipboard?.writeText(room)}>Room {room} ⧉</button><button onClick={leave}>Exit</button></div>
    </header>
    <section className="top">{TEAMS.map((t,i) => <div key={t.name} className={`team ${i === state.turn ? "on" : ""}`} style={{ "--c": t.color }}>
      <span className="dot"/><b>{t.name}</b><small>{i === seat ? playerName : gameMode === "ai" ? "Chip · AI" : i === 0 ? "Host" : "Opponent"}</small>
      <div className="pips">{Array.from({length:WIN},(_,p)=><span key={p} className={`pip ${p < state.seqs[i].length ? "full" : ""}`}/>)}</div>
    </div>)}</section>
    <div className="seq-turn"><b>{myTurn ? "Your turn" : `${team.name}'s turn`}</b><span>{hint}</span></div>
    <div className="seq-game-layout">
      <section className="seq-board-frame"><div className="board">{ROWS.map((row,r)=>row.map((value,c)=>{
        const id = r*10+c, chip = state.chips[r][c], hit = moves.some(([rr,cc])=>rr===r&&cc===c);
        return <button key={id} className={`cell ${isCorner(r,c)?"wild":""} ${isRed(value)?"red":""} ${hit?"ok":""} ${state.last?.[0]===r&&state.last?.[1]===c?"last":""} ${sequenceCells.has(id)?"inseq":""}`} disabled={!hit} onClick={()=>playAt(r,c)} aria-label={isCorner(r,c)?"Free corner":`${rank(value)} of ${value[1]}`}>
          {isCorner(r,c)?<span className="star">★</span>:<><span className="rk">{rank(value)}</span><span className="st">{SYM[value[1]]}</span></>}
          {chip !== null && <i className={`chip ${state.locked[r][c]?"lock":""}`} style={{"--c":TEAMS[chip].color,"--d":TEAMS[chip].dark}}/>}
        </button>;
      }))}</div></section>
      <aside className="seq-hand-panel"><div className="seq-panel-heading"><h2>{playerName}'s hand</h2><span>{myTurn ? "Choose a card" : "Opponent's turn"}</span></div>
        <div className="hand">{state.hands[seat].map((value,i)=><Card key={value+i} value={value} selected={myTurn&&state.sel===i} dead={isDead(state,value)} disabled={!myTurn} onClick={()=>chooseCard(i)}/>)}</div>
        <div className="actions"><button className="btn" disabled={!canSwap} onClick={swap}>Swap dead card</button>{host&&<button className="btn ghost" onClick={restart}>New game</button>}</div>
        <details className="log"><summary>Move history</summary><ol>{state.log.slice(0,12).map((entry,i)=><li key={i}>{entry}</li>)}</ol></details>
        <button className="seq-link" onClick={()=>setRulesOpen(v=>!v)}>Game rules</button>{rulesOpen&&<Rules/>}
      </aside>
    </div>
    {notice && <div className="seq-notice" role="status"><span>{notice}</span><button onClick={() => setNotice("")} aria-label="Dismiss notification">×</button></div>}
    {state.toast && !state.over && <div className="seq-toast" role="status">{state.toast}</div>}
    {state.over&&<div className="seq-winner"><div><div className="seq-trophy">🏆</div><p className="seq-eyebrow">GAME COMPLETE</p><h2>{state.winner === seat ? "Congratulations! You won!" : "Better luck next time!"}</h2><p>{TEAMS[state.winner ?? state.turn].name} completed two Sequences. Great game!</p>{host&&<button className="seq-primary" onClick={restart}>Play again</button>}<button className="seq-link" onClick={leave}>Back to lobby</button></div></div>}
    <div className={`seq-chip-helper ${chipOpen?"open":""}`}>
      {chipOpen&&<section className="seq-chip-popup"><header><b>Chip · your game guide</b><button onClick={()=>setChipOpen(false)} aria-label="Close Chip">×</button></header>
        <p>{hint}</p><p className="seq-chip-tip">{selected&&isJack(selected)?twoEyed(selected)?"A two-eyed Jack can be placed on any empty space.":"A one-eyed Jack removes an opponent chip, but not one in a completed Sequence.":"Build five connected chips in a straight line. Corners count for both players."}</p>
        <button className="seq-link" onClick={()=>setRulesOpen(v=>!v)}>Read all rules</button>{rulesOpen&&<Rules/>}
      </section>}
      <button className="seq-chip-button" onClick={()=>setChipOpen(v=>!v)} aria-label="Open Chip game guide"><span className="seq-mascot"><i/><i/><b/></span><small>Chip</small></button>
    </div>
  </main>;
}
