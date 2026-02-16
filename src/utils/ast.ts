import * as Babel from '@babel/standalone';

export interface TargetElement {
  tagName: string;
  className?: string;
}

export const updateCode = (fileContent: string, target: TargetElement, updates: { className?: string; textContent?: string }): string => {
  const { tagName, className } = target;
  const { className: newClassName, textContent: newTextContent } = updates;

  const plugin = ({ types: t }: any) => ({
    visitor: {
      JSXElement(path: any) {
        const openingElement = path.node.openingElement;
        const nameNode = openingElement.name;

        // Handle simpler case where name is an identifier
        if (!t.isJSXIdentifier(nameNode)) return;

        const name = nameNode.name;

        if (name !== tagName) return;

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

        let modified = false;

        if (newClassName !== undefined) {
            if (classNameAttr) {
                classNameAttr.value = t.stringLiteral(newClassName);
            } else {
                openingElement.attributes.push(
                    t.jsxAttribute(t.jsxIdentifier('className'), t.stringLiteral(newClassName))
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
