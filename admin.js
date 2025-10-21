import { initializeApp } from "https://www.gstatic.com/firebasejs/11.0.1/firebase-app.js";
import {
  getDatabase,
  ref,
  set,
  get,
  update,
  onValue,
  remove,
} from "https://www.gstatic.com/firebasejs/11.0.1/firebase-database.js";

/* ===== FIREBASE CONFIG ===== */
const firebaseConfig = {
  apiKey: "AIzaSyB3h1EJpPZSKasbR0ztZVJXEnwu-Uj_-0M",
  authDomain: "spel-skola.firebaseapp.com",
  databaseURL:
    "https://spel-skola-default-rtdb.europe-west1.firebasedatabase.app",
  projectId: "spel-skola",
};
const app = initializeApp(firebaseConfig);
const db = getDatabase(app);

/* ===== GRATIS AI VIA HUGGING FACE ===== */
const HF_URL =
  "https://api-inference.huggingface.co/models/google/gemma-2b-it"; // Gratis modell
const MODEL_ID = "google/gemma-2b-it";

/* ===== DOM ===== */
const playersRow = document.getElementById("playersRow");
const startBtn = document.getElementById("startBtn");
const endBtn = document.getElementById("endBtn");
const adminStatus = document.getElementById("adminStatus");
const propDisplayTop =
  document.getElementById("propDisplayTop") ||
  document.getElementById("adminProposition");
const adminLobby = document.getElementById("adminLobby");
const adminGame = document.getElementById("adminGame");
const adminPhaseTitle = document.getElementById("adminPhaseTitle");
const adminProposition = document.getElementById("adminProposition");

/* ===== PROPOSITIONER ===== */
const propositions = [
  "Sverige ska införa sex timmars arbetsdag",
  "Sverige ska legalisera cannabis",
  "Riksdagen ska sänka rösträttsåldern till 16 år",
  "Alla elever ska få gratis skollunch även på gymnasiet",
  "Förbjud anonyma konton på sociala medier",
  "Inför medborgarlön på 10 000 kr per månad",
  "Alla bilar ska vara elbilar senast 2035",
  "Sverige ska införa skoluniformer",
  "Sverige ska tillåta kärnkraft i alla län",
  "Inför gratis kollektivtrafik i hela landet",
  "Höj skatten för höginkomsttagare",
  "Sänk skatten på bensin och diesel",
  "Inför obligatorisk samhällstjänst efter gymnasiet",
  "Sverige ska införa hårdare gränskontroller",
  "Inför statligt stöd till influencers",
  "Förbjud privat vård",
  "Tillåt dödshjälp i Sverige",
  "Sverige ska gå ur EU",
  "Alla medborgare ska få basinkomst",
  "Inför förbud mot religiösa friskolor",
  "Avskaffa monarkin",
  "Sverige ska införa republik",
  "Sverige ska höja minimilönen till 20 000 kr",
  "Alla ungdomar ska få gratis SL-kort",
  "Skolan ska få införa mobilförbud",
];

/* ===== DATABASE REFS ===== */
const ROOM = "gameRoom";
const roomRef = ref(db, ROOM);
const playersRef = ref(db, `${ROOM}/players`);

/* ===== LOBBY LIVE UPDATE ===== */
onValue(playersRef, (snap) => {
  const players = snap.val() || {};
  playersRow.innerHTML = "";
  const entries = Object.entries(players);
  adminStatus.textContent =
    entries.length === 0
      ? "Väntar på spelare..."
      : `${entries.length} spelare anslutna`;

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
    const a = shuffled[i],
      b = shuffled[i + 1] || null;
    if (b) pairs.push({ a, b });
  }

  const proposition =
    propositions[Math.floor(Math.random() * propositions.length)];

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
    });
  }

  adminStatus.textContent = `Spelet startat — Runda 1 / Fas 1`;
  if (propDisplayTop) {
    propDisplayTop.textContent = `Proposition: ${proposition}`;
    propDisplayTop.style.display = "";
  }
  adminLobby.classList.add("hidden");
  adminGame.classList.remove("hidden");
  adminPhaseTitle.textContent = `1 / 3 — Fas 1`;
  adminProposition.textContent = `Proposition: ${proposition}`;
});

