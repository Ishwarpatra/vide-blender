/**
 * WelcomeScreen — Start screen with dynamically-configurable example prompts.
 *
 * Examples are defined in EXAMPLE_PROMPTS below. Adding new examples requires
 * only editing that array (or replacing it with a backend fetch in production).
 * The grid auto-sizes to the number of examples (up to 3 per row on desktop).
 */

interface Example {
  title: string;
  prompt: string;
  icon: string;
  category: string;
}

// ─── Example Prompt Registry ──────────────────────────────────────────────────
// To add/remove examples: edit this array. No other code changes required.
const EXAMPLE_PROMPTS: Example[] = [
  {
    category: 'WEAPON',
    icon: '⚔️',
    title: 'Low-Poly Neon Sword',
    prompt: 'Generate a low-poly neon sword with a glowing emissive material and a subsurf modifier for slight rounded edges.',
  },
  {
    category: 'PROP',
    icon: '📦',
    title: 'Sci-Fi Cyberpunk Crate',
    prompt: 'Create a sci-fi cyberpunk crate with complex paneling details using bpy.ops.mesh.primitive_cube_add and bevel modifiers.',
  },
  {
    category: 'ORGANIC',
    icon: '🏺',
    title: 'Smooth Ceramic Vase',
    prompt: 'Make a smooth ceramic vase using a spin operator or a lathe-like approach with a high-resolution subsurf modifier.',
  },
  {
    category: 'ARCHITECTURE',
    icon: '🏛️',
    title: 'Stone Archway',
    prompt: 'Build a stone archway using a torus sliced in half, solidified with a stone texture and bevel modifier for worn edges.',
  },
  {
    category: 'VEHICLE',
    icon: '🚀',
    title: 'Retro Spaceship',
    prompt: 'Design a retro-style spaceship using primitives, with metallic material, symmetric wing geometry using mirror modifier, and emission engine glow.',
  },
  {
    category: 'NATURE',
    icon: '🌲',
    title: 'Stylised Pine Tree',
    prompt: 'Create a stylised low-poly pine tree using a cone for the canopy and cylinder for the trunk, with flat shading and a muted green material.',
  },
];

interface WelcomeScreenProps {
  onSelectExample: (prompt: string) => void;
}

export const WelcomeScreen = ({ onSelectExample }: WelcomeScreenProps) => {
  return (
    <div className="flex flex-col items-center justify-center h-full py-12 px-6 text-center animate-fade-in overflow-y-auto">
      <div className="mb-8 p-4 border-2 border-text bg-text text-bg font-black text-4xl tracking-tighter">
        VIBE2BLENDER
      </div>

      <h3 className="text-xl font-bold mb-2 tracking-tighter">READY TO BUILD IN 3D?</h3>
      <p className="text-accent text-sm mb-12 max-w-sm">
        Select a stock example below to see the workflow, or type your own concept in the chat.
      </p>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4 w-full max-w-4xl">
        {EXAMPLE_PROMPTS.map((example, idx) => (
          <button
            key={idx}
            id={`example-${idx}`}
            onClick={() => onSelectExample(example.prompt)}
            className="group flex flex-col p-6 border border-border bg-secondary/30 hover:bg-text hover:text-bg transition-all text-left"
          >
            <span className="text-2xl mb-4 grayscale group-hover:grayscale-0 transition-all">
              {example.icon}
            </span>
            <span className="text-[8px] font-black uppercase tracking-widest mb-1 text-accent group-hover:text-bg/50">
              {example.category}
            </span>
            <span className="text-sm font-bold group-hover:text-bg">
              {example.title}
            </span>
          </button>
        ))}
      </div>
    </div>
  );
};
