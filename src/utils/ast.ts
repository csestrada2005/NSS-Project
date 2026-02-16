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

export const extractComponentProps = (
  tree: FileSystemTree,
  tagName: string
): PropDef[] => {
  let fileContent: string | null = null;
  // Heuristic: check standard paths
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
      // typeLiteral might be TSTypeLiteral or TSInterfaceBody
      const members = typeLiteral.members || typeLiteral.body;
      if (!members) return;

      members.forEach((member: any) => {
          if (member.type === 'TSPropertySignature' && member.key.type === 'Identifier') {
              const name = member.key.name;
              // Ignore standard react props
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
                  // Check for string literals
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
          // Find Component
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
          // Find Type/Interface
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

        // If dataOid is NOT provided, fallback to matching first element of type (risky but consistent with updateCode)
        if (!dataOid) {
            // Assume match for now if no better ID logic
            // In practice, inspector should always have dataOid if injected
        }

        // Find prop
        const propAttrIndex = openingElement.attributes.findIndex(
            (attr: any) => t.isJSXAttribute(attr) && attr.name && attr.name.name === 'className'
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
    const componentMap = new Map<string, string>(); // ComponentName -> FilePath

    // 1. Identify all components
    const traverseTree = (path: string, node: any) => {
        if (node.file) {
            if (path.endsWith('.tsx') || path.endsWith('.jsx')) {
                // Heuristic: Component name is filename without extension
                const parts = path.split('/');
                const fileName = parts[parts.length - 1];
                const componentName = fileName.replace(/\.(tsx|jsx)$/, '');

                nodes.push({
                    id: componentName,
                    position: { x: 0, y: 0 }, // Will be laid out later
                    data: { label: componentName, path },
                    type: 'default' // or custom
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

    // 2. Analyze imports and usage
    // We need to read file content again.
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
                // Check Usage
                JSXElement(path: any) {
                    const openingElement = path.node.openingElement;
                    if (t.isJSXIdentifier(openingElement.name)) {
                        const name = openingElement.name.name;
                        // If this name matches a known component, add an edge
                        // Exclude HTML tags (lowercase usually)
                        if (name[0] === name[0].toUpperCase() && componentMap.has(name)) {
                            // Avoid self-references or duplicates
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
