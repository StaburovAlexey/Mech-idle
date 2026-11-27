import { expect, it } from 'vitest';
import * as THREE from 'three';
import { COMBAT_COLORS, applyCombatPalette } from './combatPalette';

it('reuses original geometry and texture while giving ally and enemy different readable palettes', () => {
  const geometry = new THREE.BoxGeometry();
  const texture = new THREE.Texture();
  const materials = [new THREE.MeshBasicMaterial({ map: texture }), new THREE.MeshStandardMaterial({ map: texture })];
  const actors = materials.map(material => new THREE.Mesh(geometry, material));
  applyCombatPalette(actors[0], COMBAT_COLORS[0]);
  applyCombatPalette(actors[1], COMBAT_COLORS[4], true);
  const result = actors.map(actor => {
    expect(actor.material).toBeInstanceOf(THREE.MeshStandardMaterial);
    const material = actor.material as THREE.MeshStandardMaterial;
    const shader = {
      uniforms: {},
      fragmentShader: '#include <common>\n#include <map_fragment>\n#include <emissivemap_fragment>',
    } as Parameters<typeof material.onBeforeCompile>[0];
    material.onBeforeCompile(shader, {} as THREE.WebGLRenderer);
    expect(shader.fragmentShader).toContain('totalEmissiveRadiance +=');
    expect(material.map).toBe(texture);
    expect(material.roughness).toBe(.8);
    return shader.uniforms;
  });
  expect(actors.every(mesh => mesh.geometry === geometry)).toBe(true);
  expect(result[0].combatInk.value.getHex()).toBe(COMBAT_COLORS[0]);
  expect(result[1].combatInk.value.getHex()).toBe(COMBAT_COLORS[4]);
  expect(result.map(uniform => uniform.isFriendly.value)).toEqual([0, 1]);
});
