import * as Babel from '@babel/standalone';
import type { FileSystemTree } from '@webcontainer/api';
import type { Node, Edge } from '@xyflow/react';

export interface PropDef {
  name: string;
  type: 'string' | 'boolean' | 'number' | 'enum';
  options?: string[];
}

export interface TargetElement {
  tagName: string;
  className?: string;
  dataOid?: string;
}

export interface GraphData {
    nodes: Node[];
    edges: Edge[];
}

export interface LayoutDelta {
  dx: number;
  dy: number;
  dw?: number;
  dh?: number;
}

export interface LayoutContext {
  display: string;
  position: string;
  parentDisplay: string;
  parentPosition: string;
}

/**
 * Removes any existing class starting with `prefix` from `existing` and appends `newValue`.
 */
export function replaceOrAppendClass(existing: string, prefix: string, newValue: string): string {
  const classes = existing.split(/\s+/).filter(Boolean);
  const filtered = classes.filter(c => !c.startsWith(prefix));
  filtered.push(newValue);
  return filtered.join(' ');
}

/**
 * Returns Tailwind classes for a drag/resize operation based on element layout context.
 */
export function classNamesForLayout(delta: LayoutDelta, layoutContext: LayoutContext): string {
  const { dx, dy, dw, dh } = delta;
  const { position, parentDisplay } = layoutContext;

  let result = '';

  if (dx !== 0 || dy !== 0) {
    if (position === 'absolute' || position === 'fixed') {
      if (dx !== 0) result = replaceOrAppendClass(result, 'left-', `left-[${dx}px]`);
      if (dy !== 0) result = replaceOrAppendClass(result, 'top-', `top-[${dy}px]`);
    } else if (parentDisplay === 'flex') {
      if (dx !== 0) result = replaceOrAppendClass(result, 'ml-', `ml-[${dx}px]`);
      if (dy !== 0) result = replaceOrAppendClass(result, 'mt-', `mt-[${dy}px]`);
    } else if (parentDisplay === 'grid') {
      if (Math.abs(dx) > 50 || Math.abs(dy) > 50) {
        const col = Math.max(1, Math.round(dx / 50) + 1);
        const row = Math.max(1, Math.round(dy / 50) + 1);
        result = replaceOrAppendClass(result, 'col-start-', `col-start-${col}`);
        result = replaceOrAppendClass(result, 'row-start-', `row-start-${row}`);
      } else {
        if (dx !== 0) result = replaceOrAppendClass(result, 'ml-', `ml-[${dx}px]`);
        if (dy !== 0) result = replaceOrAppendClass(result, 'mt-', `mt-[${dy}px]`);
      }
    } else {
      result = replaceOrAppendClass(result, 'relative', 'relative');
      if (dx !== 0) result = replaceOrAppendClass(result, 'translate-x-', `translate-x-[${dx}px]`);
      if (dy !== 0) result = replaceOrAppendClass(result, 'translate-y-', `translate-y-[${dy}px]`);
    }
  }

  if (dw !== undefined) result = replaceOrAppendClass(result, 'w-', `w-[${Math.round(dw)}px]`);
  if (dh !== undefined) result = replaceOrAppendClass(result, 'h-', `h-[${Math.round(dh)}px]`);

  return result.trim();
}

