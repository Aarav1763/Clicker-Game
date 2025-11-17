// clan.js — Clicker-inspired game + Multi-Member Clan Boss (30s fights)
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
let uid = null;
function makeLocalUid() {
  let id = localStorage.getItem('local_uid');
  if (!id) {
    id = 'u' + Math.random().toString(36).slice(2,9);
    localStorage.setItem('local_uid', id);
  }
  return 'local_' + id;
}
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

// Upgrade costs
let costClickUpgrade = Number(localStorage.getItem('costClickUpgrade') || 10);
let costDpsUnit = Number(localStorage.getItem('costDpsUnit') || 20);

// Juggernaut combo
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

// Ancients multiplier
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

// ---------------------- Combat ----------------------
document.getElementById('attackBtn').addEventListener('click', () => {
  const now = Date.now();
  if (now - lastClickTime < 500) clickCombo++;
  else clickCombo = 1;
  lastClickTime = now;

  const { clickMult } = ancientsMultiplier();
  const dmg = Math.max(1, Math.floor(clickDmg * clickMult));
  monsterHp -= dmg;
  if (monsterHp <= 0) defeatMonster();
  render();
});

// auto DPS
setInterval(() => {
  const { dpsMult } = ancientsMultiplier();
  if (dps > 0) {
    monsterHp -= dps * dpsMult;
    if (monsterHp <= 0) defeatMonster();
    render();
  }
  if (Date.now() - lastClickTime > 500) clickCombo = 0;
}, 1000);

function defeatMonster() {
  const { goldMult, soulMult } = ancientsMultiplier();
  const rewardGold = Math.max(1, Math.floor((monsterMaxHp / 10) * goldMult));
  let rewardSouls = 0;
  if (Math.random() < 0.05) rewardSouls = Math.floor(1 * soulMult);
  gold += rewardGold;
  souls += rewardSouls;

  stage++;
  if (stage % 10 === 0) spawnLocalBoss(); // local boss spawn if not using Firestore

  monsterMaxHp = Math.floor(monsterMaxHp * 1.12) + 5;
  monsterHp = monsterMaxHp;
  monsterName = `Monster Lv${stage}`;

  render();
  saveAll();
}

// ---------------------- Upgrades ----------------------
document.getElementById('buyClickUpgrade').addEventListener('click', () => {
  if (gold >= costClickUpgrade) {
    gold -= costClickUpgrade;
    clickDmg += 1;
    costClickUpgrade = Math.floor(costClickUpgrade * 1.3);
    render();
    saveAll();
  }
});
document.getElementById('buyDpsUnit').addEventListener('click', () => {
  if (gold >= costDpsUnit) {
    gold -= costDpsUnit;
    dps += 1;
    costDpsUnit = Math.floor(costDpsUnit * 1.25);
    render();
    saveAll();
  }
});
document.getElementById('saveBtn').addEventListener('click', () => { saveAll(); alert('Saved locally'); });
document.getElementById('loadBtn').addEventListener('click', () => { loadAll(); alert('Loaded'); });

// ---------------------- Ancients UI ----------------------
function renderAncientsUI() {
  const container = document.getElementById('ancients');
  container.innerHTML = '';
  ancientList.forEach(a => {
    const el = document.createElement('div');
    el.className = 'ancient';
    const lvl = ancients[a.id].level || 0;
    const unlocked = stage >= a.unlockedAt;
    el.innerHTML = `<div><strong>${a.label}</strong></div>
      <div style="font-size:12px">${a.desc}</div>
      <div>Level: <span id="lvl_${a.id}">${lvl}</span></div>
      <div><button id="buyAnc_${a.id}" ${!unlocked ? 'disabled' : ''}>Buy (Cost ${getAncientCost(a.id)})</button></div>
      ${!unlocked ? `<div style="font-size:11px;color:#999">Unlocks at stage ${a.unlockedAt}</div>` : ''}`;
    container.appendChild(el);
    document.getElementById(`buyAnc_${a.id}`).addEventListener('click', () => {
      buyAncient(a.id);
    });
  });
}
function getAncientCost(id) {
  const lvl = ancients[id].level || 0;
  return Math.floor(10 * Math.pow(2, lvl));
}
function buyAncient(id) {
  const cost = getAncientCost(id);
  if (souls >= cost) {
    souls -= cost;
    ancients[id].level = (ancients[id].level || 0) + 1;
    saveAll();
    render();
    renderAncientsUI();
  } else alert('Not enough souls');
}
renderAncientsUI();

// ---------------------- Clan System & Boss (Local + Firebase) ----------------------
// ... (the rest of your existing clan & boss code remains exactly unchanged)
