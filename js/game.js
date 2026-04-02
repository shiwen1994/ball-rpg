/**
 * 弹珠 RPG — 游戏状态机 + 核心逻辑
 * 状态：aiming → shooting → playing → level_complete
 */

// 游戏状态
const GameState = {
  AIMING: 'aiming',       // 瞄准中（显示弹道线）
  SHOOTING: 'shooting',   // 发射瞬间
  PLAYING: 'playing',     // 弹珠飞行中
  LEVEL_COMPLETE: 'level_complete', // 过关
  GAME_OVER: 'game_over', // 失败
  PAUSED: 'paused',       // 暂停
};

class Game {
  constructor(canvas, renderer, physics) {
    this.canvas = canvas;
    this.renderer = renderer;
    this.physics = physics;

    // 游戏状态
    this.state = GameState.AIMING;

    // 实体列表
    this.balls = [];
    this.entities = []; // Monster / Chest / MysteryBox
    this.player = null;

    // 关卡数据
    this.floor = 1;           // 当前层数
    this.level = 1;           // 玩家等级
    this.exp = 0;             // 当前经验
    this.expToNext = 100;     // 升级所需经验
    this.shotsRemaining = 8;   // 剩余发射次数
    this.shotsPerRound = 8;    // 每轮发射数

    // 网格边界（像素坐标）
    this.gridBounds = null;

    // 弹道预测点
    this.trajectoryPoints = [];

    // 战场边界（物理碰撞用）
    this.bounds = { left: 0, top: 0, right: 0, bottom: 0 };

    // 输入状态
    this.inputStartPos = null; // 触摸/点击起始位置

    // 回调
    this.onLevelComplete = null;
    this.onGameOver = null;
    this.onLevelUp = null;
  }

  // ==================== 初始化 ====================
  init() {
    this.calcBounds();
    this.player = new Player(this.canvas.width, this.canvas.height);
    this.generateLevel(1);
  }

  calcBounds() {
    const w = this.canvas.width;
    const h = this.canvas.height;
    const padding = 8;
    const topBarH = 48;
    const bottomBarH = 48;

    // 战场区域（弹珠活动范围）
    this.bounds = {
      left: padding,
      top: topBarH + padding,
      right: w - padding,
      bottom: h - bottomBarH - 70, // 给角色留空间
    };

    // 网格区域
    const gridW = this.bounds.right - this.bounds.left;
    const gridH = this.bounds.bottom - this.bounds.top;
    const cellW = gridW / GRID_COLS;
    const cellH = gridH / GRID_ROWS;

    this.gridBounds = {
      left: this.bounds.left,
      top: this.bounds.top,
      cellW,
      cellH,
      cols: GRID_COLS,
      rows: GRID_ROWS,
    };
  }

  // ==================== 关卡生成 ====================
  generateLevel(floor) {
    this.entities = [];
    this.balls = [];
    this.state = GameState.AIMING;
    this.shotsRemaining = this.shotsPerRound + Math.min(floor - 1, 5); // 层数越高发射越多

    // 根据层数决定怪物数量和类型
    const monsterCount = Math.min(5 + Math.floor(floor * 2), GRID_COLS * 3);
    const positions = this.getRandomGridPositions(monsterCount);

    for (let i = 0; i < positions.length; i++) {
      const { col, row } = positions[i];

      // 根据层数选择怪物类型
      let typeKey;
      const rand = Math.random();
      if (floor <= 2) {
        typeKey = rand < 0.7 ? 'SLIME' : 'BAT';
      } else if (floor <= 5) {
        typeKey = rand < 0.4 ? 'SLIME' : rand < 0.65 ? 'BAT' : 'SKELETON';
      } else {
        typeKey = rand < 0.25 ? 'SLIME' : rand < 0.45 ? 'BAT' : rand < 0.7 ? 'SKELETON' : 'GOLEM';
      }

      const monster = new Monster(col, row, typeKey);
      // 血量随层数递增
      monster.maxHp = Math.floor(10 * MONSTER_TYPES[typeKey].hpMult * (1 + (floor - 1) * 0.5));
      monster.hp = monster.maxHp;
      // 设置像素坐标
      this.setEntityPixelPos(monster);
      this.entities.push(monster);

      // 偶尔放宝箱（15%概率，每层最多1个）
      if (i === positions.length - 1 && Math.random() < 0.15 && floor > 1) {
        const chestCol = Math.max(0, col - 1);
        const chestRow = Math.min(GRID_ROWS - 1, row + 1);
        // 检查位置是否已被占用
        const occupied = this.entities.some(e => e.gridCol === chestCol && e.gridRow === chestRow);
        if (!occupied) {
          const chest = new Chest(chestCol, chestRow);
          this.setEntityPixelPos(chest);
          this.entities.push(chest);
        }
      }
    }

    console.log(`[Game] 第${floor}层生成完成：${this.entities.filter(e => e instanceof Monster).length}个怪物`);
  }

