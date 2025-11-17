/* ---------------------------------------------------------
   Firebase Setup
--------------------------------------------------------- */
const firebaseConfig = FIREBASE_CONFIG; // replace with your config
firebase.initializeApp(firebaseConfig);

const auth = firebase.auth();
const db = firebase.firestore();

let uid = null;

/* ---------------------------------------------------------
   Player Local Stats (unchanged except claim reward fix)
--------------------------------------------------------- */
let souls = parseInt(localStorage.getItem("souls") || "0");
let gold = parseInt(localStorage.getItem("gold") || "0");
let dps = parseInt(localStorage.getItem("dps") || "0");
let clickDmg = parseInt(localStorage.getItem("clickDmg") || "1");

function render() {
  document.getElementById("souls").textContent = souls;
  document.getElementById("gold").textContent = gold;
  document.getElementById("dps").textContent = dps;
  document.getElementById("clickDmg").textContent = clickDmg;
}

render();

/* ---------------------------------------------------------
   Auth
--------------------------------------------------------- */
auth.signInAnonymously().then(user => {
  uid = user.user.uid;
  document.getElementById("accountStatus").textContent = "Signed in as: " + uid;
}).catch(err => {
  document.getElementById("accountStatus").textContent = "Auth error: " + err;
});

/* ---------------------------------------------------------
   Clan Logic
--------------------------------------------------------- */
let currentClanId = null;
let bossUnsub = null;
let chatUnsub = null;

/* ------------------ Create Clan ----------------------- */
document.getElementById("createClanBtn").addEventListener("click", async () => {
  const name = document.getElementById("clanNameInput").value.trim();
  if (!name) return alert("Enter clan name");

  const ref = await db.collection("clans").add({
    name,
    created: Date.now(),
    owner: uid
  });

  await ref.collection("members").doc(uid).set({
    joined: Date.now()
  });

  joinClan(ref.id);
});

/* ------------------ Join Clan ------------------------- */
document.getElementById("joinClanBtn").addEventListener("click", async () => {
  const id = document.getElementById("joinClanInput").value.trim();
  if (!id) return alert("Enter clan ID");

  joinClan(id);
});

/* ------------------ Leave Clan ------------------------- */
document.getElementById("leaveClanBtn").addEventListener("click", async () => {
  if (!currentClanId) return;

  await db.collection("clans").doc(currentClanId)
    .collection("members").doc(uid).delete();

  currentClanId = null;
  document.getElementById("clanInfo").textContent = "No clan";
  document.getElementById("bossInfo").textContent = "No boss";

  if (bossUnsub) bossUnsub();
  if (chatUnsub) chatUnsub();
});

/* ---------------------------------------------------------
   Join Clan (Main Setup)
--------------------------------------------------------- */
async function joinClan(id) {
  const ref = db.collection("clans").doc(id);
  const snap = await ref.get();
  if (!snap.exists) return alert("Clan does not exist");

  await ref.collection("members").doc(uid).set({ joined: Date.now() });

  currentClanId = id;
  document.getElementById("clanInfo").textContent = `Clan: ${snap.data().name} (${id})`;

  setupClanBossListener(id);
  setupChatListener(id);
}

/* ---------------------------------------------------------
   Clan Boss Handling
--------------------------------------------------------- */
function setupClanBossListener(clanId) {
  if (bossUnsub) bossUnsub();

  const bossRef = db.collection("clans").doc(clanId).collection("boss").doc("current");

  bossUnsub = bossRef.onSnapshot(snap => {
    if (!snap.exists) {
      document.getElementById("bossInfo").textContent = "No boss";
      return;
    }
    const b = snap.data();

    const hp = Math.max(0, Math.floor(b.hp));
    const maxHp = b.maxHp;
    const finished = b.finishedAt;

    if (!finished) {
      document.getElementById("bossInfo").textContent =
        `Boss HP: ${hp} / ${maxHp}`;
    } else {
      document.getElementById("bossInfo").textContent =
        `Boss defeated! Reward: ${b.soulsReward} souls — Press Claim Reward`;
    }

    updateBossTimer(b);
  });
}

