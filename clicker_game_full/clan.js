// clan.js — Clicker + Clans + Boss + Firebase + Stage Counter
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
  let stage = Number(localStorage.getItem('stage') || 1); // <-- STAGE COUNTER

  const goldEl = document.getElementById('gold');
  const soulsEl = document.getElementById('souls');
  const clickDmgEl = document.getElementById('clickDmg');
  const dpsEl = document.getElementById('dps');
  const hpText = document.getElementById('hpText');

  const stageEl = document.getElementById('stage') || (() => { // create if missing
    const el = document.createElement('div');
    el.id = 'stage';
    el.style.fontWeight = 'bold';
    el.style.marginBottom = '4px';
    document.body.insertBefore(el, document.getElementById('monsterBox'));
    return el;
  })();

  let monsterMaxHp = Number(localStorage.getItem('monsterMaxHp') || 50); // smaller health
  let monsterHp = Number(localStorage.getItem('monsterHp') || monsterMaxHp);
  let monsterName = localStorage.getItem('monsterName') || 'Slime';

  let costClickUpgrade = 15; // lower progression
  let costDpsUnit = 30;

  function saveLocal() {
    localStorage.setItem('gold', gold);
    localStorage.setItem('souls', souls);
    localStorage.setItem('clickDmg', clickDmg);
    localStorage.setItem('dps', dps);
    localStorage.setItem('monsterHp', monsterHp);
    localStorage.setItem('monsterMaxHp', monsterMaxHp);
    localStorage.setItem('monsterName', monsterName);
    localStorage.setItem('stage', stage); // save stage
    render();
  }

  function loadLocal() {
    gold = Number(localStorage.getItem('gold') || 0);
    souls = Number(localStorage.getItem('souls') || 0);
    clickDmg = Number(localStorage.getItem('clickDmg') || 1);
    dps = Number(localStorage.getItem('dps') || 0);
    monsterMaxHp = Number(localStorage.getItem('monsterMaxHp') || 50);
    monsterHp = Number(localStorage.getItem('monsterHp') || monsterMaxHp);
    monsterName = localStorage.getItem('monsterName') || 'Slime';
    stage = Number(localStorage.getItem('stage') || 1); // load stage
    render();
  }

  function render() {
    goldEl.textContent = gold;
    soulsEl.textContent = souls;
    clickDmgEl.textContent = clickDmg;
    dpsEl.textContent = dps;
    hpText.textContent = `${monsterHp} / ${monsterMaxHp}`;
    stageEl.textContent = `Stage: ${stage}`; // <-- render stage
    document.getElementById('costClickUpgrade').textContent = costClickUpgrade;
    document.getElementById('costDpsUnit').textContent = costDpsUnit;

    // Monster HP bar
    const bar = document.getElementById('monsterHpBar');
    if (bar) bar.style.width = `${(monsterHp / monsterMaxHp) * 100}%`;
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

    monsterMaxHp = Math.floor(monsterMaxHp * 1.12) + 5;
    monsterHp = monsterMaxHp;
    monsterName = 'Monster Lv' + stage;

    stage++; // <-- increment stage
    render();
  }

  // Upgrades
  document.getElementById('buyClickUpgrade').addEventListener('click', () => {
    if (gold >= costClickUpgrade) {
      gold -= costClickUpgrade;
      clickDmg += 1;
      costClickUpgrade = Math.floor(costClickUpgrade * 1.5); // slower progression
      render();
    }
  });

  document.getElementById('buyDpsUnit').addEventListener('click', () => {
    if (gold >= costDpsUnit) {
      gold -= costDpsUnit;
      dps += 1;
      costDpsUnit = Math.floor(costDpsUnit * 1.4); // slower progression
      render();
    }
  });

  document.getElementById('saveBtn').addEventListener('click', saveLocal);
  document.getElementById('loadBtn').addEventListener('click', loadLocal);
  render();

  // ----------------------------------------------------------
  // The rest of your clan.js remains unchanged
  // ----------------------------------------------------------
  // [All your clan creation, joining, leaving, boss, chat, etc.]
  // ----------------------------------------------------------
})();
