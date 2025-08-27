// --- Einstellungen ---
const K = 32;                  // ELO-Koeffizient (üblich)
const MANIFEST_URL = "./images.json";
const API_URL = "/api/submit"; // Vercel-Funktion

// --- Helper: ID für Teilnehmer:in ---
function uuid() {
  return crypto.randomUUID ? crypto.randomUUID()
    : 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, c => {
        const r = Math.random()*16|0, v = c==='x'?r:(r&0x3|0x8); return v.toString(16);
      });
}
const PARTICIPANT_KEY = "elo_participant_id";
let participantId = localStorage.getItem(PARTICIPANT_KEY);
if (!participantId) { participantId = uuid(); localStorage.setItem(PARTICIPANT_KEY, participantId); }

// --- State ---
let images = [];
let ratings = new Map();    // id -> rating
let votes = [];             // {winner, loser, tie, ts}
let currentPair = null;
let sent = false;           // verhindert Doppel-Sendungen

// --- ELO ---
const expected = (ra, rb) => 1 / (1 + Math.pow(10, (rb - ra) / 400));
function updateElo(winnerId, loserId, tie = false) {
  const ra = ratings.get(winnerId) ?? 1500;
  const rb = ratings.get(loserId) ?? 1500;
  const ea = expected(ra, rb);
  const eb = expected(rb, ra);

  let sa = tie ? 0.5 : 1.0; // tatsächlicher Score
  let sb = tie ? 0.5 : 0.0;

  const ra2 = ra + K * (sa - ea);
  const rb2 = rb + K * (sb - eb);
  ratings.set(winnerId, ra2);
  ratings.set(loserId, rb2);
}

// --- UI ---
const imgA = document.getElementById("imgA");
const imgB = document.getElementById("imgB");
const statusEl = document.getElementById("status");

function pickTwo() {
  if (images.length < 2) return null;
  let a = Math.floor(Math.random() * images.length);
  let b = Math.floor(Math.random() * images.length);
  while (b === a) b = Math.floor(Math.random() * images.length);
  return [images[a], images[b]];
}

function showPair() {
  currentPair = pickTwo();
  if (!currentPair) return;
  const [a, b] = currentPair;
  imgA.src = `./images/${a}`; imgA.alt = a;
  imgB.src = `./images/${b}`; imgB.alt = b;
}

// --- Upload (nur für Summary am Ende) ---
function sendJSON(payload, {beacon=false} = {}) {
  const blob = new Blob([JSON.stringify(payload)], { type: "application/json" });

  // Versuch 1: sendBeacon (super für "Tab schließen")
  if (beacon && navigator.sendBeacon) {
    navigator.sendBeacon(API_URL, blob); // fire-and-forget
    return Promise.resolve();
  }
  // Fallback: fetch (mit keepalive im Unload-Fall)
  return fetch(API_URL, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
    keepalive: beacon // true, wenn im unload
  }).then(()=>{}).catch(()=>{});
}

// --- Handlers ---
function onChoose(side) {
  if (!currentPair) return;
  const [a, b] = currentPair;
  const tie = (side === "tie");
  const winner = tie ? a : (side === "left" ? a : b);
  const loser  = tie ? b : (side === "left" ? b : a);

  updateElo(winner, loser, tie);
  const rec = { winner, loser, tie, ts: Date.now() };
  votes.push(rec);

  // KEIN Upload hier – nur lokal zählen
  statusEl.textContent = `Auswahl gespeichert: ${votes.length} Stimmen`;
  showPair();
}

async function finish() {
  if (sent) return; // doppelte Sends verhindern
  sent = true;

  // Zusammenfassung + ALLE Stimmen + aktuelles ELO senden
  const ranking = Array.from(ratings.entries())
    .map(([id, rating]) => ({ id, rating }))
    .sort((x,y)=>y.rating - x.rating);

  const payload = {
    type: "summary",
    participantId,
    votes,                 // <-- komplette Liste aller Duelle
    votesCount: votes.length,
    ranking,
    ts: Date.now()
  };
  await sendJSON(payload, {beacon:true});
  statusEl.textContent = "Zusammenfassung gesendet. Danke!";
}

// --- Init ---
(async function init(){
  try {
    const manifest = await fetch(MANIFEST_URL).then(r => r.json());
    images = manifest.images || [];
    images.forEach(id => ratings.set(id, 1500));

    if (images.length < 2) {
      statusEl.textContent = "Zu wenige Bilder in images.json (mind. 2 benötigt).";
      return;
    }
    showPair();

    document.getElementById("btnLeft").addEventListener("click", ()=>onChoose("left"));
    document.getElementById("btnRight").addEventListener("click", ()=>onChoose("right"));
    document.getElementById("btnTie").addEventListener("click", ()=>onChoose("tie"));
    document.getElementById("btnFinish").addEventListener("click", finish);

    // Beim Tab-Schließen/Wechsel: Summary senden
    addEventListener("visibilitychange", ()=> {
      if (document.visibilityState === "hidden") finish();
    });
    addEventListener("beforeunload", ()=> finish());

  } catch (e) {
    console.error(e);
    statusEl.textContent = "Fehler beim Laden von images.json.";
  }
})();
