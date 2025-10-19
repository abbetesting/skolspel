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
  const entries = Object.entries(players);
  // update admin status based on number of players
  if (entries.length === 0) {
    adminStatus.textContent = 'Väntar på spelare...';
  } else {
    adminStatus.textContent = `${entries.length} spelare anslutna`;
  }
  entries.forEach(([id, p]) => {
    const pill = document.createElement("div");
    pill.className = "player-pill";
    const name = (p && p.party) ? p.party : id;
    pill.textContent = name + (p && p.points ? ` — ${p.points}p` : "");
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
    // if party name missing, create a friendly fallback
    const p = playersObj[pid] || {};
    const partyName = (p.party && p.party.trim()) ? p.party : `Spelare-${pid.slice(-4)}`;
    await update(ref(db, `${ROOM}/players/${pid}`), { points: 0, ready: "", party: partyName });
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

  // Only check ready-to-advance for normal phases. If we're in a transition (mellanskarm)
  // or finished, skip the auto-advance readiness check here.
  if (!['phase1', 'phase2'].includes(phase)) return;

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
    // move to an intermediate 'mellanskarm' where previous arguments are shown to players
    phase = "mellanskarm";
    await update(roomRef, { phase });
    // reset players ready flags (so next phase tracks correctly)
    const playersSnap = await get(playersRef);
    const playersObj = playersSnap.exists() ? playersSnap.val() : {};
    for (const pid of Object.keys(playersObj)) {
      await update(ref(db, `${ROOM}/players/${pid}`), { ready: "" });
    }
    adminStatus.textContent = `Runda ${roundNumber} — Mellanskärm (visar tidigare argument)`;
    adminPhaseTitle.textContent = `${roundNumber} / ${totalRounds} — Mellanskärm`;
    console.log("Avancerat till mellanskärm (interstitial)");

    // after 5 seconds, advance to phase2 automatically
    setTimeout(async () => {
      phase = 'phase2';
      await update(roomRef, { phase });
      // reset ready flags again for phase2
      const ps = await get(playersRef);
      const pobj = ps.exists() ? ps.val() : {};
      for (const pid of Object.keys(pobj)) {
        await update(ref(db, `${ROOM}/players/${pid}`), { ready: '' });
      }
      adminStatus.textContent = `Runda ${roundNumber} — Fas 2`;
      adminPhaseTitle.textContent = `${roundNumber} / ${totalRounds} — Fas 2`;
      console.log('Avancerat automatiskt till phase2 efter mellanskärm');
    }, 5000);
    return;
  }

  if (phase === "phase2") {
    if (roundNumber >= totalRounds) {
      // finish game -> run AI and show results
      await update(roomRef, { phase: "finished", gameActive: false });
      adminStatus.textContent = "Spelet klart — kör AI-analys";
      // repair any missing party names before computing
      const pSnap = await get(playersRef);
      const pObj = pSnap.exists() ? pSnap.val() : {};
      for (const pid of Object.keys(pObj)) {
        const p = pObj[pid] || {};
        if (!p.party || !p.party.trim()) {
          const fallback = `Spelare-${pid.slice(-4)}`;
          await update(ref(db, `${ROOM}/players/${pid}`), { party: fallback });
        }
      }
      await runAIAndStore();
      return;
    } else {
      // show mellanskärm between rounds
      phase = 'mellanskarm';
      await update(roomRef, { phase });
      // reset ready flags
      const playersSnap = await get(playersRef);
      const playersObj = playersSnap.exists() ? playersSnap.val() : {};
      for (const pid of Object.keys(playersObj)) {
        await update(ref(db, `${ROOM}/players/${pid}`), { ready: "" });
      }
      adminStatus.textContent = `Runda ${roundNumber} — Mellanskärm (visar tidigare argument)`;
      adminPhaseTitle.textContent = `${roundNumber} / ${room.totalRounds || 3} — Mellanskärm`;
      console.log("Avancerat till mellanskärm mellan rundor", roundNumber);

      // after 5 seconds, advance to next round's phase1
      setTimeout(async () => {
        roundNumber += 1;
        phase = 'phase1';
        await update(roomRef, { roundNumber, phase });
        // reset ready flags for new round
        const ps2 = await get(playersRef);
        const pobj2 = ps2.exists() ? ps2.val() : {};
        for (const pid of Object.keys(pobj2)) {
          await update(ref(db, `${ROOM}/players/${pid}`), { ready: '' });
        }
        adminStatus.textContent = `Runda ${roundNumber} — Fas 1`;
        adminPhaseTitle.textContent = `${roundNumber} / ${room.totalRounds || 3} — Fas 1`;
        console.log('Startar runda', roundNumber);
      }, 5000);
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
      const aarg = (a && a.arguments && a.arguments[k1] && a.arguments[k1].text) ? a.arguments[k1].text : null;
      const barg = (b && b.arguments && b.arguments[k2] && b.arguments[k2].text) ? b.arguments[k2].text : null;
      const aparty = (a && a.party) ? a.party : (pair.a || "?");
      const bparty = (b && b.party) ? b.party : (pair.b || "?");
      queue.push({ pair: [aparty, bparty], author: aparty || "A", text: aarg || "(inget argument)" });
      queue.push({ pair: [aparty, bparty], author: bparty || "B", text: barg || "(inget argument)" });
    }
  }
  return queue;
}

