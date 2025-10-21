// Use Firebase globals loaded by index.html <script> tags (compat builds)
const ROOM = "gameRoom";
const firebaseConfig = {
  apiKey: "AIzaSyB3h1EJpPZSKasbR0ztZVJXEnwu-Uj_-0M",
  authDomain: "spel-skola.firebaseapp.com",
  databaseURL:
    "https://spel-skola-default-rtdb.europe-west1.firebasedatabase.app",
  projectId: "spel-skola",
};

const app = firebase.initializeApp(firebaseConfig);
const db = firebase.database();

document.addEventListener("DOMContentLoaded", () => {
  const partyInput = document.getElementById("partyInput");
  const joinBtn = document.getElementById("joinBtn");
  const joinError = document.getElementById("joinError");
  const lobbyCount = document.getElementById("lobbyCount");
  const playersGrid = document.getElementById("playersGrid");
  const roomPin = document.getElementById("roomPin");
  const stage = document.getElementById("stage");
  const joinArea = document.getElementById("joinArea");
  const lobbyTitle = document.getElementById("lobbyTitle");

  if (roomPin) roomPin.textContent = ROOM;

  let localPlayerKey = localStorage.getItem("playerKey") || null;
  let localParty = localStorage.getItem("playerParty") || null;
  if (localParty) partyInput.value = localParty;

  const playersRef = () => db.ref(`${ROOM}/players`);
  const roomRef = () => db.ref(ROOM);

  function renderPlayers(playersObj) {
    if (!playersGrid) return;
    playersGrid.innerHTML = "";
    const entries = Object.entries(playersObj || {});
    if (lobbyCount) lobbyCount.textContent = entries.length;
    entries.forEach(([id, p]) => {
      const div = document.createElement("div");
      div.className = "player-chip";
      div.textContent = p.party + (p.points ? ` — ${p.points}p` : "");
      playersGrid.appendChild(div);
    });
  }

  function updateLobbyText(room) {
    if (!lobbyTitle) return;
    if (!room.gameActive) {
      lobbyTitle.textContent = "Väntar på att admin startar spelet...";
    } else if (room.phase === "finished") {
      lobbyTitle.textContent = "Spelet är klart. Väntar på admin.";
    } else {
      lobbyTitle.textContent = `Runda ${room.roundNumber || 1} — ${
        room.phase || ""
      }`;
    }
  }

  async function getLocalPlayer() {
    if (!localPlayerKey) return null;
    const pSnap = await db
      .ref(`${ROOM}/players/${localPlayerKey}`)
      .once("value");
    return pSnap.exists() ? { id: localPlayerKey, ...pSnap.val() } : null;
  }

  playersRef().on("value", (snap) => {
    renderPlayers(snap.val());
  });

  db.ref(ROOM).on("value", async (snap) => {
    const room = snap.val() || {};
    updateLobbyText(room);

    if (!room.gameActive) {
      stage.classList.add("hidden");
      if (joinArea) joinArea.style.display = "";
      return;
    }

    stage.classList.remove("hidden");
    if (joinArea) joinArea.style.display = "none";

    const st = document.getElementById("stageTitle");
    if (st) st.textContent = room.proposition || "-";

    const playerRole = document.getElementById("playerRole");
    const roleHelp = document.getElementById("roleHelp");
    const argumentSection = document.getElementById("argumentSection");
    const argumentInput = document.getElementById("argumentInput");
    const submitArgumentBtn = document.getElementById("submitArgumentBtn");
    const argumentStatus = document.getElementById("argumentStatus");
    const quizArea = document.getElementById("quizArea");
    const quizList = document.getElementById("quizList");
    const quizStatus = document.getElementById("quizStatus");
    const previousArguments = document.getElementById("previousArguments");
    const previousList = document.getElementById("previousList");
    const opponentPrevArg = document.getElementById("opponentPrevArg");
    const opponentPrevText = document.getElementById("opponentPrevText");

    const lp = await getLocalPlayer();
    if (!lp) {
      if (playerRole) playerRole.textContent = "-";
      if (roleHelp) roleHelp.textContent = "Du är inte ansluten som spelare.";
      argumentSection?.classList.add("hidden");
      quizArea?.classList.add("hidden");
      return;
    }

    const pairs = room.pairs || [];
    let myPair = null;
    let myRole = null;
    for (const p of pairs) {
      if (!p) continue;
      if (p.a === lp.id) {
        myPair = p;
        myRole = "A";
        break;
      }
      if (p.b === lp.id) {
        myPair = p;
        myRole = "B";
        break;
      }
    }

    if (!myPair) {
      playerRole.textContent = "Utesluten";
      roleHelp.textContent = "Du blev inte tilldelad ett par.";
      argumentSection?.classList.add("hidden");
      quizArea?.classList.add("hidden");
      return;
    }

    const roleText = myRole === "A" ? "FÖR" : "MOT";
    playerRole.textContent = roleText;

    const phase = room.phase || "phase1";
    const writerRole = phase === "phase1" ? "A" : "B";
    const amIWriter = writerRole === myRole;

    if (phase === "finished") {
      argumentSection?.classList.add("hidden");
      quizArea?.classList.add("hidden");
      roleHelp.textContent = "Spelet är klart. Väntar på admin.";
      return;
    }

    // Visa argumentsektion eller quiz
    if (amIWriter) {
      argumentSection?.classList.remove("hidden");
      quizArea?.classList.add("hidden");
      roleHelp.textContent = `Du skriver ditt argument som ${roleText}. Var kort och tydlig.`;
    } else {
      argumentSection?.classList.add("hidden");
      quizArea?.classList.remove("hidden");
      roleHelp.textContent =
        "Du svarar på frågor medan din motståndare skriver.";
    }

    // --- Quiz ---
    if (!amIWriter) {
      const allQuestions = [
        "Riksdagen stiftar lagar.",
        "Regeringen väljs av folket direkt.",
        "Kommuner bestämmer över skolan.",
        "EU kan stifta lagar som påverkar Sverige.",
        "Statsministern är samma sak som riksdagens talman.",
      ];
      quizList.innerHTML = "";
      allQuestions.forEach((q, i) => {
        const row = document.createElement("div");
        row.style.marginBottom = "8px";
        const label = document.createElement("div");
        label.textContent = q;
        row.appendChild(label);
        const btnT = document.createElement("button");
        btnT.textContent = "Sant";
        btnT.className = "primary";
        btnT.style.marginRight = "6px";
        const btnF = document.createElement("button");
        btnF.textContent = "Falskt";
        btnF.className = "secondary";
        btnT.onclick = () => submitQuizAnswer(`q${i + 1}`, true);
        btnF.onclick = () => submitQuizAnswer(`q${i + 1}`, false);
        row.appendChild(btnT);
        row.appendChild(btnF);
        quizList.appendChild(row);
      });
      quizStatus.textContent = "";
    }

    // --- Visa motståndarens argument från föregående runda ---
    opponentPrevArg.style.display = "none";
    opponentPrevText.textContent = "";
    try {
      const allPlayersSnap = await playersRef().once("value");
      const allPlayers = allPlayersSnap.exists() ? allPlayersSnap.val() : {};
      const currentRound = room.roundNumber || 1;
      const prevRound = Math.max(1, currentRound - 1);
      const keyPrev = `r${prevRound}_phase1`;

      let opponentId = myRole === "A" ? myPair.b : myPair.a;
      if (
        allPlayers[opponentId] &&
        allPlayers[opponentId].arguments &&
        allPlayers[opponentId].arguments[keyPrev]
      ) {
        opponentPrevArg.style.display = "";
        opponentPrevText.textContent =
          allPlayers[opponentId].arguments[keyPrev].text;
      }
    } catch (e) {
      console.warn(e);
    }

    // --- Previous arguments (alla rundor) ---
    previousList.innerHTML = "";
    previousArguments?.classList.add("hidden");
    try {
      const allPlayersSnap = await playersRef().once("value");
      const allPlayers = allPlayersSnap.exists() ? allPlayersSnap.val() : {};
      const round = room.roundNumber || 1;
      const keys = [];
      for (let r = 1; r <= round; r++) {
        keys.push(`r${r}_phase1`);
        keys.push(`r${r}_phase2`);
      }
      const container = document.createElement("div");
      container.className = "previous-args-container";
      keys.forEach((k) => {
        Object.entries(allPlayers).forEach(([pid, p]) => {
          if (!p?.arguments?.[k]?.text) return;
          if (pid === lp.id) return;
          const card = document.createElement("div");
          card.className = "card";
          const h = document.createElement("div");
          h.style.fontWeight = "700";
          h.textContent = `${p.party} (${k})`;
          const t = document.createElement("div");
          t.textContent = p.arguments[k].text;
          card.appendChild(h);
          card.appendChild(t);
          container.appendChild(card);
        });
      });
      if (container.children.length) {
        previousList.appendChild(container);
        previousArguments?.classList.remove("hidden");
        previousArguments.style.display = "";
      }
    } catch (e) {
      console.warn(e);
    }

    // --- Disable if submitted ---
    const myKey = `r${room.roundNumber}_${phase}`;
    const already = lp.arguments && lp.arguments[myKey];
    if (already) {
      argumentStatus.textContent = "Du har redan skickat för denna fas.";
      submitArgumentBtn.disabled = true;
      argumentInput.disabled = true;
    } else {
      argumentStatus.textContent = "";
      submitArgumentBtn.disabled = false;
      argumentInput.disabled = false;
    }
  });

  async function attemptJoin() {
    joinError.textContent = "";
    const party = (partyInput.value || "").trim();
    if (!party) {
      joinError.textContent = "Skriv in ett partinamn";
      partyInput.focus();
      return;
    }
    const snap = await playersRef().once("value");
    const players = snap.exists() ? snap.val() : {};
    if (
      Object.values(players).some(
        (p) => p.party?.toLowerCase() === party.toLowerCase()
      )
    ) {
      joinError.textContent = "Namnet är upptaget";
      return;
    }
    const newRef = playersRef().push();
    const key = newRef.key;
    await newRef.set({ party, points: 0, ready: "", arguments: {} });
    await newRef.update({ party });
    localPlayerKey = key;
    localParty = party;
    localStorage.setItem("playerKey", key);
    localStorage.setItem("playerParty", party);
    joinBtn.textContent = "Ansluten";
    joinBtn.disabled = true;
    partyInput.disabled = true;
    joinArea?.classList.add("collapsed");
    joinArea.style.display = "none";
  }

  joinBtn.onclick = attemptJoin;
  partyInput.addEventListener("keydown", (e) => {
    if (e.key === "Enter") attemptJoin();
  });

  submitArgumentBtn.addEventListener("click", async () => {
    const txt = (argumentInput.value || "").trim();
    if (!txt) {
      argumentStatus.textContent = "Skriv något först.";
      return;
    }
    const lp = await getLocalPlayer();
    if (!lp) {
      argumentStatus.textContent = "Inte ansluten.";
      return;
    }
    const roomSnap = await roomRef().once("value");
    const room = roomSnap.exists() ? roomSnap.val() : {};
    const round = room.roundNumber || 1;
    const phase = room.phase || "phase1";
    const key = `r${round}_${phase}`;
    await db
      .ref(`${ROOM}/players/${lp.id}/arguments`)
      .update({ [key]: { text: txt, at: Date.now() } });
    await db.ref(`${ROOM}/players/${lp.id}`).update({ ready: key });
    argumentStatus.textContent = "Skickat!";
    submitArgumentBtn.disabled = true;
    argumentInput.disabled = true;
  });

  async function submitQuizAnswer(qid, value) {
    quizStatus.textContent = "";
    const lp = await getLocalPlayer();
    if (!lp) {
      quizStatus.textContent = "Inte ansluten.";
      return;
    }
    const roomSnap = await roomRef().once("value");
    const room = roomSnap.exists() ? roomSnap.val() : {};
    const round = room.roundNumber || 1;
    const phase = room.phase || "phase1";
    const key = `r${round}_${phase}`;
    await db
      .ref(`${ROOM}/players/${lp.id}/quizAnswers/${key}`)
      .update({ [qid]: value });
    quizStatus.textContent = `Svar skickat: ${qid} = ${
      value ? "Sant" : "Falskt"
    }`;
  }
});
