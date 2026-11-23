import {
  AdditiveBlending,
  BufferAttribute,
  DoubleSide,
  DynamicDrawUsage,
  InstancedBufferAttribute,
  InstancedBufferGeometry,
  Mesh,
  ShaderMaterial,
  type Scene,
  type Texture,
} from 'three'
import { MAX_PARTICLES, type ParticleFrame, type ParticleTexture } from '../../../modules/particles/particles.ts'
import { particleTextureOf, whiteTextureOf } from '../../../modules/particles/particleTextures.ts'

/**
 * The vertex shader of a particle: a quad of the size of the particle, turned by its angle, always facing the camera.
 *
 * @remarks
 * The place of the particle is in the world of the view already (the field mirrors the game's axes when it writes the
 * buffer), so the quad is put around it in the space of the camera: `mvPosition.xy` is the plane the camera looks at.
 */
/**
 * The world size of a particle of the size the game stores.
 *
 * @remarks
 * The game draws a particle as a **screen** sprite: its half size on the screen follows the size of the life, the
 * distance of the view and the focal of the camera (`EERIECreateSprite`: `(screen / 480) * siz * (3000 / depth - 1) *
 * focal * 0.001129`), so the same size number is a wide flame in front of the camera and a small spark at a distance.
 * A billboard of the view is a quad of the world, and the two meet at a factor of about four at the distance an author
 * stands from a fire: the size of the game is multiplied by it, so the flame reads as the game's flame at the range a
 * fireplace is looked at.
 */
const PARTICLE_SIZE_FACTOR = 4

const VERTEX_SHADER = `
attribute vec2 corner;
attribute vec3 partPosition;
attribute float partSize;
attribute float partRotation;
attribute vec3 partColor;
attribute float partAlpha;

varying vec2 vUv;
varying vec3 vColor;
varying float vAlpha;

void main() {
  vUv = corner + 0.5;
  vColor = partColor;
  vAlpha = partAlpha;

  vec4 mvPosition = modelViewMatrix * vec4(partPosition, 1.0);

  float s = sin(partRotation);
  float c = cos(partRotation);
  vec2 offset = vec2(c * corner.x - s * corner.y, s * corner.x + c * corner.y) * partSize;

  mvPosition.xy += offset;

  gl_Position = projectionMatrix * mvPosition;
}
`

/**
 * The fragment shader of a particle: the color of the texture, lit by the color of the particle and its life.
 */
const FRAGMENT_SHADER = `
uniform sampler2D map;

varying vec2 vUv;
varying vec3 vColor;
varying float vAlpha;

void main() {
  vec4 texel = texture2D(map, vUv);

  gl_FragColor = vec4(texel.rgb * vColor * vAlpha, 1.0);

  #include <colorspace_fragment>
}
`

/**
 * One texture of the field: its mesh, its buffers and the number of particles it draws.
 */
type Field = {
  readonly alpha: InstancedBufferAttribute
  readonly color: InstancedBufferAttribute
  readonly geometry: InstancedBufferGeometry
  readonly material: ShaderMaterial
  readonly mesh: Mesh
  readonly position: InstancedBufferAttribute
  readonly rotation: InstancedBufferAttribute
  readonly size: InstancedBufferAttribute
  count: number
}

/**
 * What a view draws of the particles of the level.
 */
export type ParticleField = {
  /**
   * Takes the particles of the frame, and drops the ones before it.
   *
   * @param frames The particles of the moment.
   */
  readonly update: (frames: readonly ParticleFrame[]) => void
  /**
   * Turns the particles on or off.
   *
   * @param visible Whether the particles of the level are on.
   */
  readonly setVisible: (visible: boolean) => void
  /**
   * Frees the buffers and the materials of the field.
   */
  readonly dispose: () => void
}

/**
 * Builds the field of the particles of one view.
 *
 * @remarks
 * A texture is one mesh of instanced quads, so the fire and the smoke of a level are two draws, and the fog or a spell
 * adds a third. The particles are placed by the buffers the model writes on every frame, and the shader of the material
 * turns every quad toward the camera: no sprite per particle, no node per particle.
 *
 * The texture of a field arrives from the data directory of the game (or the placeholder of the level): until it is
 * there the mesh is hidden, and the frames of the field are not written.
 *
 * @param options The scene of the view, and what asks it for a frame.
 * @param options.scene The scene the meshes of the field go into.
 * @param options.onRender Asks the view for a frame, so a new texture or a moved mesh is drawn.
 *
 * @returns The handle of the field.
 */
