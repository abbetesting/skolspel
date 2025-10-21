import { initializeApp } from "https://www.gstatic.com/firebasejs/11.0.1/firebase-app.js";
import { getDatabase, ref, set, get, update, onValue, remove } from "https://www.gstatic.com/firebasejs/11.0.1/firebase-database.js";

/* ===== FIREBASE CONFIG ===== */
const firebaseConfig = {
  apiKey: "AIzaSyB3h1EJpPZSKasbR0ztZVJXEnwu-Uj_-0M",
  authDomain: "spel-skola.firebaseapp.com",
  databaseURL: "https://spel-skola-default-rtdb.europe-west1.firebasedatabase.app",
  projectId: "spel-skola",
};
const app = initializeApp(firebaseConfig);
const db = getDatabase(app);

/* ===== OPENROUTER API KEY ===== */
const OPENROUTER_API_KEY = "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";
const MODEL_ID = "tngtech/deepseek-r1t2-chimera:free";

/* ===== DOM ===== */
const playersRow = document.getElementById("playersRow");
const startBtn = document.getElementById("startBtn");
const endBtn = document.getElementById("endBtn");
const adminStatus = document.getElementById("adminStatus");
const propDisplayTop = document.getElementById("propDisplayTop") || document.getElementById("adminProposition");
const adminLobby = document.getElementById("adminLobby");
const adminGame = document.getElementById("adminGame");
const adminPhaseTitle = document.getElementById("adminPhaseTitle");
const adminProposition = document.getElementById("adminProposition");

/* ===== PROPOSITIONS ===== */
const propositions = [
  "Sverige ska införa 6 timmars arbetsdag istället för 8",
  "Alla ungdomar under 18 ska ha rätt till gratis mobiltelefon",
  "Skolan ska få rätt att övervaka sociala medier",
  "Sverige ska införa medborgarlön på 10 000 kr/månad",
  "Alla bilar i Sverige ska vara elbilar senast 2030",
  "Riksdagen ska ha obligatoriska humorlektioner en gång i veckan",
  "Alla skolor ska införa uniformer",
  "Alla barn ska lära sig programmering från förskoleklass",
  "Sverige ska införa totalt förbud mot energidrycker under 18 år",
  "Privatägda vapen ska förbjudas helt",
  "Skatt på streamingtjänster ska införas för kulturen",
  "Alla ska kunna byta kön juridiskt utan medicinska tester",
  "Sverige ska införa gratis kollektivtrafik i hela landet",
  "Djur ska ha samma rättigheter som människor i domstol",
  "Sverige ska legalisera cannabis för privat bruk",
  "Föräldrar ska kunna rösta för sina barns skolval",
  "Kända influencers ska betala högre skatt än vanliga människor",
  "Sverige ska införa obligatorisk veganvecka i skolor",
  "Rätten att protestera ska gälla även om det stör arbete",
  "Alla ska ha rätt till robotassistent hemma, subventionerad"
];

/* ===== DATABASE REFS ===== */
const ROOM = "gameRoom";
const roomRef = ref(db, ROOM);
const playersRef = ref(db, `${ROOM}/players`);

/* ===== LOBBY LIVE UPDATE ===== */
onValue(playersRef, snap => {
  const players = snap.val() || {};
  playersRow.innerHTML = "";
  const entries = Object.entries(players);
  adminStatus.textContent = entries.length === 0 ? "Väntar på spelare..." : `${entries.length} spelare anslutna`;

  entries.forEach(([id, p]) => {
    const pill = document.createElement("div");
    pill.className = "player-pill";
    pill.textContent = (p.party || id) + (p.points ? ` — ${p.points}p` : "");
    playersRow.appendChild(pill);
  });
});

/* ===== START GAME ===== */
startBtn.addEventListener("click", async () => {
  const playersSnap = await get(playersRef);
  const playersObj = playersSnap.exists() ? playersSnap.val() : {};
  const playerIds = Object.keys(playersObj);
  if (playerIds.length < 2) return alert("Minst 2 spelare krävs");

  const shuffled = playerIds.sort(() => Math.random() - 0.5);
  const pairs = [];
  for (let i = 0; i < shuffled.length; i += 2) {
    const a = shuffled[i], b = shuffled[i + 1] || null;
    if (b) pairs.push({ a, b });
  }

  const proposition = propositions[Math.floor(Math.random() * propositions.length)];

  await set(roomRef, {
    gameActive: true,
    proposition,
    roundNumber: 1,
    totalRounds: 3,
    phase: "phase1",
    pairs,
  });

  for (const pid of playerIds) {
    const p = playersObj[pid] || {};
    const partyName = p.party?.trim() || `Spelare-${pid.slice(-4)}`;
    await update(ref(db, `${ROOM}/players/${pid}`), {
      points: 0,
      ready: "",
      party: partyName,
      arguments: {}
    });
  }

  adminStatus.textContent = `Spelet startat — Runda 1 / Fas 1`;
  if (propDisplayTop) { propDisplayTop.textContent = `Proposition: ${proposition}`; propDisplayTop.style.display = ""; }
  adminLobby.classList.add("hidden");
  adminGame.classList.remove("hidden");
  adminPhaseTitle.textContent = `1 / 3 — Fas 1`;
  adminProposition.textContent = `Proposition: ${proposition}`;
});

