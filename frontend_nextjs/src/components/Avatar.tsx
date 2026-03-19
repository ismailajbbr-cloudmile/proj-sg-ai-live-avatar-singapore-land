"use client";

import { Canvas, useFrame } from "@react-three/fiber";
import { OrbitControls, useGLTF } from "@react-three/drei";
import { Suspense, useRef, useEffect } from "react";
import { Group, DoubleSide, MeshBasicMaterial } from "three";
import type { VisemeFrame, AvatarGesture } from "@/types/viseme";

useGLTF.preload("/avatar/avatar_1.glb");

// ─── Camera / Display Constants ────────────────────────────────────────────
// Full-body framing: RPM avatar is ~1.8m tall. With AVATAR_Y_POSITION=-0.9
// the feet land at world Y=-0.9 and the top of the head at ~Y=0.9.
// Camera sits at chest height (Y=0.5), 3 units back, targeting the torso
// centre (Y=0.2) so the full figure — head, arms, hands — fits in frame.
const CAMERA_X = 0, CAMERA_Y = 0.5, CAMERA_Z = 3.0;
const CAMERA_TARGET_X = 0, CAMERA_TARGET_Y = 0.2, CAMERA_TARGET_Z = 0;
const AVATAR_Y_POSITION = -0.9;
const CAMERA_FOV = 50;
const ENABLE_ZOOM = true, ENABLE_PAN = false, ENABLE_ROTATE = true;
const MIN_DISTANCE = 1.5, MAX_DISTANCE = 8;
const AMBIENT_LIGHT_INTENSITY = 2, DIRECTIONAL_LIGHT_INTENSITY = 2, POINT_LIGHT_INTENSITY = 2;

// ─── Viseme → possible morph target names ───────────────────────────────────
const VISEME_TO_MORPH: Record<string, string[]> = {
  AA: ["viseme_aa", "mouthOpen", "jawOpen"],
  AE: ["viseme_ae", "mouthOpen"],
  AH: ["viseme_ah", "mouthOpen"],
  AO: ["viseme_ao", "mouthOpen"],
  EH: ["viseme_eh", "mouthOpen"],
  ER: ["viseme_er", "mouthOpen"],
  IY: ["viseme_iy", "mouthSmile"],
  UW: ["viseme_uw", "mouthRound"],
  OH: ["viseme_oh", "mouthOpen"],
  FV: ["viseme_fv", "mouthDentalLip"],
  L: ["viseme_l", "mouthOpen"],
  MBP: ["viseme_mbp", "mouthClose"],
  TH: ["viseme_th", "mouthOpen"],
  CH: ["viseme_ch", "mouthOpen"],
  R: ["viseme_r", "mouthOpen"],
  S: ["viseme_s", "mouthOpen"],
  T: ["viseme_t", "mouthOpen"],
  K: ["viseme_k", "mouthOpen"],
};

// ─── Helpers ──────────────────────────────────────────────────────────────────
function lerp(a: number, b: number, t: number) { return a + (b - a) * t; }
function clamp01(x: number) { return Math.max(0, Math.min(1, x)); }

/** Smoothstep easing: accelerates in, decelerates out — more organic than linear */
function smoothstep(t: number) { return t * t * (3 - 2 * t); }

function sampleViseme(
  visemes: VisemeFrame[],
  playheadMs: number
): { label: string | null; mouth: number } {
  if (!visemes || visemes.length === 0) return { label: null, mouth: 0 };
  if (playheadMs <= visemes[0].t) return { label: visemes[0].label, mouth: visemes[0].mouth ?? 0 };
  const last = visemes[visemes.length - 1];
  if (playheadMs >= last.t) return { label: last.label, mouth: 0 };
  for (let i = 0; i < visemes.length - 1; i++) {
    const a = visemes[i], b = visemes[i + 1];
    if (playheadMs >= a.t && playheadMs < b.t) {
      const span = b.t - a.t || 1;
      // Smoothstep instead of linear — creates organic ease-in/out between phonemes
      const tt = smoothstep(clamp01((playheadMs - a.t) / span));
      return {
        label: tt < 0.5 ? a.label : b.label,
        // Cap at 0.75 — avoids robotic extreme-open jaw positions
        mouth: lerp(a.mouth ?? 0, b.mouth ?? 0, tt) * 0.75,
      };
    }
  }
  return { label: null, mouth: 0 };
}

