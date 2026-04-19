/**
 * RAG (Retrieval-Augmented Generation) Pipeline
 *
 * Purpose: Augment the local Ollama/Qwen "Interviewer" model with curated
 * Blender bpy API knowledge to drastically reduce hallucination rates on
 * domain-specific terminology (modifiers, node trees, bpy.ops calls, etc.).
 *
 * Architecture:
 *   VECTOR_STORE  — A static knowledge base of Blender API snippets.
 *                   In production this would be replaced by PGVector / Chroma DB
 *                   embeddings generated offline and stored in PostgreSQL.
 *   retrieveBlenderContext() — Multi-keyword scorer that mimics cosine-similarity
 *                   retrieval; returns the top-N most relevant documents.
 *   The retrieved context is prepended to the system prompt sent to Qwen,
 *   grounding its responses in real bpy API facts before it sees the user message.
 */

export interface Document {
  id: string;
  content: string;
  /** Keyword tags used by the heuristic scorer (stand-in for embedding vectors) */
  tags: string[];
  metadata: Record<string, any>;
}

// ─── Blender bpy API Knowledge Base ─────────────────────────────────────────
// NOTE: Extend this array or replace it with a real vector DB query in Phase 5.
const VECTOR_STORE: Document[] = [
  // ── Mesh Primitives ──────────────────────────────────────────────────
  {
    id: 'mesh-01',
    content: 'Create a cube: bpy.ops.mesh.primitive_cube_add(size=2, location=(0,0,0))',
    tags: ['cube', 'mesh', 'primitive', 'box', 'create', 'add'],
    metadata: { category: 'geometry', api: 'bpy.ops.mesh' },
  },
  {
    id: 'mesh-02',
    content: 'Create a UV sphere: bpy.ops.mesh.primitive_uv_sphere_add(radius=1, segments=32, ring_count=16)',
    tags: ['sphere', 'ball', 'round', 'uv sphere', 'mesh', 'primitive'],
    metadata: { category: 'geometry', api: 'bpy.ops.mesh' },
  },
  {
    id: 'mesh-03',
    content: 'Create a cylinder: bpy.ops.mesh.primitive_cylinder_add(radius=1, depth=2, vertices=32)',
    tags: ['cylinder', 'tube', 'pipe', 'pillar', 'column', 'mesh'],
    metadata: { category: 'geometry', api: 'bpy.ops.mesh' },
  },
  {
    id: 'mesh-04',
    content: 'Create a torus (donut): bpy.ops.mesh.primitive_torus_add(major_radius=1, minor_radius=0.25)',
    tags: ['torus', 'donut', 'ring', 'loop', 'mesh'],
    metadata: { category: 'geometry', api: 'bpy.ops.mesh' },
  },
  {
    id: 'mesh-05',
    content: 'Create a cone: bpy.ops.mesh.primitive_cone_add(radius1=1, radius2=0, depth=2, vertices=32)',
    tags: ['cone', 'pyramid', 'spike', 'tip', 'mesh'],
    metadata: { category: 'geometry', api: 'bpy.ops.mesh' },
  },
  {
    id: 'mesh-06',
    content: 'Delete all default objects before creating your scene: bpy.ops.object.select_all(action=\'SELECT\'); bpy.ops.object.delete(use_global=False)',
    tags: ['clear', 'delete', 'empty', 'clean', 'reset', 'scene'],
    metadata: { category: 'scene', api: 'bpy.ops.object' },
  },

  // ── Modifiers ────────────────────────────────────────────────────────
  {
    id: 'mod-01',
    content: 'Add a Bevel modifier: obj = bpy.context.active_object; mod = obj.modifiers.new(name="Bevel", type="BEVEL"); mod.width = 0.1; mod.segments = 3',
    tags: ['bevel', 'edge', 'chamfer', 'smooth edge', 'modifier'],
    metadata: { category: 'modifiers', api: 'modifiers.new' },
  },
  {
    id: 'mod-02',
    content: 'Add Subdivision Surface: mod = obj.modifiers.new(name="Subdivision", type="SUBSURF"); mod.levels = 2; mod.render_levels = 3',
    tags: ['subdivision', 'subsurf', 'smooth', 'subdivide', 'modifier', 'highpoly'],
    metadata: { category: 'modifiers', api: 'modifiers.new' },
  },
  {
    id: 'mod-03',
    content: 'Add a Solidify modifier (gives flat planes thickness): mod = obj.modifiers.new(name="Solidify", type="SOLIDIFY"); mod.thickness = 0.05',
    tags: ['solidify', 'thickness', 'thin', 'flat', 'plane', 'wall', 'modifier'],
    metadata: { category: 'modifiers', api: 'modifiers.new' },
  },
  {
    id: 'mod-04',
    content: 'Add Mirror modifier (great for symmetrical objects): mod = obj.modifiers.new(name="Mirror", type="MIRROR"); mod.use_axis[0] = True',
    tags: ['mirror', 'symmetry', 'symmetric', 'half', 'duplicate', 'modifier'],
    metadata: { category: 'modifiers', api: 'modifiers.new' },
  },
  {
    id: 'mod-05',
    content: 'Apply smooth shading across all polygons: bpy.ops.object.shade_smooth()',
    tags: ['smooth', 'shading', 'shade smooth', 'normals', 'look'],
    metadata: { category: 'modifiers', api: 'bpy.ops.object' },
  },

  // ── Materials & Shaders ──────────────────────────────────────────────
  {
    id: 'mat-01',
    content: 'Create and assign a Principled BSDF material: mat = bpy.data.materials.new(name="Material"); mat.use_nodes = True; bsdf = mat.node_tree.nodes["Principled BSDF"]; obj.data.materials.append(mat)',
    tags: ['material', 'shader', 'principled', 'bsdf', 'assign', 'color'],
    metadata: { category: 'materials', api: 'bpy.data.materials' },
  },
  {
    id: 'mat-02',
    content: 'Set base color on Principled BSDF: bsdf.inputs["Base Color"].default_value = (R, G, B, 1.0)  # RGBA 0-1 range',
    tags: ['color', 'base color', 'rgb', 'paint', 'diffuse', 'material'],
    metadata: { category: 'materials', api: 'node_tree.nodes' },
  },
  {
    id: 'mat-03',
    content: 'Make metallic surface: bsdf.inputs["Metallic"].default_value = 1.0; bsdf.inputs["Roughness"].default_value = 0.1',
    tags: ['metal', 'metallic', 'shiny', 'reflective', 'chrome', 'steel', 'material'],
    metadata: { category: 'materials', api: 'node_tree.nodes' },
  },
  {
    id: 'mat-04',
    content: 'Create glowing Emission material: emit_node = mat.node_tree.nodes.new("ShaderNodeEmission"); emit_node.inputs["Strength"].default_value = 5.0; mat.node_tree.links.new(emit_node.outputs[0], output.inputs[0])',
    tags: ['glow', 'emit', 'emission', 'neon', 'light', 'luminous', 'material'],
    metadata: { category: 'materials', api: 'node_tree.nodes' },
  },
  {
    id: 'mat-05',
    content: 'Make glass/transparent material: bsdf.inputs["Transmission Weight"].default_value = 1.0; bsdf.inputs["IOR"].default_value = 1.45; mat.blend_method = "BLEND"',
    tags: ['glass', 'transparent', 'crystal', 'clear', 'see-through', 'material'],
    metadata: { category: 'materials', api: 'node_tree.nodes' },
  },

  // ── Lighting ─────────────────────────────────────────────────────────
  {
    id: 'light-01',
    content: 'Add a Point light: bpy.ops.object.light_add(type="POINT", location=(2,2,4)); bpy.context.active_object.data.energy = 1000',
    tags: ['light', 'point light', 'illumination', 'lamp'],
    metadata: { category: 'lighting', api: 'bpy.ops.object.light_add' },
  },
  {
    id: 'light-02',
    content: 'Add a Sun light for directional lighting: bpy.ops.object.light_add(type="SUN", location=(0,0,10)); bpy.context.active_object.data.energy = 5',
    tags: ['sun', 'directional', 'sunlight', 'outdoor', 'lighting'],
    metadata: { category: 'lighting', api: 'bpy.ops.object.light_add' },
  },

  // ── Scene & Camera ───────────────────────────────────────────────────
  {
    id: 'scene-01',
    content: 'Add a camera and set it as active: bpy.ops.object.camera_add(location=(7,-7,5)); cam = bpy.context.active_object; bpy.context.scene.camera = cam',
    tags: ['camera', 'view', 'render', 'framing', 'scene'],
    metadata: { category: 'scene', api: 'bpy.ops.object.camera_add' },
  },
  {
    id: 'scene-02',
    content: 'Rename an object for clarity: obj.name = "MyObject"; obj.data.name = "MyMesh"',
    tags: ['name', 'rename', 'label', 'identifier', 'scene'],
    metadata: { category: 'scene', api: 'bpy.types.Object' },
  },

  // ── Geometry Nodes ───────────────────────────────────────────────────
  {
    id: 'geonodes-01',
    content: 'Add a Geometry Nodes modifier: mod = obj.modifiers.new(name="GeometryNodes", type="NODES"); node_group = bpy.data.node_groups.new("GeoNodes", "GeometryNodeTree"); mod.node_group = node_group',
    tags: ['geometry nodes', 'procedural', 'geonodes', 'modifier', 'node'],
    metadata: { category: 'geometry_nodes', api: 'modifiers.new' },
  },
];

