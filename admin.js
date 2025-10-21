// admin.js (host + presentation + AI)
import { initializeApp } from "https://www.gstatic.com/firebasejs/11.0.1/firebase-app.js";
import {
  getDatabase,
  ref,
  set,
  get,
  update,
  push,
  onValue,
  remove,
} from "https://www.gstatic.com/firebasejs/11.0.1/firebase-database.js";

/* ===== FIREBASE CONFIG (byt om du vill) ===== */
const firebaseConfig = {
  apiKey: "AIzaSyB3h1EJpPZSKasbR0ztZVJXEnwu-Uj_-0M",
  authDomain: "spel-skola.firebaseapp.com",
  databaseURL:
    "https://spel-skola-default-rtdb.europe-west1.firebasedatabase.app",
  projectId: "spel-skola",
};
const app = initializeApp(firebaseConfig);
const db = getDatabase(app);

/* ===== OPENROUTER KEY - fyll i din om du vill AI ska köras ===== */
const OPENROUTER_API_KEY =
  "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";

/* ===== DOM ===== */
const playersRow = document.getElementById("playersRow");
const startBtn = document.getElementById("startBtn");
const endBtn = document.getElementById("endBtn");
const adminStatus = document.getElementById("adminStatus");
// propDisplayTop may not exist in markup; create a reference to adminProposition fallback
const propDisplayTop =
  document.getElementById("propDisplayTop") ||
  document.getElementById("adminProposition");

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
  "Mer praktik i skolan",
];

/* ===== Refs ===== */
const ROOM = "gameRoom";
const roomRef = ref(db, ROOM);
const playersRef = ref(db, `${ROOM}/players`);
const pairsRef = ref(db, `${ROOM}/pairs`);
const roomMetaRef = ref(db, ROOM);

/* ===== live lobby (admin sees names) ===== */
onValue(playersRef, (snap) => {
  const players = snap.val() || {};
  playersRow.innerHTML = "";
  const entries = Object.entries(players);
  // update admin status based on number of players
  if (entries.length === 0) {
    adminStatus.textContent = "Väntar på spelare...";
  } else {
    adminStatus.textContent = `${entries.length} spelare anslutna`;
  }
  entries.forEach(([id, p]) => {
    const pill = document.createElement("div");
    pill.className = "player-pill";
    const name = p && p.party ? p.party : id;
    pill.textContent = name + (p && p.points ? ` — ${p.points}p` : "");
    playersRow.appendChild(pill);
  });

  // If there are more than 2 players, ensure pills flow inline. If >6, allow wrap to next line.
  if (entries.length > 2) {
    playersRow.classList.add("player-list");
  } else {
    playersRow.classList.add("player-list");
  }
  // If more than 6 players, remove compact class so they naturally wrap into multiple rows
  if (entries.length > 6) {
    playersRow.classList.remove("compact");
  } else if (entries.length <= 3) {
    playersRow.classList.add("compact");
  }
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
    const b = shuffled[i + 1] || null;
    if (b) pairs.push({ a, b });
    else {
      console.warn("Leftover (unpaired):", a);
    }
  }

  // pick random proposition automatically
  const proposition =
    propositions[Math.floor(Math.random() * propositions.length)];

  // write initial room state
  await set(roomRef, {
    gameActive: true,
    proposition,
    roundNumber: 1,
    phase: "phase1",
    totalRounds: 3,
    pairs,
  });

  // reset players
  for (const pid of playerIds) {
    // if party name missing, create a friendly fallback
    const p = playersObj[pid] || {};
    const partyName =
      p.party && p.party.trim() ? p.party : `Spelare-${pid.slice(-4)}`;
    await update(ref(db, `${ROOM}/players/${pid}`), {
      points: 0,
      ready: "",
      party: partyName,
    });
  }

  adminStatus.textContent = `Spelet startat — Runda 1 / Fas 1`;
  // show proposition to admin game view
  if (propDisplayTop) {
    propDisplayTop.textContent = `Proposition: ${proposition}`;
    propDisplayTop.style.display = "";
    propDisplayTop.classList.add("admin-game-prop-visible");
  }
  console.log("Game started:", { pairs, proposition });

  // switch admin view to game
  adminLobby.classList.add("hidden");
  adminGame.classList.remove("hidden");
  adminPhaseTitle.textContent = `1 / 3 — Fas 1`;
  adminProposition.textContent = `Proposition: ${proposition}`;
});

