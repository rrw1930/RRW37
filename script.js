// Simple Pong game
// Left paddle: player (mouse + Arrow Up/Down)
// Right paddle: simple computer AI
// Scoreboard, bouncing ball, paddle & wall collision detection

(() => {
  const canvas = document.getElementById('gameCanvas');
  const ctx = canvas.getContext('2d');

  const scoreboardPlayer = document.getElementById('playerScore');
  const scoreboardComputer = document.getElementById('computerScore');

  const W = canvas.width;
  const H = canvas.height;

  // Game state
  let playerScore = 0;
  let computerScore = 0;
  let running = false;
  let paused = false;

  // Paddle settings
  const paddleWidth = 16;
  const paddleHeight = 120;
  const paddleMargin = 12;
  const playerPaddle = {
    x: paddleMargin,
    y: (H - paddleHeight) / 2,
    w: paddleWidth,
    h: paddleHeight,
    dy: 0,
    speed: 6
  };
  const computerPaddle = {
    x: W - paddleMargin - paddleWidth,
    y: (H - paddleHeight) / 2,
    w: paddleWidth,
    h: paddleHeight,
    speed: 4.2, // AI max speed
  };

  // Ball settings
  const ballRadius = 9;
  const ball = {
    x: W / 2,
    y: H / 2,
    vx: 0,
    vy: 0,
    speed: 6,
    r: ballRadius
  };

  // Input state
  let keys = { ArrowUp: false, ArrowDown: false };
  let mouseY = null;

  // Utility
  function clamp(v, a, b) { return Math.max(a, Math.min(b, v)); }

  // Reset ball to center and give random initial direction
  function resetBall(servingTo = Math.random() < 0.5 ? 'player' : 'computer') {
    ball.x = W / 2;
    ball.y = H / 2;
    ball.speed = 6;
    // angle between -30 and 30 degrees in radians
    const angle = (Math.random() * Math.PI / 3) - (Math.PI / 6);
    const dir = (servingTo === 'player') ? -1 : 1;
    ball.vx = dir * ball.speed * Math.cos(angle);
    ball.vy = ball.speed * Math.sin(angle);
  }

  // Start or resume the game loop
  function startGame() {
    if (!running) {
      running = true;
      paused = false;
      resetBall();
      requestAnimationFrame(loop);
    } else {
      paused = false;
    }
  }

  function togglePause() {
    paused = !paused;
    if (!paused) {
      requestAnimationFrame(loop);
    } else {
      // draw the paused overlay on next frame
      draw();
      drawOverlay('PAUSED — Press Space to resume');
    }
  }

  // Draw helpers
  function drawNet() {
    ctx.fillStyle = 'rgba(255,255,255,0.07)';
    const step = 18;
    for (let y = 0; y < H; y += step) {
      ctx.fillRect(W / 2 - 1, y + 6, 2, step / 2);
    }
  }

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

  function drawOverlay(text) {
    ctx.save();
    ctx.fillStyle = 'rgba(0,0,0,0.45)';
    ctx.fillRect(0, 0, W, H);
    ctx.fillStyle = '#fff';
    ctx.font = '22px system-ui, Arial';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(text, W / 2, H / 2);
    ctx.restore();
  }

  // Main draw
  function draw() {
    // background
    ctx.clearRect(0, 0, W, H);
    ctx.fillStyle = '#07142a';
    ctx.fillRect(0, 0, W, H);

    drawNet();

    // paddles
    drawRect(playerPaddle.x, playerPaddle.y, playerPaddle.w, playerPaddle.h, '#86f3b3');
    drawRect(computerPaddle.x, computerPaddle.y, computerPaddle.w, computerPaddle.h, '#8fb7ff');

    // ball
    drawCircle(ball.x, ball.y, ball.r, '#ffffff');

    // soft shadow/glow
    ctx.save();
    ctx.globalAlpha = 0.06;
    ctx.fillStyle = '#fff';
    ctx.fillRect(0, 0, W, H);
    ctx.restore();
  }

  // Collision detection between ball and a paddle
  function paddleCollision(paddle) {
    // Axis-Aligned Bounding Box check
    const paddleLeft = paddle.x;
    const paddleRight = paddle.x + paddle.w;
    const paddleTop = paddle.y;
    const paddleBottom = paddle.y + paddle.h;

    const closestX = clamp(ball.x, paddleLeft, paddleRight);
    const closestY = clamp(ball.y, paddleTop, paddleBottom);

    const dx = ball.x - closestX;
    const dy = ball.y - closestY;
    const distanceSq = dx * dx + dy * dy;

    return distanceSq <= (ball.r * ball.r);
  }

  // Update logic
  function update() {
    // Player paddle movement from keys
    if (keys.ArrowUp) playerPaddle.y -= playerPaddle.speed;
    if (keys.ArrowDown) playerPaddle.y += playerPaddle.speed;

    // Player paddle follow mouse if present (smoothly)
    if (mouseY !== null) {
      const targetY = mouseY - playerPaddle.h / 2;
      // smooth interpolation
      playerPaddle.y += (targetY - playerPaddle.y) * 0.25;
    }

    // Clamp player paddle inside screen
    playerPaddle.y = clamp(playerPaddle.y, 0, H - playerPaddle.h);

    // Simple computer AI: follow ball with a limit on speed and some randomness
    const paddleCenter = computerPaddle.y + computerPaddle.h / 2;
    const delta = ball.y - paddleCenter;
    const aiSpeed = computerPaddle.speed;
    // move only a fraction for realistic play
    const move = clamp(delta * 0.08, -aiSpeed, aiSpeed);
    computerPaddle.y += move;

    // Bound AI paddle
    computerPaddle.y = clamp(computerPaddle.y, 0, H - computerPaddle.h);

    // Move ball
    ball.x += ball.vx;
    ball.y += ball.vy;

    // Top/bottom wall collision
    if (ball.y - ball.r <= 0) {
      ball.y = ball.r;
      ball.vy = -ball.vy;
    } else if (ball.y + ball.r >= H) {
      ball.y = H - ball.r;
      ball.vy = -ball.vy;
    }

    // Paddle collisions
    // Left paddle (player)
    if (ball.vx < 0 && paddleCollision(playerPaddle)) {
      // move ball out of paddle
      ball.x = playerPaddle.x + playerPaddle.w + ball.r + 0.1;
      reflectOffPaddle(playerPaddle);
    }
    // Right paddle (computer)
    if (ball.vx > 0 && paddleCollision(computerPaddle)) {
      ball.x = computerPaddle.x - ball.r - 0.1;
      reflectOffPaddle(computerPaddle);
    }

    // Scoring
    if (ball.x + ball.r < 0) {
      // computer scores
      computerScore++;
      scoreboardComputer.textContent = `Computer: ${computerScore}`;
      resetBall('computer');
      paused = true;
      draw();
      drawOverlay('Point for Computer — Click to continue');
      return;
    } else if (ball.x - ball.r > W) {
      // player scores
      playerScore++;
      scoreboardPlayer.textContent = `Player: ${playerScore}`;
      resetBall('player');
      paused = true;
      draw();
      drawOverlay('Point for Player — Click to continue');
      return;
    }
  }

  // When ball hits a paddle, reflect and adjust vy based on contact point
  function reflectOffPaddle(paddle) {
    // Calculate hit point relative to paddle center (-1 to 1)
    const relativeIntersectY = (paddle.y + (paddle.h / 2)) - ball.y;
    const normalizedRelativeIntersectionY = relativeIntersectY / (paddle.h / 2);
    // Max bounce angle (radians)
    const maxBounce = (5 * Math.PI) / 12; // ~75 degrees
    const bounceAngle = normalizedRelativeIntersectionY * maxBounce;

    const direction = (paddle === playerPaddle) ? 1 : -1;
    const newSpeed = Math.min(ball.speed + 0.5, 16); // gradually increase speed up to cap
    ball.speed = newSpeed;

    ball.vx = direction * ball.speed * Math.cos(bounceAngle);
    ball.vy = -ball.speed * Math.sin(bounceAngle);
  }

  // Main loop
  function loop() {
    if (!running || paused) return;
    update();
    draw();
    requestAnimationFrame(loop);
  }

  // Input handlers
  canvas.addEventListener('mousemove', (e) => {
    const rect = canvas.getBoundingClientRect();
    mouseY = e.clientY - rect.top;
  });

  // If mouse leaves canvas, stop using mouse input
  canvas.addEventListener('mouseleave', () => { mouseY = null; });

  // Keyboard
  window.addEventListener('keydown', (e) => {
    if (e.code === 'Space') {
      e.preventDefault();
      if (!running) startGame();
      else togglePause();
      return;
    }
    if (e.code === 'Enter') {
      if (!running) startGame();
    }
    if (e.code === 'ArrowUp' || e.code === 'ArrowDown') {
      keys[e.code] = true;
      e.preventDefault();
    }
  });

  window.addEventListener('keyup', (e) => {
    if (e.code === 'ArrowUp' || e.code === 'ArrowDown') {
      keys[e.code] = false;
      e.preventDefault();
    }
  });

  // Start game on canvas click or touch
  canvas.addEventListener('click', () => {
    if (!running) startGame();
    else if (paused) {
      paused = false;
      requestAnimationFrame(loop);
    }
  });

  canvas.addEventListener('touchstart', (e) => {
    const touch = e.touches[0];
    const rect = canvas.getBoundingClientRect();
    mouseY = touch.clientY - rect.top;
    if (!running) startGame();
    e.preventDefault();
  }, { passive: false });

  canvas.addEventListener('touchmove', (e) => {
    const touch = e.touches[0];
    const rect = canvas.getBoundingClientRect();
    mouseY = touch.clientY - rect.top;
    e.preventDefault();
  }, { passive: false });

  // Initialize visuals
  resetBall();
  draw();
  drawOverlay('Click the canvas to start');

  // Expose a global restart if needed (for debugging/testing in console)
  window.pongRestart = () => {
    playerScore = 0;
    computerScore = 0;
    scoreboardPlayer.textContent = `Player: ${playerScore}`;
    scoreboardComputer.textContent = `Computer: ${computerScore}`;
    resetBall();
    running = false;
    paused = false;
    draw();
    drawOverlay('Click the canvas to start');
  };
})();