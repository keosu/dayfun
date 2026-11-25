import * as THREE from "three";
import { RoomEnvironment } from "three/addons/environments/RoomEnvironment.js";
import { renderScene, animateScene } from "./picker-scenes.js";
import { isDarkTheme, themeEvent } from "./theme.js";
import { addMesh, clamp, disposeGroup } from "./picker/kit.js";
import { buildWheel } from "./picker/wheel.js";
import { buildCapsule } from "./picker/capsule.js";
import { buildPixel } from "./picker/pixel.js";

const builders = {
  wheel: buildWheel,
  capsule: buildCapsule,
  pixel: buildPixel,
};
const names = { wheel: "幸运转盘", capsule: "惊喜扭蛋机", pixel: "像素顶骰子" };
const HOME = { target: [0, 1.66, 0], distance: 7.17, elevation: 0.215 };

function fallbackScene(container, mode, options) {
  container.innerHTML = renderScene(mode, options);
  container.dataset.renderer = "fallback";
  return {
    animate: async (winner) => {
      container.dataset.phase = "animating";
      container.dataset.visualResult = "hidden";
      await animateScene(container, mode, winner, options.length);
      container.dataset.selectedIndex = String(winner);
      container.dataset.phase = "result";
      container.dataset.visualResult = "visible";
    },
    dispose() {},
  };
}

