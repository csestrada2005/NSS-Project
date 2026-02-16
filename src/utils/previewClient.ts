export const PREVIEW_CLIENT_SCRIPT = `
(function() {
  console.log('Preview Client Active');
  let currentMode = 'interaction';

  window.addEventListener('message', (event) => {
    if (event.data.type === 'set-mode') {
      currentMode = event.data.mode;
    } else if (event.data.type === 'scroll-element') {
      const { tagName, className } = event.data;
      if (!tagName) return;

      const elements = document.getElementsByTagName(tagName);
      for (const el of elements) {
        if (className) {
            const normalize = (s) => s.split(/\\s+/).filter(Boolean).sort().join(' ');
            if (normalize(el.className) === normalize(className)) {
                el.scrollIntoView({ behavior: 'smooth', block: 'center' });
                break;
            }
        } else {
             if (!el.className) {
                 el.scrollIntoView({ behavior: 'smooth', block: 'center' });
                 break;
             }
        }
      }
    } else if (event.data.type === 'get-element-at') {
      const { x, y } = event.data;
      const element = document.elementFromPoint(x, y);
      if (element) {
        const rect = element.getBoundingClientRect();
        window.parent.postMessage({
          type: 'element-response',
          tagName: element.tagName.toLowerCase(),
          className: element.className,
          innerText: element.innerText,
          hasChildren: element.children.length > 0,
          rect: {
            top: rect.top,
            left: rect.left,
            width: rect.width,
            height: rect.height
          }
        }, '*');
      }
    } else if (event.data.type === 'find-element-at-point') {
      const { x, y } = event.data;
      const element = document.elementFromPoint(x, y);
      if (element) {
        const rect = element.getBoundingClientRect();
        window.parent.postMessage({
          type: 'element-clicked',
          tagName: element.tagName.toLowerCase(),
          className: element.className,
          innerText: element.innerText,
          hasChildren: element.children.length > 0,
          rect: {
            top: rect.top,
            left: rect.left,
            width: rect.width,
            height: rect.height
          }
        }, '*');
      }
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
        innerText: element.innerText,
        hasChildren: element.children.length > 0,
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
        innerText: element.innerText,
        hasChildren: element.children.length > 0,
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