  getRandomGridPositions(count) {
    const positions = [];
    const used = new Set();

    // 怪物放在上半区（行 0-5），留出底部给玩家
    const maxRow = Math.min(6, GRID_ROWS - 2);

    while (positions.length < count && used.size < maxRow * GRID_COLS) {
      const col = Math.floor(Math.random() * GRID_COLS);
      const row = Math.floor(Math.random() * maxRow);
      const key = `${col},${row}`;
      if (!used.has(key)) {
        used.add(key);
        positions.push({ col, row });
      }
    }
    return positions;
  }

  setEntityPixelPos(entity) {
    if (!this.gridBounds) return;
    entity.x = this.gridBounds.left + entity.gridCol * this.gridBounds.cellW + this.gridBounds.cellW / 2;
    entity.y = this.gridBounds.top + entity.gridRow * this.gridBounds.cellH + this.gridBounds.cellH / 2;
  }

  // ==================== 输入处理 ====================
  onPointerDown(x, y) {
    if (this.state !== GameState.AIMING) return;
    this.inputStartPos = { x, y };
    this.updateTrajectory(x, y);
  }

  onPointerMove(x, y) {
    if (this.state !== GameState.AIMING || !this.inputStartPos) return;
    this.updateTrajectory(x, y);
  }

  onPointerUp(x, y) {
    if (this.state !== GameState.AIMING || !this.inputStartPos) return;

    this.launchBall(x, y);
    this.inputStartPos = null;
    this.trajectoryPoints = [];
  }

  updateTrajectory(targetX, targetY) {
    if (!this.player) return;
    const vec = this.physics.calculateLaunchVector(
      this.player.x, this.player.y - 20,
      targetX, targetY
    );
    if (vec) {
      // 限制只能向上发射（vy 必须 < 0）
      if (vec.vy >= 0) return;

      this.trajectoryPoints = this.physics.getTrajectoryPoints(
        this.player.x, this.player.y - 20,
        vec.vx, vec.vy,
        this.bounds
      );
      this._pendingLaunchVec = vec;
    }
  }

  launchBall(targetX, targetY) {
    if (!this._pendingLaunchVec) return;
    if (this.shotsRemaining <= 0) return;

    const vec = this._pendingLaunchVec;
    // 限制只能向上发射
    if (vec.vy >= 0) {
      this.trajectoryPoints = [];
      return;
    }

    // 创建弹珠
    const ball = new Ball(
      this.player.x,
      this.player.y - 20,
      vec.vx,
      vec.vy
    );

    this.balls.push(ball);
    this.shotsRemaining--;
    this.state = GameState.PLAYING;
    this._pendingLaunchVec = null;
    this.trajectoryPoints = [];

    console.log(`[Game] 发射弹珠！剩余 ${this.shotsRemaining} 次`);
  }

  // ==================== 游戏循环更新 ====================
  update(dt) {
    if (this.state === GameState.PAUSED) return;

    // 物理更新
    if (this.state === GameState.PLAYING) {
      this.physics.updateBalls(this.balls, dt, this.bounds, this.entities);

      // 清理不活跃弹珠
      this.balls = this.balls.filter(b => b.active);

      // 所有弹珠消失后检查状态
      if (this.balls.length === 0) {
        this.checkRoundEnd();
      }
    }

    // 更新玩家位置（适配 canvas 尺寸变化）
    if (this.player) {
      this.player.updatePosition(this.canvas.width, this.canvas.height);
    }
  }

