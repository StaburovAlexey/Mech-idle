import * as THREE from 'three';
import { sandHeightGLSL } from './sandTerrain';

export const PORTAL_CAPACITY = 48;
export const PORTAL_CLOSE = .82;

export function spawnRise(age: number) {
  return THREE.MathUtils.smoothstep(age, 0, .57);
}

export function createPortalMesh() {
  const geometry = new THREE.PlaneGeometry(2, 2, 8, 8).rotateX(-Math.PI / 2);
  const timing = new THREE.InstancedBufferAttribute(new Float32Array(PORTAL_CAPACITY * 2), 2).setUsage(THREE.DynamicDrawUsage);
  geometry.setAttribute('timing', timing);
  // One transparent draw for every warning, vortex and expanding shock ring.
  const material = new THREE.ShaderMaterial({
    transparent: true, depthWrite: false, toneMapped: false,
    uniforms: { occludedOnly: { value: 0 } },
    vertexShader: `
      attribute vec2 timing;
      varying vec2 p;
      varying vec2 effect;
      ${sandHeightGLSL}
      void main() {
        p = uv * 2.0 - 1.0;
        effect = timing;
        vec4 world = modelMatrix * instanceMatrix * vec4(position, 1.0);
        world.y += groundHeight(world.xz);
        gl_Position = projectionMatrix * viewMatrix * world;
      }
    `,
    fragmentShader: `
      uniform float occludedOnly;
      varying vec2 p;
      varying vec2 effect;
      void main() {
        float age = effect.x;
        float opening = smoothstep(-.5, -.09, age);
        float closing = 1.0 - smoothstep(.23, ${PORTAL_CLOSE.toFixed(2)}, age);
        float angle = atan(p.y, p.x);
        float radius = length(p);
        float spin = age * 11.0 + effect.y;
        float edge = mix(.26, .67, opening) * mix(.70, 1.0, closing);
        edge += .019 * sin(angle * 7.0 + spin) + .012 * sin(angle * 13.0 - spin * 1.7);
        float core = 1.0 - smoothstep(edge * .88, edge, radius);
        float spiral = pow(.5 + .5 * sin(angle * 3.0 - radius * 24.0 + spin + sin(radius * 14.0 - spin)), 3.0);
        float thread = (1.0 - smoothstep(.018, .048, abs(radius - edge)));
        float glow = 1.0 - smoothstep(.017, .22, abs(radius - edge));
        float wave = step(0.0, age) * (1.0 - smoothstep(.05, .58, age))
          * (1.0 - smoothstep(.013, .05, abs(radius - (.45 + age * .90))));
        float heat = min(1.0, thread * .87 + wave * .8 + core * spiral * .5);
        vec3 color = mix(vec3(.24, .003, .014), vec3(1.0, .029, .037), min(1.0, heat + glow * .33));
        color = mix(color, vec3(1.0, .27, .12), thread * thread * .42);
        float alpha = max(wave * .7, closing * (.67 * core + .28 * glow + .42 * thread));
        // If opaque scenery hides part of the portal, keep only a thin warning rim through it.
        // The vortex and sparks still obey normal occlusion, so the building does not glow red.
        float hiddenOutline = thread * closing * .64;
        gl_FragColor = vec4(color, mix(min(alpha, 1.0), hiddenOutline, occludedOnly) * mix(.35, 1.0, opening));
        #include <colorspace_fragment>
      }
    `,
  });
  const mesh = new THREE.InstancedMesh(geometry, material, PORTAL_CAPACITY);
  mesh.count = 0; mesh.frustumCulled = false; mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
  mesh.name = 'spawn-portals-ground';
  const hiddenMaterial = material.clone();
  hiddenMaterial.uniforms.occludedOnly.value = 1;
  hiddenMaterial.depthFunc = THREE.GreaterDepth;
  const occluded = new THREE.InstancedMesh(geometry, hiddenMaterial, PORTAL_CAPACITY);
  occluded.name = 'spawn-portals-occluded-rim';
  occluded.instanceMatrix = mesh.instanceMatrix;
  occluded.count = 0; occluded.frustumCulled = false;
  occluded.renderOrder = 6;
  return { mesh, timing, occluded };
}