/* ---------------------------------------------------------
   Attack Boss
--------------------------------------------------------- */
document.getElementById("attackBossBtn").addEventListener("click", async () => {
  if (!currentClanId) return;

  const bossRef = db.collection("clans").doc(currentClanId).collection("boss").doc("current");

  try {
    await db.runTransaction(async tx => {
      const snap = await tx.get(bossRef);

      if (!snap.exists) return;

      const data = snap.data();
      if (data.finishedAt) return; // already dead

      const newHp = data.hp - clickDmg;
      if (newHp <= 0) {
        tx.update(bossRef, {
          hp: 0,
          finishedAt: Date.now()
        });
      } else {
        tx.update(bossRef, { hp: newHp });
      }
    });
  } catch (e) {
    alert("Error attacking boss: " + e);
  }
});

/* ---------------------------------------------------------
   Claim Reward (FIXED)
--------------------------------------------------------- */
document.getElementById("claimRewardBtn").addEventListener("click", async () => {
  if (!currentClanId) return;

  const bossRef = db.collection("clans").doc(currentClanId)
    .collection("boss").doc("current");

  try {
    await db.runTransaction(async tx => {
      const snap = await tx.get(bossRef);
      if (!snap.exists) throw "No boss exists";

      const b = snap.data();
      if (!b.finishedAt) throw "Boss not finished yet";

      const reward = b.soulsReward || 0;

      // ★ ADD SOULS TO PLAYER ★
      souls += reward;
      localStorage.setItem("souls", souls);
      render();

      alert(`You claimed ${reward} souls!`);
    });
  } catch (e) {
    alert("Error: " + e);
  }
});

/* ---------------------------------------------------------
   Clan Boss Reset (24 hours)
--------------------------------------------------------- */
function updateBossTimer(boss) {
  const timerEl = document.getElementById("bossTimer");

  if (!boss.finishedAt) {
    timerEl.textContent = "";
    return;
  }

  const end = boss.finishedAt + 24 * 60 * 60 * 1000;

  function tick() {
    const now = Date.now();
    const diff = end - now;
    if (diff <= 0) {
      timerEl.textContent = "Boss resetting...";

      if (currentClanId) spawnNewBoss(currentClanId);

      return;
    }
    const h = Math.floor(diff / 3600000);
    const m = Math.floor((diff % 3600000) / 60000);
    const s = Math.floor((diff % 60000) / 1000);

    timerEl.textContent = `Next boss in: ${h}h ${m}m ${s}s`;

    requestAnimationFrame(tick);
  }

  tick();
}

/* ---------------------------------------------------------
   Spawn New Boss
--------------------------------------------------------- */
async function spawnNewBoss(clanId) {
  const bossRef = db.collection("clans").doc(clanId)
    .collection("boss").doc("current");

  await bossRef.set({
    hp: 500,         // smaller boss HP per your request
    maxHp: 500,
    soulsReward: 5,
    finishedAt: null
  });
}

/* ---------------------------------------------------------
   Chat
--------------------------------------------------------- */
function setupChatListener(clanId) {
  if (chatUnsub) chatUnsub();

  const msgsRef = db.collection("clans").doc(clanId)
    .collection("chat").orderBy("time", "asc");

  chatUnsub = msgsRef.onSnapshot(snap => {
    const box = document.getElementById("messages");
    box.innerHTML = "";
    snap.forEach(doc => {
      const m = doc.data();
      const div = document.createElement("div");
      div.textContent = `${m.user}: ${m.text}`;
      box.appendChild(div);
    });
    box.scrollTop = box.scrollHeight;
  });
}

document.getElementById("sendMsgBtn").addEventListener("click", async () => {
  if (!currentClanId) return;

  const text = document.getElementById("msgInput").value.trim();
  if (!text) return;

  await db.collection("clans").doc(currentClanId)
    .collection("chat").add({
      text,
      user: uid,
      time: Date.now()
    });

  document.getElementById("msgInput").value = "";
});