// ─── Multi-keyword Relevance Scorer (TF heuristic) ───────────────────────────
/**
 * Scores each document by counting how many of its tags appear in the query.
 * Higher score = more relevant. This is a stand-in for cosine-similarity search.
 */
function scoreDocument(doc: Document, lowerQuery: string): number {
  return doc.tags.reduce((score, tag) => {
    // Partial match: query contains the tag word anywhere
    return lowerQuery.includes(tag) ? score + 1 : score;
  }, 0);
}

// ─── Public API ──────────────────────────────────────────────────────────────
const TOP_K = 5; // Return the top 5 most relevant documents

/**
 * Retrieves the top-K most relevant Blender API context snippets for a given query.
 * Augments the Qwen system prompt to minimize hallucination on bpy API calls.
 *
 * @param query - The user's raw chat message.
 * @returns A formatted string of relevant bpy API guidelines.
 */
export const retrieveBlenderContext = async (query: string): Promise<string> => {
  const lowerQuery = query.toLowerCase();

  // Score all documents against the query
  const scored = VECTOR_STORE
    .map(doc => ({ doc, score: scoreDocument(doc, lowerQuery) }))
    .filter(({ score }) => score > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, TOP_K);

  // Fall back to a curated "starter kit" if no specific match found
  const docsToReturn = scored.length > 0
    ? scored.map(s => s.doc)
    : VECTOR_STORE.filter(d => ['mesh-01', 'mod-01', 'mat-01', 'mod-05', 'mesh-06'].includes(d.id));

  return docsToReturn
    .map(d => `[${d.metadata.category.toUpperCase()}] ${d.content}`)
    .join('\n');
};