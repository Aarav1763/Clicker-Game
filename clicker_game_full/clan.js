// clan.js — Full Clicker Game + Stages (10 monsters/stage) + Bosses (every 5th stage) + Primals (>=100) + Heroes (Ivan w/ PintOfAle & PowerSurge) + Clans
// --------------------------------------------------------------------------------------------
// Firebase config (unchanged)
const firebaseConfig = {
  apiKey: "AIzaSyCr-8FgUsREG3_Ruw_fCXnblUGlpUAE2z8",
  authDomain: "clicker-heroes-ecbfe.firebaseapp.com",
  projectId: "clicker-heroes-ecbfe",
  storageBucket: "clicker-heroes-ecbfe.firebasestorage.app",
  messagingSenderId: "328719492430",
  appId: "1:328719492430:web:4cf12fce6912c44a62ea1f",
  measurementId: "G-H5C31LEE5X"
};

// Initialize Firebase
firebase.initializeApp(firebaseConfig);
const auth = firebase.auth();
const db = firebase.firestore();

// Anonymous auth helper
async function initAuth() {
  const userCredential = await auth.signInAnonymously();
  return userCredential.user.uid;
}

window._firebase = { auth, db, initAuth };

// --------------------------------------------------------------------------------------------
// Main
(async function () {
  // --- Auth
  let uid;
  try {
    uid = await initAuth();
    document.getElementById('accountStatus').textContent = `Signed in (anon): ${uid}`;
  } catch (e) {
    alert('Firebase sign-in failed: ' + e);
    console.error(e);
    return;
  }

  // ---------- Player state (persisted)
  let gold = Number(localStorage.getItem('gold') || 0);
  let souls = Number(localStorage.getItem('souls') || 0);
  let clickDmgBase = Number(localStorage.getItem('clickDmg') || 1);
  // note: clickDmg displayed is base; some ancients/abilities modify effective click damage
  // dps is calculated from heroes (no generic dps unit)
  let stage = Number(localStorage.getItem('stage') || 1);
  let killsThisStage = Number(localStorage.getItem('killsThisStage') || 0);

  // Monster
  let monsterMaxHp = Number(localStorage.getItem('monsterMaxHp') || 50);
  let monsterHp = Number(localStorage.getItem('monsterHp') || monsterMaxHp);
  let monsterName = localStorage.getItem('monsterName') || 'Slime';
  // flags
  let isBossMob = false;
  let isPrimal = false;

  // upgrade costs (click upgrades still exist)
  let costClickUpgrade = Number(localStorage.getItem('costClickUpgrade') || 15);
  // We removed generic DPS unit; hero leveling uses hero.cost
  // UI refs
  const goldEl = document.getElementById('gold');
  const soulsEl = document.getElementById('souls');
  const clickDmgEl = document.getElementById('clickDmg');
  const dpsEl = document.getElementById('dps');
  const hpText = document.getElementById('hpText');
  const monsterNameEl = document.getElementById('monsterName');
  const stageDisplayEl = (() => {
    // ensure stage/kills display exists in UI
    let el = document.getElementById('stageDisplay');
    if (!el) {
      el = document.createElement('div');
      el.id = 'stageDisplay';
      el.style.fontWeight = '700';
      el.style.margin = '6px 0';
      const playerPanel = document.querySelector('.panel') || document.body;
      // insert after player panel
      playerPanel.parentNode.insertBefore(el, playerPanel.nextSibling);
    }
    return el;
  })();

  // ----------------- Heroes system (Ivan + room for more)
  let heroes = JSON.parse(localStorage.getItem('heroes') || 'null');
  if (!heroes) {
    heroes = {
      ivan: {
        id: 'ivan',
        name: 'Ivan',
        level: 0,
        baseDps: 1,         // DPS per level base
        cost: 50,
        costMult: 1.15,
        // abilities
        abilities: {
          pintOfAle: {
            name: 'Pint of Ale',
            durationMs: 30000,
            cooldownMs: 120000,
            lastUsedAt: 0,
            activeUntil: 0,
            dpsMultiplier: 2 // doubles Ivan's DPS while active
          },
          powerSurge: {
            name: 'PowerSurge',
            burstDamage: 50, // instant extra damage applied on click/boss attack
            cooldownMs: 60000,
            lastUsedAt: 0
          }
        }
      }
      // Add more heroes here later following same structure
    };
  }

  // Helper: hero DPS total
  function getHeroDpsTotal() {
    // sum over all heroes: baseDps * level * active multipliers
    let total = 0;
    for (const key in heroes) {
      const h = heroes[key];
      const lvl = Number(h.level || 0);
      if (!lvl) continue;
      let mult = 1;
      // if Ivan's Pint active, apply multiplier
      if (h.abilities && h.abilities.pintOfAle) {
        const now = Date.now();
        if ((h.abilities.pintOfAle.activeUntil || 0) > now) mult *= h.abilities.pintOfAle.dpsMultiplier;
      }
      total += h.baseDps * lvl * mult;
    }
    return total;
  }

  // UI: create hero buttons area (under Upgrades panel)
  function ensureHeroUi() {
    if (document.getElementById('heroesPanel')) return;
    const upgradesPanel = Array.from(document.querySelectorAll('.panel')).find(p => p.querySelector('#buyClickUpgrade'));
    const container = document.createElement('div');
    container.id = 'heroesPanel';
    container.style.marginTop = '8px';
    container.innerHTML = `<strong>Heroes</strong><div id="heroesList" class="row" style="margin-top:6px"></div>`;
    if (upgradesPanel) upgradesPanel.appendChild(container);
    else document.body.appendChild(container);

    renderHeroes();
  }

  function renderHeroes() {
    const list = document.getElementById('heroesList');
    if (!list) return;
    list.innerHTML = '';
    for (const key in heroes) {
      const h = heroes[key];
      const item = document.createElement('div');
      item.style.border = '1px solid #eee';
      item.style.padding = '8px';
      item.style.borderRadius = '6px';
      item.style.display = 'flex';
      item.style.flexDirection = 'column';
      item.style.alignItems = 'flex-start';
      item.style.minWidth = '160px';

      const title = document.createElement('div');
      title.innerHTML = `<strong>${h.name}</strong> Lv ${h.level}`;
      item.appendChild(title);

      const sub = document.createElement('div');
      sub.style.fontSize = '12px';
      sub.className = 'muted';
      sub.textContent = `Base DPS/level: ${h.baseDps} • Cost: ${h.cost}`;
      item.appendChild(sub);

      const btnRow = document.createElement('div');
      btnRow.style.display = 'flex';
      btnRow.style.gap = '6px';
      btnRow.style.marginTop = '6px';

      const buyBtn = document.createElement('button');
      buyBtn.textContent = 'Level Up';
      buyBtn.addEventListener('click', () => {
        buyHeroLevel(key);
      });
      btnRow.appendChild(buyBtn);

      // Abilities for Ivan
      if (h.abilities) {
        for (const abKey in h.abilities) {
          const ab = h.abilities[abKey];
          const abBtn = document.createElement('button');
          abBtn.textContent = ab.name;
          abBtn.addEventListener('click', () => {
            useHeroAbility(key, abKey);
          });
          btnRow.appendChild(abBtn);
        }
      }

      item.appendChild(btnRow);
      list.appendChild(item);
    }
    // update DPS display
    if (dpsEl) dpsEl.textContent = Math.floor(getHeroDpsTotal());
  }

  function buyHeroLevel(heroId) {
    const h = heroes[heroId];
    if (!h) return;
    if (gold < h.cost) {
      alert('Not enough gold for hero level');
      return;
    }
    gold -= h.cost;
    h.level = (h.level || 0) + 1;
    h.cost = Math.floor(h.cost * h.costMult);
    saveLocal();
    render();
    renderHeroes();
  }

  function useHeroAbility(heroId, abilityKey) {
    const h = heroes[heroId];
    if (!h) return;
    const ab = h.abilities[abilityKey];
    if (!ab) return;
    const now = Date.now();
    if ((ab.lastUsedAt || 0) + (ab.cooldownMs || 0) > now) {
      alert(`${ab.name} on cooldown`);
      return;
    }
    // apply abilities
    if (abilityKey === 'pintOfAle') {
      ab.lastUsedAt = now;
      ab.activeUntil = now + (ab.durationMs || 30000);
      saveLocal();
      renderHeroes();
      render();
      alert(`${h.name} used ${ab.name} — DPS boosted for ${Math.floor((ab.durationMs||30000)/1000)}s`);
      return;
    }
    if (abilityKey === 'powerSurge') {
      ab.lastUsedAt = now;
      // powerSurge: give instantaneous burst to current monster (if not boss) or to clan boss when attacking
      applyPowerSurgeDamage(h, ab.burstDamage || 50);
      saveLocal();
      render();
      renderHeroes();
      return;
    }
  }

  function applyPowerSurgeDamage(heroObj, amount) {
    // Prefer applying to current monster. If bossActive flag implemented later, adapt accordingly.
    if (isBossMob) {
      // mark boss hp reduced (for local solo bosses)
      monsterHp = Math.max(0, monsterHp - amount);
      if (monsterHp === 0) defeatMonster();
      alert(`${heroObj.name} used PowerSurge for ${amount} damage on boss!`);
    } else {
      monsterHp = Math.max(0, monsterHp - amount);
      if (monsterHp === 0) defeatMonster();
      alert(`${heroObj.name} used PowerSurge for ${amount} damage!`);
    }
  }

  // ----------------- End heroes

  // ----------------- Utilities: save/load
  function saveLocal() {
    localStorage.setItem('gold', gold);
    localStorage.setItem('souls', souls);
    localStorage.setItem('clickDmg', clickDmgBase);
    localStorage.setItem('stage', stage);
    localStorage.setItem('killsThisStage', killsThisStage);
    localStorage.setItem('monsterHp', monsterHp);
    localStorage.setItem('monsterMaxHp', monsterMaxHp);
    localStorage.setItem('monsterName', monsterName);
    localStorage.setItem('costClickUpgrade', costClickUpgrade);
    localStorage.setItem('heroes', JSON.stringify(heroes));
  }

  function loadLocal() {
    gold = Number(localStorage.getItem('gold') || 0);
    souls = Number(localStorage.getItem('souls') || 0);
    clickDmgBase = Number(localStorage.getItem('clickDmg') || 1);
    stage = Number(localStorage.getItem('stage') || 1);
    killsThisStage = Number(localStorage.getItem('killsThisStage') || 0);
    monsterMaxHp = Number(localStorage.getItem('monsterMaxHp') || 50);
    monsterHp = Number(localStorage.getItem('monsterHp') || monsterMaxHp);
    monsterName = localStorage.getItem('monsterName') || 'Slime';
    costClickUpgrade = Number(localStorage.getItem('costClickUpgrade') || 15);
    const h = JSON.parse(localStorage.getItem('heroes') || 'null');
    if (h) heroes = h;
  }

  // ----------------- Render
  function render() {
    goldEl.textContent = Math.floor(gold);
    soulsEl.textContent = Math.floor(souls);
    clickDmgEl.textContent = Math.max(1, clickDmgBase);
    dpsEl.textContent = Math.floor(getHeroDpsTotal());
    hpText.textContent = `${Math.floor(monsterHp)} / ${Math.floor(monsterMaxHp)}`;
    monsterNameEl.textContent = monsterName;
    stageDisplayEl.textContent = `Stage ${stage} — ${killsThisStage}/10`;
    document.getElementById('costClickUpgrade').textContent = costClickUpgrade;
  }

  // ----------------- Spawn logic
  function spawnMonster(normalStage = stage) {
    isBossMob = false;
    isPrimal = false;
    // smaller base formula, scaled with stage
    const base = Math.max(20, Math.floor(50 * Math.pow(1.10, normalStage - 1)));
    monsterMaxHp = Math.floor(base);
    monsterHp = monsterMaxHp;
    monsterName = `Mob (Stage ${normalStage})`;
    render();
  }

  function spawnStageBoss(forStage = stage) {
    isBossMob = true;
    // boss HP larger: 10x base * stage factor
    const base = Math.max(100, Math.floor(50 * Math.pow(1.10, forStage - 1)));
    monsterMaxHp = Math.floor(base * 10 * (1 + forStage / 100));
    monsterHp = monsterMaxHp;
    monsterName = `Boss (Stage ${forStage})`;
    // primal spawn chance if stage >= 100
    if (forStage >= 100 && Math.random() < 0.04) { // 4% chance (tuneable)
      isPrimal = true;
      // primals are stronger
      monsterMaxHp = Math.floor(monsterMaxHp * 5);
      monsterHp = monsterMaxHp;
      monsterName = `Primal Boss (Stage ${forStage})`;
    } else {
      isPrimal = false;
    }
    render();
  }

  // ----------------- Combat loop
  document.getElementById('attackBtn').addEventListener('click', () => {
    const clickDmgEffective = Math.max(1, Math.floor(clickDmgBase)); // modify later with ancients/abilities if desired
    monsterHp -= clickDmgEffective;
    // also apply hero PowerSurge bursts? they are activated manually
    if (monsterHp <= 0) onMonsterDefeated();
    render();
    saveLocal();
  });

  // hero DPS tick
  setInterval(() => {
    const heroDps = getHeroDpsTotal();
    if (heroDps > 0) {
      monsterHp -= heroDps;
      if (monsterHp <= 0) onMonsterDefeated();
      render();
      saveLocal();
    }
    // expire ability active flags automatically on render (abilities store activeUntil)
    // nothing else needed here
  }, 1000);

  function onMonsterDefeated() {
    // reward scaling: bosses give more gold (and primals more souls)
    if (isBossMob) {
      // boss defeated
      const goldReward = Math.max(10, Math.floor(monsterMaxHp / 20));
      gold += goldReward;
      if (isPrimal) {
        // primal extra rewards
        const primalSouls = Math.max(1, Math.floor(stage / 10));
        souls += primalSouls;
        alert(`Primal defeated! +${primalSouls} souls`);
      } else {
        // normal boss soul rule: bosses from stage >=100 give souls (example)
        if (stage >= 100) {
          const bossSouls = Math.max(1, Math.floor(stage / 50)); // tuneable
          souls += bossSouls;
        }
      }
      // After boss, reset kills counter and advance to next stage
      killsThisStage = 0;
      stage += 1;
      spawnMonster(stage);
    } else {
      // normal mob defeated
      const goldReward = Math.max(1, Math.floor(monsterMaxHp / 10));
      gold += goldReward;
      // small soul chance per mob
      if (Math.random() < 0.05) souls += 1;
      killsThisStage += 1;
      if (killsThisStage >= 10) {
        // end of stage
        // if next stage is a boss (every 5th stage), spawn boss for next stage
        if ((stage + 1) % 5 === 0) {
          stage += 1;
          killsThisStage = 0;
          spawnStageBoss(stage);
        } else {
          stage += 1;
          killsThisStage = 0;
          spawnMonster(stage);
        }
      } else {
        // continue same stage: spawn next mob with slight HP increase
        monsterMaxHp = Math.floor(monsterMaxHp * 1.08) + 2;
        monsterHp = monsterMaxHp;
        monsterName = `Mob (Stage ${stage})`;
      }
    }
    saveLocal();
    render();
  }

  // ----------------- Upgrades (click upgrades only)
  document.getElementById('buyClickUpgrade').addEventListener('click', () => {
    if (gold >= costClickUpgrade) {
      gold -= costClickUpgrade;
      clickDmgBase += 1;
      costClickUpgrade = Math.floor(costClickUpgrade * 1.4); // slower growth
      saveLocal();
      render();
    } else {
      alert('Not enough gold');
    }
  });

  // We removed buyDpsUnit handler; instead hero leveling used. But leave button as a convenience to level Ivan
  const buyDpsUnitBtn = document.getElementById('buyDpsUnit');
  if (buyDpsUnitBtn) {
    buyDpsUnitBtn.textContent = `Level Ivan (Cost shown in heroes panel)`;
    buyDpsUnitBtn.addEventListener('click', () => {
      buyHeroLevel('ivan');
    });
  }

  // ----------------- Clan System (kept/fixed)
  const clanNameInput = document.getElementById('clanNameInput');
  const createClanBtn = document.getElementById('createClanBtn');
  const joinClanInput = document.getElementById('joinClanInput');
  const joinClanBtn = document.getElementById('joinClanBtn');
  const leaveClanBtn = document.getElementById('leaveClanBtn');
  const clanInfo = document.getElementById('clanInfo');
  const attackBossBtn = document.getElementById('attackBossBtn');
  const claimRewardBtn = document.getElementById('claimRewardBtn');
  const bossInfo = document.getElementById('bossInfo');
  const bossTimerEl = document.getElementById('bossTimer');
  const messagesEl = document.getElementById('messages');
  const msgInput = document.getElementById('msgInput');
  const sendMsgBtn = document.getElementById('sendMsgBtn');

  let currentClanId = null;
  let clanUnsub = null, bossUnsub = null, msgsUnsub = null;
  let lastAttack = 0;

  function alertError(e) { console.error(e); }

  function unsubscribeClan() {
    if (clanUnsub) clanUnsub();
    if (bossUnsub) bossUnsub();
    if (msgsUnsub) msgsUnsub();
    currentClanId = null;
    clanInfo.textContent = 'No clan';
    bossInfo.textContent = 'No boss';
    bossTimerEl.textContent = '';
    messagesEl.innerHTML = '';
  }

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
    } catch (e) { alertError(e); }
  });

  joinClanBtn.addEventListener('click', async () => {
    const id = joinClanInput.value.trim();
    if (!id) return;
    try { await joinClan(id); } catch (e) { alertError(e); }
  });

  leaveClanBtn.addEventListener('click', async () => {
    if (!currentClanId) return;
    try {
      const ref = db.collection('clans').doc(currentClanId);
      await db.runTransaction(async (tx) => {
        const snap = await tx.get(ref);
        if (!snap.exists) return;
        const data = snap.data();
        const members = (data.members || []).filter(m => m !== uid);
        let leader = data.leader;
        if (leader === uid) leader = members[0] || null;
        tx.update(ref, { members, leader });
      });
      unsubscribeClan();
    } catch (e) { alertError(e); }
  });

  function subscribeToClan(id) {
    if (clanUnsub) clanUnsub();
    const ref = db.collection('clans').doc(id);

    // Clan info
    clanUnsub = ref.onSnapshot(snap => {
      if (!snap.exists) return;
      const data = snap.data();
      clanInfo.innerHTML = `Clan: ${data.name} <br/> Leader: ${data.leader} <br/> Members: ${JSON.stringify(data.members)} <br/> ID: ${snap.id}`;
    });

    // Boss with 24h reset
    const bossRef = ref.collection('boss').doc('current');
    bossUnsub = bossRef.onSnapshot(async snap => {
      let reset = false;
      if (!snap.exists) reset = true;
      else {
        const b = snap.data();
        if (!b.expiresAt || b.expiresAt.toDate() < new Date()) reset = true;
      }
      if (reset) {
        await bossRef.set({
          hp: 500,
          maxHp: 500,
          totalDamage: 0,
          soulsReward: 50,
          createdAt: firebase.firestore.FieldValue.serverTimestamp(),
          expiresAt: firebase.firestore.Timestamp.fromDate(new Date(Date.now() + 24*3600*1000))
        });
      } else {
        const b = snap.data();
        bossInfo.innerHTML = `HP: ${b.hp} / ${b.maxHp} <br/> Souls Reward: ${b.soulsReward}`;
        updateBossTimer(b.expiresAt.toDate());
      }
    });

    // Messages
    msgsUnsub = ref.collection('messages')
      .orderBy('createdAt', 'desc')
      .limit(100)
      .onSnapshot(snap => {
        messagesEl.innerHTML = '';
        snap.docs.slice().reverse().forEach(d => {
          const m = d.data();
          const time = m.createdAt ? new Date(m.createdAt.toMillis()).toLocaleTimeString() : '';
          const el = document.createElement('div');
          el.textContent = `[${time}] ${m.uid.substring(0,6)}: ${m.text}`;
          messagesEl.appendChild(el);
        });
      });

    currentClanId = id;
  }

  attackBossBtn.addEventListener('click', async () => {
    if (!currentClanId) return;
    const now = Date.now();
    if (now - lastAttack < 1500) return;
    lastAttack = now;

    const bossRef = db.collection('clans').doc(currentClanId).collection('boss').doc('current');
    // damage from click + heroDps contribution (scaled)
    const damage = Math.max(1, Math.floor(clickDmgBase + getHeroDpsTotal() * 0.25));

    try {
      await db.runTransaction(async tx => {
        const bSnap = await tx.get(bossRef);
        if (!bSnap.exists) throw "No boss active";
        const b = bSnap.data();
        const newHp = Math.max(0, b.hp - damage);
        tx.update(bossRef, { hp: newHp, totalDamage: (b.totalDamage||0)+damage });
        // save player's personal damage entry
        const pRef = bossRef.collection('players').doc(uid);
        const pSnap = await tx.get(pRef);
        const existingDamage = pSnap.exists ? (pSnap.data().damage || 0) : 0;
        tx.set(pRef, { uid, damage: existingDamage + damage }, { merge: true });
        if (newHp===0) tx.update(bossRef,{ finishedAt: firebase.firestore.FieldValue.serverTimestamp() });
      });
    } catch(e){ alertError(e); }
  });

  claimRewardBtn.addEventListener('click', async () => {
    if (!currentClanId) return;
    const bossRef = db.collection('clans').doc(currentClanId).collection('boss').doc('current');
    try {
      await db.runTransaction(async tx => {
        const bSnap = await tx.get(bossRef);
        if(!bSnap.exists) throw "No boss";
        const b = bSnap.data();
        if(!b.finishedAt) throw "Boss not finished yet";

        const pRef = bossRef.collection('players').doc(uid);
        const pSnap = await tx.get(pRef);
        if(!pSnap.exists) throw "No damage recorded";

        const pd = pSnap.data();
        if(pd.claimed) throw "Already claimed";

        const playerDamage = pd.damage || 0;
        const totalDamage = b.totalDamage || 1;
        const reward = Math.floor((playerDamage / totalDamage) * (b.soulsReward || 0));

        // Write claimed and give local souls
        tx.update(pRef, { claimed: true, rewarded: reward });
        const userRef = db.collection('users').doc(uid);
        const userSnap = await tx.get(userRef);
        const currentSouls = userSnap.exists ? (userSnap.data().souls || 0) : 0;
        tx.set(userRef, { souls: currentSouls + reward }, { merge: true });

        // Also update local client immediately (so UI shows it)
        souls += reward;
        saveLocal();
        render();
      });
    } catch(e){ alertError(e); }
  });

  sendMsgBtn.addEventListener('click', async () => {
    if(!currentClanId) return;
    const txt = msgInput.value.trim(); if(!txt) return;
    try {
      await db.collection('clans').doc(currentClanId).collection('messages').add({
        uid,
        text: txt,
        createdAt: firebase.firestore.FieldValue.serverTimestamp()
      });
      msgInput.value = '';
    } catch(e){ alertError(e); }
  });

  function updateBossTimer(expiresAt){
    // clear any previous interval by storing it on element
    if (bossTimerEl._interval) clearInterval(bossTimerEl._interval);
    bossTimerEl._interval = setInterval(()=> {
      const now = new Date();
      const diff = expiresAt - now;
      if (diff <= 0) {
        bossTimerEl.textContent = "Boss ready!";
        clearInterval(bossTimerEl._interval);
        bossTimerEl._interval = null;
      } else {
        const h = Math.floor(diff/3600000);
        const m = Math.floor((diff%3600000)/60000);
        const s = Math.floor((diff%60000)/1000);
        bossTimerEl.textContent = `Boss resets in ${h}h ${m}m ${s}s`;
      }
    }, 1000);
  }

  // initial setup
  ensureHeroUi();
  renderHeroes();
  spawnMonster(stage);
  render();

  // autosave
  setInterval(saveLocal, 30000);

})(); // end main