// ─── Avatar Model ─────────────────────────────────────────────────────────────
// Neutral arm pose — arms rest in presenter position
const NEUTRAL_ARMS = {
  lfa: [-1.5,  0,   2.5] as [number, number, number],
  lh:  [-0.5, -0.8, -0.1] as [number, number, number],
  rfa: [-1.5,  0,  -2.5] as [number, number, number],
  rh:  [-0.5,  0.8,  0.1] as [number, number, number],
};

type ArmPose = typeof NEUTRAL_ARMS;

const GESTURE_MOTION: Record<AvatarGesture, {
  head: { x: number; y: number; z: number; duration: number };
  arms: ArmPose;
}> = {
  idle: {
    head: { x: 0, y: 0, z: 0, duration: 0 },
    arms: NEUTRAL_ARMS,
  },
  nod: {
    // Head dips, left hand opens forward slightly (welcoming confirm)
    head: { x: 0.25, y: 0, z: 0, duration: 0.4 },
    arms: {
      lfa: [-1.3,  0,   2.2],
      lh:  [-0.3, -0.6, -0.1],
      rfa: [-1.5,  0,  -2.5],
      rh:  [-0.5,  0.8,  0.1],
    },
  },
  shake: {
    // Head turns, both arms open out in open-palm "no" spread
    head: { x: 0, y: 0.3, z: 0, duration: 0.4 },
    arms: {
      lfa: [-1.5,  0,   2.0],
      lh:  [-0.5, -1.1, -0.1],
      rfa: [-1.5,  0,  -2.0],
      rh:  [-0.5,  1.1,  0.1],
    },
  },
  tilt: {
    // Head tilts, right arm raises in light shrug
    head: { x: 0, y: 0, z: 0.22, duration: 0.6 },
    arms: {
      lfa: [-1.5,  0,   2.5],
      lh:  [-0.5, -0.8, -0.1],
      rfa: [-1.2,  0.1, -2.1],
      rh:  [-0.3,  0.6,  0.2],
    },
  },
  lookup: {
    // Head back slightly, left arm rises presenting/pointing upward
    head: { x: -0.2, y: 0, z: 0, duration: 0.5 },
    arms: {
      lfa: [-1.1, -0.1,  2.0],
      lh:  [-0.4, -0.5, -0.2],
      rfa: [-1.5,  0,   -2.5],
      rh:  [-0.5,  0.8,  0.1],
    },
  },
  excited: {
    // Head tilted, both arms lift and open enthusiastically
    head: { x: 0.15, y: 0.1, z: 0.08, duration: 0.3 },
    arms: {
      lfa: [-1.0,  0,   1.8],
      lh:  [-0.3, -0.5, -0.1],
      rfa: [-1.0,  0,  -1.8],
      rh:  [-0.3,  0.5,  0.1],
    },
  },
};

interface AvatarModelProps {
  isTalking: boolean;
  visemes?: VisemeFrame[];
  playheadMs?: number;
  gesture?: AvatarGesture;
}