export function createPickerScene(container, mode, options, { sfx } = {}) {
  let renderer;
  try {
    renderer = new THREE.WebGLRenderer({
      antialias: true,
      alpha: false,
      powerPreference: "low-power",
    });
  } catch {
    return fallbackScene(container, mode, options);
  }
  container.replaceChildren(renderer.domElement);
  container.dataset.renderer = "webgl";
  renderer.domElement.setAttribute("aria-label", `${names[mode]} 3D 动画场景`);
  renderer.setPixelRatio(Math.min(devicePixelRatio, 1.5));
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFShadowMap;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 0.88;
  const scene = new THREE.Scene();
  const sceneBackground = () =>
    isDarkTheme()
      ? { capsule: "#2a222b", pixel: "#1f2c27", wheel: "#242130" }[mode]
      : { capsule: "#f3e8e9", pixel: "#e9eee3", wheel: "#eee9f3" }[mode];
  const background = sceneBackground();
  scene.background = new THREE.Color(background);
  scene.fog = new THREE.Fog(background, 9, 18);
  const camera = new THREE.PerspectiveCamera(37, 1, 0.1, 40);
  camera.zoom = 1.22;

  // Camera rig: orbit yaw is user controlled; target, distance and elevation ease toward the
  // model's requested focus, so the shot follows the action like a hand-held camera.
  const rig = {
    target: new THREE.Vector3(...HOME.target),
    distance: HOME.distance,
    elevation: HOME.elevation,
  };
  const goalTarget = new THREE.Vector3();
  let viewAngle = 0.19;
  const placeCamera = () => {
    const flat = Math.cos(rig.elevation) * rig.distance;
    camera.position.set(
      rig.target.x + Math.sin(viewAngle) * flat,
      rig.target.y + Math.sin(rig.elevation) * rig.distance,
      rig.target.z + Math.cos(viewAngle) * flat,
    );
    camera.lookAt(rig.target);
  };
  const followRig = (focus, dt, instant = false) => {
    const goal = focus || HOME;
    goalTarget.fromArray(goal.target);
    const k = instant ? 1 : 1 - Math.exp(-dt * 3.4);
    rig.target.lerp(goalTarget, k);
    rig.distance += (goal.distance - rig.distance) * k;
    rig.elevation += (goal.elevation - rig.elevation) * k;
    placeCamera();
  };
  placeCamera();

  const pmrem = new THREE.PMREMGenerator(renderer);
  const room = new RoomEnvironment();
  const environment = pmrem.fromScene(room, 0.04);
  scene.environment = environment.texture;
  scene.environmentIntensity = 0.65;
  room.dispose();
  pmrem.dispose();
  scene.add(new THREE.HemisphereLight("#fffcf7", "#b6a0b8", 0.7));
  const key = new THREE.DirectionalLight("#fff7e9", 1.8);
  key.position.set(-3, 6, 5);
  key.castShadow = true;
  key.shadow.mapSize.set(1024, 1024);
  Object.assign(key.shadow.camera, { left: -4, right: 4, top: 5, bottom: -3 });
  key.shadow.normalBias = 0.025;
  key.shadow.bias = -0.0002;
  key.shadow.radius = 3;
  scene.add(key);
  const rim = new THREE.DirectionalLight("#d9caff", 1.15);
  rim.position.set(4, 4, -3);
  scene.add(rim);
  const floor = addMesh(
    scene,
    new THREE.PlaneGeometry(200, 200),
    new THREE.MeshStandardMaterial({ color: background, roughness: 1 }),
  );
  floor.rotation.x = -Math.PI / 2;
  floor.castShadow = false;
  floor.position.y = -0.025;
  const root = new THREE.Group();
  scene.add(root);
  const model = builders[mode](root, options, { sfx, camera });
  // Compile shaders for objects that only appear mid-animation, so they don't cause a hitch.
  const hidden = [];
  root.traverse((object) => {
    if (!object.visible) {
      hidden.push(object);
      object.visible = true;
    }
  });
  renderer.compile(scene, camera);
  hidden.forEach((object) => (object.visible = false));

  let size = { width: 0, height: 0 };
  const render = () => {
    if (size.width && size.height) renderer.render(scene, camera);
  };
  const updateSceneTheme = () => {
    const color = sceneBackground();
    scene.background.set(color);
    scene.fog.color.set(color);
    floor.material.color.set(color);
    scene.environmentIntensity = isDarkTheme() ? 0.58 : 0.65;
    renderer.toneMappingExposure = isDarkTheme() ? 0.92 : 0.88;
    container.dataset.theme = isDarkTheme() ? "dark" : "light";
    render();
  };
  window.addEventListener(themeEvent, updateSceneTheme);
  updateSceneTheme();
  const resize = () => {
    const width = container.clientWidth;
    const height = container.clientHeight;
    if (!width || !height) return;
    size = { width, height };
    renderer.setSize(width, height, false);
    camera.aspect = width / height;
    camera.updateProjectionMatrix();
    render();
  };
  const observer = new ResizeObserver(resize);
  observer.observe(container);
  resize();

  let frame = 0;
  let disposed = false;
  let paused = false;
  let step = null;
  let elapsed = 0;
  let frames = 0;
  let last = 0;
  let revealed = false;
  let settle = null;
  let dragX;
  const down = (event) => {
    if (step && !revealed) return;
    dragX = event.clientX;
    renderer.domElement.setPointerCapture(event.pointerId);
  };
  const move = (event) => {
    if (dragX == null) return;
    viewAngle = clamp(viewAngle + (event.clientX - dragX) * 0.003, -0.45, 0.7);
    dragX = event.clientX;
    placeCamera();
    if (!step) render();
  };
  const up = () => {
    dragX = undefined;
  };
  renderer.domElement.addEventListener("pointerdown", down);
  renderer.domElement.addEventListener("pointermove", move);
  renderer.domElement.addEventListener("pointerup", up);
  renderer.domElement.addEventListener("pointercancel", up);

  function frameLoop(now) {
    if (disposed || paused || !step) return;
    // Large enough that slow devices stay in real time; physics runs in fixed substeps anyway.
    const dt = Math.min(1 / 12, Math.max(0, (now - last) / 1000));
    last = now;
    elapsed += dt;
    frames++;
    container.dataset.fps = String(
      Math.round(frames / Math.max(elapsed, 0.001)),
    );
    container.dataset.elapsed = elapsed.toFixed(2);
    const debug = step(elapsed, dt);
    followRig(debug.focus, dt);
    container.dataset.motion = debug.motion || "animating";
    if (debug.rollAngle != null)
      container.dataset.rollAngle = String(debug.rollAngle);
    if (debug.diceAngle != null)
      container.dataset.diceAngle = String(debug.diceAngle);
    if (debug.angle != null) container.dataset.angle = String(debug.angle);
    if (debug.revealed && !revealed) {
      revealed = true;
      container.dataset.visualResult = "visible";
      container.dataset.phase = "result";
      container.dataset.selectedIndex = String(debug.selectedIndex);
      settle?.();
      settle = null;
    }
    render();
    if (debug.done) {
      step = null;
      return;
    }
    frame = requestAnimationFrame(frameLoop);
  }

  return {
    animate(winner) {
      cancelAnimationFrame(frame);
      settle?.();
      const reduced = matchMedia("(prefers-reduced-motion: reduce)").matches;
      step = model.begin(winner, { reduced });
      elapsed = 0;
      frames = 0;
      revealed = false;
      container.dataset.phase = "animating";
      container.dataset.visualResult = "hidden";
      return new Promise((resolve) => {
        settle = resolve;
        if (reduced) {
          const debug = step(0, 0);
          followRig(debug.focus, 0, true);
          if (debug.angle != null)
            container.dataset.angle = String(debug.angle);
          step = null;
          render();
          setTimeout(() => {
            revealed = true;
            container.dataset.visualResult = "visible";
            container.dataset.phase = "result";
            container.dataset.selectedIndex = String(debug.selectedIndex);
            settle?.();
            settle = null;
          }, 120);
          return;
        }
        last = performance.now();
        frame = requestAnimationFrame(frameLoop);
      });
    },
    pause() {
      paused = true;
      cancelAnimationFrame(frame);
    },
    resume() {
      if (!paused) return;
      paused = false;
      resize();
      if (step) {
        last = performance.now();
        frame = requestAnimationFrame(frameLoop);
      }
    },
    dispose() {
      disposed = true;
      cancelAnimationFrame(frame);
      settle?.();
      observer.disconnect();
      window.removeEventListener(themeEvent, updateSceneTheme);
      disposeGroup(scene);
      model.dispose?.();
      environment.dispose();
      renderer.dispose();
      renderer.forceContextLoss();
    },
  };
}
