/**
 * Cross-Site Scripting (XSS) Mitigation Utility
 * 
 * HTML-encodes all AI-generated output (markdown, python, conversational text)
 * before serialization to the frontend, preventing arbitrary script execution 
 * on the client.
 */
export const encodeHtml = (unsafeString: string): string => {
  if (!unsafeString) return unsafeString;
  return unsafeString
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
};