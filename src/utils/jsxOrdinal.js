/**
 * jsxOrdinal — deterministic ordinal-based localization + mutation of native JSX
 * elements, shared between the client (src/utils/ast.ts) and the node test suite
 * (server/*.test.js). Plain ESM JavaScript on purpose: node's built-in test
 * runner can import it directly, and Vite bundles it for the browser unchanged.
 *
 * WHY ORDINAL: the compiler (server/compiler.js `instrumentSource`) stamps every
 * NATIVE (lowercase-tag) JSX element with `data-oid="{fileSlug}:{ordinal}"`, where
 * `ordinal` is the 0-based index of that element among all native elements of the
 * file in Babel traversal (document) order. Those oids live ONLY in the compiled
 * DOM — the persisted source has none. So to reconnect a picked DOM element back
 * to its source we cannot match a `data-oid` attribute in the source (there isn't
 * one); we must re-count native elements in the SAME order the compiler used and
 * mutate the N-th one. `instrumentSource` counts `JSXOpeningElement`s with a
 * lowercase `JSXIdentifier` name; counting native `JSXElement`s on enter yields
 * the identical sequence (same pre-order DFS), so the ordinals line up exactly.
 *
 * SAFETY: if the ordinal is out of range, or the N-th native element's tag does
 * not match the `tagName` hint carried from the DOM, we DO NOT touch the file —
 * the caller surfaces an honest "couldn't apply safely, use chat" message instead
 * of a speculative mutation.
 */

// Default import: @babel/standalone is CJS, and its default export is the Babel
// object carrying `.transform`. This form resolves correctly both under Vite and
// under node's CJS interop (a namespace import can miss `.transform` in node).
import pkg from '@babel/standalone';
const Babel = pkg;

// Layout classes that are mutually exclusive by prefix — a new one replaces the
// old one on merge. Mirror of the constant in src/utils/ast.ts.
const CONFLICT_PREFIXES = [
  'translate-x-', 'translate-y-',
  'ml-', 'mt-',
  'left-', 'top-',
];

// A JSX opening element that maps to a real DOM host: a lowercase tag name.
// Component tags (Uppercase) and member/namespaced names are not native hosts —
// exactly the elements the compiler instruments (and counts) for oids.
function isNativeLowercaseOpening(t, openingElement) {
  const nameNode = openingElement.name;
  return t.isJSXIdentifier(nameNode) && /^[a-z]/.test(nameNode.name);
}

const BABEL_OPTS = {
  filename: 'file.tsx',
  parserOpts: { plugins: ['typescript', 'jsx'], isTSX: true },
  retainLines: true,
  compact: false,
  presets: [],
};

/**
 * Merge/replace a className string against the element's existing className,
 * honouring CONFLICT_PREFIXES on merge. Extracted so the ordinal path produces
 * byte-identical output to the legacy data-oid path in ast.ts.
 */
function computeFinalClassName(currentClass, newClassName, classNameMode) {
  if (classNameMode !== 'merge') return newClassName;
  if (!currentClass) return newClassName;

  const newClasses = newClassName.split(/\s+/).filter(Boolean);
  let existingClasses = currentClass.split(/\s+/).filter(Boolean);
  for (const newClass of newClasses) {
    const conflictPrefix = CONFLICT_PREFIXES.find((p) => newClass.startsWith(p));
    if (conflictPrefix) {
      existingClasses = existingClasses.filter((c) => !c.startsWith(conflictPrefix));
    }
  }
  const existingSet = new Set(existingClasses);
  const toAdd = newClasses.filter((c) => !existingSet.has(c));
  return toAdd.length > 0
    ? `${existingClasses.join(' ')} ${toAdd.join(' ')}`.trim()
    : existingClasses.join(' ').trim();
}

/**
 * Locate the `ordinal`-th native element in `fileContent` and apply className /
 * textContent updates to it. Returns the new source, or the original source
 * unchanged (and calls `onNotFound`) when the element can't be located safely.
 *
 * @param {string} fileContent
 * @param {{ tagName?: string, ordinal: number }} target
 * @param {{ className?: string, textContent?: string }} updates
 * @param {{ classNameMode?: 'replace' | 'merge' }} [options]
 * @param {(message: string) => void} [onNotFound]
 * @returns {string}
 */
