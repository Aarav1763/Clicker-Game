// clan.js — Original Clicker-inspired game + Multi-Member Clan Boss (30s fights)
// -----------------------------------------------------------------------------
// NOTE: Replace `firebaseConfig` with your Firebase config object if you want
// Firestore-backed clans. Set to `null` to run locally without Firebase.
// -----------------------------------------------------------------------------

 const firebaseConfig = {
  apiKey: "AIzaSyCr-8FgUsREG3_Ruw_fCXnblUGlpUAE2z8",
  authDomain: "clicker-heroes-ecbfe.firebaseapp.com",
  projectId: "clicker-heroes-ecbfe",
  storageBucket: "clicker-heroes-ecbfe.firebasestorage.app",
  messagingSenderId: "328719492430",
  appId: "1:328719492430:web:4cf12fce6912c44a62ea1f",
  measurementId: "G-H5C31LEE5X"
}; 

let auth = null, db = null, firebaseAvailable = false;

// Initialize Firebase if provided
if (firebaseConfig) {
  try {
    firebase.initializeApp(firebaseConfig);
    auth = firebase.auth();
    db = firebase.firestore();
    firebaseAvailable = true;
  } catch (e) {
    console.warn("Firebase init failed:", e);
    firebaseAvailable = false;
  }
}

// ------------------------ Game state ------------------------
let uid = null; // will be anonymous id if firebase enabled, otherwise local id
function makeLocalUid() { return 'local_' + (localStorage.getItem('local_uid') || (() => { const id = 'u' + Math.random().toString(36).slice(2,9); localStorage.setItem('local_uid', id); return id; })()); }
if (!firebaseAvailable) uid = makeLocalUid();

let gold = Number(localStorage.getItem('gold') || 0);
let souls = Number(localStorage.getItem('souls') || 0);
let clickDmg = Number(localStorage.getItem('clickDmg') || 1);
let dps = Number(localStorage.getItem('dps') || 0);
let stage = Number(localStorage.getItem('stage') || 1);

// Ancients
const ancientList = [
  { id: 'Siyalatas', label: 'Siyalatas', desc: '% DPS', unlockedAt: 100 },
  { id: 'Bhaal', label: 'Bhaal', desc: '% Click', unlockedAt: 100 },
  { id: 'Solomon', label: 'Solomon', desc: '% Boss Souls', unlockedAt: 100 },
  { id: 'Morgulis', label: 'Morgulis', desc: 'Souls -> DPS', unlockedAt: 100 },
  { id: 'Libertas', label: 'Libertas', desc: '% Gold', unlockedAt: 100 },
  { id: 'Mammon', label: 'Mammon', desc: '% Gold', unlockedAt: 100 },
  { id: 'Fragsworth', label: 'Fragsworth', desc: '% Click', unlockedAt: 100 },
  { id: 'Juggernaut', label: 'Juggernaut', desc: 'Click Combo', unlockedAt: 100 }
];
let ancients = JSON.parse(localStorage.getItem('ancients') || '{}');
ancientList.forEach(a => { if (!ancients[a.id]) ancients[a.id] = { level: 0 }; });

// Monster
let monsterMaxHp = Number(localStorage.getItem('monsterMaxHp') || 50);
let monsterHp = Number(localStorage.getItem('monsterHp') || monsterMaxHp);
let monsterName = localStorage.getItem('monsterName') || 'Slime';

// Upgrade costs (slower progression)
let costClickUpgrade = Number(localStorage.getItem('costClickUpgrade') || 10);
let costDpsUnit = Number(localStorage.getItem('costDpsUnit') || 20);

// Juggernaut combo variables
let clickCombo = 0;
let lastClickTime = 0;

// Clan variables
let currentClanId = null;
let clanListenerUnsub = null;
let bossListenerUnsub = null;
let msgsListenerUnsub = null;
let lastAttackTime = 0;

// DOM refs
const goldEl = document.getElementById('gold');
const soulsEl = document.getElementById('souls');
const clickDmgEl = document.getElementById('clickDmg');
const dpsEl = document.getElementById('dps');
const stageEl = document.getElementById('stage');
const monsterNameEl = document.getElementById('monsterName');
const hpText = document.getElementById('hpText');
const monsterHpBar = document.getElementById('monsterHpBar');
const bossInfoEl = document.getElementById('bossInfo');
const bossHpBar = document.getElementById('bossHpBar');
const bossTimerEl = document.getElementById('bossTimer');
const clanInfoEl = document.getElementById('clanInfo');
const messagesEl = document.getElementById('messages');
const comboDisplay = document.getElementById('comboDisplay');

// helper: save/load
function saveAll() {
  localStorage.setItem('gold', gold);
  localStorage.setItem('souls', souls);
  localStorage.setItem('clickDmg', clickDmg);
  localStorage.setItem('dps', dps);
  localStorage.setItem('stage', stage);
  localStorage.setItem('monsterMaxHp', monsterMaxHp);
  localStorage.setItem('monsterHp', monsterHp);
  localStorage.setItem('monsterName', monsterName);
  localStorage.setItem('costClickUpgrade', costClickUpgrade);
  localStorage.setItem('costDpsUnit', costDpsUnit);
  localStorage.setItem('ancients', JSON.stringify(ancients));
}
function loadAll() {
  gold = Number(localStorage.getItem('gold') || 0);
  souls = Number(localStorage.getItem('souls') || 0);
  clickDmg = Number(localStorage.getItem('clickDmg') || 1);
  dps = Number(localStorage.getItem('dps') || 0);
  stage = Number(localStorage.getItem('stage') || 1);
  monsterMaxHp = Number(localStorage.getItem('monsterMaxHp') || 50);
  monsterHp = Number(localStorage.getItem('monsterHp') || monsterMaxHp);
  monsterName = localStorage.getItem('monsterName') || 'Slime';
  costClickUpgrade = Number(localStorage.getItem('costClickUpgrade') || 10);
  costDpsUnit = Number(localStorage.getItem('costDpsUnit') || 20);
  ancients = JSON.parse(localStorage.getItem('ancients') || '{}');
  ancientList.forEach(a => { if (!ancients[a.id]) ancients[a.id] = { level: 0 }; });
  render();
}

