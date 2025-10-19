// admin.js (host + presentation + AI)
import { initializeApp } from "https://www.gstatic.com/firebasejs/11.0.1/firebase-app.js";
import { getDatabase, ref, set, get, update, push, onValue, remove } from "https://www.gstatic.com/firebasejs/11.0.1/firebase-database.js";

/* ===== FIREBASE CONFIG (byt om du vill) ===== */
const firebaseConfig = {
  apiKey: "AIzaSyB3h1EJpPZSKasbR0ztZVJXEnwu-Uj_-0M",
  authDomain: "spel-skola.firebaseapp.com",
  databaseURL: "https://spel-skola-default-rtdb.europe-west1.firebasedatabase.app",
  projectId: "spel-skola",
};
const app = initializeApp(firebaseConfig);
const db = getDatabase(app);

/* ===== OPENROUTER KEY - fyll i din om du vill AI ska köras ===== */
const OPENROUTER_API_KEY = "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";

/* ===== DOM ===== */
const playersRow = document.getElementById("playersRow");
const startBtn = document.getElementById("startBtn");
const endBtn = document.getElementById("endBtn");
const adminStatus = document.getElementById("adminStatus");
const propDisplayTop = document.getElementById("propDisplayTop");

const adminLobby = document.getElementById("adminLobby");
const adminGame = document.getElementById("adminGame");
const adminPhaseTitle = document.getElementById("adminPhaseTitle");
const adminProposition = document.getElementById("adminProposition");
const presentationArea = document.getElementById("presentationArea");
const startPresentationBtn = document.getElementById("startPresentationBtn");
const endGameBtn = document.getElementById("endGameBtn");
const aiTop3 = document.getElementById("aiTop3");

/* ===== Local propositions (random pick when starting) ===== */
const propositions = [
  "Mer samhällskunskap i skolan",
  "Inför gratis kollektivtrafik för ungdomar",
  "Sänk rösträttsåldern till 16",
  "Mobilfria skolor",
  "Inför obligatorisk samhällskunskap",
  "Obligatorisk källkritik i alla ämnen",
  "Gratis skolmat för alla elever",
  "Inför nationellt betygssystem för samhällskunskap",
  "Stärk ungdomsrösten i kommunpolitiken",
  "Mer praktik i skolan"
];

/* ===== Refs ===== */
const ROOM = "gameRoom";
const roomRef = ref(db, ROOM);
const playersRef = ref(db, `${ROOM}/players`);
const pairsRef = ref(db, `${ROOM}/pairs`);
const roomMetaRef = ref(db, ROOM);

/* ===== live lobby (admin sees names) ===== */
onValue(playersRef, snap => {
  const players = snap.val() || {};
  playersRow.innerHTML = "";
  Object.entries(players).forEach(([id, p]) => {
    const pill = document.createElement("div");
    pill.className = "player-pill";
    pill.textContent = p.party + (p.points ? ` — ${p.points}p` : "");
    playersRow.appendChild(pill);
  });
});

/* ===== start: create pairs, pick proposition, set initial state ===== */
startBtn.addEventListener("click", async () => {
  const playersSnap = await get(playersRef);
  const playersObj = playersSnap.exists() ? playersSnap.val() : {};
  const playerIds = Object.keys(playersObj);
  if (playerIds.length < 2) return alert("Minst 2 spelare krävs");

  // shuffle
  const shuffled = playerIds.sort(() => Math.random() - 0.5);

  // pairs
  const pairs = [];
  for (let i = 0; i < shuffled.length; i += 2) {
    const a = shuffled[i];
    const b = shuffled[i+1] || null;
    if (b) pairs.push({ a, b });
    else {
      console.warn("Leftover (unpaired):", a);
    }
  }

  // pick random proposition automatically
  const proposition = propositions[Math.floor(Math.random() * propositions.length)];

  // write initial room state
  await set(roomRef, {
    gameActive: true,
    proposition,
    roundNumber: 1,
    phase: "phase1",
    totalRounds: 3,
    pairs
  });

  // reset players
  for (const pid of playerIds) {
    await update(ref(db, `${ROOM}/players/${pid}`), { points: 0, ready: "" });
  }

  adminStatus.textContent = `Spelet startat — Runda 1 / Fas 1`;
  propDisplayTop.textContent = `Proposition: ${proposition}`;
  console.log("Game started:", { pairs, proposition });

  // switch admin view to game
  adminLobby.classList.add("hidden");
  adminGame.classList.remove("hidden");
  adminPhaseTitle.textContent = `1 / 3 — Fas 1`;
  adminProposition.textContent = `Proposition: ${proposition}`;
});

