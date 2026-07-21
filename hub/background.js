// Пятна на фоне медленно летают и отскакивают от краёв экрана, каждое —
// в свою сторону, пока не столкнётся с границей вьюпорта.
window.addEventListener('load', () => {
  if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;

  const movers = Array.from(document.querySelectorAll('.bg-blob')).map((el) => {
    const size = el.offsetWidth;
    const angle = Math.random() * Math.PI * 2;
    const speed = 0.12 + Math.random() * 0.1;
    return {
      el,
      size,
      x: Math.random() * Math.max(window.innerWidth - size, 0),
      y: Math.random() * Math.max(window.innerHeight - size, 0),
      vx: Math.cos(angle) * speed,
      vy: Math.sin(angle) * speed,
    };
  });

  if (!movers.length) return;

  function step() {
    movers.forEach((m) => {
      const maxX = window.innerWidth - m.size;
      const maxY = window.innerHeight - m.size;

      m.x += m.vx;
      m.y += m.vy;

      if (m.x <= 0) {
        m.x = 0;
        m.vx *= -1;
      } else if (m.x >= maxX) {
        m.x = maxX;
        m.vx *= -1;
      }

      if (m.y <= 0) {
        m.y = 0;
        m.vy *= -1;
      } else if (m.y >= maxY) {
        m.y = maxY;
        m.vy *= -1;
      }

      m.el.style.transform = `translate(${m.x}px, ${m.y}px)`;
    });

    requestAnimationFrame(step);
  }

  requestAnimationFrame(step);
});
