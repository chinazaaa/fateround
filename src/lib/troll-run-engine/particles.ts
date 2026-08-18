/**
 * Particle system for death effects, landing dust, and coin sparkles.
 */

import type { Particle } from './types'

export class ParticleManager {
  private particles: Particle[] = []

  public emitDeathPoof(x: number, y: number, color = '#ffffff'): void {
    const count = 16
    for (let i = 0; i < count; i++) {
      const angle = (Math.PI * 2 * i) / count + (Math.random() - 0.5) * 0.4
      const speed = 60 + Math.random() * 120
      this.particles.push({
        x,
        y,
        vx: Math.cos(angle) * speed,
        vy: Math.sin(angle) * speed,
        life: 0.35 + Math.random() * 0.2,
        maxLife: 0.5,
        color,
        size: 2 + Math.random() * 3,
      })
    }
  }

  public emitLandingDust(x: number, y: number): void {
    for (let i = 0; i < 6; i++) {
      const dir = i % 2 === 0 ? 1 : -1
      this.particles.push({
        x: x + (Math.random() - 0.5) * 8,
        y,
        vx: dir * (20 + Math.random() * 40),
        vy: -15 - Math.random() * 25,
        life: 0.15 + Math.random() * 0.1,
        maxLife: 0.25,
        color: '#94a3b8',
        size: 1.5 + Math.random() * 1.5,
      })
    }
  }

  public emitDoorSparkles(x: number, y: number): void {
    for (let i = 0; i < 20; i++) {
      const angle = Math.random() * Math.PI * 2
      const speed = 40 + Math.random() * 80
      this.particles.push({
        x,
        y,
        vx: Math.cos(angle) * speed,
        vy: Math.sin(angle) * speed,
        life: 0.4 + Math.random() * 0.3,
        maxLife: 0.7,
        color: Math.random() > 0.5 ? '#facc15' : '#38bdf8',
        size: 2 + Math.random() * 2,
      })
    }
  }

  public update(dt: number): void {
    for (let i = this.particles.length - 1; i >= 0; i--) {
      const p = this.particles[i]
      p.life -= dt
      if (p.life <= 0) {
        this.particles.splice(i, 1)
        continue
      }
      p.x += p.vx * dt
      p.y += p.vy * dt
      p.vx *= 0.95 // air drag
      p.vy += 200 * dt // subtle particle gravity
    }
  }

  public render(ctx: CanvasRenderingContext2D): void {
    for (const p of this.particles) {
      const alpha = Math.max(0, p.life / p.maxLife)
      ctx.save()
      ctx.globalAlpha = alpha
      ctx.fillStyle = p.color
      ctx.fillRect(Math.round(p.x - p.size / 2), Math.round(p.y - p.size / 2), p.size, p.size)
      ctx.restore()
    }
  }

  public clear(): void {
    this.particles = []
  }
}