function AvatarModel({ isTalking, visemes = [], playheadMs = 0, gesture = "idle" }: AvatarModelProps) {
  const NECK_ROTATION_X = 0.3, NECK_ROTATION_Y = 0, NECK_ROTATION_Z = 0;
  const IDLE_MOUTH_OPEN = 0;
  const IDLE_MOUTH_SMILE = 0.2;
  const BLINK_INTERVAL = 10, BLINK_DURATION = 0.2;

  const { scene, nodes } = useGLTF("/avatar/avatar_1.glb");
  const groupRef = useRef<Group>(null);
  const headRef = useRef<any>(null);
  const neckRef = useRef<any>(null);
  const leftHandRef = useRef<any>(null);
  const rightHandRef = useRef<any>(null);
  const leftForeArmRef = useRef<any>(null);
  const rightForeArmRef = useRef<any>(null);
  const headMeshRef = useRef<any>(null);
  const teethMeshRef = useRef<any>(null);
  const leftEyeMeshRef = useRef<any>(null);
  const rightEyeMeshRef = useRef<any>(null);

  const allMeshesRef = useRef<any[]>([]);
  const diagRef = useRef({ lastLog: 0, lastState: "" });
  const visemeIndexMap = useRef<Record<string, number>>({});
  // Per-frame damped influence values — we lerp toward targets each frame
  // so the mouth eases in/out instead of snapping between shapes.
  const dampedMorphRef = useRef<Record<number, number>>({});
  // Damped head rotation target — used to smoothly blend between idle and talking motion
  const headRotDampRef = useRef({ x: 0, y: 0, z: 0 });
  // Gesture: track start time and which gesture is active for oscillation
  const gestureRef = useRef<{ gesture: AvatarGesture; startTime: number }>({ gesture: "idle", startTime: 0 });
  // Damped arm rotations — lerp toward gesture target each frame
  const dampedArmRef = useRef({
    lfa: { x: NEUTRAL_ARMS.lfa[0], y: NEUTRAL_ARMS.lfa[1], z: NEUTRAL_ARMS.lfa[2] },
    lh:  { x: NEUTRAL_ARMS.lh[0],  y: NEUTRAL_ARMS.lh[1],  z: NEUTRAL_ARMS.lh[2]  },
    rfa: { x: NEUTRAL_ARMS.rfa[0], y: NEUTRAL_ARMS.rfa[1], z: NEUTRAL_ARMS.rfa[2] },
    rh:  { x: NEUTRAL_ARMS.rh[0],  y: NEUTRAL_ARMS.rh[1],  z: NEUTRAL_ARMS.rh[2]  },
  });

  useEffect(() => {
    if (!scene || !nodes) return;

    allMeshesRef.current = [];
    scene.traverse((child: any) => {
      if (child.isMesh) {
        child.visible = true;
        child.frustumCulled = false;
        allMeshesRef.current.push(child);

        // DIAGNOSTIC: replace skin/hair/body materials with solid colors
        // to confirm whether geometry is rendering at all.
        const SKIN_MESHES: Record<string, number> = {
          Wolf3D_Head: 0xff6644,
          Wolf3D_Body: 0xff6644,
          Wolf3D_Hair: 0x4444ff,
        };
        if (child.name in SKIN_MESHES) {
          child.material = new MeshBasicMaterial({ color: SKIN_MESHES[child.name as keyof typeof SKIN_MESHES], side: DoubleSide });
        } else {
          const mats = Array.isArray(child.material) ? child.material : [child.material];
          mats.forEach((mat: any) => {
            if (!mat) return;
            mat.transparent = false;
            mat.opacity = 1;
            mat.alphaTest = 0;
            mat.depthWrite = true;
            mat.side = DoubleSide;
            mat.needsUpdate = true;
          });
        }


        if (child.morphTargetInfluences) {
          if (child.name === "Wolf3D_Head" && !headMeshRef.current) headMeshRef.current = child;
          if (child.name === "Wolf3D_Teeth" && !teethMeshRef.current) teethMeshRef.current = child;
          if (child.name === "EyeLeft" && !leftEyeMeshRef.current) leftEyeMeshRef.current = child;
          if (child.name === "EyeRight" && !rightEyeMeshRef.current) rightEyeMeshRef.current = child;
        }
      }
      if (child.isBone || child.type === "Bone") {
        const n = child.name || "";
        if (n.toLowerCase() === "head" && !headRef.current) headRef.current = child;
        if (n === "Neck" && !neckRef.current) neckRef.current = child;
        if (n === "LeftHand" && !leftHandRef.current) leftHandRef.current = child;
        if (n === "RightHand" && !rightHandRef.current) rightHandRef.current = child;
        if (n === "LeftForeArm" && !leftForeArmRef.current) leftForeArmRef.current = child;
        if (n === "RightForeArm" && !rightForeArmRef.current) rightForeArmRef.current = child;
      }
    });

    if (!leftEyeMeshRef.current && (nodes as any).EyeLeft) leftEyeMeshRef.current = (nodes as any).EyeLeft;
    if (!rightEyeMeshRef.current && (nodes as any).EyeRight) rightEyeMeshRef.current = (nodes as any).EyeRight;

    if (headMeshRef.current?.morphTargetDictionary) {
      const dict = headMeshRef.current.morphTargetDictionary as Record<string, number>;
      const map: Record<string, number> = {};
      for (const [visLabel, candidates] of Object.entries(VISEME_TO_MORPH)) {
        for (const candidate of candidates) {
          if (dict[candidate] !== undefined) { map[visLabel] = dict[candidate]; break; }
          const found = Object.keys(dict).find((k) => k.toLowerCase() === candidate.toLowerCase());
          if (found !== undefined) { map[visLabel] = dict[found]; break; }
        }
      }
      if (map["AA"] === undefined) {
        for (const k of Object.keys(dict)) {
          if (k.toLowerCase().includes("mouthopen") || k.toLowerCase().includes("jawopen")) {
            map["AA"] = dict[k]; break;
          }
        }
      }
      visemeIndexMap.current = map;

      // ── DEBUG: dump all morph targets found in GLB ──────────────────────
      console.group("[Avatar] Morph target discovery");
      console.log("All morph targets in Wolf3D_Head:", Object.keys(dict));
      console.log("Viseme → morph index map:", map);
      const missed = Object.keys(VISEME_TO_MORPH).filter((v) => map[v] === undefined);
      if (missed.length) console.warn("Visemes with NO matching morph target:", missed);
      else console.log("All visemes matched ✓");
      console.groupEnd();
    }
  }, [scene, nodes]);

  useFrame((state) => {
    const t = state.clock.elapsedTime;
    const dt = state.delta;

    // ── Defeat frustum culling + material resets every frame ─────────────
    // Three.js async texture loading can replace/update material objects after
    // initial mount, resetting DoubleSide back to FrontSide and causing skin
    // meshes (Wolf3D_Head, Wolf3D_Body) to disappear. Enforce each tick.
    for (const m of allMeshesRef.current) {
      m.frustumCulled = false;
      m.visible = true;
      const mats = Array.isArray(m.material) ? m.material : [m.material];
      for (const mat of mats) {
        if (!mat) continue;
        if (mat.side !== DoubleSide) { mat.side = DoubleSide; mat.needsUpdate = true; }
        if (mat.transparent) { mat.transparent = false; mat.needsUpdate = true; }
      }
    }

    // ── Visibility chain diagnostic (logs every 0.5s when state changes) ──
    if (t - diagRef.current.lastLog > 0.5) {
      diagRef.current.lastLog = t;
      const head = allMeshesRef.current.find((m) => m.name === "Wolf3D_Head");
      if (head) {
        const chain: string[] = [];
        let obj: any = head;
        while (obj) {
          chain.push(`[${obj.name || obj.type}] vis=${obj.visible} cull=${obj.frustumCulled} inScene=${obj.parent != null}`);
          obj = obj.parent;
        }
        const key = chain.join("|");
        if (key !== diagRef.current.lastState) {
          console.log("[Avatar diag] t=", t.toFixed(1), "\n", chain.join("\n "));
          diagRef.current.lastState = key;
        }
      }
    }

    // ── Organic head motion ────────────────────────────────────────────────
    // Technique: sum two or three sine waves at irrational frequency ratios
    // (e.g., 1.0 + 1.618...) so the motion never exactly repeats — it looks
    // organic and slightly different every few seconds, like a real person.
    if (groupRef.current) groupRef.current.position.y = AVATAR_Y_POSITION;
    if (headRef.current) {
      let targetX: number, targetY: number, targetZ: number;

      // Track gesture changes
      if (gesture !== gestureRef.current.gesture) {
        gestureRef.current = { gesture, startTime: t };
      }

      const gm = GESTURE_MOTION[gesture];
      const gh = gm.head;
      const elapsed = t - gestureRef.current.startTime;

      // While talking: loop the gesture pulse (pulse + rest) so it repeats
      // naturally throughout speech rather than firing only in the first instant.
      // While idle/finishing: one-shot fade so it eases out cleanly.
      let gesturePulse = 0;
      if (gh.duration > 0) {
        if (isTalking && gesture !== "idle") {
          // One pulse every 2.5× duration: e.g. nod repeats every ~1 second
          const period = gh.duration * 2.5;
          const phase = elapsed % period;
          gesturePulse = phase < gh.duration
            ? Math.sin((phase / gh.duration) * Math.PI)
            : 0;
        } else {
          // One-shot: fires once then fades — used during idle overlay
          gesturePulse = Math.max(0, Math.sin((elapsed / gh.duration) * Math.PI));
        }
      }

      if (isTalking) {
        targetX = gh.x * gesturePulse + Math.sin(t * 1.10) * 0.012 + Math.sin(t * 2.83) * 0.006;
        targetY = gh.y * gesturePulse + Math.sin(t * 0.71) * 0.018 + Math.sin(t * 1.97) * 0.008;
        targetZ = gh.z * gesturePulse + Math.sin(t * 0.59) * 0.010;
      } else {
        // Idle: gentle floating + gesture overlay
        targetX = gh.x * gesturePulse + Math.sin(t * 0.20) * 0.05;
        targetY = gh.y * gesturePulse + Math.sin(t * 0.30) * 0.10 + Math.sin(t * 0.53) * 0.03;
        targetZ = gh.z * gesturePulse + Math.sin(t * 0.25) * 0.06 + Math.sin(t * 0.47) * 0.02;
      }

      // Delta-time exponential decay lerp — framerate-independent smoothing.
      // HEAD_ROT_SPEED controls convergence: 4 ≈ snappy-but-natural at any fps.
      const HEAD_ROT_SPEED = 4.0;
      const headK = 1 - Math.exp(-HEAD_ROT_SPEED * dt);
      const dr = headRotDampRef.current;
      dr.x += (targetX - dr.x) * headK;
      dr.y += (targetY - dr.y) * headK;
      dr.z += (targetZ - dr.z) * headK;

      headRef.current.rotation.x = dr.x;
      headRef.current.rotation.y = dr.y;
      headRef.current.rotation.z = dr.z;
      headRef.current.scale.set(1, 1, 1);
    }

    // ── Naturalistic lip sync with per-frame damped morph targets ────────────
    //
    // Technique overview (5 layers of naturalness):
    //   1. smoothstep easing in sampleViseme (not linear)
    //   2. Per-frame damping: influences lerp toward targets (ease in/out)
    //   3. Jaw base layer: mouthOpen always follows phoneme at ~40%
    //   4. Persistent talking smile: humans smile slightly when speaking
    //   5. 0.75 peak cap in sampleViseme: avoids uncanny extreme positions
    //
    if (headMeshRef.current?.morphTargetInfluences) {
      const influ = headMeshRef.current.morphTargetInfluences as number[];
      const dict = headMeshRef.current.morphTargetDictionary as Record<string, number>;

      // Damping: 0.15 = very smooth, 0.30 = snappier. Lower feels more human.
      const DAMP = 0.18;
      // Jaw floor: keeps mouth open a little even during consonants (co-articulation)
      const JAW_BASE = 0.12;
      // Smile layer: subtle constant smile during speech
      const TALKING_SMILE = 0.12;

      // Build target influences for this frame
      const targets: Record<number, number> = {};

      if (isTalking && visemes.length > 0) {
        const { label, mouth } = sampleViseme(visemes, playheadMs);
        const weight = clamp01(mouth);

        // Layer 1: phoneme viseme shape
        if (label && visemeIndexMap.current[label] !== undefined) {
          targets[visemeIndexMap.current[label]] = weight;
        }

        // Layer 2: jaw base — always opens proportionally to phoneme strength
        const mouthOpenIdx = dict["mouthOpen"] ?? dict["jawOpen"];
        if (mouthOpenIdx !== undefined) {
          const existing = targets[mouthOpenIdx] ?? 0;
          targets[mouthOpenIdx] = Math.max(existing, JAW_BASE + weight * 0.38);
        }

        // Layer 3: smile during speech; extra for front-vowels (E, I)
        const smileIdx = dict["mouthSmile"];
        if (smileIdx !== undefined) {
          const smileBoost = (label === "IY" || label === "EH") ? 0.35 : TALKING_SMILE;
          targets[smileIdx] = Math.max(targets[smileIdx] ?? 0, smileBoost);
        }
      } else {
        // Idle: resting gentle smile
        const mouthOpenIdx = dict["mouthOpen"];
        const smileIdx = dict["mouthSmile"];
        if (mouthOpenIdx !== undefined) targets[mouthOpenIdx] = IDLE_MOUTH_OPEN;
        if (smileIdx !== undefined) targets[smileIdx] = IDLE_MOUTH_SMILE;
      }

      // Apply damped influences: lerp current toward target each frame
      const damped = dampedMorphRef.current;
      for (let i = 0; i < influ.length; i++) {
        const target = targets[i] ?? 0;
        const prev = damped[i] ?? 0;
        const next = prev + (target - prev) * DAMP;
        damped[i] = next;
        influ[i] = next;
      }

      // Teeth mesh: follow jaw opening at 60% to show teeth naturally
      if (teethMeshRef.current?.morphTargetInfluences) {
        const tDict = teethMeshRef.current.morphTargetDictionary as Record<string, number>;
        const tInflu = teethMeshRef.current.morphTargetInfluences as number[];
        const mIdx = tDict["mouthOpen"];
        if (mIdx !== undefined) {
          const mouthOpenIdx = dict["mouthOpen"] ?? dict["jawOpen"];
          const jawVal = mouthOpenIdx !== undefined ? (dampedMorphRef.current[mouthOpenIdx] ?? 0) : 0;
          tInflu[mIdx] = jawVal * 0.6;
        }
      }
    }

    // ── Blink ──────────────────────────────────────────────────────────────────
    const timeInCycle = t % BLINK_INTERVAL;
    let blinkValue = 0;
    if (timeInCycle < BLINK_DURATION) {
      blinkValue = Math.sin((timeInCycle / BLINK_DURATION) * Math.PI);
    }
    if (headMeshRef.current?.morphTargetInfluences) {
      const dict = headMeshRef.current.morphTargetDictionary as Record<string, number>;
      if (dict["eyesClosed"] !== undefined) {
        headMeshRef.current.morphTargetInfluences[dict["eyesClosed"]] = blinkValue;
      } else {
        if (leftEyeMeshRef.current) leftEyeMeshRef.current.scale.set(1, 1 - blinkValue, 1);
        if (rightEyeMeshRef.current) rightEyeMeshRef.current.scale.set(1, 1 - blinkValue, 1);
      }
    } else {
      if (leftEyeMeshRef.current) leftEyeMeshRef.current.scale.set(1, 1 - blinkValue, 1);
      if (rightEyeMeshRef.current) rightEyeMeshRef.current.scale.set(1, 1 - blinkValue, 1);
    }

    // ── Neck & arms ──────────────────────────────────────────────────────────
    if (neckRef.current) {
      neckRef.current.rotation.x = NECK_ROTATION_X;
      neckRef.current.rotation.y = NECK_ROTATION_Y;
      neckRef.current.rotation.z = NECK_ROTATION_Z;
    }

    // Lerp arms toward gesture target — slower than head for natural weight feel
    // Delta-time exponential decay: ARM_SPEED = 2 gives lazy, weighted arm motion.
    const ARM_SPEED = 2.0;
    const armK = 1 - Math.exp(-ARM_SPEED * dt);
    const ap = GESTURE_MOTION[gesture].arms;
    const da = dampedArmRef.current;

    da.lfa.x += (ap.lfa[0] - da.lfa.x) * armK;
    da.lfa.y += (ap.lfa[1] - da.lfa.y) * armK;
    da.lfa.z += (ap.lfa[2] - da.lfa.z) * armK;
    da.lh.x  += (ap.lh[0]  - da.lh.x)  * armK;
    da.lh.y  += (ap.lh[1]  - da.lh.y)  * armK;
    da.lh.z  += (ap.lh[2]  - da.lh.z)  * armK;
    da.rfa.x += (ap.rfa[0] - da.rfa.x) * armK;
    da.rfa.y += (ap.rfa[1] - da.rfa.y) * armK;
    da.rfa.z += (ap.rfa[2] - da.rfa.z) * armK;
    da.rh.x  += (ap.rh[0]  - da.rh.x)  * armK;
    da.rh.y  += (ap.rh[1]  - da.rh.y)  * armK;
    da.rh.z  += (ap.rh[2]  - da.rh.z)  * armK;

    if (leftForeArmRef.current)  leftForeArmRef.current.rotation.set(da.lfa.x, da.lfa.y, da.lfa.z);
    if (leftHandRef.current)     leftHandRef.current.rotation.set(da.lh.x, da.lh.y, da.lh.z);
    if (rightForeArmRef.current) rightForeArmRef.current.rotation.set(da.rfa.x, da.rfa.y, da.rfa.z);
    if (rightHandRef.current)    rightHandRef.current.rotation.set(da.rh.x, da.rh.y, da.rh.z);
  });

  return (
    <group ref={groupRef}>
      <primitive object={scene} scale={1} />
    </group>
  );
}