/* ===== auto advance when all writers ready (admin watches room meta) ===== */
onValue(roomMetaRef, async (snap) => {
  const room = snap.val();
  if (!room || !room.gameActive) return;
  const phase = room.phase;
  const roundNumber = room.roundNumber || 1;
  const pairs = room.pairs || [];

  // Only check ready-to-advance for normal phases. If we're in a transition (mellanskarm)
  // or finished, skip the auto-advance readiness check here.
  if (!["phase1", "phase2"].includes(phase)) return;

  const expectedKey = `r${roundNumber}_${phase}`;
  console.log("Admin checking advancement; expect:", expectedKey);

  const playersSnap = await get(playersRef);
  const playersObj = playersSnap.exists() ? playersSnap.val() : {};
  // identify writer IDs for this phase
  const writerRole = phase === "phase1" ? "A" : "B";
  let writers = [];
  (pairs || []).forEach((pair) => {
    if (!pair) return;
    const w = writerRole === "A" ? pair.a : pair.b;
    if (w) writers.push(w);
  });

  // check all writers have ready==expectedKey
  let allReady = true;
  for (const wid of writers) {
    const p = playersObj[wid];
    if (!p) {
      allReady = false;
      break;
    }
    if ((p.ready || "") !== expectedKey) {
      allReady = false;
      break;
    }
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
      phase = "phase2";
      await update(roomRef, { phase });
      // reset ready flags again for phase2
      const ps = await get(playersRef);
      const pobj = ps.exists() ? ps.val() : {};
      for (const pid of Object.keys(pobj)) {
        await update(ref(db, `${ROOM}/players/${pid}`), { ready: "" });
      }
      adminStatus.textContent = `Runda ${roundNumber} — Fas 2`;
      adminPhaseTitle.textContent = `${roundNumber} / ${totalRounds} — Fas 2`;
      console.log("Avancerat automatiskt till phase2 efter mellanskärm");
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
      phase = "mellanskarm";
      await update(roomRef, { phase });
      // reset ready flags
      const playersSnap = await get(playersRef);
      const playersObj = playersSnap.exists() ? playersSnap.val() : {};
      for (const pid of Object.keys(playersObj)) {
        await update(ref(db, `${ROOM}/players/${pid}`), { ready: "" });
      }
      adminStatus.textContent = `Runda ${roundNumber} — Mellanskärm (visar tidigare argument)`;
      adminPhaseTitle.textContent = `${roundNumber} / ${
        room.totalRounds || 3
      } — Mellanskärm`;
      console.log("Avancerat till mellanskärm mellan rundor", roundNumber);

      // after 5 seconds, advance to next round's phase1
      setTimeout(async () => {
        roundNumber += 1;
        phase = "phase1";
        await update(roomRef, { roundNumber, phase });
        // reset ready flags for new round
        const ps2 = await get(playersRef);
        const pobj2 = ps2.exists() ? ps2.val() : {};
        for (const pid of Object.keys(pobj2)) {
          await update(ref(db, `${ROOM}/players/${pid}`), { ready: "" });
        }
        adminStatus.textContent = `Runda ${roundNumber} — Fas 1`;
        adminPhaseTitle.textContent = `${roundNumber} / ${
          room.totalRounds || 3
        } — Fas 1`;
        console.log("Startar runda", roundNumber);
      }, 5000);
      return;
    }
  }
}

/* ===== endBtn - clean lobby & reset room ===== */
endBtn.addEventListener("click", async () => {
  await update(roomRef, {
    gameActive: false,
    phase: "",
    roundNumber: 0,
    pairs: [],
  });
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
      const aarg =
        a && a.arguments && a.arguments[k1] && a.arguments[k1].text
          ? a.arguments[k1].text
          : null;
      const barg =
        b && b.arguments && b.arguments[k2] && b.arguments[k2].text
          ? b.arguments[k2].text
          : null;
      const aparty = a && a.party ? a.party : pair.a || "?";
      const bparty = b && b.party ? b.party : pair.b || "?";
      queue.push({
        pair: [aparty, bparty],
        author: aparty || "A",
        text: aarg || "(inget argument)",
      });
      queue.push({
        pair: [aparty, bparty],
        author: bparty || "B",
        text: barg || "(inget argument)",
      });
    }
  }
  return queue;
}

/* ===== presentation runner (admin only) ===== */
let presentationInterval = null;
// Presentation button removed: AI will run automatically when game phase becomes 'finished'.

