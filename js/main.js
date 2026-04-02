/**
 * 弹珠 RPG — 入口 + 主循环
 * 初始化 Canvas、图片预加载、事件绑定、requestAnimationFrame
 */

// ==================== 全局变量 ====================
let canvas, ctx;
let game, renderer, physics;
let lastTime = 0;
let isRunning = true;

// ==================== DOM Ready ====================
document.addEventListener('DOMContentLoaded', () => {
  initGame();
});

async function initGame() {
  // 获取 Canvas
  canvas = document.getElementById('game-canvas');
  ctx = canvas.getContext('2d');

  // 设置 Canvas 尺寸（适配屏幕）
  resizeCanvas();
  window.addEventListener('resize', debounce(resizeCanvas, 200));

  // 初始化模块
  renderer = new Renderer(canvas, ctx);
  physics = new PhysicsEngine(null); // 先传 null，后面设置
  game = new Game(canvas, renderer, physics);
  physics.game = game; // 双向引用

  // 预加载所有精灵图
  const spriteList = [
    'sprites/monster-slime.jpg',
    'sprites/monster-bat.jpg',
    'sprites/monster-skeleton.jpg',
    'sprites/monster-golem.jpg',
    'sprites/chest-treasure.jpg',
    'sprites/mystery-box.jpg',
    'sprites/player-wizard.jpg',
    'sprites/ball-projectile.jpg',
  ];

  showLoading('加载素材中...');
  await renderer.preloadAll(spriteList);

  // 初始化游戏
  game.init();

  // 绑定回调
  game.onLevelComplete = (floor) => {
    setTimeout(() => showOverlay('level-complete', `第 ${floor - 1} 层通过！`, `准备进入第 ${floor} 层`), 500);
  };
  game.onGameOver = (floor, level) => {
    setTimeout(() => showOverlay('game-over', `到达第 ${floor} 层`, `等级 Lv.${level}`), 500);
  };
  game.onLevelUp = (lvl) => {
    renderer.spawnFloatingText(canvas.width / 2, canvas.height / 2, `⬆ 升级 Lv.${lvl}!`, '#FFD54F');
    renderer.triggerShake(6);
  };

  // 绑定输入事件
  bindInputEvents();

  // 绑定 UI 按钮
  bindUIButtons();

  hideLoading();
  console.log('[Main] 🎮 弹珠 RPG 启动完成！');

  // 启动主循环
  requestAnimationFrame(gameLoop);
}

// ==================== 主循环 ====================
function gameLoop(timestamp) {
  if (!isRunning) { requestAnimationFrame(gameLoop); return; }

  const dt = timestamp - lastTime;
  lastTime = timestamp;

  // 更新（固定时间步长）
  game.update(dt);

  // 渲染
  renderer.render(game);

  // 更新 UI（DOM 元素）
  if (window.gameUpdateUI) window.gameUpdateUI();

  requestAnimationFrame(gameLoop);
}

// ==================== 输入事件 ====================
function bindInputEvents() {
  const wrap = document.querySelector('.canvas-wrap');

  // 触摸事件
  wrap.addEventListener('touchstart', (e) => {
    e.preventDefault();
    const touch = e.touches[0];
    const rect = canvas.getBoundingClientRect();
    const x = (touch.clientX - rect.left) * (canvas.width / rect.width);
    const y = (touch.clientY - rect.top) * (canvas.height / rect.height);
    game.onPointerDown(x, y);
  }, { passive: false });

  wrap.addEventListener('touchmove', (e) => {
    e.preventDefault();
    const touch = e.touches[0];
    const rect = canvas.getBoundingClientRect();
    const x = (touch.clientX - rect.left) * (canvas.width / rect.width);
    const y = (touch.clientY - rect.top) * (canvas.height / rect.height);
    game.onPointerMove(x, y);
  }, { passive: false });

  wrap.addEventListener('touchend', (e) => {
    e.preventDefault();
    // 如果有待发射的弹道向量，直接发射
    if (game._pendingLaunchVec && game.state === GameState.AIMING) {
      game.onPointerUp(0, 0);
    }
  }, { passive: false });

  // 鼠标事件（PC调试用）
  canvas.addEventListener('mousedown', (e) => {
    const rect = canvas.getBoundingClientRect();
    const x = (e.clientX - rect.left) * (canvas.width / rect.width);
    const y = (e.clientY - rect.top) * (canvas.height / rect.height);
    game.onPointerDown(x, y);
  });

  canvas.addEventListener('mousemove', (e) => {
    const rect = canvas.getBoundingClientRect();
    const x = (e.clientX - rect.left) * (canvas.width / rect.width);
    const y = (e.clientY - rect.top) * (canvas.height / rect.height);
    game.onPointerMove(x, y);
  });

  canvas.addEventListener('mouseup', (e) => {
    game.onPointerUp(0, 0);
  });

  // 防止右键菜单
  canvas.addEventListener('contextmenu', (e) => e.preventDefault());
}