/* ===== auto advance when all writers ready (admin watches room meta) ===== */
onValue(roomMetaRef, async snap => {
  const room = snap.val();
  if (!room || !room.gameActive) return;
  const phase = room.phase;
  const roundNumber = room.roundNumber || 1;
  const pairs = room.pairs || [];

  const expectedKey = `r${roundNumber}_${phase}`;
  console.log("Admin checking advancement; expect:", expectedKey);

  const playersSnap = await get(playersRef);
  const playersObj = playersSnap.exists() ? playersSnap.val() : {};
  // identify writer IDs for this phase
  const writerRole = (phase === "phase1") ? "A" : "B";
  let writers = [];
  (pairs || []).forEach(pair => {
    if (!pair) return;
    const w = writerRole === "A" ? pair.a : pair.b;
    if (w) writers.push(w);
  });

  // check all writers have ready==expectedKey
  let allReady = true;
  for (const wid of writers) {
    const p = playersObj[wid];
    if (!p) { allReady = false; break; }
    if ((p.ready || "") !== expectedKey) { allReady = false; break; }
  }

  if (allReady) {
    console.log("Alla writers är klara för", expectedKey);
    await advancePhase(); // advance
  }
});

/* ===== advancePhase ===== */
async function advancePhase() {
  const roomSnap = await get(roomRef);
  const room = roomSnap.val();
  if (!room) return;
  let { roundNumber = 1, phase = "phase1", totalRounds = 3 } = room;

  if (phase === "phase1") {
    phase = "phase2";
    await update(roomRef, { phase });
    // reset players ready flags (so next phase tracks correctly)
    const playersSnap = await get(playersRef);
    const playersObj = playersSnap.exists() ? playersSnap.val() : {};
    for (const pid of Object.keys(playersObj)) {
      await update(ref(db, `${ROOM}/players/${pid}`), { ready: "" });
    }
    adminStatus.textContent = `Runda ${roundNumber} — Fas 2`;
    adminPhaseTitle.textContent = `${roundNumber} / ${totalRounds} — Fas 2`;
    console.log("Avancerat till phase2");
    return;
  }

  if (phase === "phase2") {
    if (roundNumber >= totalRounds) {
      // finish game -> run AI and show results
      await update(roomRef, { phase: "finished", gameActive: false });
      adminStatus.textContent = "Spelet klart — kör AI-analys";
      await runAIAndStore();
      return;
    } else {
      roundNumber += 1;
      phase = "phase1";
      await update(roomRef, { roundNumber, phase });
      // reset ready flags
      const playersSnap = await get(playersRef);
      const playersObj = playersSnap.exists() ? playersSnap.val() : {};
      for (const pid of Object.keys(playersObj)) {
        await update(ref(db, `${ROOM}/players/${pid}`), { ready: "" });
      }
      adminStatus.textContent = `Runda ${roundNumber} — Fas 1`;
      adminPhaseTitle.textContent = `${roundNumber} / ${room.totalRounds || 3} — Fas 1`;
      console.log("Startar runda", roundNumber);
      return;
    }
  }
}

/* ===== endBtn - clean lobby & reset room ===== */
endBtn.addEventListener("click", async () => {
  await update(roomRef, { gameActive: false, phase: "", roundNumber: 0, pairs: [] });
  await remove(ref(db, `${ROOM}/players`));
  await remove(ref(db, `${ROOM}/arguments`));
  adminStatus.textContent = "Spelet avslutat och lobbyn rensad.";
  console.log("Game ended and cleared");
  // go back to lobby view
  adminGame.classList.add("hidden");
  adminLobby.classList.remove("hidden");
});

/* ===== presentation logic: build per-pair message queue ===== */
function buildPresentationQueue(room, players) {
  const pairs = room.pairs || [];
  const totalRounds = room.totalRounds || 3;
  const queue = [];

  // for each pair -> for each round -> show A's phase1 arg then B's phase2 arg
  for (const pair of pairs) {
    if (!pair.a || !pair.b) continue;
    const a = players[pair.a];
    const b = players[pair.b];
    for (let r = 1; r <= totalRounds; r++) {
      const k1 = `r${r}_phase1`;
      const k2 = `r${r}_phase2`;
      const aarg = (a && a.arguments && a.arguments[k1]) ? a.arguments[k1].text : null;
      const barg = (b && b.arguments && b.arguments[k2]) ? b.arguments[k2].text : null;
      queue.push({ pair: [a ? a.party : "?", b ? b.party : "?"], author: a ? a.party : "A", text: aarg || "(inget argument)" });
      queue.push({ pair: [a ? a.party : "?", b ? b.party : "?"], author: b ? b.party : "B", text: barg || "(inget argument)" });
    }
  }
  return queue;
}