export function createParticleField(options: { readonly onRender: () => void; readonly scene: Scene }): ParticleField {
  const white = whiteTextureOf()
  const fields = new Map<ParticleTexture, Field>()
  let visible = false
  let ready = 0

  /**
   * Builds one mesh of the field: the quad of a particle and the buffers of a frame.
   *
   * @param kind The texture the mesh draws with.
   *
   * @returns The mesh and the buffers of the field.
   */
  function createField(kind: ParticleTexture): Field {
    const geometry = new InstancedBufferGeometry()

    geometry.setAttribute(
      'corner',
      new BufferAttribute(new Float32Array([-0.5, -0.5, 0.5, -0.5, 0.5, 0.5, -0.5, 0.5]), 2),
    )
    geometry.setIndex([0, 1, 2, 0, 2, 3])

    const position = new InstancedBufferAttribute(new Float32Array(MAX_PARTICLES * 3), 3)
    const size = new InstancedBufferAttribute(new Float32Array(MAX_PARTICLES), 1)
    const rotation = new InstancedBufferAttribute(new Float32Array(MAX_PARTICLES), 1)
    const color = new InstancedBufferAttribute(new Float32Array(MAX_PARTICLES * 3), 3)
    const alpha = new InstancedBufferAttribute(new Float32Array(MAX_PARTICLES), 1)

    position.setUsage(DynamicDrawUsage)
    size.setUsage(DynamicDrawUsage)
    rotation.setUsage(DynamicDrawUsage)
    color.setUsage(DynamicDrawUsage)
    alpha.setUsage(DynamicDrawUsage)

    geometry.setAttribute('partPosition', position)
    geometry.setAttribute('partSize', size)
    geometry.setAttribute('partRotation', rotation)
    geometry.setAttribute('partColor', color)
    geometry.setAttribute('partAlpha', alpha)
    geometry.instanceCount = 0

    const material = new ShaderMaterial({
      uniforms: { map: { value: white } },
      vertexShader: VERTEX_SHADER,
      fragmentShader: FRAGMENT_SHADER,
      transparent: true,
      depthWrite: false,
      depthTest: true,
      side: DoubleSide,
      blending: AdditiveBlending,
    })

    const mesh = new Mesh(geometry, material)

    // the bounds of the buffers are the ones of the last frame, and a quad of the camera side is always in them
    mesh.frustumCulled = false
    mesh.visible = false
    mesh.renderOrder = 10
    options.scene.add(mesh)

    const field: Field = { geometry, material, mesh, position, size, rotation, color, alpha, count: 0 }

    fields.set(kind, field)

    void particleTextureOf(kind)
      .then((texture: Texture) => {
        material.uniforms.map.value = texture
        ready = ready + 1

        if (ready >= 2) {
          mesh.visible = visible
        }

        options.onRender()
      })
      .catch(() => {
        // the placeholder is the white pixel: a particle without its image still shows where it is
        ready = ready + 1
        options.onRender()
      })

    return field
  }

  createField('fire')
  createField('smoke')

  return {
    update: (frames: readonly ParticleFrame[]): void => {
      if (ready < 2) {
        return
      }

      for (const field of fields.values()) {
        field.count = 0
      }

      for (const frame of frames) {
        const field = fields.get(frame.texture)

        if (field === undefined || field.count >= MAX_PARTICLES) {
          continue
        }

        const at = field.count

        // the game's coordinates are the scene's own; the view mirrors the two first axes, the way the mesh does
        field.position.setXYZ(at, -frame.position.x, -frame.position.y, frame.position.z)
        field.size.setX(at, frame.size * PARTICLE_SIZE_FACTOR)
        field.rotation.setX(at, frame.rotation)
        field.color.setXYZ(at, frame.color.r, frame.color.g, frame.color.b)
        field.alpha.setX(at, frame.alpha)
        field.count = at + 1
      }

      for (const field of fields.values()) {
        field.geometry.instanceCount = field.count
        field.position.needsUpdate = true
        field.size.needsUpdate = true
        field.rotation.needsUpdate = true
        field.color.needsUpdate = true
        field.alpha.needsUpdate = true
        field.mesh.visible = visible && field.count > 0
      }
    },
    setVisible: (next: boolean): void => {
      visible = next

      for (const field of fields.values()) {
        field.mesh.visible = next && field.count > 0
      }

      options.onRender()
    },
    dispose: (): void => {
      for (const field of fields.values()) {
        options.scene.remove(field.mesh)
        field.geometry.dispose()
        field.material.dispose()
      }

      fields.clear()
      white.dispose()
    },
  }
}