/* ===== run AI at end: collects player points & args, prompts OpenRouter and saves result ===== */
/* ===== run AI at end: collects args & scores, prompts OpenRouter and saves result ===== */
async function runAIAndStore() {
  // idempotency: om results redan finns, skriv inte om (skydd mot dubbelkörning)
  try {
    const existing = await get(ref(db, `${ROOM}/results`));
    if (existing.exists()) {
      console.log("Results already present — skip AI run.");
      adminStatus.textContent = "Resultat redan beräknade.";
      return;
    }
  } catch (e) {
    console.warn("Could not check /results existence, continuing...", e);
  }

  const playersSnap = await get(playersRef);
  const players = playersSnap.exists() ? playersSnap.val() : {};
  const roomSnap = await get(roomRef);
  const room = roomSnap.exists() ? roomSnap.val() : {};

  adminStatus.textContent = "Kör AI-analys...";
  aiTop3.textContent = "AI-analys körs...";

  // helper: local mandate allocation fallback (modified Sainte-Laguë as before)
  function computeMandatesFromPoints(
    playersObj,
    totalSeats = 349,
    threshold = 0.0,
    firstDivisor = 1.4
  ) {
    const partyMap = {};
    for (const [pid, p] of Object.entries(playersObj)) {
      const name = (p.party || "Okänt").trim();
      if (!partyMap[name]) partyMap[name] = 0;
      partyMap[name] += Number(p.points || 0);
    }
    const parties = Object.entries(partyMap).map(([party, votes]) => ({
      party,
      votes,
    }));
    const totalVotes = parties.reduce((s, x) => s + x.votes, 0);
    if (totalVotes <= 0) {
      return {
        totalVotes,
        seats: parties.map((p) => ({
          party: p.party,
          points: p.votes,
          mandates: 0,
        })),
      };
    }
    // threshold optional (set to 0 here to include everyone)
    const eligible = parties.filter((p) => p.votes / totalVotes >= threshold);
    if (eligible.length === 0) return { totalVotes, seats: [] };

    const quotients = [];
    for (const p of eligible) {
      for (let i = 0; i < totalSeats; i++) {
        const divisor = i === 0 ? firstDivisor : 2 * i + 1;
        quotients.push({ party: p.party, value: p.votes / divisor });
      }
    }
    quotients.sort(
      (a, b) => b.value - a.value || a.party.localeCompare(b.party)
    );
    const top = quotients.slice(0, totalSeats);
    const seatCount = {};
    for (const t of top) seatCount[t.party] = (seatCount[t.party] || 0) + 1;
    const results = eligible.map((p) => ({
      party: p.party,
      points: p.votes,
      mandates: seatCount[p.party] || 0,
    }));
    results.sort(
      (a, b) =>
        b.mandates - a.mandates ||
        b.points - a.points ||
        a.party.localeCompare(b.party)
    );
    return { totalVotes, seats: results };
  }

  // Build pairwise context: for each pair include both players' arguments per round and their points
  const pairs = (room.pairs || []).filter((p) => p && p.a && p.b);
  if (!pairs.length) {
    console.warn("No pairs found — cannot build pairwise context.");
  }

  // Build prompt text in Swedish that explains the game and includes pairwise arguments
  let prompt =
    `Du är en neutral domare för ett skolspel där varje spelare representerar ett "parti".\n\n` +
    `Spelet: Det finns ${
      Object.keys(players).length
    } spelare (varje spelare = ett parti). Spelarna paras ihop i par (A vs B). ` +
    `Varje runda består av två faser: i fas 1 skriver spelare A sitt argument och spelare B svarar på korta sant/falskt-frågor; i fas 2 byter roller och spelare B skriver medan A svarar. Det finns totalt ${
      room.totalRounds || 3
    } rundor.\n\n` +
    `Uppgift för dig (AI):\n` +
    `1) Läs varje par (Parti A vs Parti B) och bedöm hur övertygande varje parti varit UTIFRÅN deras argument samt hur väl de svarat på motståndarens argument över rundorna.\n` +
    `2) Ge varje parti en numerisk poäng (t.ex. 0–100 eller högre) som speglar hur övertygande de var.\n` +
    `3) Fördela sedan totalt 349 mandat proportionellt utifrån poängen.\n` +
    `4) **Returnera ENDAST JSON** i *ett* av följande två giltiga format (inga kommentarer, inga extra textrader):\n\n` +
    `Format A (poäng -> vi räknar mandat lokalt om du bara skickar poäng):\n` +
    `{\n  "scores": { "Parti A": 123.4, "Parti B": 98.2, ... }\n}\n\n` +
    `Format B (direkt mandatfördelning, accepterad men vi kommer validera summan):\n` +
    `{\n  "results": [ { "party": "Parti A", "points": 123.4, "mandates": 120 }, ... ]\n}\n\n` +
    `Viktigt: om du returnerar mandat, se till att summan av "mandates" är 349. Om du returnerar poäng, vi räknar mandat i systemet.\n\n` +
    `Här kommer parvis sammanställning av argument och poäng (poäng = spelarnas egna poäng från quiz):\n\n`;

  // append per-pair sections
  for (let i = 0; i < pairs.length; i++) {
    const pair = pairs[i];
    const a = players[pair.a] || {};
    const b = players[pair.b] || {};
    const aparty = (a.party || `Spelare-${pair.a.slice(-4)}`).trim();
    const bparty = (b.party || `Spelare-${pair.b.slice(-4)}`).trim();
    prompt += `--- PAR ${i + 1}: ${aparty} (A) vs ${bparty} (B) ---\n`;
    prompt += `Poäng enligt systemet: ${aparty}: ${a.points || 0}, ${bparty}: ${
      b.points || 0
    }\n`;

    const rounds = room.totalRounds || 3;
    for (let r = 1; r <= rounds; r++) {
      const keyA = `r${r}_phase1`;
      const keyB = `r${r}_phase2`;
      const aArg =
        a.arguments && a.arguments[keyA] && a.arguments[keyA].text
          ? a.arguments[keyA].text
          : "(inget argument)";
      const bArg =
        b.arguments && b.arguments[keyB] && b.arguments[keyB].text
          ? b.arguments[keyB].text
          : "(inget argument)";
      prompt += `Runda ${r} — A (${aparty}) skrev (fas1): ${aArg}\n`;
      prompt += `Runda ${r} — B (${bparty}) skrev (fas2): ${bArg}\n`;
    }
    prompt += `\nBedöm nu detta par och ange poäng/mandat enligt ovan format.\n\n`;
  }

  // Helper: fetch with timeout and one retry
  async function fetchWithTimeout(url, options = {}, timeoutMs = 25000) {
    const controller = new AbortController();
    const id = setTimeout(() => controller.abort(), timeoutMs);
    try {
      const res = await fetch(url, { ...options, signal: controller.signal });
      clearTimeout(id);
      return res;
    } catch (err) {
      clearTimeout(id);
      throw err;
    }
  }

  // Try calling OpenRouter, parse response carefully
  let aiText = null;
  let parsed = null;
  let aiErrorSaved = null;

  const body = {
    model: "openai/gpt-oss-20b:free",
    messages: [
      {
        role: "system",
        content:
          "Du är en opartisk domare som bedömer debatter och fördelar mandat.",
      },
      { role: "user", content: prompt },
    ],
    max_tokens: 1000,
    temperature: 0.0,
  };

  // attempt up to 2 tries (1 retry)
  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      const res = await fetchWithTimeout(
        "https://openrouter.ai/api/v1/chat/completions",
        {
          method: "POST",
          headers: {
            Authorization: `Bearer ${OPENROUTER_API_KEY}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify(body),
        },
        25000
      );

      if (!res.ok) {
        const errText = await res.text().catch(() => `Status ${res.status}`);
        aiErrorSaved = { status: res.status, body: errText };
        adminStatus.textContent = `AI HTTP error ${res.status}`;
        console.warn("OpenRouter returned non-ok:", res.status, errText);
        // if 401 -> likely invalid key; break and fallback
        if (res.status === 401) break;
        // else allow retry
        continue;
      }

      const data = await res.json();
      aiText = data?.choices?.[0]?.message?.content || JSON.stringify(data);
      console.log("AI response text:", aiText);
      // try to extract JSON object (match the first { ... } block)
      const match = aiText.match(/\{[\s\S]*\}/);
      if (match) {
        try {
          parsed = JSON.parse(match[0]);
          break;
        } catch (e) {
          /* parse failed, will try other approaches */
        }
      }
      // fallback: maybe AI returned array or similar — attempt to parse whole text
      try {
        parsed = JSON.parse(aiText);
        break;
      } catch (e) {
        /* fail */
      }
    } catch (err) {
      console.warn("AI call failed (attempt " + (attempt + 1) + "):", err);
      aiErrorSaved = { error: String(err) };
      // retry loop will run once more
    }
  }

  // parsed now may be null if AI failed to return valid JSON
  let finalMandateResult = null; // structure: { totalVotes, seats: [{party, points, mandates}, ...] }
  let usedAIScores = null;

  if (parsed) {
    // Accept either parsed.scores or parsed.results
    if (parsed.scores && typeof parsed.scores === "object") {
      usedAIScores = parsed.scores;
      // convert scores -> mandates using local method to ensure exact 349 seats
      // build a fake playersObj keyed by party to reuse compute function
      const playersObjFake = {};
      Object.entries(usedAIScores).forEach(([party, score]) => {
        // we don't know pids here; just set party name and points
        playersObjFake[party] = { party, points: Number(score || 0) };
      });
      finalMandateResult = computeMandatesFromPoints(
        playersObjFake,
        349,
        0.0,
        1.4
      );
    } else if (Array.isArray(parsed.results)) {
      // If results contains party, points, mandates — trust but validate
      const arr = parsed.results.map((r) => ({
        party: r.party,
        points: Number(r.points || 0),
        mandates: Number(r.mandates || 0),
      }));
      const sumMandates = arr.reduce((s, x) => s + (x.mandates || 0), 0);
      if (sumMandates === 349) {
        finalMandateResult = {
          totalVotes: arr.reduce((s, x) => s + (x.points || 0), 0),
          seats: arr,
        };
      } else {
        // If AI returned mandates but doesn't sum to 349, recompute via points fallback
        const playersObjFake = {};
        arr.forEach(
          (r) =>
            (playersObjFake[r.party] = {
              party: r.party,
              points: r.points || 0,
            })
        );
        finalMandateResult = computeMandatesFromPoints(
          playersObjFake,
          349,
          0.0,
          1.4
        );
      }
    } else {
      // unknown parsed format -> fallback to local computation below
      parsed = null;
    }
  }

  if (!finalMandateResult) {
    // fallback: compute from stored player points (ensures something valid)
    console.warn(
      "AI parsing failed or returned unexpected format — using local mandate calculation."
    );
    finalMandateResult = computeMandatesFromPoints(players, 349, 0.0, 1.4);
  }

  // Build partyPlacement and write placements per player (matching by party name)
  const seats =
    finalMandateResult && finalMandateResult.seats
      ? finalMandateResult.seats
      : [];
  const partyPlacement = {};
  seats.forEach((s, idx) => {
    partyPlacement[s.party] = {
      rank: idx + 1,
      mandates: s.mandates,
      points: s.points,
    };
  });

  for (const [pid, p] of Object.entries(players)) {
    const pname = p && p.party ? p.party : null;
    const place =
      pname && partyPlacement[pname]
        ? partyPlacement[pname]
        : { rank: null, mandates: 0, points: p.points || 0 };
    try {
      await update(ref(db, `${ROOM}/players/${pid}`), { placement: place });
    } catch (e) {
      console.warn("Kunde inte skriva placement för", pid, e);
    }
  }

  // Prepare results payload to store (include AI raw + parsed if any, plus computed mandates)
  const resultsPayload = {
    raw: aiText || null,
    at: Date.now(),
    parsed: parsed || null,
    mandates: finalMandateResult,
    top3: seats.slice(0, 3),
    partyPlacement,
  };
  if (aiErrorSaved) resultsPayload.aiError = aiErrorSaved;

  // Save results atomically (simple set; you may choose transaction if needed)
  await set(ref(db, `${ROOM}/results`), resultsPayload);

  // Render admin UI top3 (clear first)
  aiTop3.innerHTML = "";
  try {
    if (seats && seats.length) {
      const h = document.createElement("h3");
      h.textContent = "Topplista";
      aiTop3.appendChild(h);
      seats.slice(0, 3).forEach((r, i) => {
        const div = document.createElement("div");
        div.textContent = `${i + 1}. ${r.party} — ${r.mandates} mandat (${
          r.points
        }p)`;
        aiTop3.appendChild(div);
      });
    } else {
      aiTop3.textContent = "Inga mandat kunde beräknas.";
    }
  } catch (e) {
    console.warn("Could not render aiTop3", e);
    aiTop3.textContent = "AI-analys klar (se konsol).";
  }

  adminStatus.textContent = "AI-analys klar.";
}
