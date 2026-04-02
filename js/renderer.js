/**
 * 弹珠 RPG — 渲染器 v2（稳健版）
 * 核心原则：实体用几何图形主渲染，精灵图作为增强层
 * 即使所有图片加载失败，游戏也完整可玩
 */

class Renderer {
  constructor(canvas, ctx) {
    this.canvas = canvas;
    this.ctx = ctx;
    this.particles = [];
    this.floatingTexts = [];
    this.shake = { x: 0, y: 0, duration: 0 };
    this.frameCount = 0;
    this.imageCache = {};
  }

  // ==================== 图片加载（非阻塞）====================
  preloadImage(src) {
    return new Promise((resolve) => {
      if (this.imageCache[src]) { resolve(this.imageCache[src]); return; }
      const img = new Image();
      img.onload = () => { this.imageCache[src] = img; resolve(img); };
      img.onerror = () => resolve(null);
      img.src = src;
    });
  }

  async preloadAll(sprites) {
    await Promise.all(sprites.map(s => this.preloadImage(s)));
  }

  // ==================== 主渲染入口 ====================
  render(game) {
    const ctx = this.ctx;
    const w = this.canvas.width;
    const h = this.canvas.height;
    this.frameCount++;

    ctx.clearRect(0, 0, w, h);

    // 屏幕震动
    ctx.save();
    if (this.shake.duration > 0) {
      this.shake.x = (Math.random() - 0.5) * this.shake.duration * 0.5;
      this.shake.y = (Math.random() - 0.5) * this.shake.duration * 0.5;
      ctx.translate(this.shake.x, this.shake.y);
      this.shake.duration--;
    }

    this.drawBackground(w, h);
    this.drawGrid(game.gridBounds);

    // === 实体（核心：几何图形，不依赖图片）===
    for (const entity of game.entities) {
      if (entity instanceof Monster) this.drawMonster(entity);
      else if (entity instanceof Chest || entity instanceof MysteryBox) this.drawChest(entity);
    }

    // 玩家角色
    this.drawPlayer(game.player);

    // 弹珠
    for (const ball of game.balls) {
      if (ball.active) this.drawBall(ball);
    }

    // 弹道线
    if (game.state === 'aiming' && game.trajectoryPoints.length > 1) {
      this.drawTrajectory(game.trajectoryPoints);
    }

    this.updateAndDrawParticles(ctx);
    this.updateAndDrawFloatingTexts(ctx);

    ctx.restore();
  }

