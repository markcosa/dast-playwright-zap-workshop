// Contador de caracteres para el foro (script externo: compatible con CSP 'self')
document.addEventListener('DOMContentLoaded', () => {
  const textarea = document.getElementById('text');
  if (!textarea) return;
  const counter = document.createElement('p');
  counter.className = 'muted counter';
  counter.setAttribute('aria-live', 'polite');
  const update = () => { counter.textContent = `${textarea.value.length} / ${textarea.maxLength}`; };
  textarea.after(counter);
  textarea.addEventListener('input', update);
  update();
});
