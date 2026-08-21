/** Keep footer as one-line row when expanded, and as tight stacked column (update above, settings below) when collapsed. */
const STYLE_ID = 'hankun-footer-override'

const CSS = `
/* Expanded: one-line row (settings left, update right) */
[data-slot="sidebar"] [class*="footArea"] {
  flex-direction: row !important;
  align-items: center !important;
  gap: 0 !important;
}
[data-slot="sidebar"] [class*="settingsArea"] {
  flex: 1 !important;
  min-width: 0 !important;
  width: auto !important;
}
[data-slot="sidebar"] [class*="footerActions"] {
  flex: none !important;
  min-width: 0 !important;
  display: flex !important;
  justify-content: flex-end !important;
  width: auto !important;
}
/* Collapsed: stacked column, update above settings, tight 8px rhythm.
   The root element carries the CSS Module–hashed collapsed class, so we
   match via attribute-contains on the class list rather than a bare
   .collapsed selector. */
[class*="collapsed"] [class*="footArea"] {
  flex-direction: column !important;
  align-items: center !important;
  gap: 8px !important;
}
[class*="collapsed"] [class*="settingsArea"] {
  order: 2 !important;
  flex: none !important;
  width: auto !important;
  display: flex !important;
  justify-content: center !important;
}
[class*="collapsed"] [class*="footerActions"] {
  order: 1 !important;
  flex: none !important;
  width: auto !important;
  display: flex !important;
  flex-direction: column !important;
  align-items: center !important;
  justify-content: center !important;
  gap: 4px !important;
}
[class*="collapsed"] [class*="settingsArea"] button,
[class*="collapsed"] [class*="footerActions"] button {
  margin: 0 !important;
}
[class*="collapsed"] [class*="footerActions"] > div > div {
  margin: 0 !important;
}
`

/** Inject the one-line footer override, returns disposer. */
export function injectFooterLayoutOverride(): () => void {
  if (document.getElementById(STYLE_ID) !== null) return () => {}
  const style = document.createElement('style')
  style.id = STYLE_ID
  style.textContent = CSS
  document.head.appendChild(style)
  return () => { style.remove() }
}
