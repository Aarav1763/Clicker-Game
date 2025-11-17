// clan.js — Original Clicker-inspired game + Multi-Member Clan Boss (30s fights)
// -----------------------------------------------------------------------------
// NOTE: Replace `firebaseConfig` with your Firebase config object if you want
// Firestore-backed clans. Set to `null` to run locally without Firebase.
// -----------------------------------------------------------------------------

const const firebaseConfig = {
  apiKey: "AIzaSyCr-8FgUsREG3_Ruw_fCXnblUGlpUAE2z8",
  authDomain: "clicker-heroes-ecbfe.firebaseapp.com",
  projectId: "clicker-heroes-ecbfe",
  storageBucket: "clicker-heroes-ecbfe.firebasestorage.app",
  messagingSenderId: "328719492430",
  appId: "1:328719492430:web:4cf12fce6912c44a62ea1f",
  measurementId: "G-H5C31LEE5X"
}; = null; // <-- REPLACE this with your Firebase config object to enable online clans

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

  // note: Morgulis scales with total souls for permanent DPS bonus (simple form)
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
  // juggernaut combo logic
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

// auto DPS tick
setInterval(() => {
  const { dpsMult } = ancientsMultiplier();
  if (dps > 0) {
    monsterHp -= dps * dpsMult;
    if (monsterHp <= 0) defeatMonster();
    render();
  }
  // combo decay if idle
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

  // slower growth
  monsterMaxHp = Math.floor(monsterMaxHp * 1.12) + 5;
  monsterHp = monsterMaxHp;
  monsterName = `Monster Lv${stage}`;

  render();
  saveAll();
}

// Upgrades
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
  return Math.floor(10 * Math.pow(2, lvl)); // simple cost curve
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

// ---------------------- Clan System (Multi-Member Boss, 30s) ----------------------

// Helper: if Firebase available, sign in anonymously to get uid; otherwise use local uid
(async function initAuth() {
  if (firebaseAvailable) {
    try {
      const userCredential = await auth.signInAnonymously();
      uid = userCredential.user.uid;
      document.getElementById('accountStatus').textContent = `Signed in (anon): ${uid}`;
    } catch (e) {
      console.warn('Firebase anonymous auth failed:', e);
      uid = makeLocalUid();
      document.getElementById('accountStatus').textContent = `Local: ${uid}`;
    }
  } else {
    uid = makeLocalUid();
    document.getElementById('accountStatus').textContent = `Local: ${uid}`;
  }
})();

// Local fallback clan storage (if firebase not available)
function localClans() {
  return JSON.parse(localStorage.getItem('local_clans') || '{}');
}
function saveLocalClans(obj) { localStorage.setItem('local_clans', JSON.stringify(obj)); }

// Create Clan
document.getElementById('createClanBtn').addEventListener('click', async () => {
  const name = document.getElementById('clanNameInput').value.trim();
  if (!name) return alert('Enter a clan name');
  if (firebaseAvailable) {
    const doc = await db.collection('clans').add({
      name,
      leader: uid,
      createdAt: firebase.firestore.FieldValue.serverTimestamp()
    });
    // create initial members subcollection
    await db.collection('clans').doc(doc.id).collection('members').doc(uid).set({ joinedAt: firebase.firestore.FieldValue.serverTimestamp() });
    joinClan(doc.id);
  } else {
    const id = 'local_' + Math.random().toString(36).slice(2,8);
    const clans = localClans();
    clans[id] = {
      name,
      leader: uid,
      members: { [uid]: { joinedAt: Date.now() } },
      boss: null
    };
    saveLocalClans(clans);
    joinClan(id);
  }
});

// Join Clan
document.getElementById('joinClanBtn').addEventListener('click', async () => {
  const id = document.getElementById('joinClanInput').value.trim();
  if (!id) return alert('Enter a clan ID');
  joinClan(id);
});

// Leave Clan
document.getElementById('leaveClanBtn').addEventListener('click', async () => {
  if (!currentClanId) return;
  if (firebaseAvailable) {
    await db.collection('clans').doc(currentClanId).collection('members').doc(uid).delete();
    stopClanListeners();
    currentClanId = null;
    clanInfoEl.textContent = 'No clan';
  } else {
    const clans = localClans();
    if (clans[currentClanId]) {
      delete clans[currentClanId].members[uid];
      saveLocalClans(clans);
    }
    stopClanListeners();
    currentClanId = null;
    clanInfoEl.textContent = 'No clan';
  }
});

// joinClan helper (sets up listeners / reads)
async function joinClan(id) {
  // firebase path
  if (firebaseAvailable) {
    const ref = db.collection('clans').doc(id);
    const snap = await ref.get();
    if (!snap.exists) return alert('Clan not found');
    // add member
    await ref.collection('members').doc(uid).set({ joinedAt: firebase.firestore.FieldValue.serverTimestamp() });
    currentClanId = id;
    clanInfoEl.textContent = `Clan: ${snap.data().name} (ID: ${id})`;
    setupClanListeners(id);
  } else {
    const clans = localClans();
    if (!clans[id]) return alert('Clan not found (local)');
    clans[id].members[uid] = { joinedAt: Date.now() };
    saveLocalClans(clans);
    currentClanId = id;
    clanInfoEl.textContent = `Clan: ${clans[id].name} (ID: ${id})`;
    setupClanListeners(id);
  }
}

// stop listeners
function stopClanListeners() {
  if (clanListenerUnsub) { clanListenerUnsub(); clanListenerUnsub = null; }
  if (bossListenerUnsub) { bossListenerUnsub(); bossListenerUnsub = null; }
  if (msgsListenerUnsub) { msgsListenerUnsub(); msgsListenerUnsub = null; }
  bossTimerEl.textContent = '—';
  bossHpBar.style.width = '0%';
  bossInfoEl.textContent = 'No boss';
  messagesEl.innerHTML = '';
}

// setup clan listeners
function setupClanListeners(id) {
  stopClanListeners();
  if (firebaseAvailable) {
    // clan doc
    clanListenerUnsub = db.collection('clans').doc(id).onSnapshot(snap => {
      if (!snap.exists) return;
      const data = snap.data();
      clanInfoEl.innerHTML = `Clan: ${data.name} <br/> Leader: ${data.leader} <br/> ID: ${snap.id}`;
    });

    // boss doc
    const bossRef = db.collection('clans').doc(id).collection('boss').doc('current');
    bossListenerUnsub = bossRef.onSnapshot(async snap => {
      if (!snap.exists) {
        // spawn initial boss
        await bossRef.set({
          hp: 1000,
          maxHp: 1000,
          startedAt: Date.now(),
          endsAt: Date.now() + 30 * 1000,
          totalDamage: 0,
          soulsReward: 10,
          finishedAt: null
        });
        return;
      }
      const b = snap.data();
      bossInfoEl.textContent = b.finishedAt ? `Boss defeated!` : `Boss HP: ${b.hp} / ${b.maxHp}`;
      bossHpBar.style.width = Math.max(0, (b.hp / b.maxHp) * 100) + '%';
      if (!b.finishedAt) updateBossTimer(new Date(b.endsAt));
      else bossTimerEl.textContent = 'Finished';
    });

    // messages
    msgsListenerUnsub = db.collection('clans').doc(id).collection('messages').orderBy('time', 'asc').onSnapshot(snap => {
      messagesEl.innerHTML = '';
      snap.forEach(d => {
        const m = d.data();
        const div = document.createElement('div');
        div.textContent = `${m.user.substring(0,6)}: ${m.text}`;
        messagesEl.appendChild(div);
      });
      messagesEl.scrollTop = messagesEl.scrollHeight;
    });

  } else {
    // Local-mode clan data
    const clans = localClans();
    // ensure boss exists
    if (!clans[id].boss) {
      clans[id].boss = {
        hp: 500,
        maxHp: 500,
        endsAt: Date.now() + 30*1000,
        totalDamage: 0,
        soulsReward: 5,
        finishedAt: null,
        players: {}
      };
      saveLocalClans(clans);
    }
    // show initial
    const b = clans[id].boss;
    bossInfoEl.textContent = b.finishedAt ? `Boss defeated!` : `Boss HP: ${b.hp} / ${b.maxHp}`;
    bossHpBar.style.width = Math.max(0, (b.hp / b.maxHp) * 100) + '%';
    updateLocalBossTimer(id);
    // messages (local)
    messagesEl.innerHTML = '';
    (clans[id].messages || []).forEach(m => {
      const div = document.createElement('div');
      div.textContent = `${m.user.substring(0,6)}: ${m.text}`;
      messagesEl.appendChild(div);
    });
  }
}

// attack boss
document.getElementById('attackBossBtn').addEventListener('click', async () => {
  if (!currentClanId) return alert('Join a clan first');
  if (Date.now() - lastAttackTime < 300) return; // throttle
  lastAttackTime = Date.now();

  const damage = Math.max(1, Math.floor(clickDmg + dps * 0.2));

  if (firebaseAvailable) {
    const bossRef = db.collection('clans').doc(currentClanId).collection('boss').doc('current');
    try {
      await db.runTransaction(async tx => {
        const snap = await tx.get(bossRef);
        if (!snap.exists) throw 'No boss';
        const b = snap.data();
        if (b.finishedAt) return;
        const newHp = Math.max(0, b.hp - damage);
        tx.update(bossRef, { hp: newHp, totalDamage: (b.totalDamage||0) + damage });
        // record player damage
        const pRef = bossRef.collection('players').doc(uid);
        const pSnap = await tx.get(pRef);
        const prev = pSnap.exists ? (pSnap.data().damage || 0) : 0;
        tx.set(pRef, { damage: prev + damage }, { merge: true });
        if (newHp === 0) {
          tx.update(bossRef, { finishedAt: Date.now() });
        }
      });
    } catch (e) { console.warn(e); }
  } else {
    const clans = localClans();
    const b = clans[currentClanId].boss;
    if (b.finishedAt) return;
    b.hp = Math.max(0, b.hp - damage);
    b.totalDamage = (b.totalDamage || 0) + damage;
    b.players[uid] = (b.players[uid] || 0) + damage;
    if (b.hp === 0) {
      b.finishedAt = Date.now();
    }
    clans[currentClanId].boss = b;
    saveLocalClans(clans);
    setupClanListeners(currentClanId); // refresh local UI
  }
});

// claim reward
document.getElementById('claimRewardBtn').addEventListener('click', async () => {
  if (!currentClanId) return alert('Join a clan first');

  if (firebaseAvailable) {
    const bossRef = db.collection('clans').doc(currentClanId).collection('boss').doc('current');
    try {
      await db.runTransaction(async tx => {
        const bSnap = await tx.get(bossRef);
        if (!bSnap.exists) throw 'No boss';
        const b = bSnap.data();
        if (!b.finishedAt) throw 'Boss not finished';
        const pRef = bossRef.collection('players').doc(uid);
        const pSnap = await tx.get(pRef);
        if (!pSnap.exists) throw 'No contribution recorded';
        if (pSnap.data().claimed) throw 'Already claimed';
        const playerDamage = pSnap.data().damage || 0;
        const totalDamage = b.totalDamage || 1;
        const reward = Math.floor((playerDamage / totalDamage) * (b.soulsReward || 0));
        // mark claimed and add to user's souls in users collection
        tx.set(pRef, { claimed: true, rewarded: reward }, { merge: true });
        const userRef = db.collection('users').doc(uid);
        const userSnap = await tx.get(userRef);
        const currentSouls = userSnap.exists ? (userSnap.data().souls || 0) : 0;
        tx.set(userRef, { souls: currentSouls + reward }, { merge: true });
        // Also update local UI
        souls += reward;
        saveAll();
        render();
        alert(`Claimed ${reward} souls.`);
      });
    } catch (e) { alert('Claim failed: ' + e); }
  } else {
    const clans = localClans();
    const b = clans[currentClanId].boss;
    if (!b || !b.finishedAt) return alert('No finished boss to claim');
    const playerDamage = b.players[uid] || 0;
    if (!playerDamage) return alert('You did no damage');
    if (b.claimed && b.claimed[uid]) return alert('Already claimed');
    const totalDamage = b.totalDamage || 1;
    const reward = Math.floor((playerDamage / totalDamage) * (b.soulsReward || 0));
    souls += reward;
    b.claimed = b.claimed || {};
    b.claimed[uid] = true;
    clans[currentClanId].boss = b;
    saveLocalClans(clans);
    saveAll();
    render();
    alert(`Claimed ${reward} souls (local).`);
  }
});

// chat send
document.getElementById('sendMsgBtn').addEventListener('click', async () => {
  if (!currentClanId) return alert('Join a clan first');
  const txt = document.getElementById('msgInput').value.trim();
  if (!txt) return;
  if (firebaseAvailable) {
    await db.collection('clans').doc(currentClanId).collection('messages').add({ text: txt, user: uid, time: Date.now() });
  } else {
    const clans = localClans();
    clans[currentClanId].messages = clans[currentClanId].messages || [];
    clans[currentClanId].messages.push({ text: txt, user: uid, time: Date.now() });
    saveLocalClans(clans);
    setupClanListeners(currentClanId);
  }
  document.getElementById('msgInput').value = '';
});

// --------- Boss timers (firebase & local handlers) ----------
function updateBossTimer(endsAtDate) {
  if (!endsAtDate) { bossTimerEl.textContent = '—'; return; }
  const id = setInterval(() => {
    const now = Date.now();
    const diff = endsAtDate - now;
    if (diff <= 0) {
      bossTimerEl.textContent = 'Fight ended. Claim rewards if any!';
      clearInterval(id);
      // For firebase mode: if boss not finished, mark finished and compute results
      if (firebaseAvailable) {
        const bossRef = db.collection('clans').doc(currentClanId).collection('boss').doc('current');
        bossRef.get().then(snap => {
          if (!snap.exists) return;
          const b = snap.data();
          if (!b.finishedAt) {
            // mark finished (no special action, players may have killed earlier)
            bossRef.update({ finishedAt: Date.now() });
          }
        });
      } else {
        // local: if boss still alive but timer reached zero, mark finished and set finishedAt
        const clans = localClans();
        const b = clans[currentClanId].boss;
        if (b && !b.finishedAt) {
          if (b.hp <= 0) b.finishedAt = Date.now();
          else {
            // if not killed, mark finished and leave hp as is (partial)
            b.finishedAt = Date.now();
          }
          clans[currentClanId].boss = b;
          saveLocalClans(clans);
        }
      }
      return;
    }
    const h = Math.floor(diff / 3600000);
    const m = Math.floor((diff % 3600000) / 60000);
    const s = Math.floor((diff % 60000) / 1000);
    bossTimerEl.textContent = `${h}h ${m}m ${s}s`;
  }, 1000);
}

function updateLocalBossTimer(clanId) {
  const id = setInterval(() => {
    const clans = localClans();
    const b = clans[clanId].boss;
    if (!b) { bossTimerEl.textContent = '—'; clearInterval(id); return; }
    const diff = b.endsAt - Date.now();
    if (diff <= 0) {
      bossTimerEl.textContent = 'Fight ended';
      clearInterval(id);
      if (!b.finishedAt) {
        if (b.hp <= 0) b.finishedAt = Date.now();
        else b.finishedAt = Date.now();
        clans[clanId].boss = b;
        saveLocalClans(clans);
      }
      return;
    }
    const h = Math.floor(diff / 3600000);
    const m = Math.floor((diff % 3600000) / 60000);
    const s = Math.floor((diff % 60000) / 1000);
    bossTimerEl.textContent = `${h}h ${m}m ${s}s`;
  }, 1000);
}

// spawn a local boss (for single-player testing)
function spawnLocalBoss() {
  if (!currentClanId) return;
  if (firebaseAvailable) {
    const bossRef = db.collection('clans').doc(currentClanId).collection('boss').doc('current');
    bossRef.set({
      hp: 1000 + stage * 10,
      maxHp: 1000 + stage * 10,
      startedAt: Date.now(),
      endsAt: Date.now() + 30*1000,
      totalDamage: 0,
      soulsReward: Math.max(5, Math.floor(stage/10)),
      finishedAt: null
    });
  } else {
    const clans = localClans();
    const b = {
      hp: Math.floor(500 + stage * 8),
      maxHp: Math.floor(500 + stage * 8),
      endsAt: Date.now() + 30*1000,
      totalDamage: 0,
      soulsReward: Math.max(3, Math.floor(stage/10)),
      finishedAt: null,
      players: {}
    };
    clans[currentClanId].boss = b;
    saveLocalClans(clans);
    setupClanListeners(currentClanId);
  }
}

// If user clicks "Open Console", show helpful instructions
document.getElementById('openConsole').addEventListener('click', () => {
  console.clear();
  console.log('Kerwill Demo — Console Help');
  console.log('uid:', uid);
  console.log('To enable online clans: set firebaseConfig in clan.js to your Firebase config.');
  alert('Console opened. See devtools console for info.');
});

// initial save/load
saveAll();
render();