/* ===== presentation runner (admin only) ===== */
let presentationInterval = null;
// Presentation button removed: AI will run automatically when game phase becomes 'finished'.

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
    // Compute mandates using Swedish modified Sainte-Laguë before/alongside AI
    function computeMandatesFromPoints(playersObj, totalSeats = 349, threshold = 0.04, firstDivisor = 1.4) {
      // Aggregate points by party name
      const partyMap = {};
      for (const [pid, p] of Object.entries(playersObj)) {
        const name = (p.party || 'Okänt').trim();
        if (!partyMap[name]) partyMap[name] = 0;
        partyMap[name] += Number(p.points || 0);
      }

      const parties = Object.entries(partyMap).map(([party, votes]) => ({ party, votes }));
      const totalVotes = parties.reduce((s, x) => s + x.votes, 0);

      if (totalVotes <= 0) {
        return { totalVotes, seats: [] };
      }

      // Apply threshold (4% of total votes)
      const eligible = parties.filter(p => (p.votes / totalVotes) >= threshold);

      if (eligible.length === 0) return { totalVotes, seats: [] };

      // Prepare quotients for each party
      const quotients = [];
      // We'll generate enough quotients (totalSeats per party worst-case)
      for (const p of eligible) {
        for (let i = 0; i < totalSeats; i++) {
          // divisor sequence: first is firstDivisor, then 3,5,7,... (odd numbers)
          const divisor = (i === 0) ? firstDivisor : (2 * i + 1);
          quotients.push({ party: p.party, value: p.votes / divisor });
        }
      }

      // sort quotients descending, pick top totalSeats
      quotients.sort((a, b) => b.value - a.value || a.party.localeCompare(b.party));
      const top = quotients.slice(0, totalSeats);

      // Count seats per party
      const seatCount = {};
      for (const t of top) {
        seatCount[t.party] = (seatCount[t.party] || 0) + 1;
      }

      // Build ordered result
      const results = eligible.map(p => ({ party: p.party, points: p.votes, mandates: seatCount[p.party] || 0 }));
      // sort by mandates desc
      results.sort((a, b) => b.mandates - a.mandates || b.points - a.points || a.party.localeCompare(b.party));

      return { totalVotes, seats: results };
    }

    const mandateResult = computeMandatesFromPoints(players, 349, 0.04, 1.4);
    console.log('Mandate allocation (SWE modified Sainte-Laguë):', mandateResult);
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

    let text = null;
    let parsed = null;
    if (!res.ok) {
      // read error body and continue with local mandateResult
      const errText = await res.text().catch(() => `Status ${res.status}`);
      console.warn('AI HTTP error', res.status, errText);
      text = `AI HTTP error ${res.status}: ${errText}`;
      // keep parsed=null
    } else {
      const data = await res.json();
      console.log("FULL AI RESPONSE:", data);
      text = data?.choices?.[0]?.message?.content || JSON.stringify(data);
      // try to extract JSON from response
      const match = text.match(/\{[\s\S]*\}$/);
      try {
        parsed = match ? JSON.parse(match[0]) : JSON.parse(text);
      } catch (e) {
        console.warn("Kunde inte parsa AI JSON, sparar rå text. Fel:", e);
      }
    }

  // compute per-party placements from mandateResult and store per-player placements
  const seats = (mandateResult && mandateResult.seats) ? mandateResult.seats : [];
  const partyPlacement = {};
  seats.forEach((s, idx) => {
    partyPlacement[s.party] = { rank: idx + 1, mandates: s.mandates, points: s.points };
  });

  // write per-player placement under each player node (match by party name)
  for (const [pid, p] of Object.entries(players)) {
    const pname = (p && p.party) ? p.party : null;
    const place = (pname && partyPlacement[pname]) ? partyPlacement[pname] : { rank: null, mandates: 0, points: p.points || 0 };
    try {
      await update(ref(db, `${ROOM}/players/${pid}`), { placement: place });
    } catch (e) { console.warn('Kunde inte skriva placement för', pid, e); }
  }

  // store results node (include AI raw + parsed and our mandate allocation and top3)
  const top3 = seats.slice(0,3);
  await set(ref(db, `${ROOM}/results`), { raw: text, at: Date.now(), parsed: parsed || null, mandates: mandateResult, top3, partyPlacement });

  // show in admin UI (top3)
    // show AI top3 if available
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

    // also show the computed Swedish mandates (top 5)
    try {
      const mandDiv = document.createElement('div');
      mandDiv.innerHTML = '<h3>Mandat (Svensk metod)</h3>';
      (mandateResult.seats || []).slice(0,5).forEach((r, i) => {
        const d = document.createElement('div');
        d.textContent = `${i+1}. ${r.party} — ${r.mandates} mandat (${r.points}p)`;
        mandDiv.appendChild(d);
      });
      aiTop3.appendChild(mandDiv);
    } catch (e) { console.warn('Could not render mandates', e); }

    adminStatus.textContent = "AI-analys klar.";
  } catch (err) {
    console.error("AI error:", err);
    aiTop3.textContent = "AI-fel: se konsol";
    adminStatus.textContent = "AI-fel";
  }
}

console.log("ADMIN SCRIPT LOADED");

// If admin page loads and the room is already finished, repair names and run analysis immediately.
(async function checkFinishedOnLoad(){
  try {
    const rs = await get(roomRef);
    const room = rs.exists() ? rs.val() : null;
    if (room && room.phase === 'finished') {
      adminStatus.textContent = 'Upptäcker färdigt spel — reparerar spelarnamn och kör analys';
      // repair players if necessary
      const pSnap = await get(playersRef);
      const pObj = pSnap.exists() ? pSnap.val() : {};
      for (const pid of Object.keys(pObj)) {
        const p = pObj[pid] || {};
        if (!p.party || !p.party.trim()) {
          const fallback = `Spelare-${pid.slice(-4)}`;
          await update(ref(db, `${ROOM}/players/${pid}`), { party: fallback });
        }
      }
      // run analysis which will write results/top3 and per-player placement
      await runAIAndStore();
      adminStatus.textContent = 'Analys körd (on load)';
    }
  } catch (e) {
    console.warn('Fel vid on-load kontroll:', e);
  }
})();