/* ===== AUTO ADVANCE PHASE ===== */
onValue(roomRef, async (snap) => {
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
  let writers = pairs.flatMap((p) =>
    writerRole === "A" ? [p.a] : [p.b]
  );

  const allReady = writers.every(
    (wid) => playersObj[wid]?.ready === expectedKey
  );
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
      await update(roomRef, { phase: "finished" });
      adminStatus.textContent =
        "Spelet klart — AI bedömning kommer...";
      await runAIAndStore();
      // ✅ Ingen automatisk kick här
    } else {
      await update(roomRef, {
        phase: "phase1",
        roundNumber: roundNumber + 1,
      });
      resetReadyFlags();
      adminStatus.textContent = `Runda ${
        roundNumber + 1
      } — Fas 1`;
      adminPhaseTitle.textContent = `${
        roundNumber + 1
      } / ${totalRounds} — Fas 1`;
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
  await update(roomRef, {
    gameActive: false,
    phase: "",
    roundNumber: 0,
    pairs: [],
  });
  await remove(playersRef); // Kickar först här
  adminStatus.textContent = "Spelet avslutat — alla spelare har kickats.";
  adminGame.classList.add("hidden");
  adminLobby.classList.remove("hidden");
});

/* ===== RUN AI (HUGGINGFACE) ===== */
async function runAIAndStore() {
  const playersSnap = await get(playersRef);
  const playersObj = playersSnap.exists() ? playersSnap.val() : {};
  const roomSnap = await get(roomRef);
  const room = roomSnap.val() || {};
  const pairs = room.pairs || [];

  const allArgumentsByPair = {};
  pairs.forEach((pair) => {
    const a = playersObj[pair.a] || {};
    const b = playersObj[pair.b] || {};
    const pairKey = `${a.party || pair.a} vs ${b.party || pair.b}`;
    allArgumentsByPair[pairKey] = {
      proposition: room.proposition,
      for: a.arguments || {},
      against: b.arguments || {},
    };
  });

  const prompt = `
Du är en neutral svensk domare. Bedöm alla debatter nedan.
Ge mandat (totalt 349) proportionellt mellan deltagarna baserat på deras argument.
Svara ENDAST med JSON: { "mandat": {...}, "kommentar": "..." }
Debatter:
${JSON.stringify(allArgumentsByPair, null, 2)}
`;

  try {
    const response = await fetch(HF_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ inputs: prompt }),
    });

    const data = await response.json();
    const text =
      data[0]?.generated_text ||
      JSON.stringify({
        kommentar: "AI kunde inte svara",
        mandat: {},
      });

    let aiResult;
    try {
      aiResult = JSON.parse(text);
    } catch {
      aiResult = {
        kommentar: "AI svarade inte i JSON-format.",
        mandat: {},
      };
    }

    await set(ref(db, "finalResults"), aiResult);
    alert("AI bedömning sparad!");
  } catch (err) {
    console.error("AI-förfrågan misslyckades:", err);

    const fallbackMandat = {};
    const totalMandat = 349;
    const entries = Object.entries(playersObj);
    const sorted = entries.sort(
      (a, b) => (b[1].points || 0) - (a[1].points || 0)
    );
    const perMandat = Math.floor(totalMandat / entries.length);

    sorted.forEach(([pid]) => {
      fallbackMandat[playersObj[pid].party || pid] = perMandat;
    });

    const fallback = {
      mandat: fallbackMandat,
      kommentar:
        "AI misslyckades, mandaten gavs till de som hade flest poäng.",
    };
    await set(ref(db, "finalResults"), fallback);
    alert("AI misslyckades — fallback har körts.");
  }
}
