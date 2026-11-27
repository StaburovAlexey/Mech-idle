const seam = '<div class="title-seam" aria-hidden="true"><i></i><i></i><i></i></div>';

/** The same nine-slice shell wraps screen-specific content without moving its focusable elements. */
export function armoredFrame(tag: 'nav' | 'aside' | 'section', layoutClass: string, content: string, label?: string) {
  return `<${tag} class="armored-frame ${layoutClass}"${label ? ` aria-label="${label}"` : ''}>
    ${tag === 'aside' ? '' : seam}${content}
  </${tag}>`;
}