// ─── Public Component ──────────────────────────────────────────────────────────
interface AvatarProps {
  isTalking?: boolean;
  visemes?: VisemeFrame[];
  playheadMs?: number;
  gesture?: AvatarGesture;
}

export default function Avatar({ isTalking = false, visemes = [], playheadMs = 0, gesture = "idle" }: AvatarProps) {
  return (
    <div className="h-full w-full bg-[#e8edf2]">
      <Canvas camera={{ position: [CAMERA_X, CAMERA_Y, CAMERA_Z], fov: CAMERA_FOV }}>
        <ambientLight intensity={AMBIENT_LIGHT_INTENSITY} />
        <directionalLight position={[10, 10, 5]} intensity={DIRECTIONAL_LIGHT_INTENSITY} />
        <pointLight position={[-10, -10, -5]} intensity={POINT_LIGHT_INTENSITY} />
        <Suspense fallback={null}>
          <AvatarModel isTalking={isTalking} visemes={visemes} playheadMs={playheadMs} gesture={gesture} />
        </Suspense>
        <OrbitControls
          enableZoom={ENABLE_ZOOM}
          enablePan={ENABLE_PAN}
          enableRotate={ENABLE_ROTATE}
          minDistance={MIN_DISTANCE}
          maxDistance={MAX_DISTANCE}
          target={[CAMERA_TARGET_X, CAMERA_TARGET_Y, CAMERA_TARGET_Z]}
        />
      </Canvas>
    </div>
  );
}
