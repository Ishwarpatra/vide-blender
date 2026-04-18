import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const destOps = path.join(__dirname, '..', 'node_modules', 'wasp', 'client');
const opsPath = path.join(destOps, 'operations.js');
const authPath = path.join(destOps, 'auth.js');

fs.mkdirSync(destOps, { recursive: true });

const content = `export const chat = Symbol('chat');
export const generateScript = Symbol('generateScript');

export function useAction(action) {
  return async (payload) => {
    await new Promise((r) => setTimeout(r, 200));

    if (action.toString() === Symbol('chat').toString()) {
      const msg = payload?.message || (payload?.messages && payload.messages[0]?.content) || '';
      return { content: \`Postinstall mock assistant reply to: \${String(msg).slice(0, 200)}\` };
    }

    if (action.toString() === Symbol('generateScript').toString()) {
      const refined = payload?.refinedPrompt || '';
      return { generatedCode: \`# Postinstall mock Blender Python\\n# Refined prompt: \${refined.slice(0,120)}\\nprint(\\\"This is a postinstall mock Blender script\\\")\` };
    }

    return {};
  };
}
`;

fs.writeFileSync(opsPath, content, 'utf8');

const authContent = `export function useAuth() {
  return { data: { id: 'mock-user-1', email: 'test@example.com' }, isLoading: false, error: null };
}
export function logout() {
  console.log('Mock logout');
}
`;
fs.writeFileSync(authPath, authContent, 'utf8');

console.log('Wasp stubs written to', destOps);
