// src/components/SystemMonitor.jsx
import React, { useState, useEffect } from "react";

const SystemMonitor = () => {
	const [cpuUsage, setCpuUsage] = useState(0);
	const [memoryUsage, setMemoryUsage] = useState(0);
	const [fps, setFps] = useState(0);
	const [gpuInfo, setGpuInfo] = useState("");
	const [webglStats, setWebglStats] = useState({
		drawCalls: 0,
		triangles: 0,
		textureMemory: 0,
		shaderPrograms: 0,
		gpuMemoryUsed: 0,
		renderTime: 0,
	});

	// Monitor CPU usage (approximation using busy wait)
	useEffect(() => {
		const measureCPU = () => {
			const startTime = performance.now();
			const iterations = 100000;

			// Busy work to stress CPU
			for (let i = 0; i < iterations; i++) {
				Math.random() * Math.random();
			}

			const endTime = performance.now();
			const cpuTime = endTime - startTime;

			// Normalize to percentage (this is a rough approximation)
			const usage = Math.min((cpuTime / 16) * 100, 100); // 16ms = 60fps baseline
			setCpuUsage(Math.round(usage));
		};

		const interval = setInterval(measureCPU, 1000);
		return () => clearInterval(interval);
	}, []);

	// Monitor memory usage
	useEffect(() => {
		const measureMemory = () => {
			if ("memory" in performance && (performance as any).memory) {
				const memory = (performance as any).memory;
				const usedMB = memory.usedJSHeapSize / 1024 / 1024;
				setMemoryUsage(Math.round(usedMB));
			}
		};

		const interval = setInterval(measureMemory, 1000);
		return () => clearInterval(interval);
	}, []);

	// Monitor FPS and WebGL stats
	useEffect(() => {
		let lastTime = 0;
		let frameCount = 0;
		let lastFpsUpdate = 0;
		const renderTimes: number[] = [];

		const measureFPS = (currentTime: number) => {
			frameCount++;

			// Track render time
			if (lastTime > 0) {
				const frameTime = currentTime - lastTime;
				renderTimes.push(frameTime);
				if (renderTimes.length > 60) renderTimes.shift(); // Keep last 60 frames
			}
			lastTime = currentTime;

			if (currentTime - lastFpsUpdate >= 1000) {
				setFps(frameCount);
				frameCount = 0;
				lastFpsUpdate = currentTime;

				// Update WebGL stats
				measureWebGLStats(renderTimes);
			}

			requestAnimationFrame(measureFPS);
		};

		requestAnimationFrame(measureFPS);
	}, []);

	// Measure WebGL statistics
	const measureWebGLStats = (renderTimes: number[]) => {
		const canvas = document.querySelector("canvas");
		if (canvas) {
			const gl = canvas.getContext("webgl2") || canvas.getContext("webgl");
			if (gl) {
				// Calculate average render time
				const avgRenderTime =
					renderTimes.length > 0
						? renderTimes.reduce((a, b) => a + b, 0) / renderTimes.length
						: 0;

				// Estimate GPU memory usage
				const particleCount = 2500;
				const bytesPerParticle = 4 * 4; // 4 floats (x,y,z,w) * 4 bytes
				const estimatedGPUMemory = (particleCount * bytesPerParticle) / 1024; // KB

				const stats = {
					drawCalls: 2, // FBO render + particle render
					triangles: particleCount * 2, // 2 triangles per particle
					textureMemory: Math.round(
						(gl.getParameter(gl.MAX_TEXTURE_SIZE) * 4) / 1024 / 1024,
					),
					shaderPrograms: 2, // FBO + particle rendering
					gpuMemoryUsed: Math.round(estimatedGPUMemory),
					renderTime: Math.round(avgRenderTime * 100) / 100,
				};

				setWebglStats(stats);
			}
		}
	};

	// Get GPU info
	useEffect(() => {
		const getGPUInfo = () => {
			const canvas = document.createElement("canvas");
			const gl =
				canvas.getContext("webgl2") ||
				canvas.getContext("webgl") ||
				canvas.getContext("experimental-webgl");

			if (gl) {
				const debugInfo = (gl as WebGLRenderingContext).getExtension(
					"WEBGL_debug_renderer_info",
				);
				if (debugInfo) {
					const renderer = (gl as WebGLRenderingContext).getParameter(
						debugInfo.UNMASKED_RENDERER_WEBGL,
					);
					setGpuInfo(renderer);
				} else {
					setGpuInfo("GPU info not available");
				}
			} else {
				setGpuInfo("WebGL not supported");
			}
		};

		getGPUInfo();
	}, []);

	return (
		<div style={styles.container}>
			<div style={styles.header}>System Monitor</div>

			<div style={styles.metric}>
				<span style={styles.label}>CPU:</span>
				<div style={styles.progressBar}>
					<div
						style={{
							...styles.progressFill,
							width: `${cpuUsage}%`,
							backgroundColor:
								cpuUsage > 80
									? "#ff4444"
									: cpuUsage > 50
										? "#ffaa00"
										: "#44ff44",
						}}
					/>
				</div>
				<span style={styles.value}>{cpuUsage}%</span>
			</div>

			<div style={styles.metric}>
				<span style={styles.label}>RAM:</span>
				<span style={styles.value}>{memoryUsage} MB</span>
			</div>

			<div style={styles.metric}>
				<span style={styles.label}>FPS:</span>
				<span
					style={{
						...styles.value,
						color: fps < 30 ? "#ff4444" : fps < 50 ? "#ffaa00" : "#44ff44",
					}}
				>
					{fps}
				</span>
			</div>

			<div style={styles.webglSection}>
				<div style={styles.sectionHeader}>GPU Performance</div>
				<div style={styles.smallMetric}>
					<span style={styles.smallLabel}>Render Time:</span>
					<span
						style={{
							...styles.smallValue,
							color: webglStats.renderTime > 16 ? "#ff4444" : "#44ff44",
						}}
					>
						{webglStats.renderTime}ms
					</span>
				</div>
				<div style={styles.smallMetric}>
					<span style={styles.smallLabel}>GPU Memory:</span>
					<span style={styles.smallValue}>{webglStats.gpuMemoryUsed}KB</span>
				</div>
				<div style={styles.smallMetric}>
					<span style={styles.smallLabel}>Draw Calls:</span>
					<span style={styles.smallValue}>{webglStats.drawCalls}</span>
				</div>
				<div style={styles.smallMetric}>
					<span style={styles.smallLabel}>Triangles:</span>
					<span style={styles.smallValue}>
						{webglStats.triangles.toLocaleString()}
					</span>
				</div>
				<div style={styles.smallMetric}>
					<span style={styles.smallLabel}>Shaders:</span>
					<span style={styles.smallValue}>{webglStats.shaderPrograms}</span>
				</div>
			</div>

			<div style={styles.gpuMetric}>
				<span style={styles.label}>GPU:</span>
				<span style={styles.gpuInfo}>{gpuInfo.substring(0, 30)}...</span>
			</div>

			<div style={styles.helpText}>
				💡 For real GPU usage: Activity Monitor → Window → GPU History (macOS)
			</div>
		</div>
	);
};

