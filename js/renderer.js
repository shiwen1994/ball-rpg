/**
 * 弹珠 RPG — 渲染器 + 动效系统
 * 负责所有 Canvas 绘制：网格、实体、弹珠、UI、粒子特效
 */

class Renderer {
  constructor(canvas, ctx) {
    this.canvas = canvas;
    this.ctx = ctx;
    // 粒子池
    this.particles = [];
    // 浮动文字
    this.floatingTexts = [];
    // 屏幕震动参数
    this.shake = { x: 0, y: 0, duration: 0 };
    // 帧计数（用于动画）
    this.frameCount = 0;
    // 图片缓存
    this.imageCache = {};
  }

  // ==================== 图片加载 ====================
  preloadImage(src) {
    return new Promise((resolve) => {
      if (this.imageCache[src]) {
        resolve(this.imageCache[src]);
        return;
      }
      const img = new Image();
      img.onload = () => {
        this.imageCache[src] = img;
        resolve(img);
      };
      img.onerror = () => resolve(null);
      img.src = src;
    });
  }

  async preloadAll(sprites) {
    const promises = sprites.map(s => this.preloadImage(s));
    await Promise.all(promises);
  }

  // ==================== 主渲染入口 ====================
  render(game) {
    const ctx = this.ctx;
    const w = this.canvas.width;
    const h = this.canvas.height;

    this.frameCount++;

    // 清屏
    ctx.clearRect(0, 0, w, h);

    // 应用屏幕震动
    ctx.save();
    if (this.shake.duration > 0) {
      this.shake.x = (Math.random() - 0.5) * this.shake.duration * 0.5;
      this.shake.y = (Math.random() - 0.5) * this.shake.duration * 0.5;
      ctx.translate(this.shake.x, this.shake.y);
      this.shake.duration--;
    }

    // 1. 背景
    this.drawBackground(w, h);

    // 2. 网格
    this.drawGrid(game.gridBounds);

    // 3. 实体（怪物/宝箱）
    for (const entity of game.entities) {
      if (entity instanceof Monster) {
        this.drawMonster(entity);
      } else if (entity instanceof Chest || entity instanceof MysteryBox) {
        this.drawChest(entity);
      }
    }

    // 4. 玩家角色
    this.drawPlayer(game.player);

    // 5. 弹珠
    for (const ball of game.balls) {
      if (ball.active) this.drawBall(ball);
    }

    // 6. 弹道预测线（aiming 状态）
    if (game.state === 'aiming' && game.trajectoryPoints.length > 1) {
      this.drawTrajectory(game.trajectoryPoints);
    }

    // 7. 粒子
    this.updateAndDrawParticles(ctx);

    // 8. 浮动文字
    this.updateAndDrawFloatingTexts(ctx);

    ctx.restore();
  }

