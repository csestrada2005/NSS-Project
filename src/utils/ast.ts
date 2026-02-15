export interface TargetElement {
  tagName: string;
  className?: string;
}

export const updateCode = (fileContent: string, target: TargetElement, updates: { className?: string; textContent?: string }): string => {
  const { tagName, className } = target;
  const { className: newClassName } = updates;

  // Regex to find the opening tag.
  // We use a non-greedy capture for attributes to handle the tag content.
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
    let newTag = match;

    // Apply className update
    if (newClassName !== undefined) {
      if (currentClassMatch) {
        // Replace existing className
        newTag = newTag.replace(/className=(["'])(.*?)\1/, `className="${newClassName}"`);
      } else {
        // Inject className
        const hasSpace = attributes && attributes.length > 0;
        const prefix = hasSpace ? '' : ' ';

        if (newTag.endsWith('/>')) {
          newTag = newTag.replace('/>', `${prefix}className="${newClassName}" />`);
        } else {
          newTag = newTag.replace('>', `${prefix}className="${newClassName}">`);
        }
      }
    }

    // Note: Text content update is not fully supported with this Regex approach
    // as it requires matching the closing tag which might be far away or nested.
    // The structure is here for future expansion (e.g. using Babel).

    return newTag;
  });
};
