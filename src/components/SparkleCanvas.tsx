import { useRef, useEffect } from "react";

interface Particle {
  x: number;
  y: number;
  size: number;
  opacity: number;
  speed: number;
  phase: number;
  driftX: number;
  driftY: number;
  glow: boolean;
}

const SparkleCanvas = () => {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    let animId: number;
    const particles: Particle[] = [];
    const PARTICLE_COUNT = 100;

    const resize = () => {
      const parent = canvas.parentElement;
      if (!parent) return;
      canvas.width = parent.clientWidth;
      canvas.height = parent.clientHeight;
    };

    const initParticles = () => {
      particles.length = 0;
      for (let i = 0; i < PARTICLE_COUNT; i++) {
        particles.push({
          x: Math.random() * canvas.width,
          y: Math.random() * canvas.height,
          size: Math.random() * 2.5 + 0.5,
          opacity: Math.random(),
          speed: Math.random() * 0.8 + 0.2,
          phase: Math.random() * Math.PI * 2,
          driftX: (Math.random() - 0.5) * 0.3,
          driftY: (Math.random() - 0.5) * 0.15,
          glow: Math.random() < 0.25,
        });
      }
    };

    resize();
    initParticles();

    const ro = new ResizeObserver(resize);
    ro.observe(canvas.parentElement!);

    let t = 0;
    const draw = () => {
      t += 0.016;
      ctx.clearRect(0, 0, canvas.width, canvas.height);

      for (const p of particles) {
        const twinkle = 0.3 + 0.7 * ((Math.sin(t * p.speed * 2 + p.phase) + 1) / 2);

        p.x += p.driftX;
        p.y += p.driftY;

        if (p.x < 0) p.x = canvas.width;
        if (p.x > canvas.width) p.x = 0;
        if (p.y < 0) p.y = canvas.height;
        if (p.y > canvas.height) p.y = 0;

        ctx.beginPath();
        if (p.glow) {
          ctx.shadowBlur = 8;
          ctx.shadowColor = `rgba(255,255,255,${twinkle * 0.6})`;
        } else {
          ctx.shadowBlur = 0;
        }
        ctx.fillStyle = `rgba(255,255,255,${twinkle * p.opacity})`;
        ctx.arc(p.x, p.y, p.size, 0, Math.PI * 2);
        ctx.fill();
      }
      ctx.shadowBlur = 0;

      animId = requestAnimationFrame(draw);
    };

    animId = requestAnimationFrame(draw);

    return () => {
      cancelAnimationFrame(animId);
      ro.disconnect();
    };
  }, []);

  return (
    <canvas
      ref={canvasRef}
      className="absolute inset-0 w-full h-full pointer-events-none"
      style={{ zIndex: 1 }}
    />
  );
};

export default SparkleCanvas;