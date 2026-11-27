import * as THREE from 'three';

export const COMBAT_COLORS = [0xb9433e, 0x8858d0, 0x2c709f, 0x992e4b, 0x168e83] as const;

/** Recolour the existing atlases in one shading pass, retaining wear and panel detail. */
export function applyCombatPalette(model: THREE.Object3D, color: number, ally = false) {
  const ink = new THREE.Color(color);
  const processed = new Map<THREE.Material, THREE.Material>();
  model.traverse(object => {
    if (!(object instanceof THREE.Mesh)) return;
    const configure = (source: THREE.Material) => {
      const prior = processed.get(source);
      if (prior) return prior;
      // The imported enemies are unlit. Give them the same shading model as the turret.
      const material = source instanceof THREE.MeshBasicMaterial
        ? new THREE.MeshStandardMaterial({ name: source.name, map: source.map, side: source.side, alphaTest: source.alphaTest, transparent: source.transparent, opacity: source.opacity, vertexColors: source.vertexColors })
        : source;
      processed.set(source, material);
      if (!(material instanceof THREE.MeshStandardMaterial)) return material;
      if (material !== source) source.dispose();
      material.color.set(0xffffff);
      material.roughness = .80;
      material.metalness = .10;
      material.onBeforeCompile = shader => {
        shader.uniforms.combatInk = { value: ink };
        shader.uniforms.isFriendly = { value: ally ? 1 : 0 };
        shader.fragmentShader = shader.fragmentShader
          .replace('#include <common>', '#include <common>\nuniform vec3 combatInk; uniform float isFriendly;')
          .replace('#include <map_fragment>', `#include <map_fragment>
            vec3 original = diffuseColor.rgb;
            float v = dot(original, vec3(.2126, .7152, .0722));
            float lo = min(min(original.r, original.g), original.b);
            float hi = max(max(original.r, original.g), original.b);
            float paint = smoothstep(.018, .095, hi - lo) * smoothstep(.021, .064, v);
            // The turret's cream top and red side panels both become friendly teal.
            paint = max(paint, isFriendly * smoothstep(.10, .29, v));
            vec3 frame = mix(vec3(.012, .018, .026), vec3(.22, .27, .33), smoothstep(.045, .67, v));
            vec3 plate = mix(vec3(.023, .024, .031), combatInk, clamp(.50 + v * 1.46, .0, .95));
            diffuseColor.rgb = mix(frame, plate, paint);
          `)
          .replace('#include <emissivemap_fragment>', `#include <emissivemap_fragment>
            float edge = pow(1.0 - clamp(dot(normal, normalize(vViewPosition)), 0.0, 1.0), 3.0);
            totalEmissiveRadiance += mix(vec3(.20, .27, .35), combatInk, .20) * edge * .24;
          `);
      };
      material.customProgramCacheKey = () => 'oplot-readable-combat-v1';
      material.needsUpdate = true;
      return material;
    };
    object.material = Array.isArray(object.material) ? object.material.map(configure) : configure(object.material);
  });
}
