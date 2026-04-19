/**
 * ModelViewer.tsx — WebGL 3D Preview Component
 *
 * Renders the sandbox-generated .glb file via Three.js / React Three Fiber.
 * The GLB is fetched as a Blob URL from a dedicated backend endpoint
 * (/api/models/:id/preview.glb) — it is NEVER base64-encoded in the JSON
 * response, which would bloat React state and crash the browser tab.
 *
 * Loading states:
 *  • pending  — executor container still running (glbPath is null in DB)
 *  • ready    — GLB available, rendered in the canvas
 *  • error    — executor failed or fetch failed
 *
 * Dependencies: three, @react-three/fiber, @react-three/drei
 */

import { Suspense, useEffect, useRef, useState } from 'react';
import { Canvas } from '@react-three/fiber';
import { OrbitControls, useGLTF, Environment, Center } from '@react-three/drei';

// ─── Types ────────────────────────────────────────────────────────────────────

interface ModelViewerProps {
  /** DB record ID of the generated script — used to fetch the .glb endpoint */
  scriptId: string;
  /** Whether the backend has finished the sandbox run (glbPath is populated) */
  glbReady: boolean;
}

// ─── Inner GLTF Loader (wrapped in Suspense by the parent) ────────────────────

function GltfModel({ blobUrl }: { blobUrl: string }) {
  const { scene } = useGLTF(blobUrl);
  return (
    <Center>
      <primitive object={scene} />
    </Center>
  );
}

// ─── Main Component ───────────────────────────────────────────────────────────

export function ModelViewer({ scriptId, glbReady }: ModelViewerProps) {
  const [blobUrl, setBlobUrl]   = useState<string | null>(null);
  const [error, setError]       = useState<string | null>(null);
  const [polling, setPolling]   = useState(!glbReady);
  const intervalRef             = useRef<ReturnType<typeof setInterval> | null>(null);

  // GLB endpoint served by the backend (binary, not base64 in JSON)
  const glbEndpoint = `/api/models/${scriptId}/preview.glb`;

  useEffect(() => {
    // If glbReady prop flips to true from the parent, cancel polling
    if (glbReady) {
      setPolling(false);
      fetchGlb();
    }
  }, [glbReady]);

  useEffect(() => {
    if (!polling) return;

    // Poll every 5 seconds for the GLB to become available.
    // The backend endpoint returns 202 while the executor is still running,
    // and 200 with the binary payload once complete.
    intervalRef.current = setInterval(fetchGlb, 5000);
    return () => {
      if (intervalRef.current) clearInterval(intervalRef.current);
    };
  }, [polling, scriptId]);

  // Cleanup Blob URL on unmount to prevent memory leaks
  useEffect(() => {
    return () => {
      if (blobUrl) URL.revokeObjectURL(blobUrl);
    };
  }, [blobUrl]);

  async function fetchGlb() {
    try {
      const res = await fetch(glbEndpoint);
      if (res.status === 202) {
        // Executor still running — keep polling
        return;
      }
      if (!res.ok) {
        throw new Error(`GLB endpoint responded with ${res.status}`);
      }
      // Received the binary GLB — create a Blob URL for the Three.js loader
      const blob = await res.blob();
      const url  = URL.createObjectURL(blob);
      setBlobUrl(url);
      setPolling(false);
      if (intervalRef.current) clearInterval(intervalRef.current);
    } catch (err: any) {
      setError(err.message ?? 'Failed to load 3D preview');
      setPolling(false);
      if (intervalRef.current) clearInterval(intervalRef.current);
    }
  }

  // ── Render states ───────────────────────────────────────────────────
  if (error) {
    return (
      <div className="model-viewer model-viewer--error" role="alert">
        <span className="model-viewer__icon">⚠️</span>
        <p className="model-viewer__msg">3D preview unavailable</p>
        <p className="model-viewer__sub">{error}</p>
      </div>
    );
  }

  if (!blobUrl) {
    return (
      <div className="model-viewer model-viewer--loading" aria-live="polite">
        <div className="model-viewer__spinner" />
        <p className="model-viewer__msg">
          {polling ? 'Generating 3D preview…' : 'Loading model…'}
        </p>
      </div>
    );
  }

  return (
    <div className="model-viewer model-viewer--ready" role="region" aria-label="3D model preview">
      <Canvas
        camera={{ position: [0, 2, 5], fov: 45 }}
        style={{ width: '100%', height: '100%' }}
        gl={{ antialias: true }}
      >
        <ambientLight intensity={0.6} />
        <directionalLight position={[10, 10, 5]} intensity={1} />
        <Environment preset="city" />
        <Suspense fallback={null}>
          <GltfModel blobUrl={blobUrl} />
        </Suspense>
        <OrbitControls
          enablePan
          enableZoom
          enableRotate
          autoRotate
          autoRotateSpeed={0.8}
        />
      </Canvas>
      <p className="model-viewer__hint">Drag to rotate · Scroll to zoom</p>
    </div>
  );
}
