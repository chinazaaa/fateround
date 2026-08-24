'use client'

import React, { useEffect, useRef, useState } from 'react'
import { ChampionIcon, ChessPawnIcon, CrownIcon, DicesIcon, SpadesIcon } from '@hugeicons/core-free-icons'
import { HugeiconsIcon, type IconSvgElement } from '@hugeicons/react'

const PARTICLE_ICONS: IconSvgElement[] = [DicesIcon, SpadesIcon, CrownIcon, ChessPawnIcon, ChampionIcon]

class Particle {
  public readonly id: number
  public readonly icon: IconSvgElement
  public readonly size: number
  public readonly opacity: number

  private element: SVGSVGElement | null = null
  private position: number
  private readonly friction: number
  private readonly coordinates: { x: number; y: number }
  private readonly scale: number
  private readonly siner: number
  private readonly rotationDirection: 1 | -1
  private rotationValue: number
  private readonly steps: number

  constructor(id: number, container: HTMLElement, y: number) {
    this.id = id
    this.icon = PARTICLE_ICONS[id % PARTICLE_ICONS.length]
    this.size = 16 + Math.random() * 10
    this.opacity = 0.1 + Math.random() * 0.12
    this.coordinates = {
      x: Math.random() * container.clientWidth,
      y,
    }
    this.position = y
    this.friction = 0.35 + Math.random() * 0.55
    this.steps = Math.max(container.clientHeight / 2, 1)
    this.rotationValue = Math.random() * 24 - 12
    this.rotationDirection = Math.random() > 0.5 ? 1 : -1
    this.scale = 0.8 + Math.random() * 0.35
    this.siner = (container.clientWidth / 12) * Math.random()
  }

  public attach(element: SVGSVGElement | null): void {
    this.element = element
    this.renderPosition()
  }

  public move(): boolean {
    this.position -= this.friction
    this.rotationValue += this.friction * 0.12 * this.rotationDirection
    this.renderPosition()
    return this.position >= -this.size
  }

  private renderPosition(): void {
    if (!this.element) return

    const left = this.coordinates.x + Math.sin((this.position * Math.PI) / this.steps) * this.siner
    this.element.style.transform = `translate3d(${left}px, ${this.position}px, 0) scale(${this.scale}) rotate(${this.rotationValue}deg)`
  }
}

interface MorphicBackgroundProps {
  ballColor?: string
  className?: string
}

export const MorphicBackground: React.FC<MorphicBackgroundProps> = ({
  ballColor = 'var(--text-faint, #6d656c)',
  className = 'absolute inset-0 -z-20 bg-[var(--bg)]',
}) => {
  const particleContainerRef = useRef<HTMLDivElement>(null)
  const particlesRef = useRef<Particle[]>([])
  const nextParticleIdRef = useRef(0)
  const animationFrameId = useRef<number | undefined>(undefined)
  const isPausedRef = useRef(false)
  const [particles, setParticles] = useState<Particle[]>([])

  useEffect(() => {
    const container = particleContainerRef.current
    if (!container) return

    const handleFocus = () => {
      isPausedRef.current = false
    }
    const handleBlur = () => {
      isPausedRef.current = true
    }
    window.addEventListener('focus', handleFocus)
    window.addEventListener('blur', handleBlur)

    const createParticle = (y: number) => {
      const particle = new Particle(nextParticleIdRef.current, container, y)
      nextParticleIdRef.current += 1
      particlesRef.current.push(particle)
    }

    const initialParticleCount = Math.max(10, Math.min(20, Math.round(container.clientWidth / 70)))
    const initialParticleArea = Math.max(container.clientHeight, 320)
    for (let index = 0; index < initialParticleCount; index += 1) {
      createParticle(Math.random() * initialParticleArea)
    }
    setParticles([...particlesRef.current])

    const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches
    if (reducedMotion) {
      return () => {
        window.removeEventListener('focus', handleFocus)
        window.removeEventListener('blur', handleBlur)
        particlesRef.current = []
      }
    }

    const particleInterval = window.setInterval(() => {
      if (isPausedRef.current) return

      createParticle(container.clientHeight + 40)
      setParticles([...particlesRef.current])
    }, 520)

    const update = () => {
      if (!isPausedRef.current) {
        const activeParticles = particlesRef.current.filter((particle) => particle.move())
        if (activeParticles.length !== particlesRef.current.length) {
          particlesRef.current = activeParticles
          setParticles([...activeParticles])
        }
      }
      animationFrameId.current = requestAnimationFrame(update)
    }
    update()

    return () => {
      window.clearInterval(particleInterval)
      if (animationFrameId.current) {
        cancelAnimationFrame(animationFrameId.current)
      }
      window.removeEventListener('focus', handleFocus)
      window.removeEventListener('blur', handleBlur)
      particlesRef.current = []
    }
  }, [])

  return (
    <>
      <div ref={particleContainerRef} className="pointer-events-none absolute inset-0 z-1 overflow-hidden">
        {particles.map((particle) => (
          <HugeiconsIcon
            key={particle.id}
            ref={(element) => particle.attach(element)}
            icon={particle.icon}
            aria-hidden="true"
            color={ballColor}
            strokeWidth={1.4}
            className="absolute left-0 top-0"
            style={{
              width: particle.size,
              height: particle.size,
              opacity: particle.opacity,
              willChange: 'transform',
            }}
          />
        ))}
      </div>

      <div className={className} />
    </>
  )
}