  // ==================== 背景 ====================
  drawBackground(w, h) {
    const ctx = this.ctx;
    // 深棕色渐变底色
    const grad = ctx.createRadialGradient(w / 2, h / 2, 0, w / 2, h / 2, w * 0.7);
    grad.addColorStop(0, '#1e1208');
    grad.addColorStop(1, '#0d0703');
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, w, h);
  }

  // ==================== 网格 ====================
  drawGrid(bounds) {
    const ctx = this.ctx;
    const { left, top, cellW, cellH, cols, rows } = bounds;

    ctx.strokeStyle = 'rgba(76, 175, 80, 0.12)';
    ctx.lineWidth = 1;

    // 垂直线
    for (let c = 0; c <= cols; c++) {
      const x = left + c * cellW;
      ctx.beginPath();
      ctx.moveTo(x, top);
      ctx.lineTo(x, top + rows * cellH);
      ctx.stroke();
    }
    // 水平线
    for (let r = 0; r <= rows; r++) {
      const y = top + r * cellH;
      ctx.beginPath();
      ctx.moveTo(left, y);
      ctx.lineTo(left + cols * cellW, y);
      ctx.stroke();
    }

    // 格子中心微光点
    ctx.fillStyle = 'rgba(76, 175, 80, 0.06)';
    for (let c = 0; c < cols; c++) {
      for (let r = 0; r < rows; r++) {
        const cx = left + c * cellW + cellW / 2;
        const cy = top + r * cellH + cellH / 2;
        ctx.beginPath();
        ctx.arc(cx, cy, 3, 0, Math.PI * 2);
        ctx.fill();
      }
    }
  }

  // ==================== 怪物 ====================
  drawMonster(monster) {
    const ctx = this.ctx;
    const t = this.frameCount * 0.06;

    if (!monster.active && monster.deathAnimTimer > 0) {
      // 死亡动画：爆炸缩放+渐隐
      const progress = 1 - monster.deathAnimTimer / 30;
      const scale = 1 + progress * 0.6;
      const alpha = 1 - progress;
      ctx.globalAlpha = alpha;
      ctx.save();
      ctx.translate(monster.x, monster.y);
      ctx.scale(scale, scale);
      this.drawImageCentered(monster.spriteFile, 0, 0, monster.radius * 2.2);
      ctx.restore();
      ctx.globalAlpha = 1;
      return;
    }

    if (!monster.active) return;

    // 呼吸动画：微缩放 + 微位移
    const breathe = Math.sin(t) * 0.04;
    const floatY = Math.sin(t * 1.3 + monster.gridCol) * 2;

    ctx.save();
    ctx.translate(monster.x, monster.y + floatY);
    ctx.scale(1 + breathe, 1 + breathe);

    // 受击闪白
    if (monster.hitFlash > 0) {
      ctx.globalAlpha = 0.7;
      monster.hitFlash--;
    }

    // 绘制精灵图
    this.drawImageCentered(monster.spriteFile, 0, 0, monster.radius * 2.2);

    ctx.globalAlpha = 1;
    ctx.restore();

    // 血条（仅在受伤时显示，或血量不满时始终显示）
    if (monster.hp < monster.maxHp) {
      this.drawHpBar(monster.x, monster.y - monster.radius - 10, monster.getHpRatio(), monster.color);
    }
  }

  // ==================== 宝箱 ====================
  drawChest(chest) {
    const ctx = this.ctx;
    const t = this.frameCount * 0.05;

    if (!chest.active) return;

    // 宝箱轻微弹跳
    const bounce = Math.abs(Math.sin(t * 2)) * 2;

    ctx.save();
    ctx.translate(chest.x, chest.y - bounce);
    this.drawImageCentered(chest.spriteFile, 0, 0, chest.radius * 2.2);
    ctx.restore();

    // 光晕提示
    ctx.beginPath();
    ctx.arc(chest.x, chest.y, chest.radius + 6 + Math.sin(t * 3) * 3, 0, Math.PI * 2);
    ctx.fillStyle = `rgba(255, 215, 0, ${0.06 + Math.sin(t * 3) * 0.03})`;
    ctx.fill();
  }

  // ==================== 玩家角色 ====================
  drawPlayer(player) {
    const ctx = this.ctx;
    const t = this.frameCount * 0.04;

    // 呼吸效果
    const breathe = Math.sin(t) * 0.03;

    ctx.save();
    ctx.translate(player.x, player.y);
    ctx.scale(1 + breathe, 1 + breathe);

    // 底部光环
    const glowGrad = ctx.createRadialGradient(0, 5, 0, 0, 5, player.radius + 15);
    glowGrad.addColorStop(0, 'rgba(79, 195, 247, 0.15)');
    glowGrad.addColorStop(1, 'rgba(79, 195, 247, 0)');
    ctx.fillStyle = glowGrad;
    ctx.beginPath();
    ctx.arc(0, 5, player.radius + 15, 0, Math.PI * 2);
    ctx.fill();

    // 角色精灵图
    this.drawImageCentered(player.spriteFile, 0, 0, player.spriteW);

    ctx.restore();
  }

  // ==================== 弹珠 ====================
  drawBall(ball) {
    const ctx = this.ctx;

    // 拖尾残影（画3个渐隐的旧位置）
    if (ball._prevX !== undefined) {
      for (let i = 3; i >= 1; i--) {
        const alpha = 0.08 * (4 - i);
        const trailR = ball.radius * (1 - i * 0.1);
        ctx.beginPath();
        ctx.arc(
          ball.x - ball.vx * i * 0.6,
          ball.y - ball.vy * i * 0.6,
          trailR,
          0, Math.PI * 2
        );
        ctx.fillStyle = `rgba(255, 255, 255, ${alpha})`;
        ctx.fill();
      }
    }

    // 记录上一帧位置
    ball._prevX = ball.x;
    ball._prevY = ball.y;

    // 外发光
    const glowGrad = ctx.createRadialGradient(
      ball.x, ball.y, 0,
      ball.x, ball.y, ball.radius * 3
    );
    glowGrad.addColorStop(0, 'rgba(255, 255, 255, 0.35)');
    glowGrad.addColorStop(0.4, 'rgba(200, 220, 255, 0.1)');
    glowGrad.addColorStop(1, 'rgba(200, 220, 255, 0)');
    ctx.fillStyle = glowGrad;
    ctx.beginPath();
    ctx.arc(ball.x, ball.y, ball.radius * 3, 0, Math.PI * 2);
    ctx.fill();

    // 弹珠本体（白色发光球）
    const bodyGrad = ctx.createRadialGradient(
      ball.x - ball.radius * 0.3, ball.y - ball.radius * 0.3, 0,
      ball.x, ball.y, ball.radius
    );
    bodyGrad.addColorStop(0, '#ffffff');
    bodyGrad.addColorStop(0.7, '#d0e8ff');
    bodyGrad.addColorStop(1, '#88bfff');
    ctx.fillStyle = bodyGrad;
    ctx.beginPath();
    ctx.arc(ball.x, ball.y, ball.radius, 0, Math.PI * 2);
    ctx.fill();

    // 高光点
    ctx.fillStyle = 'rgba(255, 255, 255, 0.9)';
    ctx.beginPath();
    ctx.arc(ball.x - ball.radius * 0.3, ball.y - ball.radius * 0.3, ball.radius * 0.28, 0, Math.PI * 2);
    ctx.fill();
  }

  // ==================== 弹道预测线 ====================
  drawTrajectory(points) {
    if (points.length < 2) return;
    const ctx = this.ctx;

    ctx.setLineDash([6, 8]);
    ctx.lineDashOffset = -this.frameCount * 0.5; // 动态流动感
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.25)';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(points[0].x, points[0].y);
    for (let i = 1; i < points.length; i++) {
      ctx.lineTo(points[i].x, points[i].y);
    }
    ctx.stroke();
    ctx.setLineDash([]);

    // 预测终点小圆
    const last = points[points.length - 1];
    ctx.beginPath();
    ctx.arc(last.x, last.y, 4, 0, Math.PI * 2);
    ctx.fillStyle = 'rgba(255, 255, 255, 0.3)';
    ctx.fill();
  }

  // ==================== 血条 ====================
  drawHpBar(x, y, ratio, color) {
    const ctx = this.ctx;
    const barW = 32;
    const barH = 4;

    // 背景
    ctx.fillStyle = 'rgba(0, 0, 0, 0.5)';
    ctx.fillRect(x - barW / 2, y, barW, barH);

    // 血量
    ctx.fillStyle = ratio > 0.5 ? '#4CAF50' : ratio > 0.25 ? '#FF9800' : '#F44336';
    ctx.fillRect(x - barW / 2, y, barW * ratio, barH);

    // 边框
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.15)';
    ctx.lineWidth = 0.5;
    ctx.strokeRect(x - barW / 2, y, barW, barH);
  }

  // ==================== 辅助：居中绘制图片 ====================
  drawImageCentered(src, cx, cy, size) {
    const ctx = this.ctx;
    const img = this.imageCache[src];
    if (img) {
      ctx.drawImage(img, cx - size / 2, cy - size / 2, size, size);
    } else {
      // fallback：画一个带颜色的圆形
      ctx.beginPath();
      ctx.arc(cx, cy, size / 2, 0, Math.PI * 2);
      ctx.fillStyle = '#666';
      ctx.fill();
      ctx.fillStyle = '#fff';
      ctx.font = `${size * 0.3}px sans-serif`;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText('?', cx, cy);
    }
  }

  // ==================== 粒子系统 ====================
  spawnParticles(x, y, config) {
    const count = config.count || 10;
    for (let i = 0; i < count; i++) {
      const angle = (Math.PI * 2 * i) / count + (Math.random() - 0.5) * 0.5;
      const speed = (config.speedMin || 2) + Math.random() * (config.speedMax || 4);
      this.particles.push({
        x, y,
        vx: Math.cos(angle) * speed,
        vy: Math.sin(angle) * speed,
        life: config.life || 30,
        maxLife: config.life || 30,
        size: (config.sizeMin || 3) + Math.random() * (config.sizeMax || 5),
        color: config.color || '#FFD54F',
        type: config.type || 'circle', // circle | square | star
        gravity: config.gravity || 0,
        decay: config.decay || 0.96,
      });
    }
  }

  updateAndDrawParticles(ctx) {
    for (let i = this.particles.length - 1; i >= 0; i--) {
      const p = this.particles[i];
      p.x += p.vx;
      p.y += p.vy;
      p.vy += p.gravity;
      p.vx *= p.decay;
      p.vy *= p.decay;
      p.life--;

      const alpha = p.life / p.maxLife;
      ctx.globalAlpha = alpha;
      ctx.fillStyle = p.color;

      if (p.type === 'circle') {
        ctx.beginPath();
        ctx.arc(p.x, p.y, p.size * alpha, 0, Math.PI * 2);
        ctx.fill();
      } else if (p.type === 'square') {
        ctx.fillRect(p.x - p.size / 2, p.y - p.size / 2, p.size * alpha, p.size * alpha);
      }

      ctx.globalAlpha = 1;

      if (p.life <= 0) this.particles.splice(i, 1);
    }
  }

  // ==================== 浮动文字 ====================
  spawnFloatingText(x, y, text, color = '#FFD54F') {
    this.floatingTexts.push({ x, y, text, color, life: 45, maxLife: 45 });
  }

  updateAndDrawFloatingTexts(ctx) {
    for (let i = this.floatingTexts.length - 1; i >= 0; i--) {
      const ft = this.floatingTexts[i];
      ft.y -= 1.2; // 上浮
      ft.life--;

      const alpha = ft.life / ft.maxLife;
      ctx.globalAlpha = alpha;
      ctx.fillStyle = ft.color;
      ctx.font = 'bold 14px "Nunito", sans-serif';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(ft.text, ft.x, ft.y);
      ctx.globalAlpha = 1;

      if (ft.life <= 0) this.floatingTexts.splice(i, 1);
    }
  }

  // ==================== 屏幕震动 ====================
  triggerShake(intensity = 6) {
    this.shake.duration = intensity;
  }
}
