import * as Babel from '@babel/standalone';

export interface TargetElement {
  tagName: string;
  className?: string;
  dataOid?: string;
}

export const injectDataIds = (code: string): string => {
  const plugin = ({ types: t }: any) => ({
    visitor: {
      JSXOpeningElement(path: any) {
        const attributes = path.node.attributes;
        const hasDataOid = attributes.some(
          (attr: any) => t.isJSXAttribute(attr) && attr.name && attr.name.name === 'data-oid'
        );

        if (!hasDataOid) {
          const id = Math.random().toString(36).substr(2, 9);
          attributes.push(
            t.jsxAttribute(t.jsxIdentifier('data-oid'), t.stringLiteral(id))
          );
        }
      }
    }
  });

  try {
    const result = Babel.transform(code, {
      filename: 'file.tsx',
      parserOpts: {
        plugins: ['typescript', 'jsx'],
        isTSX: true
      } as any,
      plugins: [plugin],
      retainLines: true,
      compact: false,
      presets: [],
    });
    return result.code || code;
  } catch (e) {
    console.error('Babel transform failed in injectDataIds:', e);
    return code;
  }
};

export const updateCode = (
  fileContent: string,
  target: TargetElement,
  updates: { className?: string; textContent?: string },
  options: { classNameMode?: 'replace' | 'merge' } = { classNameMode: 'merge' }
): string => {
  const { tagName, className, dataOid } = target;
  const { className: newClassName, textContent: newTextContent } = updates;
  const { classNameMode } = options;

  const plugin = ({ types: t }: any) => ({
    visitor: {
      JSXElement(path: any) {
        const openingElement = path.node.openingElement;
        const nameNode = openingElement.name;

        // Handle simpler case where name is an identifier
        if (!t.isJSXIdentifier(nameNode)) return;

        const name = nameNode.name;
        if (name !== tagName) return;

        // Check for data-oid if provided
        let matchesOid = false;
        if (dataOid) {
             const oidAttr = openingElement.attributes.find(
                (attr: any) => t.isJSXAttribute(attr) && attr.name && attr.name.name === 'data-oid'
             );
             if (oidAttr && t.isStringLiteral(oidAttr.value) && oidAttr.value.value === dataOid) {
                 matchesOid = true;
             }
        }

        // If dataOid is provided but doesn't match, skip this element
        if (dataOid && !matchesOid) return;

        // If dataOid is NOT provided, fallback to className matching
        if (!dataOid) {
            // Find existing className
            const classNameAttrIndex = openingElement.attributes.findIndex(
                (attr: any) => t.isJSXAttribute(attr) && attr.name && attr.name.name === 'className'
            );
            const classNameAttr = classNameAttrIndex !== -1 ? openingElement.attributes[classNameAttrIndex] : null;

            let currentClass = '';
            if (classNameAttr && t.isStringLiteral(classNameAttr.value)) {
                currentClass = classNameAttr.value.value;
            }

            const normalize = (s: string) => s.split(/\s+/).filter(Boolean).sort().join(' ');

            let isMatch = false;
            if (className) {
                if (normalize(currentClass) === normalize(className)) {
                    isMatch = true;
                }
            } else {
                if (!currentClass) {
                    isMatch = true;
                }
            }

            if (!isMatch) return;
        }

        // Apply updates
        let modified = false;

        if (newClassName !== undefined) {
            const classNameAttrIndex = openingElement.attributes.findIndex(
                (attr: any) => t.isJSXAttribute(attr) && attr.name && attr.name.name === 'className'
            );
            const classNameAttr = classNameAttrIndex !== -1 ? openingElement.attributes[classNameAttrIndex] : null;

            let finalClass = newClassName;

            if (classNameMode === 'merge') {
                 let currentClass = '';
                 if (classNameAttr && t.isStringLiteral(classNameAttr.value)) {
                     currentClass = classNameAttr.value.value;
                 }
                 // Merge logic: existing + new (deduplicated)
                 if (currentClass) {
                     const existingClasses = new Set(currentClass.split(/\s+/).filter(Boolean));
                     const newClasses = newClassName.split(/\s+/).filter(Boolean);
                     const toAdd = newClasses.filter(c => !existingClasses.has(c));
                     if (toAdd.length > 0) {
                         finalClass = `${currentClass} ${toAdd.join(' ')}`.trim();
                     } else {
                         finalClass = currentClass;
                     }
                 }
            }

            if (classNameAttr) {
                classNameAttr.value = t.stringLiteral(finalClass);
            } else {
                openingElement.attributes.push(
                    t.jsxAttribute(t.jsxIdentifier('className'), t.stringLiteral(finalClass))
                );
            }
            modified = true;
        }

        if (newTextContent !== undefined) {
            path.node.children = [t.jsxText(newTextContent)];

            if (openingElement.selfClosing) {
                openingElement.selfClosing = false;
                path.node.closingElement = t.jsxClosingElement(t.jsxIdentifier(name));
            }
            modified = true;
        }

        if (modified) {
            path.stop(); // Stop after first match
        }
      }
    }
  });

  try {
      const result = Babel.transform(fileContent, {
          filename: 'file.tsx',
          parserOpts: {
              plugins: ['typescript', 'jsx'],
              // isTSX: true is important for parsing <Type> assertions vs <Tag>
              isTSX: true
          } as any,
          plugins: [plugin],
          retainLines: true,
          compact: false,
          // Disable generating compilation artifacts
          presets: [],
      });
      return result.code || fileContent;
  } catch (e) {
      console.error('Babel transform failed:', e);
      return fileContent;
  }
};