export const injectDataIds = (code: string, filePath: string): string => {
  let elementIndex = 0;

  const plugin = ({ types: t }: any) => ({
    visitor: {
      JSXOpeningElement(path: any) {
        const attributes = path.node.attributes;
        const hasDataOid = attributes.some(
          (attr: any) => t.isJSXAttribute(attr) && attr.name && attr.name.name === 'data-oid'
        );

        if (!hasDataOid) {
          const idx = elementIndex++;
          const id = btoa(filePath + ':' + idx).replace(/[^a-zA-Z0-9]/g, '').slice(0, 12);
          attributes.push(
            t.jsxAttribute(t.jsxIdentifier('data-oid'), t.stringLiteral(id))
          );
        } else {
          elementIndex++;
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
  options: { classNameMode?: 'replace' | 'merge' } = { classNameMode: 'merge' },
  onNotFound?: (message: string) => void
): string => {
  const { tagName, dataOid } = target;
  const { className: newClassName, textContent: newTextContent } = updates;
  const { classNameMode } = options;

  if (!dataOid) {
    console.warn('updateCode: no dataOid provided, skipping');
    return fileContent;
  }

  let elementFound = false;

  const plugin = ({ types: t }: any) => ({
    visitor: {
      JSXElement(path: any) {
        const openingElement = path.node.openingElement;
        const nameNode = openingElement.name;

        if (!t.isJSXIdentifier(nameNode)) return;

        const name = nameNode.name;
        if (name !== tagName) return;

        const oidAttr = openingElement.attributes.find(
          (attr: any) => t.isJSXAttribute(attr) && attr.name && attr.name.name === 'data-oid'
        );
        if (!oidAttr || !t.isStringLiteral(oidAttr.value) || oidAttr.value.value !== dataOid) return;

        elementFound = true;

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
            path.stop();
        }
      }
    }
  });

  try {
      const result = Babel.transform(fileContent, {
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

      if (!elementFound) {
        onNotFound?.('Could not find the selected element — click it again to reselect.');
        return fileContent;
      }

      return result.code || fileContent;
  } catch (e) {
      console.error('Babel transform failed:', e);
      return fileContent;
  }
};

export const extractComponentProps = (
  tree: FileSystemTree,
  tagName: string
): PropDef[] => {
  let fileContent: string | null = null;
  const pathsToCheck = [
    `src/components/${tagName}.tsx`,
    `src/components/ui/${tagName}.tsx`,
    `src/${tagName}.tsx`
  ];

  const getFileContent = (path: string): string | null => {
    const parts = path.split('/');
    let current: any = tree;
    for (const part of parts) {
      if (!current) return null;
      if (current[part]) {
        current = current[part];
      } else if (current.directory && current.directory[part]) {
        current = current.directory[part];
      } else {
        return null;
      }
    }
    if (current && current.file && 'contents' in current.file) {
      return typeof current.file.contents === 'string'
        ? current.file.contents
        : new TextDecoder().decode(current.file.contents);
    }
    return null;
  };

  for (const path of pathsToCheck) {
    const content = getFileContent(path);
    if (content) {
      fileContent = content;
      break;
    }
  }

  if (!fileContent) return [];

  const props: PropDef[] = [];
  let propTypeName: string | null = null;
  let propTypeDefinition: any = null;

  const extractFromTypeLiteral = (typeLiteral: any) => {
      const members = typeLiteral.members || typeLiteral.body;
      if (!members) return;

      members.forEach((member: any) => {
          if (member.type === 'TSPropertySignature' && member.key.type === 'Identifier') {
              const name = member.key.name;
              if (['className', 'children', 'style', 'key', 'ref'].includes(name)) return;

              const typeAnn = member.typeAnnotation?.typeAnnotation;
              if (!typeAnn) return;

              if (typeAnn.type === 'TSStringKeyword') {
                  props.push({ name, type: 'string' });
              } else if (typeAnn.type === 'TSBooleanKeyword') {
                  props.push({ name, type: 'boolean' });
              } else if (typeAnn.type === 'TSNumberKeyword') {
                  props.push({ name, type: 'number' });
              } else if (typeAnn.type === 'TSUnionType') {
                  const options = typeAnn.types
                      .filter((t: any) => t.type === 'TSLiteralType' && t.literal.type === 'StringLiteral')
                      .map((t: any) => t.literal.value);

                  if (options.length > 0) {
                      props.push({ name, type: 'enum', options });
                  }
              }
          }
      });
  };

  const analysisPlugin = ({ types: t }: any) => ({
      visitor: {
          VariableDeclarator(path: any) {
              if (t.isIdentifier(path.node.id) && path.node.id.name === tagName) {
                 const init = path.node.init;
                 if (t.isArrowFunctionExpression(init) || t.isFunctionExpression(init)) {
                     const params = init.params;
                     if (params.length > 0 && params[0].typeAnnotation) {
                         const typeRef = params[0].typeAnnotation.typeAnnotation;
                         if (t.isTSTypeReference(typeRef) && t.isIdentifier(typeRef.typeName)) {
                             propTypeName = typeRef.typeName.name;
                         } else if (t.isTSTypeLiteral(typeRef)) {
                             propTypeDefinition = typeRef;
                         }
                     }
                 }
              }
          },
          FunctionDeclaration(path: any) {
              if (t.isIdentifier(path.node.id) && path.node.id.name === tagName) {
                  const params = path.node.params;
                  if (params.length > 0 && params[0].typeAnnotation) {
                         const typeRef = params[0].typeAnnotation.typeAnnotation;
                         if (t.isTSTypeReference(typeRef) && t.isIdentifier(typeRef.typeName)) {
                             propTypeName = typeRef.typeName.name;
                         } else if (t.isTSTypeLiteral(typeRef)) {
                             propTypeDefinition = typeRef;
                         }
                  }
              }
          },
          TSInterfaceDeclaration(path: any) {
              if (propTypeName && path.node.id.name === propTypeName) {
                  propTypeDefinition = path.node.body;
              }
              if (!propTypeName && (path.node.id.name === 'Props' || path.node.id.name === `${tagName}Props`)) {
                  propTypeDefinition = path.node.body;
              }
          },
          TSTypeAliasDeclaration(path: any) {
              if (propTypeName && path.node.id.name === propTypeName) {
                  propTypeDefinition = path.node.typeAnnotation;
              }
              if (!propTypeName && (path.node.id.name === 'Props' || path.node.id.name === `${tagName}Props`)) {
                  propTypeDefinition = path.node.typeAnnotation;
              }
          }
      }
  });

  try {
      Babel.transform(fileContent, {
          filename: 'file.tsx',
          parserOpts: { plugins: ['typescript', 'jsx'], isTSX: true } as any,
          plugins: [analysisPlugin],
          presets: [],
      });

      if (propTypeDefinition) {
          extractFromTypeLiteral(propTypeDefinition);
      }

  } catch (e) {
      console.error('Prop extraction failed:', e);
  }

  return props;
};

export const updateJSXProp = (
  fileContent: string,
  target: TargetElement,
  propName: string,
  propValue: string | boolean | number
): string => {
  const { tagName, dataOid } = target;

  const plugin = ({ types: t }: any) => ({
    visitor: {
      JSXElement(path: any) {
        const openingElement = path.node.openingElement;
        const nameNode = openingElement.name;

        if (!t.isJSXIdentifier(nameNode)) return;
        const name = nameNode.name;
        if (name !== tagName) return;

        let matchesOid = false;
        if (dataOid) {
             const oidAttr = openingElement.attributes.find(
                (attr: any) => t.isJSXAttribute(attr) && attr.name && attr.name.name === 'data-oid'
             );
             if (oidAttr && t.isStringLiteral(oidAttr.value) && oidAttr.value.value === dataOid) {
                 matchesOid = true;
             }
        }

        if (dataOid && !matchesOid) return;

        const propAttrIndex = openingElement.attributes.findIndex(
            (attr: any) => t.isJSXAttribute(attr) && attr.name && attr.name.name === propName
        );
        const propAttr = propAttrIndex !== -1 ? openingElement.attributes[propAttrIndex] : null;

        let newValueNode;
        if (typeof propValue === 'string') {
            newValueNode = t.stringLiteral(propValue);
        } else if (typeof propValue === 'boolean') {
             newValueNode = t.jsxExpressionContainer(t.booleanLiteral(propValue));
        } else if (typeof propValue === 'number') {
             newValueNode = t.jsxExpressionContainer(t.numericLiteral(propValue));
        }

        if (propAttr) {
            propAttr.value = newValueNode;
        } else {
            openingElement.attributes.push(
                t.jsxAttribute(t.jsxIdentifier(propName), newValueNode)
            );
        }

        path.stop();
      }
    }
  });

  try {
      const result = Babel.transform(fileContent, {
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
      return result.code || fileContent;
  } catch (e) {
      console.error('Babel transform failed in updateJSXProp:', e);
      return fileContent;
  }
};

export const analyzeDependencyGraph = (tree: FileSystemTree): GraphData => {
    const nodes: Node[] = [];
    const edges: Edge[] = [];
    const componentMap = new Map<string, string>();

    const traverseTree = (path: string, node: any) => {
        if (node.file) {
            if (path.endsWith('.tsx') || path.endsWith('.jsx')) {
                const parts = path.split('/');
                const fileName = parts[parts.length - 1];
                const componentName = fileName.replace(/\.(tsx|jsx)$/, '');

                nodes.push({
                    id: componentName,
                    position: { x: 0, y: 0 },
                    data: { label: componentName, path },
                    type: 'default'
                });
                componentMap.set(componentName, path);
            }
        } else if (node.directory) {
            for (const [name, child] of Object.entries(node.directory)) {
                traverseTree(path ? `${path}/${name}` : name, child);
            }
        }
    };
    traverseTree('', tree);

    const getFileContent = (p: string): string | null => {
        const parts = p.split('/');
        let current: any = tree;
        for (const part of parts) {
            if (!current) return null;
            if (current[part]) {
                current = current[part];
            } else if (current.directory && current.directory[part]) {
                current = current.directory[part];
            } else {
                return null;
            }
        }
        if (current && current.file && 'contents' in current.file) {
            return typeof current.file.contents === 'string'
                ? current.file.contents
                : new TextDecoder().decode(current.file.contents);
        }
        return null;
    };

    nodes.forEach(node => {
        const filePath = node.data.path as string;
        const content = getFileContent(filePath);
        if (!content) return;

        const plugin = ({ types: t }: any) => ({
            visitor: {
                JSXElement(path: any) {
                    const openingElement = path.node.openingElement;
                    if (t.isJSXIdentifier(openingElement.name)) {
                        const name = openingElement.name.name;
                        if (name[0] === name[0].toUpperCase() && componentMap.has(name)) {
                             if (name !== node.id) {
                                 const edgeId = `${node.id}-${name}`;
                                 if (!edges.some(e => e.id === edgeId)) {
                                     edges.push({
                                         id: edgeId,
                                         source: node.id,
                                         target: name,
                                         animated: true,
                                     });
                                 }
                             }
                        }
                    }
                }
            }
        });

        try {
            Babel.transform(content, {
                filename: 'file.tsx',
                parserOpts: { plugins: ['typescript', 'jsx'], isTSX: true } as any,
                plugins: [plugin],
                presets: [],
            });
        } catch (e) {
            // ignore
        }
    });

    return { nodes, edges };
};
