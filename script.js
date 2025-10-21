// Use Firebase globals loaded by index.html <script> tags (compat builds)
const ROOM = 'gameRoom';
const firebaseConfig = {
  apiKey: "AIzaSyB3h1EJpPZSKasbR0ztZVJXEnwu-Uj_-0M",
  authDomain: "spel-skola.firebaseapp.com",
  databaseURL: "https://spel-skola-default-rtdb.europe-west1.firebasedatabase.app",
  projectId: "spel-skola",
};

const app = firebase.initializeApp(firebaseConfig);
const db = firebase.database();

document.addEventListener('DOMContentLoaded', () => {
  const partyInput = document.getElementById('partyInput');
  const joinBtn = document.getElementById('joinBtn');
  const joinError = document.getElementById('joinError');
  const lobbyCount = document.getElementById('lobbyCount');
  const lobbyWait = document.getElementById('lobbyWait');
  const playersGrid = document.getElementById('playersGrid');
  const roomPin = document.getElementById('roomPin');
  const stage = document.getElementById('stage');
  const joinArea = document.getElementById('joinArea');
  const lobbyTitle = document.getElementById('lobbyTitle');

  if (roomPin) roomPin.textContent = ROOM;

  let localPlayerKey = localStorage.getItem('playerKey') || null;
  let localParty = localStorage.getItem('playerParty') || null;
  if (localParty) partyInput.value = localParty;

  const playersRef = () => db.ref(`${ROOM}/players`);
  const roomRef = () => db.ref(ROOM);

  function renderPlayers(playersObj){
    if (!playersGrid) return;
    playersGrid.innerHTML = '';
    const entries = Object.entries(playersObj || {});
    if (lobbyCount) lobbyCount.textContent = entries.length;
    entries.forEach(([id, p]) => {
      const div = document.createElement('div');
      div.className = 'player-chip';
      div.textContent = p.party + (p.points ? ` — ${p.points}p` : '');
      playersGrid.appendChild(div);
    });
  }

  function updateLobbyText(room){
    if (!lobbyTitle) return;
    if (!room.gameActive) {
      lobbyTitle.textContent = 'Väntar på att admin startar spelet...';
    } else if (room.phase === 'finished') {
      lobbyTitle.textContent = 'Spelet är klart. Väntar på admin.';
    } else {
      lobbyTitle.textContent = `Runda ${room.roundNumber || 1} — ${room.phase || ''}`;
    }
  }

  async function getLocalPlayer() {
    if (!localPlayerKey) return null;
    const pSnap = await db.ref(`${ROOM}/players/${localPlayerKey}`).once('value');
    return pSnap.exists() ? { id: localPlayerKey, ...pSnap.val() } : null;
  }

  playersRef().on('value', snap => {
    const players = snap.val() || {};
    renderPlayers(players);
  });

  db.ref(ROOM).on('value', async snap => {
    const room = snap.val() || {};
    updateLobbyText(room);

    if (!room.gameActive){
      stage.classList.add('hidden');
      if (joinArea) joinArea.style.display = '';
      return;
    }

    stage.classList.remove('hidden');
    if (joinArea) joinArea.style.display = 'none';

    const st = document.getElementById('stageTitle');
    if (st) st.textContent = room.proposition || '-';

    const playerRole = document.getElementById('playerRole');
    const roleHelp = document.getElementById('roleHelp');
    const argumentSection = document.getElementById('argumentSection');
    const argumentInput = document.getElementById('argumentInput');
    const submitArgumentBtn = document.getElementById('submitArgumentBtn');
    const argumentStatus = document.getElementById('argumentStatus');
    const quizArea = document.getElementById('quizArea');
    const quizList = document.getElementById('quizList');
    const quizStatus = document.getElementById('quizStatus');
    const previousArguments = document.getElementById('previousArguments');
    const previousList = document.getElementById('previousList');
    const finalResult = document.getElementById('finalResult');
    const yourPlacement = document.getElementById('yourPlacement');

    const lp = await getLocalPlayer();
    if (!lp){
      if (playerRole) playerRole.textContent = '-';
      if (roleHelp) roleHelp.textContent = 'Du är inte ansluten som spelare.';
      if (argumentSection) argumentSection.classList.add('hidden');
      if (quizArea) quizArea.classList.add('hidden');
      return;
    }

    const pairs = room.pairs || [];
    let myPair = null;
    let myRole = null;
    for (const p of pairs){
      if (!p) continue;
      if (p.a === lp.id) { myPair = p; myRole = 'A'; break; }
      if (p.b === lp.id) { myPair = p; myRole = 'B'; break; }
    }

    if (!myPair){
      playerRole.textContent = 'Utesluten';
      roleHelp.textContent = 'Du blev inte tilldelad ett par.';
      argumentSection.classList.add('hidden');
      quizArea.classList.add('hidden');
      return;
    }

    const roleText = (myRole === 'A') ? 'FÖR' : 'MOT';
    playerRole.textContent = roleText;

    const phase = room.phase || 'phase1';
    const writerRole = (phase === 'phase1') ? 'A' : 'B';
    const amIWriter = (writerRole === myRole);

    // --- FINISHED PHASE: hide interactivity, wait for admin ---
    if (phase === 'finished'){
      argumentSection.classList.add('hidden');
      quizArea.classList.add('hidden');
      roleHelp.textContent = 'Spelet är klart. Väntar på admin.';
      return;
    }

    // --- writer/editor ---
    if (amIWriter){
      argumentSection.classList.remove('hidden');
      quizArea.classList.add('hidden');
      roleHelp.textContent = `Du skriver ditt argument som ${roleText}. Var kort och tydlig.`;
    } else {
      argumentSection.classList.add('hidden');
      quizArea.classList.remove('hidden');
      roleHelp.textContent = 'Du svarar på frågor medan din motståndare skriver.';
    }

  // --- START: Ersätt sampleQs med slumpade 20 frågor ---
if (!amIWriter){
  const allQuestions = [
    'Riksdagen stiftar lagar.',
    'Regeringen väljs av folket direkt.',
    'Kommuner bestämmer över skolan.',
    'EU kan stifta lagar som påverkar Sverige.',
    'Statsministern är samma sak som riksdagens talman.',
    'Alla kommuner måste ha samma skattesats.',
    'Sverige är medlem i FN.',
    'Skolplikt gäller upp till 18 års ålder.',
    'Riksbankschefen utses av riksdagen.',
    'Försvarsmakten lyder under regeringen.',
    'Polisen är fristående från staten.',
    'Sverige har två statsministrar samtidigt.',
    'Regeringen kan införa lagar utan riksdagens godkännande.',
    'EU-domstolen kan påverka svenska lagar.',
    'Skolans budget bestäms av kommunerna.',
    'Sverige har aldrig haft kvinnlig statsminister.',
    'Alla partier måste delta i riksdagsvalet.',
    'Militären får agera utomlands utan riksdagens godkännande.',
    'Grundlagen kan ändras av regeringen ensam.',
    'Alla skolor måste ha gymnasieprogram i naturvetenskap.'
  ];

  // Slumpa 20 frågor
  const shuffledQs = allQuestions.sort(() => Math.random() - 0.5);
  const sampleQs = shuffledQs.slice(0, 20).map((q, i) => ({ id: `q${i+1}`, text: q }));

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
// --- SLUT ---
    // render previous arguments (optional, only phase2)
    previousList.innerHTML = '';
    previousArguments.classList.add('hidden');
    if (phase === 'phase2'){
      try {
        const allPlayersSnap = await playersRef().once('value');
        const allPlayers = allPlayersSnap.exists() ? allPlayersSnap.val() : {};
        const round = room.roundNumber || 1;
        const keys = [`r${round}_phase1`, `r${round}_phase2`];
        const container = document.createElement('div');
        container.className = 'previous-args-container';
        keys.forEach(k => {
          Object.entries(allPlayers).forEach(([pid, p]) => {
            const partyName = (p && p.party) ? p.party : pid;
            const argObj = (p && p.arguments && p.arguments[k]) ? p.arguments[k] : null;
            if (argObj && argObj.text) {
              const card = document.createElement('div'); card.className = 'card';
              const h = document.createElement('div'); h.style.fontWeight = '700'; h.textContent = `${partyName} (${k})`;
              const t = document.createElement('div'); t.textContent = argObj.text;
              card.appendChild(h); card.appendChild(t);
              container.appendChild(card);
            }
          });
        });
        if (container.children.length) {
          previousList.appendChild(container);
          previousArguments.classList.remove('hidden');
          previousArguments.style.display = '';
        }
      } catch(e){ console.warn('Kunde inte läsa tidigare argument', e); }
    }

    // disable input if already submitted
    try {
      const myKey = `r${room.roundNumber}_${phase}`;
      const already = lp.arguments && lp.arguments[myKey];
      if (already){
        argumentStatus.textContent = 'Du har redan skickat för denna fas.';
        submitArgumentBtn.disabled = true; argumentInput.disabled = true;
      } else {
        argumentStatus.textContent = '';
        submitArgumentBtn.disabled = false; argumentInput.disabled = false;
      }
    } catch(e){ console.warn(e); }
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
    try {
      await newRef.set({ party, points: 0, ready: '', arguments: {} });
      await newRef.update({ party });
    } catch (e) {
      console.error('Kunde inte spara spelarinfo till Firebase:', e);
      joinError.textContent = 'Kunde inte ansluta just nu. Försök igen.';
      return;
    }

    localPlayerKey = key; localParty = party;
    localStorage.setItem('playerKey', key); localStorage.setItem('playerParty', party);

    joinBtn.textContent = 'Ansluten'; joinBtn.disabled = true; partyInput.disabled = true;
    if (joinArea) { joinArea.classList.add('collapsed'); joinArea.style.display = 'none'; }
  }

  joinBtn.addEventListener('click', attemptJoin);
  partyInput.addEventListener('keydown', e => { if (e.key === 'Enter') attemptJoin(); });

  (async function verify(){
    if (!localPlayerKey) return;
    const pSnap = await db.ref(`${ROOM}/players/${localPlayerKey}`).once('value');
    if (!pSnap.exists()){ 
      localStorage.removeItem('playerKey'); localStorage.removeItem('playerParty'); 
      localPlayerKey = null; localParty = null; 
    } else {
      const data = pSnap.val() || {};
      if ((!data.party || data.party === '') && localParty) {
        try { await db.ref(`${ROOM}/players/${localPlayerKey}`).update({ party: localParty }); } 
        catch (e) { console.warn('Kunde inte reparera party-fält:', e); }
      }
      joinBtn.textContent = 'Ansluten'; joinBtn.disabled = true; partyInput.disabled = true;
      if (joinArea) { joinArea.classList.add('collapsed'); joinArea.style.display = 'none'; }
    }
  })();

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
    await db.ref(`${ROOM}/players/${lp.id}/arguments`).update({ [key]: { text: txt, at: Date.now() } });
    await db.ref(`${ROOM}/players/${lp.id}`).update({ ready: key });
    argumentStatus.textContent = 'Skickat!';
    submitArgumentBtn.disabled = true; argumentInput.disabled = true;
    if (joinArea) joinArea.style.display = 'none';
  });

  async function submitQuizAnswer(qid, value) {
    quizStatus.textContent = '';
    const lp = await getLocalPlayer();
    if (!lp) { quizStatus.textContent = 'Inte ansluten.'; return; }
    const roomSnap = await roomRef().once('value');
    const room = roomSnap.exists() ? roomSnap.val() : {};
    const round = room.roundNumber || 1;
    const phase = room.phase || 'phase1';
    const key = `r${round}_${phase}`;
    await db.ref(`${ROOM}/players/${lp.id}/quizAnswers/${key}`).update({ [qid]: value });
    quizStatus.textContent = `Svar skickat: ${qid} = ${value ? 'Sant' : 'Falskt'}`;
  }

  console.log('CLIENT SCRIPT LOADED (DOM Ready)');
});
