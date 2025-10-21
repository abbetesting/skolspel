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
  const playersGrid = document.getElementById('playersGrid'); 
  const roomPin = document.getElementById('roomPin');
  const stage = document.getElementById('stage');
  const joinArea = document.getElementById('joinArea');
  const lobbyTitle = document.getElementById('lobbyTitle'); // dynamisk lobbytext

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
    entries.forEach(([id, p]) => {
      const div = document.createElement('div');
      div.className = 'player-chip';
      div.textContent = p.party + (p.points ? ` — ${p.points}p` : '');
      playersGrid.appendChild(div);
    });
  }

  async function getLocalPlayer() {
    if (!localPlayerKey) return null;
    const pSnap = await db.ref(`${ROOM}/players/${localPlayerKey}`).once('value');
    return pSnap.exists() ? { id: localPlayerKey, ...pSnap.val() } : null;
  }

  function updateLobbyText(room){
    if (!room.gameActive){
      lobbyTitle.textContent = 'Väntar på att admin startar spelet...';
      return;
    }
    if (room.phase === 'ai_judging'){
      lobbyTitle.textContent = 'AI bedömer ditt argument – vänta på resultat';
    } else {
      lobbyTitle.textContent = 'Spelet pågår';
    }
  }

  // live players list
  playersRef().on('value', snap => {
    const players = snap.val() || {};
    renderPlayers(players);
  });

  // room metadata listener
  db.ref(ROOM).on('value', async snap => {
    const room = snap.val() || {};
    updateLobbyText(room);

    if (!room.gameActive){
      stage.classList.add('hidden');
      if (joinArea) joinArea.style.display = '';
      return;
    }

    // spelet pågår
    stage.classList.remove('hidden');
    if (joinArea) joinArea.style.display = 'none';

    const st = document.getElementById('stageTitle');
    if (st) st.textContent = room.proposition || '-'; // propositionen visas

    const playerRole = document.getElementById('playerRole');
    const roleHelp = document.getElementById('roleHelp');
    const argumentSection = document.getElementById('argumentSection');
    const argumentInput = document.getElementById('argumentInput');
    const submitArgumentBtn = document.getElementById('submitArgumentBtn');
    const argumentStatus = document.getElementById('argumentStatus');
    const quizArea = document.getElementById('quizArea');
    const quizList = document.getElementById('quizList');
    const quizStatus = document.getElementById('quizStatus');

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

    // bestäm om skrivfas
    const phase = room.phase || 'phase1';
    const writerRole = (phase === 'phase1') ? 'A' : 'B';
    const amIWriter = (writerRole === myRole);

    if (phase === 'ai_judging'){
      argumentSection.classList.add('hidden');
      quizArea.classList.add('hidden');
      roleHelp.textContent = 'AI bedömer ditt argument...';
    } else if (amIWriter){
      argumentSection.classList.remove('hidden');
      quizArea.classList.add('hidden');
      roleHelp.textContent = `Du skriver ditt argument som ${roleText}. Var kort och tydlig.`;
    } else {
      argumentSection.classList.add('hidden');
      quizArea.classList.remove('hidden');
      roleHelp.textContent = 'Du svarar på frågor medan din motståndare skriver.';
    }

    // render quiz questions
    quizList.innerHTML = '';
    if (!amIWriter && phase !== 'ai_judging'){
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

    // kontrollera om argument redan skickats
    const key = `r${room.roundNumber || 1}_${phase}`;
    if (lp.arguments && lp.arguments[key]){
      argumentStatus.textContent = 'Du har redan skickat för denna fas.';
      submitArgumentBtn.disabled = true; argumentInput.disabled = true;
    } else {
      argumentStatus.textContent = '';
      submitArgumentBtn.disabled = false; argumentInput.disabled = false;
    }
  });

  // join player
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
    if (joinArea) joinArea.style.display = 'none';
  }

  joinBtn.addEventListener('click', attemptJoin);
  partyInput.addEventListener('keydown', e => { if (e.key === 'Enter') attemptJoin(); });

  async function submitQuizAnswer(qid, value){
    const lp = await getLocalPlayer();
    if (!lp){ quizStatus.textContent = 'Inte ansluten.'; return; }
    const roomSnap = await roomRef().once('value');
    const room = roomSnap.exists() ? roomSnap.val() : {};
    const key = `r${room.roundNumber || 1}_${room.phase || 'phase1'}`;
    await db.ref(`${ROOM}/players/${lp.id}/quizAnswers/${key}`).update({ [qid]: value });
    quizStatus.textContent = `Svar skickat: ${qid} = ${value ? 'Sant' : 'Falskt'}`;
  }

  submitArgumentBtn.addEventListener('click', async () => {
    const txt = (argumentInput.value || '').trim();
    if (!txt) { argumentStatus.textContent = 'Skriv något först.'; return; }
    const lp = await getLocalPlayer();
    if (!lp) { argumentStatus.textContent = 'Inte ansluten.'; return; }
    const roomSnap = await roomRef().once('value');
    const room = roomSnap.exists() ? roomSnap.val() : {};
    const key = `r${room.roundNumber || 1}_${room.phase || 'phase1'}`;
    await db.ref(`${ROOM}/players/${lp.id}/arguments`).update({ [key]: { text: txt, at: Date.now() } });
    await db.ref(`${ROOM}/players/${lp.id}`).update({ ready: key });
    argumentStatus.textContent = 'Skickat!';
    submitArgumentBtn.disabled = true; argumentInput.disabled = true;
    if (joinArea) joinArea.style.display = 'none';
  });

  console.log('CLIENT SCRIPT LOADED (DOM Ready)');
});
