// 乒乓球 — 使用外部音频文件，本地多人游戏选项，开始菜单，胜利与排行榜。
// 虚拟坐标系：900x600

(() => {
  const VIRTUAL_W = 900;
  const VIRTUAL_H = 600;

  // DOM引用
  const canvas = document.getElementById('gameCanvas');
  const ctx = canvas.getContext('2d');
  const container = canvas.parentElement;

  const scoreboardPlayer = document.getElementById('playerScore');
  const scoreboardComputer = document.getElementById('computerScore');
  const modeSelect = document.getElementById('mode');
  const difficultySelect = document.getElementById('difficulty');
  const pointsToWinSelect = document.getElementById('pointsToWin');
  const soundToggle = document.getElementById('soundToggle');
  const volumeSlider = document.getElementById('volume');
  const resetBtn = document.getElementById('resetBtn');

  const menuOverlay = document.getElementById('menuOverlay');
  const startButton = document.getElementById('startButton');
  const leaderboardList = document.getElementById('leaderboardList');

  const victoryOverlay = document.getElementById('victoryOverlay');
  const victoryText = document.getElementById('victoryText');
  const winnerNameInput = document.getElementById('winnerName');
  const saveWinnerBtn = document.getElementById('saveWinnerBtn');
  const closeVictoryBtn = document.getElementById('closeVictoryBtn');

  // 游戏状态
  let playerScore = 0;
  let computerScore = 0;
  let running = false;
  let paused = false;
  let pointsToWin = Number(pointsToWinSelect.value);

  // paddle settings (virtual)
  const paddleWidth = 16;
  const paddleHeight = 120;
  const paddleMargin = 12;

  const playerPaddle = {
    x: paddleMargin,
    y: (VIRTUAL_H - paddleHeight) / 2,
    w: paddleWidth,
    h: paddleHeight,
    speed: 6
  };
  const computerPaddle = {
    x: VIRTUAL_W - paddleMargin - paddleWidth,
    y: (VIRTUAL_H - paddleHeight) / 2,
    w: paddleWidth,
    h: paddleHeight,
    speed: 4.2,
    reaction: 0.08
  };

  // Ball
  const ball = {
    x: VIRTUAL_W / 2,
    y: VIRTUAL_H / 2,
    vx: 0,
    vy: 0,
    r: 9,
    speed: 6
  };

  // Input
  let keys = {};
  let mouseY = null;

  // Audio: external files preloaded as AudioBuffers
  let audioCtx = null;
  let masterGain = null;
  const audioBuffers = {}; // keys: paddle, wall, score, bgm

  // list of sound files to load (place these in assets/sounds/)
  const soundFiles = {
    paddle: 'assets/sounds/paddle.wav',
    wall: 'assets/sounds/wall.wav',
    score: 'assets/sounds/score.wav',
    bgm:   'assets/sounds/bgm.mp3' // optional background music
  };

  // Initialize AudioContext lazily on first user gesture
  function initAudio() {
    if (audioCtx) return;
    try {
      audioCtx = new (window.AudioContext || window.webkitAudioContext)();
      masterGain = audioCtx.createGain();
      masterGain.gain.value = Number(volumeSlider.value || 0.7);
      masterGain.connect(audioCtx.destination);
      // start background music if available and enabled
      if (soundToggle.checked) {
        if (audioBuffers.bgm) {
          playBGMLoop();
        }
      }
    } catch (e) {
      console.warn('WebAudio 不可用', e);
      audioCtx = null;
    }
  }

  function setVolume(v) {
    if (masterGain) masterGain.gain.setValueAtTime(Number(v), audioCtx.currentTime);
  }

  volumeSlider.addEventListener('input', () => {
    setVolume(volumeSlider.value);
  });

  // load audio files into buffers
  async function loadAudioFiles() {
    if (!window.fetch) return;
    try {
      const names = Object.keys(soundFiles);
      for (const name of names) {
        const url = soundFiles[name];
        // try to fetch, decode
        try {
          const res = await fetch(url);
          if (!res.ok) {
            console.warn('无法加载音频:', url, res.status);
            continue;
          }
          const arrayBuffer = await res.arrayBuffer();
          if (!audioCtx) {
            // create temp audio context to decode if needed
            const tmpCtx = new (window.AudioContext || window.webkitAudioContext)();
            audioBuffers[name] = await tmpCtx.decodeAudioData(arrayBuffer.slice(0));
            tmpCtx.close();
          } else {
            audioBuffers[name] = await audioCtx.decodeAudioData(arrayBuffer.slice(0));
          }
        } catch (err) {
          console.warn('加载或解码音频时出错：', url, err);
        }
      }
    } catch (e) {
      console.warn('加载音频失败', e);
    }
  }

  // play AudioBuffer once
  function playBuffer(name, when = 0, loop = false, gain = 1) {
    if (!audioCtx || !soundToggle.checked) return;
    const buf = audioBuffers[name];
    if (!buf) return;
    const src = audioCtx.createBufferSource();
    src.buffer = buf;
    src.loop = !!loop;
    const g = audioCtx.createGain();
    g.gain.value = gain;
    src.connect(g);
    g.connect(masterGain);
    src.start(audioCtx.currentTime + when);
    return src;
  }

  let bgmSource = null;
  function playBGMLoop() {
    if (!audioCtx || !audioBuffers.bgm || !soundToggle.checked) return;
    if (bgmSource) {
      try { bgmSource.stop(); } catch {}
      bgmSource = null;
    }
    bgmSource = audioCtx.createBufferSource();
    bgmSource.buffer = audioBuffers.bgm;
    bgmSource.loop = true;
    const g = audioCtx.createGain();
    g.gain.value = 0.25; // background lower volume
    bgmSource.connect(g);
    g.connect(masterGain);
    bgmSource.start();
  }
  function stopBGM() {
    if (bgmSource) {
      try { bgmSource.stop(); } catch {}
      bgmSource = null;
    }
  }

  // Preload sounds in background (non-blocking)
  loadAudioFiles();

  // Utility
  function clamp(v, a, b) { return Math.max(a, Math.min(b, v)); }

  function resetBall(servingTo = Math.random() < 0.5 ? 'player' : 'computer') {
    ball.x = VIRTUAL_W / 2;
    ball.y = VIRTUAL_H / 2;
    ball.speed = 6;
    const angle = (Math.random() * Math.PI / 3) - (Math.PI / 6);
    const dir = (servingTo === 'player') ? -1 : 1;
    ball.vx = dir * ball.speed * Math.cos(angle);
    ball.vy = ball.speed * Math.sin(angle);
  }

  // Difficulty application for AI
  function applyDifficulty(level) {
    switch (level) {
      case 'easy':
        computerPaddle.speed = 3.2;
        computerPaddle.reaction = 0.05;
        break;
      case 'normal':
        computerPaddle.speed = 4.2;
        computerPaddle.reaction = 0.08;
        break;
      case 'hard':
        computerPaddle.speed = 6.0;
        computerPaddle.reaction = 0.12;
        break;
      default:
        computerPaddle.speed = 4.2;
        computerPaddle.reaction = 0.08;
    }
  }
  applyDifficulty(difficultySelect.value);
  difficultySelect.addEventListener('change', () => applyDifficulty(difficultySelect.value));

  // Responsive canvas
  let DPR = Math.max(1, window.devicePixelRatio || 1);
  function resizeCanvas() {
    DPR = Math.max(1, window.devicePixelRatio || 1);
    const cssWidth = Math.min(container.clientWidth, 980);
    const cssHeight = Math.round(cssWidth * (VIRTUAL_H / VIRTUAL_W));
    canvas.style.width = cssWidth + 'px';
    canvas.style.height = cssHeight + 'px';
    canvas.width = Math.round(cssWidth * DPR);
    canvas.height = Math.round(cssHeight * DPR);
    const scale = canvas.width / VIRTUAL_W;
    ctx.setTransform(scale, 0, 0, scale, 0, 0);
  }
  window.addEventListener('resize', resizeCanvas);
  resizeCanvas();

  // Drawing helpers
  function drawRect(x, y, w, h, color = '#fff') {
    ctx.fillStyle = color;
    ctx.fillRect(x, y, w, h);
  }
  function drawCircle(x, y, r, color = '#fff') {
    ctx.fillStyle = color;
    ctx.beginPath();
    ctx.arc(x, y, r, 0, Math.PI * 2);
    ctx.fill();
  }
  function drawNet() {
    ctx.fillStyle = 'rgba(255,255,255,0.07)';
    const step = 18;
    for (let y = 0; y < VIRTUAL_H; y += step) {
      ctx.fillRect(VIRTUAL_W / 2 - 1, y + 6, 2, step / 2);
    }
  }

  function drawOverlayText(text) {
    ctx.save();
    ctx.fillStyle = 'rgba(0,0,0,0.45)';
    ctx.fillRect(0, 0, VIRTUAL_W, VIRTUAL_H);
    ctx.fillStyle = '#fff';
    ctx.font = '24px system-ui, Arial';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(text, VIRTUAL_W / 2, VIRTUAL_H / 2);
    ctx.restore();
  }

  function draw() {
    ctx.clearRect(0, 0, VIRTUAL_W, VIRTUAL_H);
    ctx.fillStyle = '#07142a';
    ctx.fillRect(0, 0, VIRTUAL_W, VIRTUAL_H);
    drawNet();
    drawRect(playerPaddle.x, playerPaddle.y, playerPaddle.w, playerPaddle.h, '#86f3b3');
    drawRect(computerPaddle.x, computerPaddle.y, computerPaddle.w, computerPaddle.h, '#8fb7ff');
    drawCircle(ball.x, ball.y, ball.r, '#fff');
  }

  // collision check
  function paddleCollision(p) {
    const left = p.x, right = p.x + p.w, top = p.y, bottom = p.y + p.h;
    const cx = clamp(ball.x, left, right);
    const cy = clamp(ball.y, top, bottom);
    const dx = ball.x - cx, dy = ball.y - cy;
    return (dx*dx + dy*dy) <= (ball.r * ball.r);
  }

  function reflectOffPaddle(p) {
    const relY = (p.y + p.h/2) - ball.y;
    const norm = relY / (p.h / 2);
    const maxBounce = (5 * Math.PI) / 12;
    const angle = norm * maxBounce;
    const dir = (p === playerPaddle) ? 1 : -1;
    const newSpeed = Math.min(ball.speed + 0.5, 16);
    ball.speed = newSpeed;
    ball.vx = dir * ball.speed * Math.cos(angle);
    ball.vy = -ball.speed * Math.sin(angle);
  }

  // update loop
  function update() {
    // player controls depend on mode
    const mode = modeSelect.value;

    // left player: keyboard W/S and mouse
    if (keys['KeyW']) playerPaddle.y -= playerPaddle.speed;
    if (keys['KeyS']) playerPaddle.y += playerPaddle.speed;
    if (mouseY !== null) {
      const target = mouseY - playerPaddle.h / 2;
      playerPaddle.y += (target - playerPaddle.y) * 0.28;
    }
    playerPaddle.y = clamp(playerPaddle.y, 0, VIRTUAL_H - playerPaddle.h);

    // right side behaviour: AI or second player
    if (mode === 'single') {
      // AI
      const paddleCenter = computerPaddle.y + computerPaddle.h / 2;
      let target = ball.y;
      if (difficultySelect.value === 'hard' && ball.vx > 0) {
        const timeToReach = (computerPaddle.x - ball.x) / ball.vx;
        if (timeToReach > 0 && timeToReach < 4) {
          let predictedY = ball.y + ball.vy * timeToReach;
          const ph = VIRTUAL_H;
          const period = ph * 2;
          predictedY = ((predictedY % period) + period) % period;
          if (predictedY > ph) predictedY = period - predictedY;
          target = predictedY;
        }
      }
      const delta = target - paddleCenter;
      const move = clamp(delta * computerPaddle.reaction, -computerPaddle.speed, computerPaddle.speed);
      computerPaddle.y += move;
      computerPaddle.y = clamp(computerPaddle.y, 0, VIRTUAL_H - computerPaddle.h);
    } else {
      // local second player controls: ArrowUp / ArrowDown
      if (keys['ArrowUp']) computerPaddle.y -= computerPaddle.speed;
      if (keys['ArrowDown']) computerPaddle.y += computerPaddle.speed;
      computerPaddle.y = clamp(computerPaddle.y, 0, VIRTUAL_H - computerPaddle.h);
    }

    // move ball
    ball.x += ball.vx;
    ball.y += ball.vy;

    // walls
    if (ball.y - ball.r <= 0) {
      ball.y = ball.r;
      ball.vy = -ball.vy;
      if (audioCtx && soundToggle.checked) playBuffer('wall', 0, false, 1);
    } else if (ball.y + ball.r >= VIRTUAL_H) {
      ball.y = VIRTUAL_H - ball.r;
      ball.vy = -ball.vy;
      if (audioCtx && soundToggle.checked) playBuffer('wall', 0, false, 1);
    }

    // paddle hits
    if (ball.vx < 0 && paddleCollision(playerPaddle)) {
      ball.x = playerPaddle.x + playerPaddle.w + ball.r + 0.1;
      reflectOffPaddle(playerPaddle);
      if (audioCtx && soundToggle.checked) playBuffer('paddle', 0, false, 1);
    }
    if (ball.vx > 0 && paddleCollision(computerPaddle)) {
      ball.x = computerPaddle.x - ball.r - 0.1;
      reflectOffPaddle(computerPaddle);
      if (audioCtx && soundToggle.checked) playBuffer('paddle', 0, false, 1);
    }

    // scoring
    if (ball.x + ball.r < 0) {
      // right side scores
      computerScore++;
      scoreboardComputer.textContent = `电脑：${computerScore}`;
      if (audioCtx && soundToggle.checked) playBuffer('score', 0, false, 1);
      checkWinThenPause('computer');
      return;
    }
    if (ball.x - ball.r > VIRTUAL_W) {
      // left scores
      playerScore++;
      scoreboardPlayer.textContent = `玩家：${playerScore}`;
      if (audioCtx && soundToggle.checked) playBuffer('score', 0, false, 1);
      checkWinThenPause('player');
      return;
    }
  }

  function checkWinThenPause(scorer) {
    // if either reached pointsToWin -> end game
    pointsToWin = Number(pointsToWinSelect.value);
    if (playerScore >= pointsToWin || computerScore >= pointsToWin) {
      running = false;
      paused = true;
      // show victory overlay and allow saving name
      const winner = (playerScore > computerScore) ? '玩家' : (playerScore < computerScore) ? (modeSelect.value === 'local' ? '玩家 2' : '电脑') : scorer === 'player' ? '玩家' : '电脑';
      victoryText.textContent = `${winner} 获胜！`;
      winnerNameInput.value = winner === '电脑' ? 'Computer' : '';
      victoryOverlay.style.display = 'block';
      menuOverlay.style.display = 'none';
      // stop bgm if playing
      stopBGM();
      draw();
      return;
    }
    // otherwise reset ball, pause until click to continue
    resetBall(scorer === 'player' ? 'computer' : 'player');
    paused = true;
    running = false;
    draw();
    drawOverlayMessage(`得分：${scorer === 'player' ? '玩家' : '电脑'} — 点击开始下一局`);
  }

  function drawOverlayMessage(text) {
    draw();
    drawOverlayText(text);
  }

  // main loop
  function loop() {
    if (!running || paused) return;
    update();
    draw();
    requestAnimationFrame(loop);
  }

  // input mapping: convert clientY to virtual Y
  function clientYToVirtual(clientY) {
    const rect = canvas.getBoundingClientRect();
    const offsetY = clientY - rect.top;
    return (offsetY / rect.height) * VIRTUAL_H;
  }

  canvas.addEventListener('mousemove', (e) => {
    mouseY = clientYToVirtual(e.clientY);
  });
  canvas.addEventListener('mouseleave', () => { mouseY = null; });

  canvas.addEventListener('pointermove', (e) => {
    mouseY = clientYToVirtual(e.clientY);
  });

  // touch support
  canvas.addEventListener('touchstart', (e) => {
    initAudio();
    const touch = e.touches[0];
    mouseY = clientYToVirtual(touch.clientY);
    e.preventDefault();
  }, { passive: false });
  canvas.addEventListener('touchmove', (e) => {
    const t = e.touches[0];
    mouseY = clientYToVirtual(t.clientY);
    e.preventDefault();
  }, { passive: false });

  // keyboard
  window.addEventListener('keydown', (e) => {
    if (e.code === 'Space') {
      e.preventDefault();
      if (!running) {
        startRound();
      } else {
        togglePause();
      }
      return;
    }
    if (e.code === 'Enter') {
      if (!running && paused) {
        startRound();
      } else if (!running && !paused) {
        startGame(); // if not started yet
      }
    }
    keys[e.code] = true;
  });
  window.addEventListener('keyup', (e) => {
    keys[e.code] = false;
  });

  // UI: start/reset/menu
  startButton.addEventListener('click', () => {
    initAudio();
    // play bgm if available
    if (audioCtx && audioBuffers.bgm && soundToggle.checked) playBGMLoop();
    hideMenus();
    startGame();
  });

  canvas.addEventListener('click', () => {
    initAudio();
    if (!running && paused) {
      startRound();
    } else if (!running && !paused) {
      startGame();
    } else {
      // click to focus; nothing else
    }
  });

  resetBtn.addEventListener('click', () => {
    resetScores();
    showMenu();
  });

  function startGame() {
    // begin full gameplay
    running = true;
    paused = false;
    playerScore = 0;
    computerScore = 0;
    scoreboardPlayer.textContent = `玩家：${playerScore}`;
    scoreboardComputer.textContent = `电脑：${computerScore}`;
    resetBall();
    requestAnimationFrame(loop);
  }
  function startRound() {
    // continue after point pause
    running = true;
    paused = false;
    resetBall();
    requestAnimationFrame(loop);
  }

  function togglePause() {
    paused = !paused;
    if (!paused) {
      requestAnimationFrame(loop);
    } else {
      draw();
      drawOverlayText('已暂停 — 按空格继续');
    }
  }

  function resetScores() {
    playerScore = 0;
    computerScore = 0;
    scoreboardPlayer.textContent = `玩家：${playerScore}`;
    scoreboardComputer.textContent = `电脑：${computerScore}`;
  }

  // Menu show/hide
  function showMenu() {
    menuOverlay.style.display = 'block';
    victoryOverlay.style.display = 'none';
    paused = true;
    running = false;
    draw();
    populateLeaderboardUI();
    // start bgm only when playing
    stopBGM();
  }
  function hideMenus() {
    menuOverlay.style.display = 'none';
    victoryOverlay.style.display = 'none';
  }

  // Victory saving & leaderboard (localStorage)
  const LB_KEY = 'simple_pong_leaderboard_v1';
  function getLeaderboard() {
    try {
      const raw = localStorage.getItem(LB_KEY);
      return raw ? JSON.parse(raw) : [];
    } catch (e) {
      return [];
    }
  }
  function saveLeaderboardEntry(name, score) {
    const list = getLeaderboard();
    list.push({ name: name || '匿名', score: score, date: new Date().toISOString() });
    // keep top 10 by score desc (higher score first)
    list.sort((a,b) => b.score - a.score);
    const top = list.slice(0, 10);
    localStorage.setItem(LB_KEY, JSON.stringify(top));
    populateLeaderboardUI();
  }
  function populateLeaderboardUI() {
    const list = getLeaderboard();
    leaderboardList.innerHTML = '';
    if (list.length === 0) {
      leaderboardList.innerHTML = '<li>暂无记录</li>';
    } else {
      for (const it of list) {
        const li = document.createElement('li');
        li.textContent = `${it.name} — ${it.score} 分 (${new Date(it.date).toLocaleDateString()})`;
        leaderboardList.appendChild(li);
      }
    }
  }

  saveWinnerBtn.addEventListener('click', () => {
    const name = winnerNameInput.value.trim() || '匿名';
    const finalScore = Math.max(playerScore, computerScore);
    saveLeaderboardEntry(name, finalScore);
    victoryOverlay.style.display = 'none';
    showMenu();
  });
  closeVictoryBtn.addEventListener('click', () => {
    victoryOverlay.style.display = 'none';
    showMenu();
  });

  // play/stop BGM when sound toggle changed
  soundToggle.addEventListener('change', () => {
    if (!audioCtx) return;
    if (soundToggle.checked) {
      if (audioBuffers.bgm) playBGMLoop();
    } else {
      stopBGM();
    }
  });

  // when win paused, we already show victoryOverlay. Also allow clicking Save or return.

  // mouseY helper
  function clientYToVirtual(clientY) {
    const rect = canvas.getBoundingClientRect();
    const offsetY = clientY - rect.top;
    return (offsetY / rect.height) * VIRTUAL_H;
  }

  // initial display
  resetBall();
  draw();
  showMenu();

  // load and apply difficulty on mode change
  modeSelect.addEventListener('change', () => {
    if (modeSelect.value === 'local') {
      difficultySelect.disabled = true;
      document.getElementById('menuInstructions').textContent = '单地主机对战：左侧 玩家 1：W / S 或鼠标；右侧 玩家 2：↑ / ↓';
    } else {
      difficultySelect.disabled = false;
      document.getElementById('menuInstructions').textContent = '单人模式：左侧 W / S 或鼠标；右侧为 AI（也可用 ↑/↓ 测试）';
    }
  });

  // Attempt to init audio on first gesture and then decode any remaining audio
  document.addEventListener('click', function one() {
    initAudio();
    // if audio buffers were loaded earlier into temp ctx, they may need re-decode into audioCtx — already handled in loadAudioFiles
    if (audioBuffers.bgm && soundToggle.checked) playBGMLoop();
    document.removeEventListener('click', one);
  }, { once: true });

  // scoring and overlay helpers
  function drawOverlayText(text) {
    draw();
    drawOverlayText(text);
  }

  // ensure resize on load
  resizeCanvas();

})();
