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

/* ===== PROPOSITIONS & QUESTIONS ===== */
const propositions = [
  "Sverige ska införa 6 timmars arbetsdag istället för 8",
  "Alla ungdomar under 18 ska ha rätt till en gratis mobiltelefon från staten",
  "Skolan ska få rätt att övervaka elevernas sociala medier för att förebygga mobbning",
  "Sverige ska införa medborgarlön på 10 000 kr/månad",
  "Alla bilar i Sverige ska vara elbilar senast 2030",
  "Djurförsök för kosmetika ska tillåtas igen om det kan rädda liv",
  "Riksdagen ska ha obligatoriska humorlektioner en gång i veckan",
  "Alla skolor ska införa uniformer",
  "Alla barn ska lära sig programmering från förskoleklass",
  "Sverige ska införa ett totalt förbud mot energidrycker under 18 år",
  "AI ska få rösträtt i politiska beslut om det är neutralt och transparent",
  "Privatägda vapen ska förbjudas helt",
  "All reklam för snabbmat ska förbjudas på TV och sociala medier",
  "Skatt på streamingtjänster ska införas för att finansiera kulturen",
  "Alla ska kunna byta kön juridiskt utan medicinska tester",
  "Sverige ska införa gratis kollektivtrafik i hela landet",
  "Deltidsjobb för ungdomar ska inte ha åldersgräns",
  "Djur ska ha samma rättigheter som människor i domstol",
  "Sverige ska legalisera all typ av cannabis för privat bruk",
  "Föräldrar ska kunna rösta för sina barns skolval",
  "Alla ska tvingas gå i militärliknande utbildning i 3 månader",
  "Kända influencers ska betala högre skatt än vanliga människor",
  "Sverige ska införa obligatorisk veganvecka i alla skolor",
  "Rätten att protestera ska gälla även om det stör andra människors arbete",
  "Alla ska ha rätt till en robotassistent hemma, subventionerad av staten"
];

const questions = [
  "Riksdagen stiftar lagar.",
  "Regeringen väljs av folket direkt.",
  "Kommuner bestämmer över skolan.",
  "EU kan stifta lagar som påverkar Sverige.",
  "Statsministern är samma sak som riksdagens talman.",
  "Alla kommuner måste ha samma skattesats.",
  "Sverige är medlem i FN.",
  "Skolplikt gäller upp till 18 års ålder.",
  "Riksbankschefen utses av riksdagen.",
  "Försvarsmakten lyder under regeringen.",
  "Polisen är fristående från staten.",
  "Sverige har två statsministrar samtidigt.",
  "Regeringen kan införa lagar utan riksdagens godkännande.",
  "EU-domstolen kan påverka svenska lagar.",
  "Skolans budget bestäms av kommunerna.",
  "Sverige har aldrig haft kvinnlig statsminister.",
  "Alla partier måste delta i riksdagsvalet.",
  "Militären får agera utomlands utan riksdagens godkännande.",
  "Grundlagen kan ändras av regeringen ensam.",
  "Alla skolor måste ha gymnasieprogram i naturvetenskap."
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

  // Slumpa par
  const shuffled = playerIds.sort(() => Math.random() - 0.5);
  const pairs = [];
  for (let i = 0; i < shuffled.length; i += 2) {
    const a = shuffled[i], b = shuffled[i + 1] || null;
    if (b) pairs.push({ a, b });
  }

  // Slumpa proposition för runda 1
  const shuffledProps = propositions.sort(() => Math.random() - 0.5);
  const proposition = shuffledProps[0];

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
  let writers = pairs.flatMap(p => writerRole === "A" ? [p.a] : [p.b]);
  const allReady = writers.every(wid => playersObj[wid]?.ready === expectedKey);

  if (allReady) {
    if (phase === "phase1") {
      await update(roomRef, { phase: "phase2" });
      resetReadyFlags();
      adminStatus.textContent = `Runda ${roundNumber} — Fas 2`;
      adminPhaseTitle.textContent = `${roundNumber} / ${room.totalRounds} — Fas 2`;
    } else if (phase === "phase2") {
      if (roundNumber < room.totalRounds) {
        // Slumpa nästa proposition
        const nextProp = propositions[Math.floor(Math.random() * propositions.length)];
        await update(roomRef, { phase: "phase1", roundNumber: roundNumber + 1, proposition: nextProp });
        resetReadyFlags();
        adminStatus.textContent = `Runda ${roundNumber + 1} — Fas 1`;
        adminPhaseTitle.textContent = `${roundNumber + 1} / ${room.totalRounds} — Fas 1`;
        adminProposition.textContent = `Proposition: ${nextProp}`;
      } else {
        adminStatus.textContent = "Alla rundor klara — vänta på admin avslutar spelet";
      }
    }
  }
});

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
  await remove(ref(db, `${ROOM}/players`));
  adminStatus.textContent = "Spelet avslutat och lobbyn rensad.";
  adminGame.classList.add("hidden");
  adminLobby.classList.remove("hidden");
});