// ==================== UI 按钮绑定 ====================
function bindUIButtons() {
  // 加速按钮
  const speedBtn = document.querySelector('.speed-btn');
  if (speedBtn) {
    speedBtn.addEventListener('click', () => {
      speedBtn.classList.toggle('active');
      // 可以在这里实现加速逻辑（跳帧等）
    });
  }

  // 暂停按钮
  const pauseBtn = document.querySelector('.pause-btn');
  if (pauseBtn) {
    pauseBtn.addEventListener('click', () => {
      if (game.state === GameState.PAUSED) {
        game.state = GameState.AIMING; // 恢复
        pauseBtn.textContent = '⏸';
        hideOverlay('pause-overlay');
      } else if (game.state !== GameState.LEVEL_COMPLETE && game.state !== GameState.GAME_OVER) {
        game.state = GameState.PAUSED;
        pauseBtn.textContent = '▶';
      }
    });
  }
}

// ==================== 弹窗控制 ====================
function showOverlay(type, title, subtitle) {
  let overlay;
  if (type === 'level-complete') {
    overlay = document.getElementById('level-overlay');
    if (overlay) {
      overlay.querySelector('.overlay-title').textContent = '🎉 过关！';
      overlay.querySelector('.overlay-sub').textContent = subtitle || '';
      overlay.classList.add('active');
      // 绑定继续按钮
      const btn = overlay.querySelector('.overlay-btn');
      btn.onclick = () => {
        overlay.classList.remove('active');
        game.nextLevel();
      };
    }
  } else if (type === 'game-over') {
    overlay = document.getElementById('gameover-overlay');
    if (overlay) {
      overlay.querySelector('.overlay-title').textContent = '💀 游戏结束';
      overlay.querySelector('.overlay-sub').textContent = subtitle || '';
      overlay.classList.add('active');
      const btn = overlay.querySelector('.overlay-btn');
      btn.onclick = () => {
        overlay.classList.remove('active');
        game.restart();
      };
    }
  }
}

function hideOverlay(type) {
  const overlay = document.getElementById(type + '-overlay');
  if (overlay) overlay.classList.remove('active');
}

// ==================== UI 更新（每帧调用）====================
function updateUI() {
  // 等级显示
  const levelEl = document.querySelector('.level-text');
  if (levelEl) levelEl.textContent = `Lv.${game.level}`;

  // 层数显示
  const floorEl = document.querySelector('.floor-num');
  if (floorEl) floorEl.innerHTML = `第 <span>${game.floor}</span> 层`;

  // 发射次数
  const shotEl = document.querySelector('.shot-count');
  if (shotEl) shotEl.textContent = `${game.shotsRemaining}`;

  // 经验条
  const expFill = document.querySelector('.exp-fill');
  if (expFill) expFill.style.width = `${(game.exp / game.expToNext) * 100}%`;

  const expValue = document.querySelector('.exp-value');
  if (expValue) expValue.textContent = `${game.exp} / ${game.expToNext}`;
}

// 把 updateUI 挂到全局，让 main loop 能调用
window.gameUpdateUI = updateUI;

// ==================== Canvas 尺寸适配 ====================
function resizeCanvas() {
  const container = document.getElementById('game-container');
  const w = container.clientWidth || window.innerWidth;
  const h = container.clientHeight || window.innerHeight;

  // 设置实际像素尺寸（考虑设备像素比，避免模糊）
  const dpr = window.devicePixelRatio || 1;
  canvas.width = w * dpr;
  canvas.height = h * dpr;
  canvas.style.width = w + 'px';
  canvas.style.height = h + 'px';

  // 用 setTransform 替代 scale，避免多次调用时叠加
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

  // 通知游戏重新计算边界
  if (game) game.resize(w, h);

  console.log(`[Main] Canvas 尺寸: ${w}x${h} (dpr:${dpr})`);
}

// ==================== 工具函数 ====================
function debounce(fn, delay) {
  let timer;
  return (...args) => {
    clearTimeout(timer);
    timer = setTimeout(() => fn.apply(this, args), delay);
  };
}

function showLoading(text) {
  let loading = document.getElementById('loading');
  if (!loading) {
    loading = document.createElement('div');
    loading.id = 'loading';
    loading.style.cssText = `
      position:absolute;top:0;left:0;right:0;bottom:0;
      background:#1a0f05;display:flex;align-items:center;justify-content:center;
      z-index:200;color:#FFD54F;font-size:16px;font-weight:bold;
      flex-direction:column;gap:12px;
    `;
    loading.innerHTML = `<div>🎮</div><div>${text || '加载中...'}</div>`;
    document.getElementById('game-container').appendChild(loading);
  }
}

function hideLoading() {
  const loading = document.getElementById('loading');
  if (loading) loading.style.display = 'none';
}
