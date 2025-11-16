// Firebase CONFIG
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

// Anonymous auth
async function initAuth() {
  const userCredential = await auth.signInAnonymously();
  return userCredential.user.uid;
}

window._firebase = { auth, db, initAuth };

// Clan system
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
    const damage = Math.max(1, 1); // replace with clickDmg + dps if needed

    try {
      await db.runTransaction(async tx => {
        const bSnap = await tx.get(bossRef);
        if (!bSnap.exists) throw "No boss active";
        const b = bSnap.data();
        const newHp = Math.max(0, b.hp - damage);
        tx.update(bossRef, { hp: newHp, totalDamage: (b.totalDamage||0)+damage });
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
        const reward = b.soulsReward || 0;
        // Add to player's souls (simplified)
        alert(`You claimed ${reward} souls!`);
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
    const interval = setInterval(()=>{
      const now = new Date();
      const diff = expiresAt - now;
      if(diff<=0){ bossTimerEl.textContent="Boss ready!"; clearInterval(interval); }
      else{
        const h=Math.floor(diff/3600000);
        const m=Math.floor((diff%3600000)/60000);
        const s=Math.floor((diff%60000)/1000);
        bossTimerEl.textContent=`Boss resets in ${h}h ${m}m ${s}s`;
      }
    },1000);
  }

})();
