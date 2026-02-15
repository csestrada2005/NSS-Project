export const PREVIEW_CLIENT_SCRIPT = `
let currentMode = 'interaction';

window.addEventListener('message', (event) => {
  if (event.data.type === 'set-mode') {
    currentMode = event.data.mode;
  }
  // Keep get-element for legacy or specific requests
  if (event.data.type === 'get-element') {
    const element = document.elementFromPoint(event.data.x, event.data.y);
    if (!element) return;
    const rect = element.getBoundingClientRect();
    window.parent.postMessage({
      type: 'element-selected',
      tagName: element.tagName.toLowerCase(),
      className: element.className,
      rect: {
        top: rect.top,
        left: rect.left,
        width: rect.width,
        height: rect.height
      }
    }, '*');
  }
});

window.addEventListener('click', (event) => {
  if (currentMode === 'visual') {
    event.preventDefault();
    event.stopPropagation();

    const element = event.target;
    const rect = element.getBoundingClientRect();

    window.parent.postMessage({
      type: 'element-clicked',
      tagName: element.tagName.toLowerCase(),
      className: element.className,
      rect: {
        top: rect.top,
        left: rect.left,
        width: rect.width,
        height: rect.height
      }
    }, '*');
  }
}, true);

// Add hover support for visual mode
window.addEventListener('mouseover', (event) => {
  if (currentMode === 'visual') {
    const element = event.target;
    const rect = element.getBoundingClientRect();

    window.parent.postMessage({
      type: 'element-hovered',
      tagName: element.tagName.toLowerCase(),
      className: element.className,
      rect: {
        top: rect.top,
        left: rect.left,
        width: rect.width,
        height: rect.height
      }
    }, '*');
  }
});
`;
