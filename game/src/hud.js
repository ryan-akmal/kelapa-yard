// The DOM HUD: crosshair, hit marker, health, ammo, money, timer, score,
// bomb status, kill feed and the buy menu. It never touches the sim;
// main.js pushes numbers in and reads the play callback out. All text
// updates are guarded so a value that did not change costs no DOM write.
const COPY = {
  start: {
    title: 'KELAPA YARD',
    copy: 'Sore di halaman kampung. Empat penjaga jaga dua titik — KIOS dan WARUNG. Tanam Tas Kelapa di salah satunya, atau habisi mereka semua. Menang 3 ronde dulu.',
    action: 'Mulai main',
  },
  paused: {
    title: 'KELAPA YARD',
    copy: 'Jeda. Klik untuk lanjut.',
    action: 'Lanjut main',
  },
};

export function createHud() {
  const el = (id) => document.getElementById(id);
  const overlay = el('overlay');
  const title = el('overlay-title');
  const copy = el('overlay-copy');
  const play = el('play');
  const ammoMag = el('ammo-mag');
  const ammoReserve = el('ammo-reserve');
  const weaponName = el('weapon-name');
  const grenadeCount = el('grenade-count');
  const healthFill = el('health-fill');
  const healthNum = el('health-num');
  const moneyValue = el('money-value');
  const timerValue = el('timer-value');
  const scoreValue = el('score-value');
  const roundValue = el('round-value');
  const bombBar = el('bomb-bar');
  const bombFill = el('bomb-fill');
  const bombLabel = el('bomb-label');
  const feed = el('feed');
  const hitmarker = el('hitmarker');
  const crosshair = el('crosshair');
  const buyPanel = el('buy');
  const buyList = el('buy-list');
  const banner = el('banner');
  const ammoBox = el('ammo');

  let last = { mag: -1, reserve: -1, weapon: '', grenades: -1, health: -1, money: -1, timer: -1, score: '', round: -1 };
  let hitTimer = 0;

  function setText(node, value) {
    if (node.textContent !== value) node.textContent = value;
  }

  return {
    setHealth(hp) {
      const v = Math.max(0, Math.round(hp));
      if (v === last.health) return;
      last.health = v;
      healthFill.style.width = `${v}%`;
      healthFill.style.background = v > 50 ? '#3f7a4e' : v > 25 ? '#ff8c42' : '#c0392b';
      setText(healthNum, `${v}`);
    },
    setAmmo(mag, reserve, weapon, grenades) {
      if (mag !== last.mag || reserve !== last.reserve || weapon !== last.weapon || grenades !== last.grenades) {
        last.mag = mag;
        last.reserve = reserve;
        last.weapon = weapon;
        last.grenades = grenades;
        setText(ammoMag, String(mag));
        setText(ammoReserve, `/ ${reserve}`);
        setText(weaponName, weapon);
        setText(grenadeCount, `Petasan x${grenades}`);
        ammoBox.classList.toggle('empty', mag === 0);
      }
    },
    setMoney(money) {
      if (money === last.money) return;
      last.money = money;
      setText(moneyValue, `$${money}`);
    },
    setTimer(seconds) {
      const v = Math.max(0, Math.ceil(seconds));
      if (v === last.timer) return;
      last.timer = v;
      const mm = Math.floor(v / 60);
      const ss = String(v % 60).padStart(2, '0');
      setText(timerValue, `${mm}:${ss}`);
      timerValue.classList.toggle('urgent', v <= 15);
    },
    setScore(won, lost, round) {
      const s = `${won} — ${lost}`;
      if (s !== last.score) {
        last.score = s;
        setText(scoreValue, s);
      }
      if (round !== last.round) {
        last.round = round;
        setText(roundValue, `Ronde ${round}`);
      }
    },
    setBomb(label, progress) {
      if (label) {
        bombBar.hidden = false;
        setText(bombLabel, label);
        bombFill.style.width = `${Math.max(0, Math.min(100, progress * 100))}%`;
      } else {
        bombBar.hidden = true;
      }
    },
    setBanner(text) {
      setText(banner, text);
      banner.hidden = !text;
    },
    feedLine(text) {
      const line = document.createElement('div');
      line.textContent = text;
      feed.prepend(line);
      while (feed.children.length > 4) feed.removeChild(feed.lastChild);
      setTimeout(() => {
        if (line.parentNode) line.parentNode.removeChild(line);
      }, 5000);
    },
    hitMarker(killed, holdMs = 90) {
      hitmarker.classList.add('on');
      hitmarker.style.transform = killed
        ? 'translate(-50%, -50%) rotate(45deg) scale(1.3)'
        : 'translate(-50%, -50%) rotate(45deg)';
      clearTimeout(hitTimer);
      hitTimer = setTimeout(() => {
        hitmarker.classList.remove('on');
        hitmarker.style.transform = '';
      }, holdMs);
    },
    setCrosshairGap(px) {
      crosshair.style.setProperty('--gap', `${px}px`);
    },
    showBuy(money, items) {
      buyPanel.hidden = false;
      buyList.innerHTML = '';
      for (const item of items) {
        const row = document.createElement('div');
        row.className = 'buy-row' + (item.owned ? ' owned' : '');
        const key = document.createElement('kbd');
        key.textContent = item.key;
        const name = document.createElement('span');
        name.textContent = item.name;
        const price = document.createElement('b');
        price.textContent = item.owned ? 'DIMILIKI' : `$${item.price}`;
        row.append(key, name, price);
        buyList.appendChild(row);
      }
      setText(el('buy-money'), `$${money} — tekan 1-4 untuk beli, B atau Enter untuk mulai ronde`);
    },
    hideBuy() {
      buyPanel.hidden = true;
    },
    showOverlay(mode, detail) {
      if (mode === 'round' || mode === 'match') {
        title.textContent = detail.title;
        copy.textContent = detail.copy;
        play.textContent = detail.action;
      } else {
        const text = COPY[mode];
        title.textContent = text.title;
        copy.textContent = text.copy;
        play.textContent = text.action;
      }
      overlay.hidden = false;
      play.focus();
    },
    hideOverlay() {
      overlay.hidden = true;
    },
    onPlay(handler) {
      play.addEventListener('click', handler);
    },
  };
}
