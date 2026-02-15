export const PREVIEW_CLIENT_SCRIPT = `
(function() {
  let currentMode = 'interaction';

  window.addEventListener('message', (event) => {
    if (event.data.type === 'set-mode') {
      currentMode = event.data.mode;
    }
  });

  window.addEventListener('mouseover', (event) => {
    if (currentMode === 'visual') {
      event.stopPropagation();
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
  }, true);

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
})();
`;