/* ===== AUTO ADVANCE PHASE ===== */
onValue(roomRef, async snap => {
  const room = snap.val();
  if (!room || !room.gameActive) return;

  const phase = room.phase;
  const roundNumber = room.roundNumber || 1;
  const pairs = room.pairs || [];

  if (!["phase1", "phase2"].includes(phase)) return;

  const expectedKey = `r${roundNumber}_${phase}`;
  const playersSnap = await get(playersRef);
  const playersObj = playersSnap.exists() ? playersSnap.val() : {};

  const writerRole = phase === "phase1" ? "A" : "B";
  const writers = pairs.flatMap(p => writerRole === "A" ? [p.a] : [p.b]);

  const allReady = writers.every(wid => playersObj[wid]?.ready === expectedKey);
  if (allReady) await advancePhase();
});

/* ===== ADVANCE PHASE ===== */
async function advancePhase() {
  const roomSnap = await get(roomRef);
  const room = roomSnap.val();
  if (!room) return;

  let { roundNumber = 1, phase = "phase1", totalRounds = 3 } = room;

  if (phase === "phase1") {
    await update(roomRef, { phase: "phase2" });
    resetReadyFlags();
    adminStatus.textContent = `Runda ${roundNumber} — Fas 2`;
    adminPhaseTitle.textContent = `${roundNumber} / ${totalRounds} — Fas 2`;
  } else if (phase === "phase2") {
    if (roundNumber >= totalRounds) {
      await update(roomRef, { phase: "finished", gameActive: false });
      adminStatus.textContent = "Spelet klart — skickar allt till AI";
      await runAIAndStore();
    } else {
      await update(roomRef, { phase: "phase1", roundNumber: roundNumber + 1 });
      resetReadyFlags();
      adminStatus.textContent = `Runda ${roundNumber + 1} — Fas 1`;
      adminPhaseTitle.textContent = `${roundNumber + 1} / ${totalRounds} — Fas 1`;
    }
  }
}

async function resetReadyFlags() {
  const playersSnap = await get(playersRef);
  const playersObj = playersSnap.exists() ? playersSnap.val() : {};
  for (const pid of Object.keys(playersObj)) {
    await update(ref(db, `${ROOM}/players/${pid}`), { ready: "" });
  }
}

/* ===== END GAME ===== */
endBtn.addEventListener("click", async () => {
  await update(roomRef, { gameActive: false, phase: "", roundNumber: 0, pairs: [] });
  await remove(playersRef);
  adminStatus.textContent = "Spelet avslutat och lobbyn rensad.";
  adminGame.classList.add("hidden");
  adminLobby.classList.remove("hidden");
});

/* ===== RUN AI ===== */
async function runAIAndStore() {
  const playersSnap = await get(playersRef);
  const playersObj = playersSnap.exists() ? playersSnap.val() : {};
  const roomSnap = await get(roomRef);
  const room = roomSnap.val() || {};
  const pairs = room.pairs || [];

  const allArgumentsByPair = {};
  pairs.forEach(pair => {
    const a = playersObj[pair.a] || {};
    const b = playersObj[pair.b] || {};
    const pairKey = `${a.party || pair.a} vs ${b.party || pair.b}`;
    allArgumentsByPair[pairKey] = {
      proposition: room.proposition,
      for: a.arguments || {},
      against: b.arguments || {}
    };
  });

  const aiPrompt = `
Du är en neutral domare i "Debatt Spelet".
Bedöm alla par och deras argument. Ge mandat (totalt 349) proportionellt.
Svara ENDAST med JSON: { "mandat": {...}, "kommentar": "..." }
Här är alla debattpar och deras argument:
${JSON.stringify(allArgumentsByPair, null, 2)}
`;

  try {
    const response = await fetch("https://openrouter.ai/api/v1/chat/completions", {
      method: "POST",
      headers: { "Content-Type": "application/json", "Authorization": `Bearer ${OPENROUTER_API_KEY}` },
      body: JSON.stringify({
        model: MODEL_ID,
        messages: [
          { role: "system", content: "Du är en svensk AI-domare som bedömer politiska debatter." },
          { role: "user", content: aiPrompt }
        ],
        temperature: 0.7,
        max_tokens: 2000
      })
    });

    if (!response.ok) throw new Error(await response.text());
    const data = await response.json();
    const aiResult = JSON.parse(data.choices[0].message.content);

    await set(ref(db, "finalResults"), aiResult);
    alert("AI har bedömt debatten! Resultatet är sparat.");
  } catch (err) {
    console.error("AI-förfrågan misslyckades:", err);
    // fallback
    const fallbackMandat = {};
    const totalMandat = 349;
    const entries = Object.entries(playersObj);
    const perMandat = Math.floor(totalMandat / entries.length);
    entries.forEach(([pid]) => { fallbackMandat[playersObj[pid].party || pid] = perMandat; });
    const fallback = { mandat: fallbackMandat, kommentar: "AI misslyckades, mandaten gavs till de med högst poäng." };
    await set(ref(db, "finalResults"), fallback);
    alert("AI misslyckades — fallback har körts.");
  }
}
