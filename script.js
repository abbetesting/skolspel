// Use Firebase globals loaded by index.html <script> tags (compat builds)
const ROOM = 'gameRoom';
const firebaseConfig = {
  apiKey: "AIzaSyB3h1EJpPZSKasbR0ztZVJXEnwu-Uj_-0M",
  authDomain: "spel-skola.firebaseapp.com",
  databaseURL: "https://spel-skola-default-rtdb.europe-west1.firebasedatabase.app",
  projectId: "spel-skola",
};

// initialize using compat/global firebase namespace
const app = firebase.initializeApp(firebaseConfig);
const db = firebase.database();

document.addEventListener('DOMContentLoaded', () => {
  const partyInput = document.getElementById('partyInput');
  const joinBtn = document.getElementById('joinBtn');
  const joinError = document.getElementById('joinError');
  const lobbyCount = document.getElementById('lobbyCount');
  const lobbyWait = document.getElementById('lobbyWait');
  const playersGrid = document.getElementById('playersGrid'); // may be null on player page (admin-only)
  const roomPin = document.getElementById('roomPin');
  const stage = document.getElementById('stage');
  const joinArea = document.getElementById('joinArea');

  roomPin.textContent = ROOM;

  let localPlayerKey = localStorage.getItem('playerKey') || null;
  let localParty = localStorage.getItem('playerParty') || null;
  if (localParty) partyInput.value = localParty;

  const playersRef = () => db.ref(`${ROOM}/players`);
  const roomRef = () => db.ref(ROOM);

  function renderPlayers(playersObj){
    if (!playersGrid) return; // nothing to render on player view
    playersGrid.innerHTML = '';
    const entries = Object.entries(playersObj || {});
    lobbyCount.textContent = entries.length;
    entries.forEach(([id, p]) => {
      const div = document.createElement('div');
      div.className = 'player-chip';
      div.textContent = p.party + (p.points ? ` — ${p.points}p` : '');
      playersGrid.appendChild(div);
    });
  }

  // UI refs for game stage
  const playerRole = document.getElementById('playerRole');
  const roleHelp = document.getElementById('roleHelp');
  const argumentSection = document.getElementById('argumentSection');
  const argumentInput = document.getElementById('argumentInput');
  const submitArgumentBtn = document.getElementById('submitArgumentBtn');
  const argumentStatus = document.getElementById('argumentStatus');
  const previousArguments = document.getElementById('previousArguments');
  const previousList = document.getElementById('previousList');
  const quizArea = document.getElementById('quizArea');
  const quizList = document.getElementById('quizList');
  const quizStatus = document.getElementById('quizStatus');

  // Helper: get player's party id and party name from stored local key
  async function getLocalPlayer() {
    if (!localPlayerKey) return null;
    const pSnap = await db.ref(`${ROOM}/players/${localPlayerKey}`).once('value');
    return pSnap.exists() ? { id: localPlayerKey, ...pSnap.val() } : null;
  }

  // live players list
  playersRef().on('value', snap => {
    const players = snap.val() || {};
    renderPlayers(players);
  });

  // room metadata listener
  db.ref(ROOM).on('value', snap => {
    const room = snap.val() || {};
    if (room.gameActive){
      lobbyWait.textContent = `Spelet pågår — proposition: ${room.proposition || '-'} `;
      stage.classList.remove('hidden');
      const st = document.getElementById('stageTitle');
      if (st) st.textContent = `Runda ${room.roundNumber || 1} — ${room.phase || ''}`;
      // determine player role and show appropriate UI
      (async () => {
        const lp = await getLocalPlayer();
        if (!lp) {
          // not joined or local data missing
          playerRole.textContent = '-';
          roleHelp.textContent = 'Du är inte ansluten som spelare.';
          argumentSection.classList.add('hidden');
          quizArea.classList.add('hidden');
          previousArguments.classList.add('hidden');
          return;
        }

        const pairs = room.pairs || [];
        // find this player's pair and role (A or B)
        let myPair = null;
        let myRole = null;
        for (const p of pairs) {
          if (!p) continue;
          if (p.a === lp.id) { myPair = p; myRole = 'A'; break; }
          if (p.b === lp.id) { myPair = p; myRole = 'B'; break; }
        }

        if (!myPair) {
          playerRole.textContent = 'Utesluten';
          roleHelp.textContent = 'Du blev inte tilldelad ett par och deltar inte i debatten.';
          argumentSection.classList.add('hidden');
          previousArguments.classList.add('hidden');
          quizArea.classList.add('hidden');
          return;
        }

        // show role
        playerRole.textContent = myRole;
        // determine whether current phase is writing or answering for this player
        const round = room.roundNumber || 1;
        const phase = room.phase || 'phase1';
        const writerRole = (phase === 'phase1') ? 'A' : 'B';
        const amIWriter = (writerRole === myRole);

        if (amIWriter) {
          // show argument editor
          argumentSection.classList.remove('hidden');
          quizArea.classList.add('hidden');
          previousArguments.classList.remove('hidden');
          roleHelp.textContent = `Du skriver argument för runda ${round} (${phase}). När du skickar markeras du som klar.`;
        } else {
          // show quiz area (answering)
          argumentSection.classList.add('hidden');
          quizArea.classList.remove('hidden');
          previousArguments.classList.remove('hidden');
          roleHelp.textContent = `Du svarar på frågor medan din motståndare skriver. Du ser deras tidigare argument.`;
        }

        // render previous arguments (for both roles show all previously submitted args)
        previousList.innerHTML = '';
        try {
          const playersSnap = await playersRef().once('value');
          const players = playersSnap.exists() ? playersSnap.val() : {};
          // gather all arguments for this pair across rounds
          const myPairPartyA = players[myPair.a] ? players[myPair.a].party : 'A';
          const myPairPartyB = players[myPair.b] ? players[myPair.b].party : 'B';
          const total = room.totalRounds || 3;
          for (let r = 1; r <= total; r++) {
            const k1 = `r${r}_phase1`;
            const k2 = `r${r}_phase2`;
            const aarg = players[myPair.a] && players[myPair.a].arguments && players[myPair.a].arguments[k1] ? players[myPair.a].arguments[k1].text : null;
            const barg = players[myPair.b] && players[myPair.b].arguments && players[myPair.b].arguments[k2] ? players[myPair.b].arguments[k2].text : null;
            if (aarg) {
              const d = document.createElement('div'); d.className = 'chip-small'; d.textContent = `${myPairPartyA} (r${r} A): ${aarg}`; previousList.appendChild(d);
            }
            if (barg) {
              const d = document.createElement('div'); d.className = 'chip-small'; d.textContent = `${myPairPartyB} (r${r} B): ${barg}`; previousList.appendChild(d);
            }
          }
        } catch (e) { console.warn('Could not render previous args', e); }

        // render quiz questions for current round for answerers
        quizList.innerHTML = '';
        if (!amIWriter) {
          // For now create 5 sample T/F questions. Admin will grade on server/admin side.
          const sampleQs = [
            { id: 'q1', text: 'Riksdagen stiftar lagar.' },
            { id: 'q2', text: 'Regeringen väljs av folket direkt.' },
            { id: 'q3', text: 'Kommuner bestämmer över skolan.' },
            { id: 'q4', text: 'EU kan stifta lagar som påverkar Sverige.' },
            { id: 'q5', text: 'Statsministern är samma sak som riksdagens talman.' }
          ];
          sampleQs.forEach(q => {
            const row = document.createElement('div'); row.style.marginBottom = '8px';
            const label = document.createElement('div'); label.textContent = q.text; row.appendChild(label);
            const btnT = document.createElement('button'); btnT.textContent = 'Sant'; btnT.className = 'primary'; btnT.style.marginRight = '6px';
            const btnF = document.createElement('button'); btnF.textContent = 'Falskt'; btnF.className = 'secondary';
            btnT.addEventListener('click', () => submitQuizAnswer(q.id, true));
            btnF.addEventListener('click', () => submitQuizAnswer(q.id, false));
            row.appendChild(btnT); row.appendChild(btnF);
            quizList.appendChild(row);
          });
          quizStatus.textContent = '';
        }
      })();
    } else {
      lobbyWait.textContent = 'Väntar på att admin startar spelet...';
      stage.classList.add('hidden');
  // player page doesn't show server lobby; just show/hide stage
    }
  });

  async function attemptJoin(){
    joinError.textContent = '';
    const party = (partyInput.value||'').trim();
    if (!party){ joinError.textContent = 'Skriv in ett partinamn'; partyInput.focus(); return; }

    const snap = await playersRef().once('value');
    const players = snap.exists() ? snap.val() : {};
    const exists = Object.values(players).some(p => p.party && p.party.toLowerCase() === party.toLowerCase());
    if (exists){ joinError.textContent = 'Namnet är upptaget'; return; }

    const newRef = playersRef().push();
    const key = newRef.key;
    await newRef.set({ party, points: 0, ready: '', arguments: {} });

  localPlayerKey = key; localParty = party;
  localStorage.setItem('playerKey', key); localStorage.setItem('playerParty', party);

  joinBtn.textContent = 'Ansluten'; joinBtn.disabled = true; partyInput.disabled = true;
  // collapse the join UI so name box moves away for player
  if (joinArea) joinArea.classList.add('collapsed');
  }

  joinBtn.addEventListener('click', attemptJoin);
  partyInput.addEventListener('keydown', e => { if (e.key === 'Enter') attemptJoin(); });

  (async function verify(){
    if (!localPlayerKey) return;
    const pSnap = await db.ref(`${ROOM}/players/${localPlayerKey}`).once('value');
    if (!pSnap.exists()){ localStorage.removeItem('playerKey'); localStorage.removeItem('playerParty'); localPlayerKey = null; localParty = null; }
    else { joinBtn.textContent = 'Ansluten'; joinBtn.disabled = true; partyInput.disabled = true; }
  })();

  // submit argument handler
  submitArgumentBtn.addEventListener('click', async () => {
    const txt = (argumentInput.value || '').trim();
    if (!txt) { argumentStatus.textContent = 'Skriv något först.'; return; }
    const lp = await getLocalPlayer();
    if (!lp) { argumentStatus.textContent = 'Inte ansluten.'; return; }
    const roomSnap = await roomRef().once('value');
    const room = roomSnap.exists() ? roomSnap.val() : {};
    const round = room.roundNumber || 1;
    const phase = room.phase || 'phase1';
    const key = `r${round}_${phase}`;
    // write argument under player's node
    await db.ref(`${ROOM}/players/${lp.id}/arguments`).update({ [key]: { text: txt, at: Date.now() } });
    // set ready flag for writers
    await db.ref(`${ROOM}/players/${lp.id}`).update({ ready: key });
    argumentStatus.textContent = 'Skickat!';
    submitArgumentBtn.disabled = true; argumentInput.disabled = true;
  });

  // submit quiz answer
  async function submitQuizAnswer(qid, value) {
    quizStatus.textContent = '';
    const lp = await getLocalPlayer();
    if (!lp) { quizStatus.textContent = 'Inte ansluten.'; return; }
    const roomSnap = await roomRef().once('value');
    const room = roomSnap.exists() ? roomSnap.val() : {};
    const round = room.roundNumber || 1;
    const phase = room.phase || 'phase1';
    const key = `r${round}_${phase}`;
    // store under quizAnswers -> keyed by round/phase
    await db.ref(`${ROOM}/players/${lp.id}/quizAnswers/${key}`).update({ [qid]: value });
    quizStatus.textContent = `Svar skickat: ${qid} = ${value ? 'Sant' : 'Falskt'}`;
  }

  console.log('CLIENT SCRIPT LOADED (DOM Ready)');
});
