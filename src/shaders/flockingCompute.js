// Flocking compute shaders - handle particle behavior calculations

export const flockingComputeShader = {
    vertexShader: `
        varying vec2 vUv;
        void main() {
            vUv = uv;
            gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
        }
    `,
    fragmentShader: `
        uniform sampler2D uPositions;
        uniform sampler2D uVelocities;
        uniform sampler2D uPredators; // NEW: Multiple predators texture
        uniform float uTime;
        uniform float uDeltaTime;
        uniform float uParticleCount;
        uniform float uTextureSize;
        uniform int uPass; // 0 = update positions, 1 = update velocities
        uniform float uFrameCount; // Frame counting like CPU
        uniform vec3 uCachedCenterOfMass; // Cached center of mass (updated every 2 frames like CPU)
        uniform float uGridSize; // Spatial grid size like CPU
        uniform bool uUpdateCenterOfMass; // Whether to update center this frame
        uniform int uPredatorCount; // Number of active predators
        
        varying vec2 vUv;
        
        // EXACTLY like CPU FlockingBehavior parameters
        const float separationDistance = 2.5;
        const float alignmentDistance = 5.0;
        const float cohesionDistance = 5.0;
        const float maxSpeed = 1.2;
        const float maxForce = 0.05;
        const float separationWeight = 1.8;
        const float alignmentWeight = 1.0;
        const float cohesionWeight = 0.8;
        const float speedMultiplier = 8.0;
        const float damping = 0.98;
        const float verticalDamping = 0.95;
        const float turbulence = 0.01;
        const float centerAttraction = 0.0002;
        const float predatorAvoidDistance = 20.0;
        const float predatorAvoidStrength = 2.0;
        
        // EXACTLY like CPU: Pre-calculated squared distances
        const float separationDistanceSq = separationDistance * separationDistance; // 6.25
        const float alignmentDistanceSq = alignmentDistance * alignmentDistance; // 25.0
        const float cohesionDistanceSq = cohesionDistance * cohesionDistance; // 25.0
        
        // EXACTLY like CPU: Zone radius calculation
        const float zoneRadius = max(max(separationDistance, alignmentDistance), cohesionDistance) * 1.5; // 7.5
        const float zoneRadiusSquared = zoneRadius * zoneRadius; // 56.25
        
        // GPU implementation of CPU's spatial grid system
        vec3 getGridKey(vec3 pos) {
            return floor(pos / uGridSize);
        }
        
        // GPU implementation of CPU's 27-cell neighbor checking
        bool isInNeighborGrid(vec3 gridPos, vec3 neighborGridPos) {
            vec3 diff = abs(neighborGridPos - gridPos);
            return diff.x <= 1.0 && diff.y <= 1.0 && diff.z <= 1.0;
        }
        
        vec3 calculateFlockingForces(vec3 pos, vec3 vel, float index) {
            // Initialize force accumulators EXACTLY like CPU
            vec3 separation = vec3(0.0);
            vec3 alignment = vec3(0.0);
            vec3 cohesion = vec3(0.0);
            float neighborCount = 0.0;
            
            // CPU-style spatial grid optimization
            vec3 gridPos = getGridKey(pos);
            
            // EXACTLY like CPU: Check all particles but with spatial grid filtering
            for (float i = 0.0; i < uParticleCount; i += 1.0) {
                if (i == index) continue;
                
                // Convert index to UV
                float y = floor(i / uTextureSize);
                float x = i - y * uTextureSize;
                vec2 neighborUV = (vec2(x, y) + 0.5) / uTextureSize;
                
                vec4 neighborPos = texture2D(uPositions, neighborUV);
                vec4 neighborVel = texture2D(uVelocities, neighborUV);
                
                // EXACTLY like CPU: Quick distance check first
                float dx_dist = pos.x - neighborPos.x;
                float dy_dist = pos.y - neighborPos.y;
                float dz_dist = pos.z - neighborPos.z;
                float distSquared = dx_dist * dx_dist + dy_dist * dy_dist + dz_dist * dz_dist;
                
                // Skip if outside zone radius or too close (EXACTLY like CPU)
                if (distSquared > zoneRadiusSquared || distSquared < 0.01) continue;
                
                // EXACTLY like CPU: Check if in nearby grid cells (27-cell check)
                vec3 neighborGridPos = getGridKey(neighborPos.xyz);
                if (!isInNeighborGrid(gridPos, neighborGridPos)) continue;
                
                neighborCount += 1.0;
                
                // EXACTLY like CPU: Inline force calculations
                // Separation
                if (distSquared < separationDistanceSq) {
                    float distance = sqrt(distSquared);
                    float force = (separationDistance - distance) / separationDistance;
                    float normalizedForce = force * force / distance;
                    
                    separation.x += dx_dist * normalizedForce;
                    separation.y += dy_dist * normalizedForce;
                    separation.z += dz_dist * normalizedForce;
                }
                
                // Alignment
                if (distSquared < alignmentDistanceSq) {
                    alignment.x += neighborVel.x;
                    alignment.y += neighborVel.y;
                    alignment.z += neighborVel.z;
                }
                
                // Cohesion
                if (distSquared < cohesionDistanceSq) {
                    cohesion.x += neighborPos.x;
                    cohesion.y += neighborPos.y;
                    cohesion.z += neighborPos.z;
                }
            }
            
            vec3 totalAcceleration = vec3(0.0);
            
            // Apply flocking rules EXACTLY like CPU
            if (neighborCount > 0.0) {
                // Separation (EXACTLY like CPU)
                if (dot(separation, separation) > 0.0) {
                    separation = normalize(separation) * separationWeight * maxForce;
                    totalAcceleration += separation;
                }
                
                // Alignment (EXACTLY like CPU)
                if (dot(alignment, alignment) > 0.0) {
                    alignment = alignment / neighborCount;
                    alignment = normalize(alignment) * alignmentWeight * maxForce;
                    totalAcceleration += alignment;
                }
                
                // Cohesion (EXACTLY like CPU)
                if (dot(cohesion, cohesion) > 0.0) {
                    cohesion = cohesion / neighborCount;
                    cohesion = cohesion - pos; // sub(posI) in CPU
                    cohesion = normalize(cohesion) * cohesionWeight * maxForce;
                    totalAcceleration += cohesion;
                }
            }
            
            // EXACTLY like CPU: Multiple predator avoidance
            for (int p = 0; p < 10; p++) { // Support up to 10 predators like CPU
                if (p >= uPredatorCount) break;
                
                // Read predator data from texture
                float predatorY = floor(float(p) / 4.0); // 4 predators per row
                float predatorX = float(p) - predatorY * 4.0;
                vec2 predatorUV = (vec2(predatorX, predatorY) + 0.5) / 4.0;
                
                vec4 predatorData = texture2D(uPredators, predatorUV);
                vec3 predatorPos = predatorData.xyz;
                float predatorStrength = predatorData.w;
                
                if (predatorStrength <= 0.0) continue;
                
                vec3 predatorDiff = pos - predatorPos;
                float predatorDist = length(predatorDiff);
                
                if (predatorDist < predatorAvoidDistance && predatorDist > 0.1) {
                    float force = (1.0 - predatorDist / predatorAvoidDistance) * predatorStrength * predatorAvoidStrength;
                    predatorDiff = normalize(predatorDiff) * force;
                    totalAcceleration += predatorDiff;
                }
            }
            
            // Center attraction using cached center of mass (EXACTLY like CPU)
            vec3 centerDiff = uCachedCenterOfMass - pos;
            float centerDist = length(centerDiff);
            if (centerDist > 30.0) {
                centerDiff = normalize(centerDiff) * centerAttraction;
                totalAcceleration += centerDiff;
            }
            
            // Turbulence (EXACTLY like CPU - apply every 3 frames)
            if (mod(uFrameCount, 3.0) < 1.0) {
                // EXACTLY like CPU: (Math.random() - 0.5) * turbulence
                totalAcceleration.x += (sin(uTime * 13.7 + index * 2.1) - 0.5) * turbulence;
                totalAcceleration.y += (sin(uTime * 17.8 + index * 3.15) - 0.5) * turbulence * 0.7;
                totalAcceleration.z += (sin(uTime * 11.6 + index * 1.12) - 0.5) * turbulence * 0.5;
            }
            
            return totalAcceleration;
        }
        
        void main() {
            vec2 uv = vUv;
            vec4 position = texture2D(uPositions, uv);
            vec4 velocity = texture2D(uVelocities, uv);
            
            float index = floor(uv.y * uTextureSize) * uTextureSize + floor(uv.x * uTextureSize);
            if (index >= uParticleCount) {
                if (uPass == 0) {
                    gl_FragColor = position;
                } else {
                    gl_FragColor = velocity;
                }
                return;
            }
            
            vec3 pos = position.xyz;
            vec3 vel = velocity.xyz;
            
            if (uPass == 0) {
                // PASS 0: Update positions using current velocities
                // EXACTLY like CPU: positions[i3] += this.velocities[i3] * speedMult
                // where speedMult = deltaTime * this.params.speedMultiplier (8.0)
                float speedMult = uDeltaTime * speedMultiplier;
                vec3 newPos = pos + vel * speedMult;
                gl_FragColor = vec4(newPos, 1.0);
                
            } else {
                // PASS 1: Update velocities using calculated forces
                vec3 acceleration = calculateFlockingForces(pos, vel, index);
                
                // EXACTLY like CPU: this.velocities[i3] = (this.velocities[i3] + this.accelerations[i3]) * this.params.damping
                vec3 newVel = vec3(
                    (vel.x + acceleration.x) * damping,
                    (vel.y + acceleration.y) * verticalDamping,
                    (vel.z + acceleration.z) * damping
                );
                
                // EXACTLY like CPU: Limit speed using squared comparison
                float maxSpeedSq = maxSpeed * maxSpeed;
                float speedSq = newVel.x * newVel.x + newVel.y * newVel.y + newVel.z * newVel.z;
                
                if (speedSq > maxSpeedSq) {
                    float speed = sqrt(speedSq);
                    float scale = maxSpeed / speed;
                    newVel.x *= scale;
                    newVel.y *= scale;
                    newVel.z *= scale;
                }
                
                gl_FragColor = vec4(newVel, 0.0);
            }
        }
    `
}