/* ===== presentation runner (admin only) ===== */
let presentationInterval = null;
startPresentationBtn.addEventListener("click", async () => {
  // get room + players
  const roomSnap = await get(roomRef);
  const room = roomSnap.val() || {};
  const playersSnap = await get(playersRef);
  const players = playersSnap.exists() ? playersSnap.val() : {};

  const queue = buildPresentationQueue(room, players);
  if (!queue.length) return alert("Inga meddelanden att visa.");

  presentationArea.innerHTML = ""; // clear
  adminPhaseTitle.textContent = "Resultatvisning";

  // show one message at a time; keep previous messages visible; new messages scroll into view
  let idx = 0;
  function showNext() {
    if (idx >= queue.length) {
      clearInterval(presentationInterval);
      adminStatus.textContent = "Presentation klar.";
      // after presenting all pairs, compute AI top3
      runAIAndStore();
      return;
    }
    const item = queue[idx++];
    const div = document.createElement("div");
    div.className = "presentation-message";
    div.innerHTML = `<strong>${item.author}:</strong> ${item.text}`;
    presentationArea.appendChild(div);
    div.scrollIntoView({ behavior: "smooth", block: "end" });

    // TTS only on admin
    try {
      const utter = new SpeechSynthesisUtterance(`${item.author} säger: ${item.text}`);
      speechSynthesis.speak(utter);
    } catch (e) {
      console.warn("TTS fel:", e);
    }
  }

  // initial show + interval
  showNext();
  presentationInterval = setInterval(showNext, 3500);
});

/* ===== run AI at end: collects player points & args, prompts OpenRouter and saves result ===== */
async function runAIAndStore() {
  const playersSnap = await get(playersRef);
  const players = playersSnap.exists() ? playersSnap.val() : {};
  const roomSnap = await get(roomRef);
  const room = roomSnap.exists() ? roomSnap.val() : {};

  // Build prompt - be explicit so AI returns party list & mandates
  let prompt = `Du är en neutral domare. Ämnet: "${room.proposition || 'Okänt'}".\n\n`;
  prompt += `Följande partier och deras poäng (från frågor) och argument presenteras:\n\n`;
  for (const [pid, p] of Object.entries(players)) {
    prompt += `Parti: ${p.party}\nPoäng: ${p.points || 0}\nArgument:\n`;
    const args = p.arguments || {};
    Object.keys(args).forEach(k => {
      prompt += ` - ${k}: ${args[k].text}\n`;
    });
    prompt += "\n";
  }

  prompt += `\nUppgift:\n1) Summera poängen för varje parti.\n2) Fördela 349 mandat proportionellt baserat på poängen (använd D'Hondt eller likvärdigt) och ge ett JSON-objekt med format:\n{\n  \"results\": [\n    {\"party\":\"PartiA\",\"points\":X,\"mandates\":Y},\n    ...\n  ],\n  \"explanation\": \"Kort motivering\"\n}\nReturnera endast giltig JSON i svaret (ingen extra text).`;

  adminStatus.textContent = "Kör AI-analys...";
  aiTop3.textContent = "AI-analys körs...";

  try {
    const res = await fetch("https://openrouter.ai/api/v1/chat/completions", {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${OPENROUTER_API_KEY}`,
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        model: "openai/gpt-oss-20b:free",
        messages: [
          { role: "system", content: "Du är en opartisk domare som fördelar mandat i riksdagen." },
          { role: "user", content: prompt }
        ],
        max_tokens: 800
      })
    });

    const data = await res.json();
    console.log("FULL AI RESPONSE:", data);
    const text = data?.choices?.[0]?.message?.content || JSON.stringify(data);

    // try to extract JSON from response
    const match = text.match(/\{[\s\S]*\}$/);
    let parsed = null;
    try {
      parsed = match ? JSON.parse(match[0]) : JSON.parse(text);
    } catch (e) {
      console.warn("Kunde inte parsa AI JSON, sparar rå text. Fel:", e);
    }

    // store results node
    await set(ref(db, `${ROOM}/results`), { raw: text, at: Date.now(), parsed: parsed || null });

    // show in admin UI (top3)
    if (parsed && parsed.results && Array.isArray(parsed.results)) {
      aiTop3.innerHTML = "<h3>Topplista (AI)</h3>";
      parsed.results.slice(0,3).forEach((r, i) => {
        const p = document.createElement("div");
        p.innerHTML = `${i+1}. ${r.party} — ${r.mandates} mandat (${r.points}p)`;
        aiTop3.appendChild(p);
      });
    } else {
      aiTop3.textContent = "AI gav inte ett parsbart resultat. Se konsolen.";
    }

    adminStatus.textContent = "AI-analys klar.";
  } catch (err) {
    console.error("AI error:", err);
    aiTop3.textContent = "AI-fel: se konsol";
    adminStatus.textContent = "AI-fel";
  }
}

console.log("ADMIN SCRIPT LOADED");
