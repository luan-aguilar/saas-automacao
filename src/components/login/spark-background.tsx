"use client";

import { useEffect, useRef } from "react";

/**
 * Fundo interativo da tela de login: um rastro de faíscas douradas/azuis que
 * segue o mouse, mais algumas partículas ambientes subindo devagar mesmo sem
 * interação (atmosfera "tech" mesmo parado). Tudo em Canvas 2D puro (sem
 * biblioteca nova) — leve o bastante pra não pesar numa tela que só existe
 * pra pedir e-mail/senha.
 *
 * Respeita `prefers-reduced-motion`: com a preferência ativa, não gera
 * partículas (fundo fica só o gradiente estático do body).
 */

const GOLD_RGB = "250, 191, 36";
const BLUE_RGB = "60, 131, 246";

type Particle = {
  x: number;
  y: number;
  vx: number;
  vy: number;
  life: number; // 1 -> 0
  decay: number;
  size: number;
  rgb: string;
};

function makeParticle(x: number, y: number, fromCursor: boolean): Particle {
  const angle = Math.random() * Math.PI * 2;
  const speed = fromCursor ? 0.5 + Math.random() * 1.6 : 0.08 + Math.random() * 0.22;
  return {
    x: x + (Math.random() - 0.5) * 6,
    y: y + (Math.random() - 0.5) * 6,
    vx: Math.cos(angle) * speed,
    vy: fromCursor ? Math.sin(angle) * speed : -speed,
    life: 1,
    decay: fromCursor ? 0.02 + Math.random() * 0.015 : 0.006 + Math.random() * 0.004,
    size: fromCursor ? 1.2 + Math.random() * 2 : 0.6 + Math.random() * 1.2,
    rgb: Math.random() > 0.45 ? GOLD_RGB : BLUE_RGB,
  };
}

export function SparkBackground() {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    const ctx = canvas?.getContext("2d");
    if (!canvas || !ctx) return;

    const prefersReducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

    let width = 0;
    let height = 0;
    function resize() {
      width = window.innerWidth;
      height = window.innerHeight;
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      canvas!.width = width * dpr;
      canvas!.height = height * dpr;
      canvas!.style.width = `${width}px`;
      canvas!.style.height = `${height}px`;
      ctx!.setTransform(dpr, 0, 0, dpr, 0, 0);
    }
    resize();
    window.addEventListener("resize", resize);

    const particles: Particle[] = [];
    const MAX_PARTICLES = 240;

    function onPointerMove(e: PointerEvent) {
      if (prefersReducedMotion) return;
      particles.push(makeParticle(e.clientX, e.clientY, true));
      particles.push(makeParticle(e.clientX, e.clientY, true));
      if (particles.length > MAX_PARTICLES) {
        particles.splice(0, particles.length - MAX_PARTICLES);
      }
    }
    window.addEventListener("pointermove", onPointerMove);

    let ambientTimer = 0;
    let rafId = 0;

    function tick() {
      ctx!.clearRect(0, 0, width, height);

      if (!prefersReducedMotion) {
        ambientTimer++;
        if (ambientTimer > 18 && particles.length < MAX_PARTICLES) {
          ambientTimer = 0;
          particles.push(makeParticle(Math.random() * width, height + 10, false));
        }
      }

      for (let i = particles.length - 1; i >= 0; i--) {
        const p = particles[i];
        p.x += p.vx;
        p.y += p.vy;
        p.vy += 0.0025; // leve gravidade nas faíscas do cursor
        p.life -= p.decay;
        if (p.life <= 0) {
          particles.splice(i, 1);
          continue;
        }

        const alpha = p.life * 0.85;
        const radius = p.size * (0.6 + p.life * 0.6) * 4;
        const gradient = ctx!.createRadialGradient(p.x, p.y, 0, p.x, p.y, radius);
        gradient.addColorStop(0, `rgba(${p.rgb}, ${alpha})`);
        gradient.addColorStop(1, `rgba(${p.rgb}, 0)`);
        ctx!.fillStyle = gradient;
        ctx!.beginPath();
        ctx!.arc(p.x, p.y, radius, 0, Math.PI * 2);
        ctx!.fill();
      }

      rafId = requestAnimationFrame(tick);
    }
    rafId = requestAnimationFrame(tick);

    return () => {
      window.removeEventListener("resize", resize);
      window.removeEventListener("pointermove", onPointerMove);
      cancelAnimationFrame(rafId);
    };
  }, []);

  return <canvas ref={canvasRef} aria-hidden="true" className="pointer-events-none fixed inset-0 z-0" />;
}