export function updateCodeByOrdinal(fileContent, target, updates, options, onNotFound) {
  const { tagName, ordinal } = target;
  const { className: newClassName, textContent: newTextContent } = updates;
  const classNameMode = (options && options.classNameMode) || 'merge';

  if (typeof ordinal !== 'number' || !Number.isFinite(ordinal) || ordinal < 0) {
    if (onNotFound) onNotFound('No pude localizar el elemento (ordinal inválido) — usa el chat.');
    return fileContent;
  }

  let elementFound = false;
  let counter = 0;

  const plugin = ({ types: t }) => ({
    visitor: {
      JSXElement(path) {
        if (elementFound) return;
        const openingElement = path.node.openingElement;
        if (!isNativeLowercaseOpening(t, openingElement)) return;

        const current = counter;
        counter += 1;
        if (current !== ordinal) return;

        // Tag-name hint guard: the picked DOM element and the located source
        // element must agree, or we refuse to mutate (never speculative).
        if (tagName && openingElement.name.name !== tagName) {
          path.stop();
          return; // elementFound stays false → onNotFound below.
        }

        elementFound = true;

        if (newClassName !== undefined) {
          const classNameAttr = openingElement.attributes.find(
            (attr) => t.isJSXAttribute(attr) && attr.name && attr.name.name === 'className'
          );
          let currentClass = '';
          if (classNameAttr && t.isStringLiteral(classNameAttr.value)) {
            currentClass = classNameAttr.value.value;
          }
          const finalClass = computeFinalClassName(currentClass, newClassName, classNameMode);
          if (classNameAttr) {
            classNameAttr.value = t.stringLiteral(finalClass);
          } else {
            openingElement.attributes.push(
              t.jsxAttribute(t.jsxIdentifier('className'), t.stringLiteral(finalClass))
            );
          }
        }

        if (newTextContent !== undefined) {
          path.node.children = [t.jsxText(newTextContent)];
          if (openingElement.selfClosing) {
            openingElement.selfClosing = false;
            path.node.closingElement = t.jsxClosingElement(t.jsxIdentifier(openingElement.name.name));
          }
        }

        path.stop();
      },
    },
  });

  try {
    const result = Babel.transform(fileContent, { ...BABEL_OPTS, plugins: [plugin] });
    if (!elementFound) {
      if (onNotFound) onNotFound('No pude localizar el elemento seleccionado con seguridad — usa el chat.');
      return fileContent;
    }
    return result.code || fileContent;
  } catch (e) {
    console.error('[jsxOrdinal] Babel transform failed:', e);
    return fileContent;
  }
}

/**
 * Locate the `ordinal`-th native element and set/replace a JSX prop on it.
 *
 * @param {string} fileContent
 * @param {{ tagName?: string, ordinal: number }} target
 * @param {string} propName
 * @param {string | boolean | number} propValue
 * @returns {string}
 */
export function updateJSXPropByOrdinal(fileContent, target, propName, propValue) {
  const { tagName, ordinal } = target;
  if (typeof ordinal !== 'number' || !Number.isFinite(ordinal) || ordinal < 0) {
    return fileContent;
  }

  let counter = 0;
  let done = false;

  const plugin = ({ types: t }) => ({
    visitor: {
      JSXElement(path) {
        if (done) return;
        const openingElement = path.node.openingElement;
        if (!isNativeLowercaseOpening(t, openingElement)) return;

        const current = counter;
        counter += 1;
        if (current !== ordinal) return;
        if (tagName && openingElement.name.name !== tagName) {
          done = true;
          path.stop();
          return;
        }

        let newValueNode;
        if (typeof propValue === 'string') {
          newValueNode = t.stringLiteral(propValue);
        } else if (typeof propValue === 'boolean') {
          newValueNode = t.jsxExpressionContainer(t.booleanLiteral(propValue));
        } else {
          newValueNode = t.jsxExpressionContainer(t.numericLiteral(Number(propValue)));
        }

        const propAttr = openingElement.attributes.find(
          (attr) => t.isJSXAttribute(attr) && attr.name && attr.name.name === propName
        );
        if (propAttr) {
          propAttr.value = newValueNode;
        } else {
          openingElement.attributes.push(t.jsxAttribute(t.jsxIdentifier(propName), newValueNode));
        }

        done = true;
        path.stop();
      },
    },
  });

  try {
    const result = Babel.transform(fileContent, { ...BABEL_OPTS, plugins: [plugin] });
    return result.code || fileContent;
  } catch (e) {
    console.error('[jsxOrdinal] updateJSXPropByOrdinal failed:', e);
    return fileContent;
  }
}
