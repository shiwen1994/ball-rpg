/**
 * 弹珠 RPG — 实体定义
 * 定义所有游戏实体类：Ball, Monster, Chest, Player
 */

// ==================== 常量 ====================
const GRID_COLS = 6;
const GRID_ROWS = 8;
const BALL_RADIUS = 8;
const BALL_SPEED = 10; // px/frame
const ENTITY_RADIUS = 18; // 怪物/宝箱碰撞半径

// 怪物类型配置
const MONSTER_TYPES = {
  SLIME:   { id: 'slime',   name: '史莱姆', hpMult: 1.0, color: '#4CAF50', sprite: 'sprites/monster-slime.jpg' },
  BAT:     { id: 'bat',     name: '蝙蝠',   hpMult: 0.8, color: '#9C27B0', sprite: 'sprites/monster-bat.jpg' },
  SKELETON:{ id: 'skeleton',name: '骷髅兵', hpMult: 2.0, color: '#E0E0E0', sprite: 'sprites/monster-skeleton.jpg' },
  MIMIC:   { id: 'mimic',   name: '宝箱怪', hpMult: 3.0, color: '#FFC107', sprite: 'sprites/monster-slime.jpg' }, // 暂用slime图
  GOLEM:   { id: 'golem',   name: '岩石傀儡',hpMult: 5.0, color: '#607D8B', sprite: 'sprites/monster-golem.jpg' },
};

// ==================== Ball（弹珠）====================
class Ball {
  constructor(x, y, vx, vy) {
    this.x = x;
    this.y = y;
    this.vx = vx;
    this.vy = vy;
    this.radius = BALL_RADIUS;
    this.active = true;
    // 穿透计数
    this.pierce = 0;
    // 分裂标记
    this.isSplitChild = false;
    // 特效标记
    this.effect = null; // 'fire' | 'ice' | 'normal'
  }

  update(dt) {
    if (!this.active) return;
    this.x += this.vx;
    this.y += this.vy;
  }
}

// ==================== Monster（怪物）====================
class Monster {
  constructor(gridCol, gridRow, type) {
    this.gridCol = gridCol;
    this.gridRow = gridRow;
    this.type = type; // MONSTER_TYPES 中的 key
    const typeData = MONSTER_TYPES[type];
    this.name = typeData.name;
    this.color = typeData.color;
    this.spriteFile = typeData.sprite;

    // 像素坐标（由外部设置）
    this.x = 0;
    this.y = 0;
    this.radius = ENTITY_RADIUS;

    // 血量 = 基础值 × 类型倍率 × 层数系数
    this.maxHp = Math.floor(10 * typeData.hpMult);
    this.hp = this.maxHp;

    this.active = true;
    this.deathAnimTimer = 0; // 死亡动画计时
  }

  takeDamage(dmg) {
    this.hp -= dmg;
    if (this.hp <= 0) {
      this.active = false;
      this.deathAnimTimer = 30; // 30帧死亡动画
      return true; // 死亡
    }
    return false;
  }

  getHpRatio() {
    return Math.max(0, this.hp / this.maxHp);
  }
}

// ==================== Chest（宝箱）====================
class Chest {
  constructor(gridCol, gridRow) {
    this.gridCol = gridCol;
    this.gridRow = gridRow;
    this.x = 0;
    this.y = 0;
    this.radius = ENTITY_RADIUS - 2;
    this.active = true; // 未被打开
    this.opened = false;
    this.spriteFile = 'sprites/chest-treasure.jpg';
  }

  open() {
    if (this.active && !this.opened) {
      this.opened = true;
      this.active = false;
      return true;
    }
    return false;
  }
}

// ==================== MysteryBox（问号箱）====================
class MysteryBox {
  constructor(gridCol, gridRow) {
    this.gridCol = gridCol;
    this.gridRow = gridRow;
    this.x = 0;
    this.y = 0;
    this.radius = ENTITY_RADIUS - 2;
    this.active = true;
    this.spriteFile = 'sprites/mystery-box.jpg';
  }

  open() {
    if (this.active) {
      this.active = false;
      return true;
    }
    return false;
  }
}

// ==================== Player（玩家角色）====================
class Player {
  constructor(canvasWidth, canvasHeight) {
    this.radius = 22;
    // 底部居中
    this.x = canvasWidth / 2;
    this.y = canvasHeight - 70;
    this.spriteFile = 'sprites/player-wizard.jpg';
    this.spriteW = 46;
    this.spriteH = 46;
  }

  updatePosition(canvasWidth, canvasHeight) {
    this.x = canvasWidth / 2;
    this.y = canvasHeight - 70;
  }
}