const styles = {
	container: {
		position: "absolute" as const,
		top: "60px", // Below the stats.js panel
		right: "10px",
		padding: "15px",
		backgroundColor: "rgba(0, 0, 0, 0.8)",
		color: "#ffffff",
		borderRadius: "8px",
		fontFamily: "monospace",
		fontSize: "12px",
		minWidth: "200px",
		zIndex: 1000,
		backdropFilter: "blur(5px)",
		border: "1px solid rgba(255, 255, 255, 0.1)",
	},
	header: {
		fontSize: "14px",
		fontWeight: "bold" as const,
		marginBottom: "10px",
		textAlign: "center" as const,
		borderBottom: "1px solid rgba(255, 255, 255, 0.2)",
		paddingBottom: "5px",
	},
	metric: {
		display: "flex",
		alignItems: "center" as const,
		marginBottom: "8px",
		gap: "8px",
	},
	label: {
		minWidth: "35px",
		fontSize: "11px",
		color: "#ccc",
	},
	value: {
		fontWeight: "bold" as const,
		minWidth: "40px",
		textAlign: "right" as const,
	},
	progressBar: {
		flex: 1,
		height: "8px",
		backgroundColor: "rgba(255, 255, 255, 0.1)",
		borderRadius: "4px",
		overflow: "hidden" as const,
	},
	progressFill: {
		height: "100%",
		transition: "width 0.3s ease",
		borderRadius: "4px",
	},
	webglSection: {
		marginTop: "10px",
		paddingTop: "8px",
		borderTop: "1px solid rgba(255, 255, 255, 0.1)",
	},
	sectionHeader: {
		fontSize: "11px",
		fontWeight: "bold" as const,
		marginBottom: "6px",
		color: "#aaa",
	},
	smallMetric: {
		display: "flex",
		justifyContent: "space-between" as const,
		marginBottom: "4px",
	},
	smallLabel: {
		fontSize: "10px",
		color: "#999",
	},
	smallValue: {
		fontSize: "10px",
		fontWeight: "bold" as const,
		color: "#fff",
	},
	gpuMetric: {
		marginTop: "8px",
		paddingTop: "6px",
		borderTop: "1px solid rgba(255, 255, 255, 0.1)",
		display: "flex",
		alignItems: "center" as const,
		gap: "8px",
	},
	gpuInfo: {
		fontSize: "9px",
		color: "#ccc",
		flex: 1,
		wordBreak: "break-all" as const,
	},
	helpText: {
		fontSize: "10px",
		color: "#ccc",
		marginTop: "10px",
		textAlign: "center" as const,
	},
};

export default SystemMonitor;
