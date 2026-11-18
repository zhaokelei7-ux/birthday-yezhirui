export function startFireworks(canvas, { duration = 8000 } = {}) {
  const context = canvas.getContext('2d');
  if (!context) return () => {};

  const colors = ['#ffd166', '#ff8a65', '#7fd1ae', '#7fb7ff', '#ff9fb2', '#fff4de'];
  let width = 0;
  let height = 0;
  let particles = [];
  let frameId = 0;
  let stopped = false;
  let lastBurst = 0;
  const startedAt = performance.now();

  function resize() {
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    width = window.innerWidth;
    height = window.innerHeight;
    canvas.width = Math.floor(width * dpr);
    canvas.height = Math.floor(height * dpr);
    canvas.style.width = `${width}px`;
    canvas.style.height = `${height}px`;
    context.setTransform(dpr, 0, 0, dpr, 0, 0);
  }

  function burst(x, y) {
    const color = colors[Math.floor(Math.random() * colors.length)];
    const count = 42 + Math.floor(Math.random() * 20);
    const speed = 60 + Math.random() * 90;

    for (let index = 0; index < count; index += 1) {
      const angle = (Math.PI * 2 * index) / count + Math.random() * 0.08;
      const velocity = speed * (0.55 + Math.random() * 0.7);
      particles.push({
        x,
        y,
        vx: Math.cos(angle) * velocity,
        vy: Math.sin(angle) * velocity,
        life: 1,
        decay: 0.008 + Math.random() * 0.012,
        color,
        size: 1.4 + Math.random() * 1.8,
      });
    }
  }

  function frame(now) {
    if (stopped) return;

    const elapsed = now - startedAt;
    context.clearRect(0, 0, width, height);

    if (now - lastBurst > 420 && elapsed < duration - 1200) {
      lastBurst = now;
      burst(
        width * (0.2 + Math.random() * 0.6),
        height * (0.15 + Math.random() * 0.4),
      );
    }

    particles = particles.filter((particle) => particle.life > 0);
    for (const particle of particles) {
      particle.x += particle.vx / 60;
      particle.y += particle.vy / 60;
      particle.vy += 0.02;
      particle.vx *= 0.995;
      particle.vy *= 0.995;
      particle.life -= particle.decay;
      context.globalAlpha = Math.max(0, particle.life);
      context.fillStyle = particle.color;
      context.beginPath();
      context.arc(particle.x, particle.y, particle.size, 0, Math.PI * 2);
      context.fill();
    }
    context.globalAlpha = 1;

    if (elapsed < duration || particles.length > 0) {
      frameId = requestAnimationFrame(frame);
    } else {
      context.clearRect(0, 0, width, height);
    }
  }

  function stop() {
    stopped = true;
    cancelAnimationFrame(frameId);
    window.removeEventListener('resize', resize);
    context.clearRect(0, 0, width, height);
  }

  resize();
  window.addEventListener('resize', resize);
  frameId = requestAnimationFrame(frame);
  return stop;
}
