export interface TargetElement {
  tagName: string;
  className?: string;
}

export const updateCode = (fileContent: string, target: TargetElement, updates: { className: string }): string => {
  const { tagName, className } = target;
  const { className: newClassName } = updates;

  // Regex to find the opening tag.
  // We use a non-greedy capture for attributes to handle the tag content.
  // Note: This simple regex might fail on tags with '>' in attribute values.
  const tagRegex = new RegExp(`<${tagName}(\\s+[^>]*)?>`, 'g');

  let updated = false;

  return fileContent.replace(tagRegex, (match, attributes) => {
    if (updated) return match;

    // Extract existing className
    const currentClassMatch = attributes ? attributes.match(/className=(["'])(.*?)\1/) : null;
    const currentClass = currentClassMatch ? currentClassMatch[2] : '';

    const normalize = (s: string) => s.split(/\s+/).filter(Boolean).sort().join(' ');

    // Check if this is the target element
    if (className) {
      if (normalize(currentClass) !== normalize(className)) {
        return match;
      }
    } else {
      // If target has no className, we look for a tag that also has no className
      if (currentClass) {
        return match;
      }
    }

    updated = true;

    // Apply update
    if (currentClassMatch) {
      // Replace existing className
      return match.replace(/className=(["'])(.*?)\1/, `className="${newClassName}"`);
    } else {
      // Inject className
      const hasSpace = attributes && attributes.length > 0;
      const prefix = hasSpace ? '' : ' ';

      if (match.endsWith('/>')) {
        return match.replace('/>', `${prefix}className="${newClassName}" />`);
      } else {
        return match.replace('>', `${prefix}className="${newClassName}">`);
      }
    }
  });
};
