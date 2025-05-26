import * as THREE from 'three'

export class GPUFlockingBehavior {
    constructor(particleCount) {
        this.particleCount = particleCount
        this.isGPUSupported = this.checkGPUSupport()
        this.textureSize = Math.ceil(Math.sqrt(particleCount))

        // GPU-specific properties
        this.scene = new THREE.Scene()
        this.camera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1)
        this.renderTargets = null
        this.computeMesh = null

        // Flocking parameters (same as CPU version)
        this.params = {
            separationDistance: 2.5,
            alignmentDistance: 5.0,
            cohesionDistance: 5.0,
            maxSpeed: 1.2,
            maxForce: 0.05,
            separationWeight: 1.8,
            alignmentWeight: 1.0,
            cohesionWeight: 0.8,
            speedMultiplier: 8.0,
            damping: 0.98,
            verticalDamping: 0.95,
            turbulence: 0.01,
            centerAttraction: 0.0002,
            predatorAvoidDistance: 20.0,
            predatorAvoidStrength: 2.0
        }

        // Predator system
        this.predators = []
        this.lastDisruptionTime = 0
        this.disruptionInterval = 15000
        this.disruptionDuration = 5000
    }

    checkGPUSupport() {
        try {
            const canvas = document.createElement('canvas')
            const gl = canvas.getContext('webgl2') || canvas.getContext('webgl')
            if (!gl) return false

            // Check for float texture support
            const ext = gl.getExtension('OES_texture_float') || gl.getExtension('EXT_color_buffer_float')
            return !!ext
        } catch (e) {
            return false
        }
    }

    initializeGPU(gl) {
        if (!this.isGPUSupported) return false

        try {
            // Create render targets for ping-pong rendering
            const options = {
                minFilter: THREE.NearestFilter,
                magFilter: THREE.NearestFilter,
                format: THREE.RGBAFormat,
                type: THREE.FloatType,
                generateMipmaps: false,
                stencilBuffer: false,
                depthBuffer: false
            }

            this.renderTargets = {
                position: {
                    read: new THREE.WebGLRenderTarget(this.textureSize, this.textureSize, options),
                    write: new THREE.WebGLRenderTarget(this.textureSize, this.textureSize, options)
                },
                velocity: {
                    read: new THREE.WebGLRenderTarget(this.textureSize, this.textureSize, options),
                    write: new THREE.WebGLRenderTarget(this.textureSize, this.textureSize, options)
                }
            }

            // Create compute mesh
            this.computeMesh = new THREE.Mesh(
                new THREE.PlaneGeometry(2, 2),
                new THREE.ShaderMaterial({
                    uniforms: this.createUniforms(),
                    vertexShader: this.getVertexShader(),
                    fragmentShader: this.getVelocityFragmentShader()
                })
            )

            this.scene.add(this.computeMesh)
            return true
        } catch (e) {
            console.warn('GPU flocking initialization failed, falling back to CPU:', e)
            this.isGPUSupported = false
            return false
        }
    }

    createUniforms() {
        return {
            uPositionsTexture: { value: null },
            uVelocitiesTexture: { value: null },
            uResolution: { value: new THREE.Vector2(this.textureSize, this.textureSize) },
            uDeltaTime: { value: 0 },
            uTime: { value: 0 },
            uSeparationDistance: { value: this.params.separationDistance },
            uAlignmentDistance: { value: this.params.alignmentDistance },
            uCohesionDistance: { value: this.params.cohesionDistance },
            uMaxSpeed: { value: this.params.maxSpeed },
            uMaxForce: { value: this.params.maxForce },
            uSeparationWeight: { value: this.params.separationWeight },
            uAlignmentWeight: { value: this.params.alignmentWeight },
            uCohesionWeight: { value: this.params.cohesionWeight },
            uPredatorCount: { value: 0 },
            uPredatorPositions: { value: new Float32Array(12) }, // Max 3 predators
            uPredatorStrengths: { value: new Float32Array(3) }
        }
    }

    getVertexShader() {
        return `
            void main() {
                gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
            }
        `
    }

    getVelocityFragmentShader() {
        return `
            uniform sampler2D uPositionsTexture;
            uniform sampler2D uVelocitiesTexture;
            uniform vec2 uResolution;
            uniform float uDeltaTime;
            uniform float uTime;
            uniform float uSeparationDistance;
            uniform float uAlignmentDistance;
            uniform float uCohesionDistance;
            uniform float uMaxSpeed;
            uniform float uMaxForce;
            uniform float uSeparationWeight;
            uniform float uAlignmentWeight;
            uniform float uCohesionWeight;
            uniform int uPredatorCount;
            uniform vec3 uPredatorPositions[3];
            uniform float uPredatorStrengths[3];
            
            void main() {
                vec2 uv = gl_FragCoord.xy / uResolution;
                vec3 position = texture2D(uPositionsTexture, uv).xyz;
                vec3 velocity = texture2D(uVelocitiesTexture, uv).xyz;
                
                vec3 separation = vec3(0.0);
                vec3 alignment = vec3(0.0);
                vec3 cohesion = vec3(0.0);
                float neighborCount = 0.0;
                
                // Optimized neighbor sampling - reduced radius for performance
                float sampleStep = 1.0 / uResolution.x;
                int sampleRadius = 2;
                
                for (int x = -sampleRadius; x <= sampleRadius; x++) {
                    for (int y = -sampleRadius; y <= sampleRadius; y++) {
                        if (x == 0 && y == 0) continue;
                        
                        vec2 sampleUV = uv + vec2(float(x), float(y)) * sampleStep;
                        if (sampleUV.x < 0.0 || sampleUV.x > 1.0 || sampleUV.y < 0.0 || sampleUV.y > 1.0) continue;
                        
                        vec3 otherPos = texture2D(uPositionsTexture, sampleUV).xyz;
                        vec3 otherVel = texture2D(uVelocitiesTexture, sampleUV).xyz;
                        
                        vec3 diff = position - otherPos;
                        float dist = length(diff);
                        
                        if (dist > 0.0 && dist < uCohesionDistance) {
                            neighborCount += 1.0;
                            
                            // Separation
                            if (dist < uSeparationDistance) {
                                separation += normalize(diff) / dist;
                            }
                            
                            // Alignment
                            if (dist < uAlignmentDistance) {
                                alignment += otherVel;
                            }
                            
                            // Cohesion
                            cohesion += otherPos;
                        }
                    }
                }
                
                vec3 acceleration = vec3(0.0);
                
                if (neighborCount > 0.0) {
                    // Apply flocking rules
                    if (length(separation) > 0.0) {
                        separation = normalize(separation) * uMaxForce * uSeparationWeight;
                        acceleration += separation;
                    }
                    
                    if (length(alignment) > 0.0) {
                        alignment = normalize(alignment / neighborCount) * uMaxForce * uAlignmentWeight;
                        acceleration += alignment;
                    }
                    
                    if (length(cohesion) > 0.0) {
                        cohesion = normalize((cohesion / neighborCount) - position) * uMaxForce * uCohesionWeight;
                        acceleration += cohesion;
                    }
                }
                
                // Predator avoidance
                for (int i = 0; i < 3; i++) {
                    if (i >= uPredatorCount) break;
                    
                    vec3 predatorPos = uPredatorPositions[i];
                    float predatorStrength = uPredatorStrengths[i];
                    
                    vec3 diff = position - predatorPos;
                    float dist = length(diff);
                    
                    if (dist < 20.0 && dist > 0.1) {
                        float force = (1.0 - dist / 20.0) * predatorStrength * 2.0;
                        acceleration += normalize(diff) * force;
                    }
                }
                
                // Turbulence
                acceleration += vec3(
                    (fract(sin(dot(uv + uTime * 0.1, vec2(12.9898, 78.233))) * 43758.5453) - 0.5) * 0.01,
                    (fract(sin(dot(uv + uTime * 0.1, vec2(93.9898, 67.345))) * 43758.5453) - 0.5) * 0.007,
                    (fract(sin(dot(uv + uTime * 0.1, vec2(45.1234, 89.567))) * 43758.5453) - 0.5) * 0.005
                );
                
                // Update velocity
                velocity += acceleration * uDeltaTime;
                
                // Apply damping
                velocity.xy *= 0.98;
                velocity.z *= 0.95;
                
                // Limit speed
                float speed = length(velocity);
                if (speed > uMaxSpeed) {
                    velocity = normalize(velocity) * uMaxSpeed;
                }
                
                gl_FragColor = vec4(velocity, 1.0);
            }
        `
    }

    getPositionFragmentShader() {
        return `
            uniform sampler2D uPositionsTexture;
            uniform sampler2D uVelocitiesTexture;
            uniform float uDeltaTime;
            
            void main() {
                vec2 uv = gl_FragCoord.xy / vec2(${this.textureSize}.0, ${this.textureSize}.0);
                vec3 position = texture2D(uPositionsTexture, uv).xyz;
                vec3 velocity = texture2D(uVelocitiesTexture, uv).xyz;
                
                // Update position
                position += velocity * uDeltaTime * 8.0;
                
                // Boundaries
                if (abs(position.x) > 40.0) {
                    position.x = sign(position.x) * 40.0;
                }
                if (abs(position.y) > 30.0) {
                    position.y = sign(position.y) * 30.0;
                }
                if (abs(position.z) > 20.0) {
                    position.z = sign(position.z) * 20.0;
                }
                
                gl_FragColor = vec4(position, 1.0);
            }
        `
    }

    initializeTextures(positions, velocities, gl) {
        if (!this.isGPUSupported || !this.renderTargets) return false

        try {
            // Convert positions and velocities to texture format
            const textureData = this.convertToTextureData(positions, velocities)

            // Create data textures
            const positionTexture = new THREE.DataTexture(
                textureData.positions, this.textureSize, this.textureSize,
                THREE.RGBAFormat, THREE.FloatType
            )
            const velocityTexture = new THREE.DataTexture(
                textureData.velocities, this.textureSize, this.textureSize,
                THREE.RGBAFormat, THREE.FloatType
            )

            positionTexture.needsUpdate = true
            velocityTexture.needsUpdate = true

            // Initialize render targets
            this.initializeRenderTarget(gl, this.renderTargets.position.read, positionTexture)
            this.initializeRenderTarget(gl, this.renderTargets.position.write, positionTexture)
            this.initializeRenderTarget(gl, this.renderTargets.velocity.read, velocityTexture)
            this.initializeRenderTarget(gl, this.renderTargets.velocity.write, velocityTexture)

            return true
        } catch (e) {
            console.warn('GPU texture initialization failed:', e)
            return false
        }
    }

    convertToTextureData(positions, velocities) {
        const texturePositions = new Float32Array(this.textureSize * this.textureSize * 4)
        const textureVelocities = new Float32Array(this.textureSize * this.textureSize * 4)

        for (let i = 0; i < this.particleCount; i++) {
            const i3 = i * 3
            const i4 = i * 4

            texturePositions[i4] = positions[i3]
            texturePositions[i4 + 1] = positions[i3 + 1]
            texturePositions[i4 + 2] = positions[i3 + 2]
            texturePositions[i4 + 3] = 1

            textureVelocities[i4] = velocities[i3]
            textureVelocities[i4 + 1] = velocities[i3 + 1]
            textureVelocities[i4 + 2] = velocities[i3 + 2]
            textureVelocities[i4 + 3] = 1
        }

        return { positions: texturePositions, velocities: textureVelocities }
    }

    initializeRenderTarget(gl, renderTarget, dataTexture) {
        const tempMaterial = new THREE.ShaderMaterial({
            vertexShader: this.getVertexShader(),
            fragmentShader: `
                uniform sampler2D uTexture;
                void main() {
                    vec2 uv = gl_FragCoord.xy / vec2(${this.textureSize}.0, ${this.textureSize}.0);
                    gl_FragColor = texture2D(uTexture, uv);
                }
            `,
            uniforms: { uTexture: { value: dataTexture } }
        })

        const tempMesh = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), tempMaterial)
        const tempScene = new THREE.Scene()
        tempScene.add(tempMesh)

        gl.setRenderTarget(renderTarget)
        gl.render(tempScene, this.camera)
        gl.setRenderTarget(null)

        // Cleanup
        tempMaterial.dispose()
        tempMesh.geometry.dispose()
        tempScene.remove(tempMesh)
    }

    updateGPU(deltaTime, gl) {
        if (!this.isGPUSupported || !this.renderTargets || !this.computeMesh) return null

        try {
            deltaTime = Math.min(deltaTime, 0.033)

            // Update predators
            this.updatePredators(Date.now(), { x: 0, y: 0, z: 0 })
            this.updatePredatorUniforms()

            // Update velocities
            this.computeMesh.material.fragmentShader = this.getVelocityFragmentShader()
            this.computeMesh.material.uniforms.uPositionsTexture.value = this.renderTargets.position.read.texture
            this.computeMesh.material.uniforms.uVelocitiesTexture.value = this.renderTargets.velocity.read.texture
            this.computeMesh.material.uniforms.uDeltaTime.value = deltaTime
            this.computeMesh.material.uniforms.uTime.value = performance.now() * 0.001
            this.computeMesh.material.needsUpdate = true

            gl.setRenderTarget(this.renderTargets.velocity.write)
            gl.render(this.scene, this.camera)

            // Update positions
            this.computeMesh.material.fragmentShader = this.getPositionFragmentShader()
            this.computeMesh.material.uniforms.uPositionsTexture.value = this.renderTargets.position.read.texture
            this.computeMesh.material.uniforms.uVelocitiesTexture.value = this.renderTargets.velocity.write.texture
            this.computeMesh.material.needsUpdate = true

            gl.setRenderTarget(this.renderTargets.position.write)
            gl.render(this.scene, this.camera)

            gl.setRenderTarget(null)

            // Swap render targets
            this.swapRenderTargets()

            return this.renderTargets.position.read.texture
        } catch (e) {
            console.warn('GPU update failed, falling back to CPU:', e)
            this.isGPUSupported = false
            return null
        }
    }

    swapRenderTargets() {
        // Swap position targets
        const tempPos = this.renderTargets.position.read
        this.renderTargets.position.read = this.renderTargets.position.write
        this.renderTargets.position.write = tempPos

        // Swap velocity targets
        const tempVel = this.renderTargets.velocity.read
        this.renderTargets.velocity.read = this.renderTargets.velocity.write
        this.renderTargets.velocity.write = tempVel
    }

    updatePredators(currentTime, flockCenter) {
        if (currentTime - this.lastDisruptionTime > this.disruptionInterval) {
            this.createDisruption(flockCenter)
            this.lastDisruptionTime = currentTime
        }

        this.predators = this.predators.filter(predator => {
            const age = currentTime - predator.createdAt
            if (age > this.disruptionDuration) return false

            // Smooth movement
            predator.position.x += predator.velocity.x * 0.016
            predator.position.y += predator.velocity.y * 0.016
            predator.position.z += predator.velocity.z * 0.016

            // Smooth fade
            const t = age / this.disruptionDuration
            predator.strength = predator.initialStrength * (1 - t * t)

            return true
        })
    }

    createDisruption(flockCenter) {
        const angle = Math.random() * Math.PI * 2
        const distance = 25

        this.predators.push({
            position: new THREE.Vector3(
                flockCenter.x + Math.cos(angle) * distance,
                flockCenter.y,
                flockCenter.z + Math.sin(angle) * distance
            ),
            velocity: new THREE.Vector3(
                -Math.cos(angle) * 0.3,
                0,
                -Math.sin(angle) * 0.3
            ),
            initialStrength: 0.6,
            strength: 0.6,
            createdAt: Date.now()
        })
    }

    updatePredatorUniforms() {
        if (!this.computeMesh) return

        const uniforms = this.computeMesh.material.uniforms
        uniforms.uPredatorCount.value = Math.min(this.predators.length, 3)

        for (let i = 0; i < 3; i++) {
            if (i < this.predators.length) {
                const predator = this.predators[i]
                uniforms.uPredatorPositions.value[i * 3] = predator.position.x
                uniforms.uPredatorPositions.value[i * 3 + 1] = predator.position.y
                uniforms.uPredatorPositions.value[i * 3 + 2] = predator.position.z
                uniforms.uPredatorStrengths.value[i] = predator.strength
            } else {
                uniforms.uPredatorPositions.value[i * 3] = 0
                uniforms.uPredatorPositions.value[i * 3 + 1] = 0
                uniforms.uPredatorPositions.value[i * 3 + 2] = 0
                uniforms.uPredatorStrengths.value[i] = 0
            }
        }
    }

    // Fallback methods for CPU computation
    startTransition() {
        // Implementation remains the same as your original
    }

    endTransition() {
        // Implementation remains the same as your original
    }

    dispose() {
        if (this.renderTargets) {
            this.renderTargets.position.read.dispose()
            this.renderTargets.position.write.dispose()
            this.renderTargets.velocity.read.dispose()
            this.renderTargets.velocity.write.dispose()
        }

        if (this.computeMesh) {
            this.computeMesh.material.dispose()
            this.computeMesh.geometry.dispose()
        }
    }
}
