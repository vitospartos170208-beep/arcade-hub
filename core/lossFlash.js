// Красная вспышка при проигрыше: класс мгновенно красит фон/рамку/кнопки
// (см. lossFlash.css), затем сразу снимается — а плавный переход обратно к
// цвету темы обеспечивает transition в базовых правилах тех же элементов.
export function triggerLossFlash() {
  document.body.classList.add('flash-loss');
  // Двойной rAF гарантирует, что браузер отрисует красное состояние хотя бы
  // один кадр, прежде чем класс снимется и начнётся затухание.
  requestAnimationFrame(() => {
    requestAnimationFrame(() => {
      document.body.classList.remove('flash-loss');
    });
  });
}
