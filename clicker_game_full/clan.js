// clan.js — Clicker + Clans + Boss + Firebase
// -----------------------------------------------------------
// 1. Firebase CONFIG
// -----------------------------------------------------------
const firebaseConfig = {
  apiKey: "AIzaSyCr-8FgUsREG3_Ruw_fCXnblUGlpUAE2z8",
  authDomain: "clicker-heroes-ecbfe.firebaseapp.com",
  projectId: "clicker-heroes-ecbfe",
  storageBucket: "clicker-heroes-ecbfe.firebasestorage.app",
  messagingSenderId: "328719492430",
  appId: "1:328719492430:web:4cf12fce6912c44a62ea1f",
  measurementId: "G-H5C31LEE5X"
};

// -----------------------------------------------------------
// 2. Initialize Firebase
// -----------------------------------------------------------
firebase.initializeApp(firebaseConfig);
const auth = firebase.auth();
const db = firebase.firestore();

// Anonymous auth helper
async function initAuth() {
  const userCredential = await auth.signInAnonymously();
  return userCredential.user.uid;
}

window._firebase = { auth, db, initAuth };

// -----------------------------------------------------------
// 3. Main Game & Clan logic
// -----------------------------------------------------------
(async function () {
  let uid;
  try {
    uid = await initAuth();
    document.getElementById('accountStatus').textContent = `Signed in (anon): ${uid}`;
  } catch (e) {
    alert('Firebase sign-in failed: ' + e);
    console.error(e);
    return;
  }

  // ---------- Player / Game state ----------
  let gold = Number(localStorage.getItem('gold') || 0);
  let souls = Number(localStorage.getItem('souls') || 0);
  let clickDmg = Number(localStorage.getItem('clickDmg') || 1);
  let dps = Number(localStorage.getItem('dps') || 0);

  const goldEl = document.getElementById('gold');
  const soulsEl = document.getElementById('souls');
  const clickDmgEl = document.getElementById('clickDmg');
  const dpsEl = document.getElementById('dps');
  const hpText = document.getElementById('hpText');

  let monsterMaxHp = Number(localStorage.getItem('monsterMaxHp') || 100);
  let monsterHp = Number(localStorage.getItem('monsterHp') || monsterMaxHp);
  let monsterName = localStorage.getItem('monsterName') || 'Slime';

  let costClickUpgrade = 25;
  let costDpsUnit = 50;

  function saveLocal() {
    localStorage.setItem('gold', gold);
    localStorage.setItem('souls', souls);
    localStorage.setItem('clickDmg', clickDmg);
    localStorage.setItem('dps', dps);
    localStorage.setItem('monsterHp', monsterHp);
    localStorage.setItem('monsterMaxHp', monsterMaxHp);
    localStorage.setItem('monsterName', monsterName);
    render();
  }

  function loadLocal() {
    gold = Number(localStorage.getItem('gold') || 0);
    souls = Number(localStorage.getItem('souls') || 0);
    clickDmg = Number(localStorage.getItem('clickDmg') || 1);
    dps = Number(localStorage.getItem('dps') || 0);
    monsterMaxHp = Number(localStorage.getItem('monsterMaxHp') || 100);
    monsterHp = Number(localStorage.getItem('monsterHp') || monsterMaxHp);
    monsterName = localStorage.getItem('monsterName') || 'Slime';
    render();
  }

  function render() {
    goldEl.textContent = gold;
    soulsEl.textContent = souls;
    clickDmgEl.textContent = clickDmg;
    dpsEl.textContent = dps;
    hpText.textContent = `${monsterHp} / ${monsterMaxHp}`;
    document.getElementById('costClickUpgrade').textContent = costClickUpgrade;
    document.getElementById('costDpsUnit').textContent = costDpsUnit;
  }

  // Player attack
  document.getElementById('attackBtn').addEventListener('click', () => {
    monsterHp -= clickDmg;
    if (monsterHp <= 0) defeatMonster();
    render();
  });

  setInterval(() => {
    if (dps > 0) {
      monsterHp -= dps;
      if (monsterHp <= 0) defeatMonster();
      render();
    }
  }, 1000);

  function defeatMonster() {
    const rewardGold = Math.max(1, Math.floor(monsterMaxHp / 10));
    gold += rewardGold;
    if (Math.random() < 0.05) souls += 1;
    monsterMaxHp = Math.floor(monsterMaxHp * 1.15) + 10;
    monsterHp = monsterMaxHp;
    monsterName = 'Monster Lv' + Math.floor(Math.log(monsterMaxHp));
    render();
  }

  // Upgrades
  document.getElementById('buyClickUpgrade').addEventListener('click', () => {
    if (gold >= costClickUpgrade) {
      gold -= costClickUpgrade;
      clickDmg += 1;
      costClickUpgrade = Math.floor(costClickUpgrade * 1.8);
      render();
    }
  });

  document.getElementById('buyDpsUnit').addEventListener('click', () => {
    if (gold >= costDpsUnit) {
      gold -= costDpsUnit;
      dps += 1;
      costDpsUnit = Math.floor(costDpsUnit * 1.6);
      render();
    }
  });

  document.getElementById('saveBtn').addEventListener('click', saveLocal);
  document.getElementById('loadBtn').addEventListener('click', loadLocal);
  render();

  // ---------- Clan System ----------
  const clanNameInput = document.getElementById('clanNameInput');
  const createClanBtn = document.getElementById('createClanBtn');
  const joinClanInput = document.getElementById('joinClanInput');
  const joinClanBtn = document.getElementById('joinClanBtn');
  const leaveClanBtn = document.getElementById('leaveClanBtn');
  const clanInfo = document.getElementById('clanInfo');
  const attackBossBtn = document.getElementById('attackBossBtn');
  const claimRewardBtn = document.getElementById('claimRewardBtn');
  const bossInfo = document.getElementById('bossInfo');
  const messagesEl = document.getElementById('messages');
  const msgInput = document.getElementById('msgInput');
  const sendMsgBtn = document.getElementById('sendMsgBtn');

  let currentClanId = null;
  let clanUnsub = null,
    bossUnsub = null,
    msgsUnsub = null;
  let lastAttack = 0;

  function alertError(e) {
    console.error(e);
  }

  // Create a clan
  createClanBtn.addEventListener('click', async () => {
    const name = clanNameInput.value.trim();
    if (!name) return;
    try {
      const doc = await db.collection('clans').add({
        name,
        leader: uid,
        members: [uid],
        createdAt: firebase.firestore.FieldValue.serverTimestamp()
      });
      await joinClan(doc.id);
    } catch (e) {
      alertError(e);
    }
  });

  // Join a clan
  joinClanBtn.addEventListener('click', async () => {
    const id = joinClanInput.value.trim();
    if (!id) return;
    try {
      await joinClan(id);
    } catch (e) {
      alertError(e);
    }
  });

  // Leave clan
  leaveClanBtn.addEventListener('click', async () => {
    if (!currentClanId) return;
    try {
      const ref = db.collection('clans').doc(currentClanId);
      await db.runTransaction(async (tx) => {
        const snap = await tx.get(ref);
        if (!snap.exists) return;
        const data = snap.data();
        const members = (data.members || []).filter((m) => m !== uid);
        let leader = data.leader;
        if (leader === uid) leader = members[0] || null;
        tx.update(ref, { members, leader });
      });
      unsubscribeClan();
    } catch (e) {
      alertError(e);
    }
  });

  function unsubscribeClan() {
    if (clanUnsub) clanUnsub();
    if (bossUnsub) bossUnsub();
    if (msgsUnsub) msgsUnsub();
    currentClanId = null;
    clanInfo.textContent = 'No clan';
    bossInfo.textContent = 'No boss';
    messagesEl.innerHTML = '';
  }

  // Subscribe to a clan
  function subscribeToClan(id) {
    if (clanUnsub) clanUnsub();
    const ref = db.collection('clans').doc(id);

    // Display clan info
    clanUnsub = ref.onSnapshot((snap) => {
      if (!snap.exists) return;
      const data = snap.data();
      clanInfo.innerHTML = `Clan: ${data.name} <br/> Leader: ${data.leader} <br/> Members: ${JSON.stringify(data.members)} <br/> ID: ${snap.id}`;
    });

    // Boss setup with 24-hour reset
    const bossRef = ref.collection('boss').doc('current');
    bossUnsub = bossRef.onSnapshot(async (snap) => {
      let reset = false;
      if (!snap.exists) {
        reset = true;
      } else {
        const b = snap.data();
        if (!b.expiresAt || b.expiresAt.toDate() < new Date()) reset = true;
      }

      if (reset) {
        await bossRef.set({
          hp: 1000,
          maxHp: 1000,
          createdAt: firebase.firestore.FieldValue.serverTimestamp(),
          expiresAt: firebase.firestore.Timestamp.fromDate(new Date(Date.now() + 24 * 3600 * 1000)),
          soulsReward: 50,
          totalDamage: 0
        });
      } else {
        const b = snap.data();
        bossInfo.innerHTML = `HP: ${b.hp} / ${b.maxHp} <br/> Souls Reward: ${b.soulsReward || 0}`;
      }
    });

    // Messages
    msgsUnsub = ref
      .collection('messages')
      .orderBy('createdAt', 'desc')
      .limit(100)
      .onSnapshot((snap) => {
        messagesEl.innerHTML = '';
        snap.docs.slice().reverse().forEach((d) => {
          const m = d.data();
          const time = m.createdAt ? new Date(m.createdAt.toMillis()).toLocaleTimeString() : '';
          const el = document.createElement('div');
          el.textContent = `[${time}] ${m.uid.substring(0, 6)}: ${m.text}`;
          messagesEl.appendChild(el);
        });
      });

    currentClanId = id;
  }

  // Join clan helper
  async function joinClan(id) {
    const ref = db.collection('clans').doc(id);
    await db.runTransaction(async (tx) => {
      const snap = await tx.get(ref);
      if (!snap.exists) throw 'Clan not found';
      const data = snap.data();
      const members = data.members || [];
      if (!members.includes(uid)) members.push(uid);
      tx.update(ref, { members });
    });
    subscribeToClan(id);
  }

  // ----------------------------------------------------------
  // FIXED ATTACK BOSS (only this changed)
  // ----------------------------------------------------------
  attackBossBtn.addEventListener('click', async () => {
    if (!currentClanId) return;
    const now = Date.now();
    if (now - lastAttack < 1500) return;
    lastAttack = now;

    const bossRef = db.collection('clans')
      .doc(currentClanId)
      .collection('boss')
      .doc('current');

    const damage = Math.max(1, Math.floor(clickDmg + dps * 0.2));

    try {
      await db.runTransaction(async (tx) => {
        // READS FIRST --------------
        const bSnap = await tx.get(bossRef);
        if (!bSnap.exists) throw "No boss active";
        const b = bSnap.data();

        const pRef = bossRef.collection("players").doc(uid);
        const pSnap = await tx.get(pRef);
        const existingDamage = pSnap.exists ? (pSnap.data().damage || 0) : 0;

        // CALCULATE before writing
        const newHp = Math.max(0, b.hp - damage);

        // WRITES SECOND ------------
        tx.update(bossRef, {
          hp: newHp,
          totalDamage: (b.totalDamage || 0) + damage
        });

        tx.set(
          pRef,
          { uid, damage: existingDamage + damage },
          { merge: true }
        );

        if (newHp === 0) {
          tx.update(bossRef, {
            finishedAt: firebase.firestore.FieldValue.serverTimestamp()
          });
        }
      });
    } catch (e) {
      alertError(e);
    }
  });

  // ----------------------------------------------------------
  // FIXED CLAIM REWARD (only this changed)
  // ----------------------------------------------------------
  claimRewardBtn.addEventListener('click', async () => {
    if (!currentClanId) return;

    const bossRef = db.collection("clans")
      .doc(currentClanId)
      .collection("boss")
      .doc("current");

    try {
      await db.runTransaction(async (tx) => {
        // READS FIRST --------------------------
        const bSnap = await tx.get(bossRef);
        if (!bSnap.exists) throw "No boss";
        const b = bSnap.data();
        if (!b.finishedAt) throw "Boss not finished yet";

        const pRef = bossRef.collection("players").doc(uid);
        const pSnap = await tx.get(pRef);
        if (!pSnap.exists) throw "No damage recorded";

        const pd = pSnap.data();
        if (pd.claimed) throw "Already claimed";

        const playerDamage = pd.damage || 0;
        const totalDamage = b.totalDamage || 1;

        const reward = Math.floor((playerDamage / totalDamage) * (b.soulsReward || 0));

        const userRef = db.collection("users").doc(uid);
        const userSnap = await tx.get(userRef);
        const currentSouls = userSnap.exists ? (userSnap.data().souls || 0) : 0;

        // WRITES SECOND ------------------------
        tx.update(pRef, { claimed: true, rewarded: reward });
        tx.set(userRef, { souls: currentSouls + reward }, { merge: true });
      });
    } catch (e) {
      alertError(e);
    }
  });

  // Send message
  sendMsgBtn.addEventListener('click', async () => {
    if (!currentClanId) return;
    const txt = msgInput.value.trim();
    if (!txt) return;
    try {
      await db.collection('clans').doc(currentClanId).collection('messages').add({
        uid,
        text: txt,
        createdAt: firebase.firestore.FieldValue.serverTimestamp()
      });
      msgInput.value = '';
    } catch (e) {
      alertError(e);
    }
  });

  // Auto-save local periodically
  setInterval(saveLocal, 30000);
})();

