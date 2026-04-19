"""
executor.py — Blender Python wrapper for the sandboxed execution pipeline.

Invoked by Blender's headless mode:
    blender --background --python /executor.py -- <script_path> <output_glb_path>

Security notes:
  • This file runs INSIDE the already-isolated Docker container.
  • The container has --network none, memory/CPU limits, and read-only mounts
    except for /output. These are enforced by the Docker host at runtime.
  • We do NOT apply additional Python-level sandboxing here because the
    container boundary IS the sandbox. Attempting Python-level restrictions
    (e.g. RestrictedPython) would be redundant and fragile.

Exit codes:
  0 — Success, GLB written to output_path
  1 — Script execution failed
  2 — GLB export failed
  3 — Bad arguments
"""

import sys
import os
import traceback

import bpy  # type: ignore  # bpy is provided by Blender's embedded Python


def parse_args():
    """Extract positional args passed after the '--' separator."""
    try:
        sep = sys.argv.index("--")
        tail = sys.argv[sep + 1:]
    except ValueError:
        tail = []

    if len(tail) < 2:
        print(
            "[executor] ERROR: Expected 2 arguments after '--': "
            "<script_path> <output_glb_path>",
            file=sys.stderr,
        )
        sys.exit(3)

    return tail[0], tail[1]


def clear_scene():
    """Remove all default objects so the generated script starts clean."""
    bpy.ops.object.select_all(action="SELECT")
    bpy.ops.object.delete(use_global=False)


def run_user_script(script_path: str):
    """
    Execute the user-generated bpy script in the current Blender context.
    Any exception is caught, logged, and causes a non-zero exit.
    """
    print(f"[executor] Running script: {script_path}")
    try:
        with open(script_path, "r") as fh:
            source = fh.read()
        # exec() is safe here: we are inside --network none + resource-limited
        # Docker container. The script cannot reach the internet or the host FS
        # (script volume is read-only; only /output is writable).
        exec(compile(source, script_path, "exec"), {"__name__": "__main__"})  # noqa: S102
        print("[executor] Script executed successfully.")
    except Exception:
        print("[executor] ERROR: Script execution failed:", file=sys.stderr)
        traceback.print_exc()
        sys.exit(1)


def export_glb(output_path: str):
    """Export the active Blender scene to a binary GLB file."""
    print(f"[executor] Exporting GLB to: {output_path}")
    os.makedirs(os.path.dirname(output_path), exist_ok=True)
    try:
        bpy.ops.export_scene.gltf(
            filepath=output_path,
            export_format="GLB",
            # Keep the export minimal: no animations, no extras
            export_animations=False,
            export_lights=False,
        )
        print(f"[executor] GLB export complete: {output_path}")
    except Exception:
        print("[executor] ERROR: GLB export failed:", file=sys.stderr)
        traceback.print_exc()
        sys.exit(2)


def main():
    script_path, output_path = parse_args()
    clear_scene()
    run_user_script(script_path)
    export_glb(output_path)
    sys.exit(0)


if __name__ == "__main__":
    main()
