# Music Vizualizers Design Language

## Core Direction
- Build for ritual clarity, not maximal effects.
- Every scene needs one dominant geometric anchor and one supporting layer.
- Motion should feel intentional: smooth base drift, reactive accents, no center jitter.

## Composition Rules
- Keep the visual center stable within a narrow radius.
- Avoid UI-heavy overlays; controls should remain secondary.
- Use negative space around geometry so glow can breathe.

## Color and Theme Rules
- Each theme uses one accent family and neutral text.
- Theme changes must affect shape stroke, grid, particles, and bloom balance.
- Never use random hue jumps tied to audio peaks.

## Glow Rules (Quality Guardrails)
- Glow is node-based, not full-canvas wash.
- Allow only curated highlight points (ring nodes, lattice intersections, halo anchors).
- Split brightness into three layers:
  - core line energy
  - short-radius bloom
  - soft halo veil
- Cap bloom gain per layer to prevent muddy overexposure.

## Geometry Integrity
- Selected shape stays locked until user changes it.
- Linear sacred forms (Metatron, Sri triangles, Merkaba) keep canonical proportions.
- Curvature should blend arcs into forms without destroying geometric identity.

## Motion and Reactivity
- Map bands independently:
  - bass: halo radius and depth
  - mids: stroke thickness and petal/body expansion
  - treble: edge shimmer and spark points
- Randomness controls counter-phase complexity and modulation depth, not jitter.
- Opposing motion should use clean ratios (for example `sqrt(2)`, `phi`, `sqrt(5)` families).

## Touch Micro-Delight
- Press-and-hold: local energy lens (temporary bloom focus).
- Two-finger twist: phase rotation only, no camera wobble.
- Double tap: snap-to-symmetry settle.
- Edge scrub: quick intensity rail with subtle fade-out.

## Anti-Patterns
- No full-screen white bloom blasts.
- No frequent random shape swapping.
- No harsh velocity jumps between adjacent frames.
- No decorative noise that competes with the geometry silhouette.

## Done Criteria
- Visual remains clean when paused on any frame.
- Audio peaks increase presence without breaking readability.
- Theme swap clearly changes mood and material response.
- Shapes feel alive, mathematically coherent, and consistently aesthetic.
