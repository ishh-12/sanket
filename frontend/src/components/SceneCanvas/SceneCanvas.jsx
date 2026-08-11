import { useEffect, useRef } from 'react';
import * as THREE from 'three';
import './SceneCanvas.css';

const sceneNames = ['hero', 'build', 'healthy', 'notice', 'why', 'storage', 'heal', 'restore', 'predict', 'pillars', 'final'];

export default function SceneCanvas({ activeScene, activePillar, pointerRef, reducedMotion }) {
  const canvasRef = useRef(null);
  const sceneRef = useRef(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return undefined;

    const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true, powerPreference: 'high-performance' });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 1.8));
    renderer.setSize(window.innerWidth, window.innerHeight);
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.08;

    const scene = new THREE.Scene();
    scene.fog = new THREE.FogExp2(0x0d0f0e, 0.045);

    const camera = new THREE.PerspectiveCamera(39, window.innerWidth / window.innerHeight, 0.1, 100);
    camera.position.set(0, 0.1, 9.6);

    const ambient = new THREE.HemisphereLight(0xf2f0e8, 0x0d0f0e, 0.62);
    const key = new THREE.PointLight(0xf2f0e8, 4.2, 25);
    key.position.set(3.2, 4.2, 6);
    const limeLight = new THREE.PointLight(0xc7ff3d, 1.65, 20);
    limeLight.position.set(-2.5, -1.2, 3);
    scene.add(ambient, key, limeLight);

    const root = new THREE.Group();
    scene.add(root);

    const materials = {
      pearl: new THREE.MeshPhysicalMaterial({
        color: 0xf2f0e8,
        roughness: 0.18,
        metalness: 0.08,
        transmission: 0.52,
        thickness: 1.3,
        transparent: true,
        opacity: 0.76,
      }),
      metal: new THREE.MeshStandardMaterial({ color: 0x8b8d86, metalness: 0.72, roughness: 0.26 }),
      darkMetal: new THREE.MeshStandardMaterial({ color: 0x242824, metalness: 0.8, roughness: 0.28 }),
      lime: new THREE.MeshBasicMaterial({ color: 0xc7ff3d, transparent: true, opacity: 0.9 }),
      sage: new THREE.MeshBasicMaterial({ color: 0xb9c9aa, transparent: true, opacity: 0.48 }),
      amber: new THREE.MeshBasicMaterial({ color: 0xd5ae63, transparent: true, opacity: 0.75 }),
      line: new THREE.LineBasicMaterial({ color: 0xc7ff3d, transparent: true, opacity: 0.22 }),
      paleLine: new THREE.LineBasicMaterial({ color: 0xf2f0e8, transparent: true, opacity: 0.14 }),
    };

    const core = new THREE.Mesh(new THREE.IcosahedronGeometry(1.1, 4), materials.pearl);
    root.add(core);

    const inner = new THREE.Mesh(new THREE.IcosahedronGeometry(0.62, 2), materials.darkMetal);
    root.add(inner);

    const circuits = new THREE.Group();
    for (let i = 0; i < 18; i += 1) {
      const angle = (i / 18) * Math.PI * 2;
      const line = new THREE.Line(
        new THREE.BufferGeometry().setFromPoints([
          new THREE.Vector3(Math.cos(angle) * 0.35, Math.sin(angle * 2) * 0.18, Math.sin(angle) * 0.35),
          new THREE.Vector3(Math.cos(angle) * 0.92, Math.sin(angle * 2) * 0.36, Math.sin(angle) * 0.92),
        ]),
        i % 4 === 0 ? materials.line : materials.paleLine
      );
      circuits.add(line);
    }
    root.add(circuits);

    const helix = new THREE.Group();
    const strandA = [];
    const strandB = [];
    const beadGeometry = new THREE.SphereGeometry(0.045, 14, 14);
    for (let i = 0; i < 70; i += 1) {
      const t = i / 69;
      const y = (t - 0.5) * 4.6;
      const angle = t * Math.PI * 6.4;
      const radius = 0.98;
      const a = new THREE.Vector3(Math.cos(angle) * radius, y, Math.sin(angle) * radius);
      const b = new THREE.Vector3(Math.cos(angle + Math.PI) * radius, y, Math.sin(angle + Math.PI) * radius);
      strandA.push(a);
      strandB.push(b);
      if (i % 2 === 0) {
        const beadA = new THREE.Mesh(beadGeometry, i % 10 === 0 ? materials.lime : materials.sage);
        const beadB = new THREE.Mesh(beadGeometry, materials.sage);
        beadA.position.copy(a);
        beadB.position.copy(b);
        helix.add(beadA, beadB);
      }
      if (i % 8 === 0) {
        helix.add(new THREE.Line(new THREE.BufferGeometry().setFromPoints([a, b]), materials.paleLine));
      }
    }
    helix.add(new THREE.Line(new THREE.BufferGeometry().setFromPoints(strandA), materials.paleLine));
    helix.add(new THREE.Line(new THREE.BufferGeometry().setFromPoints(strandB), materials.paleLine));
    root.add(helix);

    const layers = new THREE.Group();
    const layerNames = ['hardware', 'software', 'performance', 'network', 'behavior'];
    layerNames.forEach((name, index) => {
      const angle = (index / layerNames.length) * Math.PI * 2;
      const material = index === 2
        ? new THREE.MeshStandardMaterial({ color: 0xc7ff3d, emissive: 0xc7ff3d, emissiveIntensity: 0.1, metalness: 0.18, roughness: 0.28 })
        : materials.metal.clone();
      const mesh = new THREE.Mesh(new THREE.BoxGeometry(0.55, 0.11, 0.55), material);
      mesh.position.set(Math.cos(angle) * 0.7, (index - 2) * 0.18, Math.sin(angle) * 0.7);
      mesh.userData = {
        angle,
        homeY: (index - 2) * 0.18,
        baseColor: index === 2 ? new THREE.Color(0xc7ff3d) : new THREE.Color(0x8b8d86),
        accentColor: new THREE.Color(0xc7ff3d),
      };
      layers.add(mesh);
    });
    root.add(layers);

    const graph = new THREE.Group();
    const graphPoints = [
      new THREE.Vector3(-2.1, 1.25, 0.15),
      new THREE.Vector3(-0.75, 0.45, -0.1),
      new THREE.Vector3(0.65, -0.3, 0.1),
      new THREE.Vector3(2.05, -1.1, -0.1),
    ];
    graphPoints.forEach((point, index) => {
      const node = new THREE.Mesh(new THREE.OctahedronGeometry(0.18, 1), index === 2 ? materials.lime : materials.metal);
      node.position.copy(point);
      graph.add(node);
      if (index > 0) {
        graph.add(new THREE.Line(new THREE.BufferGeometry().setFromPoints([graphPoints[index - 1], point]), materials.line));
      }
    });
    root.add(graph);

    const storage = new THREE.Group();
    const storageShell = new THREE.Mesh(
      new THREE.SphereGeometry(1.45, 48, 28),
      new THREE.MeshPhysicalMaterial({
        color: 0xf2f0e8,
        roughness: 0.1,
        metalness: 0.02,
        transmission: 0.68,
        thickness: 1.6,
        transparent: true,
        opacity: 0.32,
      }),
    );
    storage.add(storageShell);
    for (let i = 0; i < 34; i += 1) {
      const block = new THREE.Mesh(new THREE.BoxGeometry(0.18, 0.18, 0.18), i % 7 === 0 ? materials.lime : materials.darkMetal);
      const r = 0.2 + Math.random() * 1.05;
      const a = Math.random() * Math.PI * 2;
      block.position.set(Math.cos(a) * r, (Math.random() - 0.5) * 1.8, Math.sin(a) * r);
      block.rotation.set(Math.random(), Math.random(), Math.random());
      block.userData = { drift: Math.random() * 0.5 + 0.5 };
      storage.add(block);
    }
    root.add(storage);

    const repair = new THREE.Group();
    for (let i = 0; i < 5; i += 1) {
      const point = new THREE.Mesh(new THREE.SphereGeometry(0.12, 18, 18), i < 2 ? materials.sage : materials.lime);
      point.position.set((i - 2) * 0.78, -1.7, 0);
      repair.add(point);
      if (i > 0) {
        repair.add(new THREE.Line(new THREE.BufferGeometry().setFromPoints([
          new THREE.Vector3((i - 3) * 0.78, -1.7, 0),
          new THREE.Vector3((i - 2) * 0.78, -1.7, 0),
        ]), materials.line));
      }
    }
    root.add(repair);

    const prediction = new THREE.Group();
    const curvePoints = [];
    for (let i = 0; i < 28; i += 1) {
      const x = -3.3 + i * 0.25;
      const y = -0.8 + Math.pow(i / 27, 1.7) * 1.8 + Math.sin(i * 0.55) * 0.06;
      curvePoints.push(new THREE.Vector3(x, y, 0));
      const dot = new THREE.Mesh(new THREE.SphereGeometry(0.035, 10, 10), i > 22 ? materials.amber : materials.sage);
      dot.position.set(x, y, 0);
      prediction.add(dot);
    }
    prediction.add(new THREE.Line(new THREE.BufferGeometry().setFromPoints(curvePoints), materials.line));
    root.add(prediction);

    const particles = new THREE.Group();
    const particleGeo = new THREE.SphereGeometry(0.018, 8, 8);
    for (let i = 0; i < 130; i += 1) {
      const particle = new THREE.Mesh(particleGeo, i % 9 === 0 ? materials.lime : materials.sage);
      const radius = 1.7 + Math.random() * 2.8;
      const angle = Math.random() * Math.PI * 2;
      particle.position.set(Math.cos(angle) * radius, (Math.random() - 0.5) * 4.8, Math.sin(angle) * radius * 0.62);
      particle.userData = { radius, angle, speed: 0.00045 + Math.random() * 0.0011 };
      particles.add(particle);
    }
    root.add(particles);

    const components = { layers, graph, storage, repair, prediction };
    Object.values(components).forEach((group) => {
      group.visible = false;
      group.scale.setScalar(0.001);
    });

    const groups = { layers, graph, storage, repair, prediction };

    const updateScene = () => {
      const compact = window.innerWidth < 820;
      const sceneIndex = Math.max(0, sceneNames.indexOf(activeScene));
      const sceneT = sceneIndex / (sceneNames.length - 1);
      const spin = reducedMotion ? 0.00008 : 0.00032;

      root.rotation.y += spin;
      root.rotation.x += (pointerRef.current.y * 0.13 - root.rotation.x) * 0.03;
      root.rotation.z += (pointerRef.current.x * -0.08 - root.rotation.z) * 0.03;
      root.position.x += ((compact ? 0 : pointerRef.current.x * 0.28) - root.position.x) * 0.025;
      root.position.y += ((0.45 - sceneT * 0.75) - root.position.y) * 0.02;
      root.scale.lerp(new THREE.Vector3(compact ? 0.72 : 1, compact ? 0.72 : 1, compact ? 0.72 : 1), 0.03);

      camera.position.z += ((compact ? 11.5 : 8.9) - sceneT * 0.9 - camera.position.z) * 0.025;
      camera.position.x += ((activeScene === 'why' ? 0.85 : 0) + pointerRef.current.x * 0.12 - camera.position.x) * 0.02;
      camera.lookAt(0, -0.05, 0);

      limeLight.position.x += (pointerRef.current.x * 3 - limeLight.position.x) * 0.04;
      limeLight.position.y += (-1.2 + pointerRef.current.y * -1.4 - limeLight.position.y) * 0.04;

      const pulse = Math.sin(performance.now() * 0.0018) * 0.025;
      core.scale.setScalar(1 + pulse + (activeScene === 'restore' ? 0.08 : 0));
      inner.rotation.y -= 0.0006;
      circuits.rotation.y += 0.0005;
      helix.rotation.y += 0.00025;

      particles.children.forEach((particle, index) => {
        const phase = particle.userData.angle + performance.now() * particle.userData.speed;
        const radius = activeScene === 'restore' ? particle.userData.radius * 0.72 : particle.userData.radius;
        particle.position.x += (Math.cos(phase) * radius - particle.position.x) * 0.018;
        particle.position.z += (Math.sin(phase) * radius * 0.62 - particle.position.z) * 0.018;
        particle.material.opacity = 0.16 + Math.sin(performance.now() * 0.0018 + index) * 0.08;
      });

      const buildOn = activeScene === 'build' || activeScene === 'pillars';
      const visibleScale = activeScene === 'pillars' ? 1.8 : 1.35;
      if (buildOn) {
        layers.visible = true;
        layers.scale.lerp(new THREE.Vector3(visibleScale, visibleScale, visibleScale), 0.08);
      } else {
        layers.scale.lerp(new THREE.Vector3(0.001, 0.001, 0.001), 0.08);
        if (layers.scale.x < 0.002) layers.visible = false;
      }

      layers.children.forEach((mesh, index) => {
        const spread = activeScene === 'build' ? 1.35 : activeScene === 'pillars' ? 2.4 : 0.45;
        const angle = mesh.userData.angle + performance.now() * 0.00022;
        const highlighted = activeScene === 'pillars' && activePillar === index;
        const subtlePillarsGlow = activeScene === 'pillars' && activePillar < 0 ? 0.18 : 0;
        mesh.position.x += (Math.cos(angle) * spread - mesh.position.x) * 0.04;
        mesh.position.z += (Math.sin(angle) * spread - mesh.position.z) * 0.04;
        mesh.position.y += (mesh.userData.homeY * (activeScene === 'build' ? 2.2 : 1) - mesh.position.y) * 0.04;
        mesh.rotation.y += 0.0008 + index * 0.00002;
        mesh.scale.lerp(new THREE.Vector3(highlighted ? 1.14 : 1, highlighted ? 1.14 : 1, highlighted ? 1.14 : 1), 0.08);
        mesh.material.color.lerp(highlighted ? mesh.userData.accentColor : mesh.userData.baseColor, 0.12);
        if (mesh.material.emissive) {
          mesh.material.emissive.copy(mesh.userData.accentColor);
          mesh.material.emissiveIntensity += ((highlighted ? 0.32 : subtlePillarsGlow) - mesh.material.emissiveIntensity) * 0.08;
        }
      });

      const activeGraph = activeScene === 'notice' || activeScene === 'why';
      graph.visible = activeGraph;
      graph.scale.lerp(new THREE.Vector3(activeScene === 'why' ? 1.55 : 1, activeScene === 'why' ? 1.55 : 1, activeScene === 'why' ? 1.55 : 1), 0.08);
      graph.rotation.y = activeScene === 'why' ? Math.sin(performance.now() * 0.0005) * 0.35 : 0;

      const activeStorage = activeScene === 'storage';
      storage.visible = activeStorage;
      storage.scale.lerp(new THREE.Vector3(activeStorage ? 1.25 : 0.001, activeStorage ? 1.25 : 0.001, activeStorage ? 1.25 : 0.001), 0.08);
      storage.rotation.y -= 0.00028;
      storage.children.forEach((child, index) => {
        if (index > 0) {
          const separation = activeScene === 'storage' ? 0.55 : 0;
          child.position.y += ((child.position.y > 0 ? separation : -separation) * child.userData.drift - child.position.y * 0.02) * 0.012;
        }
      });

      const activeRepair = activeScene === 'heal' || activeScene === 'restore';
      repair.visible = activeRepair;
      repair.scale.lerp(new THREE.Vector3(activeScene === 'restore' ? 1.45 : 1.1, activeScene === 'restore' ? 1.45 : 1.1, activeScene === 'restore' ? 1.45 : 1.1), 0.08);
      repair.children.forEach((child, index) => {
        if (child.material && child.material.opacity !== undefined) {
          child.material.opacity = activeScene === 'restore' ? 0.82 : 0.44 + index * 0.04;
        }
      });

      const activePrediction = activeScene === 'predict';
      prediction.visible = activePrediction;
      prediction.scale.lerp(new THREE.Vector3(activePrediction ? 1.35 : 0.001, activePrediction ? 1.35 : 0.001, activePrediction ? 1.35 : 0.001), 0.08);
      prediction.rotation.y = Math.sin(performance.now() * 0.0005) * 0.16;

      if (activeScene === 'final') {
        Object.values(groups).forEach((group) => {
          group.visible = false;
          group.scale.lerp(new THREE.Vector3(compact ? 0.82 : 1.1, compact ? 0.82 : 1.1, compact ? 0.82 : 1.1), 0.02);
        });
        root.scale.lerp(new THREE.Vector3(compact ? 0.82 : 1.1, compact ? 0.82 : 1.1, compact ? 0.82 : 1.1), 0.02);
      }

      renderer.render(scene, camera);
      requestAnimationFrame(updateScene);
    };

    const resize = () => {
      camera.aspect = window.innerWidth / window.innerHeight;
      camera.updateProjectionMatrix();
      renderer.setSize(window.innerWidth, window.innerHeight);
    };

    window.addEventListener('resize', resize);
    let requestId = requestAnimationFrame(updateScene);

    return () => {
      window.removeEventListener('resize', resize);
      cancelAnimationFrame(requestId);
      renderer.dispose();
      scene.traverse((obj) => {
        if (obj.geometry) obj.geometry.dispose();
        if (obj.material) {
          if (Array.isArray(obj.material)) obj.material.forEach((mat) => mat.dispose());
          else obj.material.dispose();
        }
      });
    };
  }, [activeScene, activePillar, pointerRef, reducedMotion]);

  return <canvas ref={canvasRef} className="scene-canvas" aria-hidden="true" />;
}
