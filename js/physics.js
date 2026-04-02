/**
 * 弹珠 RPG — 物理引擎
 * 处理弹珠运动、碰撞检测、反弹向量计算
 */

class PhysicsEngine {
  constructor(game) {
    this.game = game;
  }

  /**
   * 更新所有活跃弹珠
   */
  updateBalls(balls, dt, bounds, entities) {
    for (let i = balls.length - 1; i >= 0; i--) {
      const ball = balls[i];
      if (!ball.active) continue;

      // 移动
      ball.x += ball.vx;
      ball.y += ball.vy;

      // 边界碰撞（战场四壁）
      this.checkWallCollision(ball, bounds);

      // 实体碰撞（怪物/宝箱）
      this.checkEntityCollisions(ball, entities);
    }
  }

  /**
   * 墙壁反弹
   */
  checkWallCollision(ball, bounds) {
    const r = ball.radius;
    const left = bounds.left + r;
    const right = bounds.right - r;
    const top = bounds.top + r;
    const bottom = bounds.bottom - r;

    if (ball.x < left) {
      ball.x = left;
      ball.vx = Math.abs(ball.vx); // 向右反弹
    } else if (ball.x > right) {
      ball.x = right;
      ball.vx = -Math.abs(ball.vx); // 向左反弹
    }

    if (ball.y < top) {
      ball.y = top;
      ball.vy = Math.abs(ball.vy); // 向下反弹
    } else if (ball.y > bottom) {
      // 弹珠掉出底部 → 标记为不活跃（消失）
      ball.active = false;
    }
  }

  /**
   * 圆-圆碰撞检测 + 反弹
   */
  checkEntityCollisions(ball, entities) {
    for (const entity of entities) {
      if (!entity.active) continue;

      const dx = ball.x - entity.x;
      const dy = ball.y - entity.y;
      const distSq = dx * dx + dy * dy;
      const minDist = ball.radius + entity.radius;

      if (distSq < minDist * minDist) {
        // 发生碰撞！
        const dist = Math.sqrt(distSq);
        if (dist === 0) continue; // 避免除零

        // 碰撞法线（从实体指向弹球）
        const nx = dx / dist;
        const ny = dy / dist;

        // 分离弹珠，防止穿透
        const overlap = minDist - dist;
        ball.x += nx * overlap;
        ball.y += ny * overlap;

        // 计算反射速度: v' = v - 2(v·n)n
        const dot = ball.vx * nx + ball.vy * ny;
        
        // 只有当弹珠朝向实体运动时才反弹（避免粘连）
        if (dot < 0) {
          ball.vx -= 2 * dot * nx;
          ball.vy -= 2 * dot * ny;

          // 轻微能量损失（模拟真实感）
          ball.vx *= 0.98;
          ball.vy *= 0.98;
        }

        // 触发实体受击回调（由 game 层处理伤害等）
        this.game.onBallHitEntity(ball, entity);
      }
    }
  }

  /**
   * 检测弹珠是否全部消失
   */
  allBallsInactive(balls) {
    return balls.every(b => !b.active);
  }

  /**
   * 从角色位置向目标点发射弹珠
   * 返回初始速度向量（已归一化 × BALL_SPEED）
   */
  calculateLaunchVector(fromX, fromY, toX, toY) {
    const dx = toX - fromX;
    const dy = toY - fromY;
    const len = Math.sqrt(dx * dx + dy * dy);
    
    if (len < 1) return null; // 点击太近

    return {
      vx: (dx / len) * BALL_SPEED,
      vy: (dy / len) * BALL_SPEED
    };
  }

  /**
   * 生成弹道预测点（用于绘制虚线）
   */
  getTrajectoryPoints(fromX, fromY, vx, vy, bounds, maxPoints = 25) {
    const points = [];
    let px = fromX;
    let py = fromY;
    let pvx = vx;
    let pvy = vy;
    const r = BALL_RADIUS;

    for (let i = 0; i < maxPoints; i++) {
      points.push({ x: px, y: py });

      px += pvx;
      py += pvy;

      // 简单边界预测反弹
      if (px < bounds.left + r || px > bounds.right - r) {
        pvx = -pvx;
        px = Math.max(bounds.left + r, Math.min(bounds.right - r, px));
      }
      if (py < bounds.top + r) {
        pvy = Math.abs(pvy);
        py = bounds.top + r;
      }
      if (py > bounds.bottom) break; // 掉出底部停止预测
    }

    return points;
  }
}
