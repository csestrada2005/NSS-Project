export const PREVIEW_CLIENT_SCRIPT = `
(function() {
  console.log('Preview Client Active');
  let currentMode = 'interaction';
  let selectedElement = null;
  let hoverRafId = null;

  function getLayoutContext(element) {
    const computedStyle = window.getComputedStyle(element);
    const parent = element.parentElement;
    const parentComputedStyle = parent ? window.getComputedStyle(parent) : { display: 'block', position: 'static' };
    return {
      display: computedStyle.display,
      position: computedStyle.position,
      parentDisplay: parentComputedStyle.display,
      parentPosition: parentComputedStyle.position,
      offsetTop: element.offsetTop,
      offsetLeft: element.offsetLeft,
      offsetWidth: element.offsetWidth,
      offsetHeight: element.offsetHeight,
    };
  }

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
    } else if (event.data.type === 'select-parent') {
      if (selectedElement && selectedElement.parentElement) {
        const parent = selectedElement.parentElement;
        if (parent.tagName === 'HTML') return;

        selectedElement = parent;
        const rect = parent.getBoundingClientRect();
        const layoutContext = getLayoutContext(parent);

        window.parent.postMessage({
          type: 'element-clicked',
          tagName: parent.tagName.toLowerCase(),
          className: parent.className,
          innerText: parent.innerText,
          hasChildren: parent.children.length > 0,
          dataOid: parent.getAttribute('data-oid'),
          rect: {
            top: rect.top,
            left: rect.left,
            width: rect.width,
            height: rect.height
          },
          layoutContext
        }, '*');
      }
    } else if (event.data.type === 'get-element-at') {
      const { x, y } = event.data;
      if (hoverRafId !== null) cancelAnimationFrame(hoverRafId);
      hoverRafId = requestAnimationFrame(() => {
        hoverRafId = null;
        const element = document.elementFromPoint(x, y);
        if (element) {
          const rect = element.getBoundingClientRect();
          const layoutContext = getLayoutContext(element);
          window.parent.postMessage({
            type: 'element-response',
            tagName: element.tagName.toLowerCase(),
            className: element.className,
            innerText: element.innerText,
            hasChildren: element.children.length > 0,
            dataOid: element.getAttribute('data-oid'),
            rect: {
              top: rect.top,
              left: rect.left,
              width: rect.width,
              height: rect.height
            },
            layoutContext
          }, '*');
        }
      });
    } else if (event.data.type === 'find-element-at-point') {
      const { x, y } = event.data;
      const element = document.elementFromPoint(x, y);
      if (element) {
        selectedElement = element;
        const rect = element.getBoundingClientRect();
        const layoutContext = getLayoutContext(element);
        window.parent.postMessage({
          type: 'element-clicked',
          tagName: element.tagName.toLowerCase(),
          className: element.className,
          innerText: element.innerText,
          hasChildren: element.children.length > 0,
          dataOid: element.getAttribute('data-oid'),
          rect: {
            top: rect.top,
            left: rect.left,
            width: rect.width,
            height: rect.height
          },
          layoutContext
        }, '*');
      }
    }
  });

  window.addEventListener('mouseover', (event) => {
    if (currentMode === 'visual') {
      event.stopPropagation();
      if (hoverRafId !== null) cancelAnimationFrame(hoverRafId);
      const element = event.target;
      hoverRafId = requestAnimationFrame(() => {
        hoverRafId = null;
        const rect = element.getBoundingClientRect();
        const layoutContext = getLayoutContext(element);
        window.parent.postMessage({
          type: 'element-hovered',
          tagName: element.tagName.toLowerCase(),
          className: element.className,
          innerText: element.innerText,
          hasChildren: element.children.length > 0,
          dataOid: element.getAttribute('data-oid'),
          rect: {
            top: rect.top,
            left: rect.left,
            width: rect.width,
            height: rect.height
          },
          layoutContext
        }, '*');
      });
    }
  }, true);

  window.addEventListener('click', (event) => {
    if (currentMode === 'visual') {
      event.preventDefault();
      event.stopPropagation();

      const element = event.target;
      selectedElement = element;
      const rect = element.getBoundingClientRect();
      const layoutContext = getLayoutContext(element);

      window.parent.postMessage({
        type: 'element-clicked',
        tagName: element.tagName.toLowerCase(),
        className: element.className,
        innerText: element.innerText,
        hasChildren: element.children.length > 0,
        dataOid: element.getAttribute('data-oid'),
        rect: {
          top: rect.top,
          left: rect.left,
          width: rect.width,
          height: rect.height
        },
        layoutContext
      }, '*');
    }
  }, true);
})();
`;
