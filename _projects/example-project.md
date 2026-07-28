---
name: Aurora
subtitle: A generative visual engine powered by WebGL shaders
image: /assets/image/projects/_placeholder.svg
description: Real-time procedural visuals driven by audio input — built to explore GPU shader composition at scale.
category: Web
status: "2024"
tags: [TypeScript, WebGL, Three.js, Shaders]
external_links:
  - { name: "Live Demo", url: "https://example.com", icon: "external-link-alt" }
  - { name: "Source", url: "https://github.com/example/aurora", icon: "github", prefix: "fab" }
---

## Role
Solo developer — architecture, shader pipeline, and audio analysis.

## Contributions
- Designed a modular shader graph supporting 40+ concurrent visual layers
- Built an FFT audio analyzer feeding 16 frequency bands into uniform inputs
- Implemented adaptive quality scaling for 60fps on mobile GPUs

## Technical Challenges
- **Shader compilation stutter** — Solved by pre-compiling all shader variants at load time and hot-swapping pipelines.
- **Audio latency** — Reduced from 120ms to 18ms via Web Audio API's AnalyserNode with a custom smoothing kernel.

## Lessons Learned
- GPU profiling early would have caught the fill-rate bottleneck before the final week.
- A data-driven shader graph (JSON config) beats hardcoded pipelines for iteration speed.