  // ==================== 背景 ====================
  drawBackground(w, h) {
    const ctx = this.ctx;
    const grad = ctx.createRadialGradient(w * 0.5, h * 0.35, 0, w * 0.5, h * 0.5, w * 0.75);
    grad.addColorStop(0, '#1e1410');
    grad.addColorStop(1, '#0a0604');
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, w, h);
  }

  // ==================== 网格（清晰可见版）====================
  drawGrid(bounds) {
    if (!bounds) return;
    const ctx = this.ctx;
    const { left, top, cellW, cellH, cols, rows } = bounds;

    // 格子背景交替色
    for (let r = 0; r < rows; r++) {
      for (let c = 0; c < cols; c++) {
        const x = left + c * cellW;
        const y = top + r * cellH;
        if ((r + c) % 2 === 0) {
          ctx.fillStyle = 'rgba(255,255,255,0.018)';
        } else {
          ctx.fillStyle = 'rgba(255,255,255,0.008)';
        }
        ctx.fillRect(x, y, cellW, cellH);
      }
    }

    // 网格线（清晰）
    ctx.strokeStyle = 'rgba(100, 200, 120, 0.2)';
    ctx.lineWidth = 1;

    for (let c = 0; c <= cols; c++) {
      const x = left + c * cellW;
      ctx.beginPath(); ctx.moveTo(x, top); ctx.lineTo(x, top + rows * cellH); ctx.stroke();
    }
    for (let r = 0; r <= rows; r++) {
      const y = top + r * cellH;
      ctx.beginPath(); ctx.moveTo(left, y); ctx.lineTo(left + cols * cellW, y); ctx.stroke();
    }
  }

  // ==================== 怪物（几何图形主渲染）====================
  drawMonster(m) {
    const ctx = this.ctx;
    const t = this.frameCount * 0.06;

    // 死亡动画
    if (!m.active && m.deathAnimTimer > 0) {
      const progress = 1 - m.deathAnimTimer / 30;
      const scale = 1 + progress * 0.8;
      const alpha = 1 - progress;
      ctx.globalAlpha = alpha;
      ctx.save();
      ctx.translate(m.x, m.y);
      ctx.scale(scale, scale);
      this.drawMonsterShape(m, 0);
      ctx.restore();
      ctx.globalAlpha = 1;
      return;
    }
    if (!m.active) return;

    // 呼吸动画
    const breathe = Math.sin(t) * 0.04;
    const floatY = Math.sin(t * 1.3 + m.gridCol) * 1.5;

    ctx.save();
    ctx.translate(m.x, m.y + floatY);
    ctx.scale(1 + breathe, 1 + breathe);

    if (m.hitFlash > 0) { ctx.globalAlpha = 0.7; m.hitFlash--; }

    // 1. 先画几何形状（始终可见）
    this.drawMonsterShape(m, t);

    // 2. 再叠加精灵图（如果加载成功）
    const img = this.imageCache[m.spriteFile];
    if (img) {
      ctx.globalAlpha = ctx.globalAlpha * 0.9;
      ctx.drawImage(img, -m.radius * 1.1, -m.radius * 1.1, m.radius * 2.2, m.radius * 2.2);
    }

    ctx.globalAlpha = 1;
    ctx.restore();

    // 血条
    if (m.hp < m.maxHp) {
      this.drawHpBar(m.x, m.y - m.radius - 8, m.getHpRatio(), m.color);
    }
  }

  // 怠物几何形状（纯 Canvas 绘制，不依赖任何图片）
  drawMonsterShape(m, t) {
    const ctx = this.ctx;
    const r = m.radius;
    const c = m.color;

    // 外发光
    const glow = ctx.createRadialGradient(0, 0, r * 0.5, 0, 0, r * 1.6);
    glow.addColorStop(0, this.hexToRgba(c, 0.15));
    glow.addColorStop(1, this.hexToRgba(c, 0));
    ctx.fillStyle = glow;
    ctx.beginPath(); ctx.arc(0, 0, r * 1.6, 0, Math.PI * 2); ctx.fill();

    // 身体（圆形渐变）
    const body = ctx.createRadialGradient(-r * 0.25, -r * 0.3, 0, 0, 0, r);
    body.addColorStop(0, this.lightenColor(c, 0.4));
    body.addColorStop(0.7, c);
    body.addColorStop(1, this.darkenColor(c, 0.35));
    ctx.fillStyle = body;
    ctx.beginPath(); ctx.arc(0, 0, r, 0, Math.PI * 2); ctx.fill();

    // 边框
    ctx.strokeStyle = this.hexToRgba(c, 0.5);
    ctx.lineWidth = 1.5;
    ctx.beginPath(); ctx.arc(0, 0, r, 0, Math.PI * 2); ctx.stroke();

    // 眼睛（两个小圆点）
    const eyeY = -r * 0.15;
    const eyeSpacing = r * 0.3;
    ctx.fillStyle = '#fff';
    ctx.beginPath(); ctx.arc(-eyeSpacing, eyeY, r * 0.18, 0, Math.PI * 2); ctx.fill();
    ctx.beginPath(); ctx.arc(eyeSpacing, eyeY, r * 0.18, 0, Math.PI * 2); ctx.fill();
    // 瞳孔
    ctx.fillStyle = '#111';
    ctx.beginPath(); ctx.arc(-eyeSpacing + 1, eyeY + 1, r * 0.08, 0, Math.PI * 2); ctx.fill();
    ctx.beginPath(); ctx.arc(eyeSpacing + 1, eyeY + 1, r * 0.08, 0, Math.PI * 2); ctx.fill();

    // 名字标签
    ctx.fillStyle = 'rgba(255,255,255,0.7)';
    ctx.font = `bold ${Math.max(8, r * 0.4)}px "Nunito", sans-serif`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(m.name, 0, r + 11);
  }

  // ==================== 宝箱（几何图形）====================
  drawChest(chest) {
    const ctx = this.ctx;
    const t = this.frameCount * 0.05;
    if (!chest.active) return;

    const bounce = Math.abs(Math.sin(t * 2)) * 2;
    const r = chest.radius;
    const gold = '#FFD54F';

    ctx.save();
    ctx.translate(chest.x, chest.y - bounce);

    // 光晕
    const glow = ctx.createRadialGradient(0, 0, r * 0.3, 0, 0, r * 1.8);
    glow.addColorStop(0, 'rgba(255,213,79,0.12)');
    glow.addColorStop(1, 'rgba(255,213,79,0)');
    ctx.fillStyle = glow;
    ctx.beginPath(); ctx.arc(0, 0, r * 1.8, 0, Math.PI * 2); ctx.fill();

    // 箱体（圆角矩形）
    const boxGrad = ctx.createLinearGradient(-r, -r * 0.8, r, r * 0.8);
    boxGrad.addColorStop(0, '#FFEC53');
    boxGrad.addColorStop(0.5, '#FFB300');
    boxGrad.addColorStop(1, '#FF8F00');
    ctx.fillStyle = boxGrad;
    this.roundRect(ctx, -r * 0.85, -r * 0.65, r * 1.7, r * 1.3, 5);
    ctx.fill();
    ctx.strokeStyle = 'rgba(255,255,255,0.25)';
    ctx.lineWidth = 1;
    this.roundRect(ctx, -r * 0.85, -r * 0.65, r * 1.7, r * 1.3, 5);
    ctx.stroke();

    // 锁扣
    ctx.fillStyle = '#BF360C';
    ctx.fillRect(-4, -3, 8, 8);
    ctx.fillStyle = '#FFD54F';
    ctx.beginPath(); ctx.arc(0, 1, 2.5, 0, Math.PI * 2); ctx.fill();

    // 叠加精灵图
    const img = this.imageCache[chest.spriteFile];
    if (img) ctx.drawImage(img, -r * 1.1, -r * 1.1, r * 2.2, r * 2.2);

    ctx.restore();
  }

  // ==================== 玩家角色（几何图形）====================
  drawPlayer(player) {
    if (!player) return;
    const ctx = this.ctx;
    const t = this.frameCount * 0.04;
    const breathe = Math.sin(t) * 0.03;
    const r = player.radius;

    ctx.save();
    ctx.translate(player.x, player.y);
    ctx.scale(1 + breathe, 1 + breathe);

    // 底部光环
    const glow = ctx.createRadialGradient(0, 6, 0, 0, 6, r + 18);
    glow.addColorStop(0, 'rgba(79,195,247,0.18)');
    glow.addColorStop(1, 'rgba(79,195,247,0)');
    ctx.fillStyle = glow;
    ctx.beginPath(); ctx.arc(0, 6, r + 18, 0, Math.PI * 2); ctx.fill();

    // 身体
    const body = ctx.createRadialGradient(-r * 0.2, -r * 0.3, 0, 0, 0, r);
    body.addColorStop(0, '#81D4FA');
    body.addColorStop(0.5, '#29B6F6');
    body.addColorStop(1, '#0277BD');
    ctx.fillStyle = body;
    ctx.beginPath(); ctx.arc(0, 0, r, 0, Math.PI * 2); ctx.fill();

    // 边框
    ctx.strokeStyle = 'rgba(79,195,247,0.6)';
    ctx.lineWidth = 2;
    ctx.beginPath(); ctx.arc(0, 0, r, 0, Math.PI * 2); ctx.stroke();

    // 帽子/头饰（小三角）
    ctx.fillStyle = '#FFD54F';
    ctx.beginPath();
    ctx.moveTo(-10, -r + 2);
    ctx.lineTo(10, -r + 2);
    ctx.lineTo(0, -r - 10);
    ctx.closePath();
    ctx.fill();

    // 脸
    ctx.fillStyle = '#fff';
    ctx.beginPath(); ctx.arc(-6, -2, 4, 0, Math.PI * 2); ctx.fill();
    ctx.beginPath(); ctx.arc(6, -2, 4, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = '#111';
    ctx.beginPath(); ctx.arc(-5, -1, 2, 0, Math.PI * 2); ctx.fill();
    ctx.beginPath(); ctx.arc(7, -1, 2, 0, Math.PI * 2); ctx.fill();

    // 微笑
    ctx.strokeStyle = '#fff';
    ctx.lineWidth = 1.5;
    ctx.beginPath(); ctx.arc(0, 4, 6, 0.2 * Math.PI, 0.8 * Math.PI); ctx.stroke();

    // 叠加精灵图
    const img = this.imageCache[player.spriteFile];
    if (img) ctx.drawImage(img, -player.spriteW / 2, -player.spriteH / 2, player.spriteW, player.spriteH);

    ctx.restore();
  }

  // ==================== 弹珠（醒目版）====================
  drawBall(ball) {
    const ctx = this.ctx;
    const r = ball.radius;

    // 拖尾
    if (ball._prevX !== undefined) {
      for (let i = 3; i >= 1; i--) {
        const alpha = 0.12 * (4 - i);
        const tr = r * (1 - i * 0.12);
        ctx.beginPath();
        ctx.arc(
          ball.x - ball.vx * i * 0.5,
          ball.y - ball.vy * i * 0.5,
          tr, 0, Math.PI * 2
        );
        ctx.fillStyle = `rgba(255,255,255,${alpha})`;
        ctx.fill();
      }
    }
    ball._prevX = ball.x;
    ball._prevY = ball.y;

    // 外发光（更大更亮）
    const glow = ctx.createRadialGradient(ball.x, ball.y, 0, ball.x, ball.y, r * 4);
    glow.addColorStop(0, 'rgba(255,255,255,0.45)');
    glow.addColorStop(0.3, 'rgba(180,220,255,0.15)');
    glow.addColorStop(1, 'rgba(180,220,255,0)');
    ctx.fillStyle = glow;
    ctx.beginPath(); ctx.arc(ball.x, ball.y, r * 4, 0, Math.PI * 2); ctx.fill();

    // 本体
    const body = ctx.createRadialGradient(
      ball.x - r * 0.3, ball.y - r * 0.3, 0,
      ball.x, ball.y, r
    );
    body.addColorStop(0, '#ffffff');
    body.addColorStop(0.6, '#e0f0ff');
    body.addColorStop(1, '#66aaff');
    ctx.fillStyle = body;
    ctx.beginPath(); ctx.arc(ball.x, ball.y, r, 0, Math.PI * 2); ctx.fill();

    // 高光
    ctx.fillStyle = 'rgba(255,255,255,0.95)';
    ctx.beginPath(); ctx.arc(ball.x - r * 0.32, ball.y - r * 0.32, r * 0.3, 0, Math.PI * 2); ctx.fill();
  }

  // ==================== 弹道预测线 ====================
  drawTrajectory(points) {
    if (points.length < 2) return;
    const ctx = this.ctx;
    ctx.setLineDash([6, 8]);
    ctx.lineDashOffset = -this.frameCount * 0.5;
    ctx.strokeStyle = 'rgba(255,255,255,0.3)';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(points[0].x, points[0].y);
    for (let i = 1; i < points.length; i++) ctx.lineTo(points[i].x, points[i].y);
    ctx.stroke();
    ctx.setLineDash([]);

    const last = points[points.length - 1];
    ctx.beginPath(); ctx.arc(last.x, last.y, 5, 0, Math.PI * 2);
    ctx.fillStyle = 'rgba(255,255,255,0.35)';
    ctx.fill();
  }

  // ==================== 血条 ====================
  drawHpBar(x, y, ratio, color) {
    const ctx = this.ctx;
    const barW = 36, barH = 4;
    ctx.fillStyle = 'rgba(0,0,0,0.55)';
    ctx.fillRect(x - barW / 2, y, barW, barH);
    const c = ratio > 0.5 ? '#4CAF50' : ratio > 0.25 ? '#FF9800' : '#F44336';
    ctx.fillStyle = c;
    ctx.fillRect(x - barW / 2, y, barW * ratio, barH);
    ctx.strokeStyle = 'rgba(255,255,255,0.12)';
    ctx.lineWidth = 0.5;
    ctx.strokeRect(x - barW / 2, y, barW, barH);
  }

  // ==================== 圆角矩形辅助 ====================
  roundRect(ctx, x, y, w, h, rad) {
    ctx.beginPath();
    ctx.moveTo(x + rad, y);
    ctx.lineTo(x + w - rad, y);
    ctx.quadraticCurveTo(x + w, y, x + w, y + rad);
    ctx.lineTo(x + w, y + h - rad);
    ctx.quadraticCurveTo(x + w, y + h, x + w - rad, y + h);
    ctx.lineTo(x + rad, y + h);
    ctx.quadraticCurveTo(x, y + h, x, y + h - rad);
    ctx.lineTo(x, y + rad);
    ctx.quadraticCurveTo(x, y, x + rad, y);
    ctx.closePath();
  }

  // ==================== 颜色工具 ====================
  hexToRgba(hex, alpha) {
    const r = parseInt(hex.slice(1, 3), 16);
    const g = parseInt(hex.slice(3, 5), 16);
    const b = parseInt(hex.slice(5, 7), 16);
    return `rgba(${r},${g},${b},${alpha})`;
  }

  lightenColor(hex, factor) {
    const r = parseInt(hex.slice(1, 3), 16);
    const g = parseInt(hex.slice(3, 5), 16);
    const b = parseInt(hex.slice(5, 7), 16);
    return `rgb(${Math.min(255, r + (255 - r) * factor)}, ${Math.min(255, g + (255 - g) * factor)}, ${Math.min(255, b + (255 - b) * factor)})`;
  }

  darkenColor(hex, factor) {
    const r = parseInt(hex.slice(1, 3), 16);
    const g = parseInt(hex.slice(3, 5), 16);
    const b = parseInt(hex.slice(5, 7), 16);
    return `rgb(${Math.floor(r * factor)}, ${Math.floor(g * factor)}, ${Math.floor(b * factor)})`;
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
        type: config.type || 'circle',
        gravity: config.gravity || 0,
        decay: config.decay || 0.96,
      });
    }
  }

  updateAndDrawParticles(ctx) {
    for (let i = this.particles.length - 1; i >= 0; i--) {
      const p = this.particles[i];
      p.x += p.vx; p.y += p.vy;
      p.vy += p.gravity;
      p.vx *= p.decay; p.vy *= p.decay;
      p.life--;
      const alpha = p.life / p.maxLife;
      ctx.globalAlpha = alpha;
      ctx.fillStyle = p.color;
      if (p.type === 'circle') {
        ctx.beginPath(); ctx.arc(p.x, p.y, p.size * alpha, 0, Math.PI * 2); ctx.fill();
      } else {
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
      ft.y -= 1.2;
      ft.life--;
      const alpha = ft.life / ft.maxLife;
      ctx.globalAlpha = alpha;
      ctx.fillStyle = ft.color;
      ctx.font = 'bold 13px "Nunito", sans-serif';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(ft.text, ft.x, ft.y);
      ctx.globalAlpha = 1;
      if (ft.life <= 0) this.floatingTexts.splice(i, 1);
    }
  }

  triggerShake(intensity = 6) {
    this.shake.duration = intensity;
  }
}