  checkRoundEnd() {
    // 检查是否所有怪物都被消灭
    const monstersAlive = this.entities.filter(
      e => e instanceof Monster && e.active
    ).length;

    if (monstersAlive === 0) {
      // 过关！
      this.state = GameState.LEVEL_COMPLETE;
      this.onLevelCompleteCallback();
      return;
    }

    // 还有怪物但没子弹了
    if (this.shotsRemaining <= 0) {
      this.state = GameState.GAME_OVER;
      this.onGameOverCallback();
      return;
    }

    // 还有子弹，继续瞄准
    this.state = GameState.AIMING;
  }

  // ==================== 碰撞回调 ====================
  onBallHitEntity(ball, entity) {
    if (entity instanceof Monster && entity.active) {
      const dmg = 1; // 基础伤害=1（后续可升级）
      const killed = entity.takeDamage(dmg);

      // 受击闪白
      entity.hitFlash = 6;

      // 浮动伤害数字
      this.renderer.spawnFloatingText(entity.x, entity.y - entity.radius, `-${dmg}`, '#FF5252');

      if (killed) {
        // 死亡特效
        this.renderer.spawnParticles(entity.x, entity.y, {
          count: 12, color: entity.color,
          speedMin: 2, speedMax: 5,
          sizeMin: 3, sizeMax: 7,
          life: 25, gravity: 0.15,
        });
        this.renderer.triggerShake(4);
        this.addExp(10); // 击杀经验
      } else {
        // 受击小粒子
        this.renderer.spawnParticles(ball.x, ball.y, {
          count: 4, color: '#fff',
          speedMin: 1, speedMax: 3,
          sizeMin: 1.5, sizeMax: 3,
          life: 12, gravity: 0,
        });
        this.renderer.triggerShake(2);
      }
    }

    if ((entity instanceof Chest || entity instanceof MysteryBox) && entity.active) {
      entity.open();
      this.renderer.spawnParticles(entity.x, entity.y, {
        count: 16, color: '#FFD54F',
        speedMin: 2, speedMax: 6,
        sizeMin: 3, sizeMax: 6,
        life: 30, gravity: 0.08,
      });
      this.renderer.triggerShake(5);
      this.addExp(25);
      this.renderer.spawnFloatingText(entity.x, entity.y - entity.radius, '+宝箱!', '#FFD54F');
    }
  }

  // ==================== 经验与升级 ====================
  addExp(amount) {
    this.exp += amount;
    while (this.exp >= this.expToNext) {
      this.exp -= this.expToNext;
      this.levelUp();
    }
  }

  levelUp() {
    this.level++;
    this.expToNext = Math.floor(this.expToNext * 1.3);
    this.shotsPerRound += 1; // 升级奖励：每轮多1发

    console.log(`[Game] 🎉 升级！Lv.${this.level}`);

    if (this.onLevelUp) {
      this.onLevelUp(this.level);
    }
  }

  // ==================== 过关/失败回调 ====================
  onLevelCompleteCallback() {
    this.floor++;
    // 奖励经验
    this.addExp(30 + this.floor * 5);
    console.log(`[Game] ✅ 第${this.floor - 1}层通过！进入第${this.floor}层`);

    if (this.onLevelComplete) {
      this.onLevelComplete(this.floor);
    }
  }

  onGameOverCallback() {
    console.log(`[Game] 💀 Game Over！到达第${this.floor}层，等级 Lv.${this.level}`);
    if (this.onGameOver) {
      this.onGameOver(this.floor, this.level);
    }
  }

  // ==================== 进入下一关 ====================
  nextLevel() {
    this.generateLevel(this.floor);
  }

  // ==================== 重新开始 ====================
  restart() {
    this.floor = 1;
    this.level = 1;
    this.exp = 0;
    this.expToNext = 100;
    this.shotsPerRound = 8;
    this.renderer.particles = [];
    this.renderer.floatingTexts = [];
    this.init();
  }

  // ==================== 尺寸变化时重新计算 ====================
  resize(w, h) {
    // 注意：不要重置 canvas.width/height，由 main.js 的 resizeCanvas 统一处理 DPR
    // 只重新计算边界和实体坐标
    this.calcBounds();
    // 更新所有实体像素坐标
    for (const entity of this.entities) {
      this.setEntityPixelPos(entity);
    }
    if (this.player) {
      this.player.updatePosition(w, h);
    }
  }
}