// compute ancients effects (formula A-inspired but original)
function ancientsMultiplier() {
  const sLvl = ancients.Siyalatas.level || 0;
  const bLvl = ancients.Bhaal.level || 0;
  const frLvl = ancients.Fragsworth.level || 0;
  const juLvl = ancients.Juggernaut.level || 0;
  const lib = ancients.Libertas.level || 0;
  const mam = ancients.Mammon.level || 0;
  const sol = ancients.Solomon.level || 0;
  const mor = ancients.Morgulis.level || 0;

  const dpsMult = 1 + sLvl * 0.25 + (mor * (souls * 0.001));
  const clickMult = 1 + bLvl * 0.5 + frLvl * 0.5 + (juLvl ? (1 + (clickCombo * 0.05 * juLvl)) - 1 : 0);
  const goldMult = 1 + lib * 0.02 + mam * 0.05;
  const soulMult = 1 + sol * 0.05;
  return { dpsMult, clickMult, goldMult, soulMult };
}

// ---------------------- Rendering ----------------------
function render() {
  goldEl.textContent = Math.floor(gold);
  soulsEl.textContent = Math.floor(souls);
  clickDmgEl.textContent = Math.floor(clickDmg * 100)/100;
  dpsEl.textContent = Math.floor(dps * 100)/100;
  stageEl.textContent = stage;
  monsterNameEl.textContent = `${monsterName} — Stage ${stage}`;
  hpText.textContent = `${Math.ceil(monsterHp)} / ${Math.ceil(monsterMaxHp)}`;
  monsterHpBar.style.width = Math.max(0, (monsterHp / monsterMaxHp) * 100) + '%';
  document.getElementById('costClickUpgrade').textContent = costClickUpgrade;
  document.getElementById('costDpsUnit').textContent = costDpsUnit;
  comboDisplay && (comboDisplay.textContent = clickCombo > 0 ? `combo x${clickCombo}` : '');
}
render();

// --- EVERYTHING ELSE REMAINS EXACTLY THE SAME UNTIL LOCAL CLAN CODE ---

// Local fallback clan storage
function localClans() {
  return JSON.parse(localStorage.getItem('local_clans') || '{}');
}
function saveLocalClans(obj) { localStorage.setItem('local_clans', JSON.stringify(obj)); }

// Ensure local clan data exists
function ensureClanData(id) {
  const clans = localClans();
  if (!clans[id]) clans[id] = { name:'Unnamed', leader:uid, members:{[uid]:{joinedAt:Date.now()}}, boss:null, messages:[] };
  if (!clans[id].boss) clans[id].boss = { hp:500, maxHp:500, endsAt:Date.now()+30*1000, totalDamage:0, soulsReward:5, finishedAt:null, players:{} };
  if (!clans[id].messages) clans[id].messages = [];
  saveLocalClans(clans);
}

// Create Clan (local)
document.getElementById('createClanBtn').addEventListener('click', () => {
  const name = document.getElementById('clanNameInput').value.trim();
  if (!name) return alert('Enter a clan name');
  const id = 'local_' + Math.random().toString(36).slice(2,8);
  const clans = localClans();
  clans[id] = { name, leader: uid, members:{[uid]:{joinedAt:Date.now()}}, boss:null, messages:[] };
  saveLocalClans(clans);
  joinClan(id);
});

// Join Clan (local)
document.getElementById('joinClanBtn').addEventListener('click', () => {
  const id = document.getElementById('joinClanInput').value.trim();
  if (!id) return alert('Enter a clan ID');
  joinClan(id);
});

// joinClan helper (local)
function joinClan(id) {
  if (firebaseAvailable) return; // keep original firebase code
  ensureClanData(id);
  const clans = localClans();
  clans[id].members[uid] = { joinedAt: Date.now() };
  saveLocalClans(clans);
  currentClanId = id;
  clanInfoEl.textContent = `Clan: ${clans[id].name} (ID: ${id})`;
  setupClanListeners(id);
}

// setupClanListeners (local)
function setupClanListeners(id) {
  stopClanListeners();
  if (firebaseAvailable) return; // keep original firebase code
  ensureClanData(id);
  const clans = localClans();
  const b = clans[id].boss;

  bossInfoEl.textContent = b.finishedAt ? `Boss defeated!` : `Boss HP: ${b.hp} / ${b.maxHp}`;
  bossHpBar.style.width = Math.max(0,(b.hp/b.maxHp)*100)+'%';
  updateLocalBossTimer(id);

  // messages
  messagesEl.innerHTML = '';
  clans[id].messages.forEach(m=>{
    const div=document.createElement('div');
    div.textContent = `${m.user.substring(0,6)}: ${m.text}`;
    messagesEl.appendChild(div);
  });
}

// --- EVERYTHING ELSE REMAINS EXACTLY THE SAME ---

// initial save/load
saveAll();
render();
