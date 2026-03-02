import type { GalleryLayout } from "@/components/museum/galleryLayout";
import { artistRoomRanges } from "@/content/museum";

export type WallSlot = {
  position: [number, number, number];
  rotation: [number, number, number];
};

function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * t;
}

export function buildWallSlots(
  layout: GalleryLayout["zones"][number],
  hallLayouts?: { felixHall?: GalleryLayout["zones"][number] | null; lucaHall?: GalleryLayout["zones"][number] | null },
): WallSlot[] {
  const halfW = layout.width / 2;
  const centerX = layout.centerX ?? 0;
  const edgePad = 3.2;
  const doorGap = 4.2;
  const isFelixRoom = layout.zone.artistId === "felix";
  const isLucaRoom = layout.zone.artistId === "luca";
  const isLobby = layout.zone.id === "lobby";
  const isHall = layout.zone.id === "felix-hall";
  const hallDoorHalf = 3.0;
  const minZ = Math.min(layout.startZ, layout.endZ) + edgePad;
  const maxZ = Math.max(layout.startZ, layout.endZ) - edgePad;
  const minX = centerX - halfW + edgePad;
  const maxX = centerX + halfW - edgePad;
  const leftX = centerX - halfW + 0.05;
  const rightX = centerX + halfW - 0.05;
  const frontZ = Math.max(layout.startZ, layout.endZ) - 0.05;
  const backZ = Math.min(layout.startZ, layout.endZ) + 0.05;
  const z1 = lerp(maxZ, minZ, 0.33);
  const z2 = lerp(maxZ, minZ, 0.66);
  const zA = lerp(maxZ, minZ, 0.2);
  const zB = lerp(maxZ, minZ, 0.5);
  const zC = lerp(maxZ, minZ, 0.8);
  const xA = lerp(minX, maxX, 0.2);
  const xB = lerp(minX, maxX, 0.5);
  const xC = lerp(minX, maxX, 0.8);
  const frontLeftX = (minX + (centerX - doorGap)) / 2;
  const frontRightX = ((centerX + doorGap) + maxX) / 2;
  const backLeftX = (minX + (centerX - doorGap)) / 2;
  const backRightX = ((centerX + doorGap) + maxX) / 2;

  const range = artistRoomRanges.find((r) => layout.index >= r.startIndex && layout.index < r.startIndex + r.count);
  const inRange = Boolean(range);
  const isFirst = inRange && layout.index === range!.startIndex;
  const isLast = inRange && layout.index === range!.startIndex + range!.count - 1;

  let doorLeft = false;
  let doorRight = false;
  let doorFront = false;
  let doorBack = false;
  const hallForFelix = hallLayouts?.felixHall ?? null;
  const hallForLuca = hallLayouts?.lucaHall ?? null;
  const resolveHallSide = (hall?: GalleryLayout["zones"][number] | null) => {
    if (!hall) return null;
    const dx = centerX - (hall.centerX ?? 0);
    const dz = (layout.centerZ ?? 0) - (hall.centerZ ?? 0);
    if (Math.abs(dx) > 0.6) {
      return dx > 0 ? "left" : "right";
    }
    return dz < 0 ? "front" : "back";
  };

  if (isLobby) {
    doorBack = true;
  } else if (isHall) {
    doorFront = true;
    doorRight = true;
  } else if (isFelixRoom) {
    const side = resolveHallSide(hallForFelix);
    doorLeft = side === "left";
    doorRight = side === "right";
    doorFront = side === "front";
    doorBack = side === "back";
  } else if (isLucaRoom) {
    const side = resolveHallSide(hallForLuca);
    doorLeft = side === "left";
    doorRight = side === "right";
    doorFront = side === "front";
    doorBack = side === "back";
  } else if (inRange) {
    doorFront = true;
    doorBack = !isLast || (isLast && !isFirst);
  }

  const slots: WallSlot[] = [];

  if (doorLeft) {
    let leftZ1 = z1;
    let leftZ2 = z2;
    if (isFelixRoom || isLucaRoom) {
      const doorMin = layout.centerZ - hallDoorHalf;
      const doorMax = layout.centerZ + hallDoorHalf;
      const segAEnd = Math.min(maxZ, doorMin - 0.4);
      const segBStart = Math.max(minZ, doorMax + 0.4);
      if (segAEnd > minZ + 0.2) {
        leftZ1 = (minZ + segAEnd) / 2;
      }
      if (maxZ > segBStart + 0.2) {
        leftZ2 = (segBStart + maxZ) / 2;
      }
    }
    if (isFelixRoom) {
      slots.push({ position: [leftX, 1.75, leftZ1], rotation: [0, Math.PI / 2, 0] });
      slots.push({ position: [leftX, 1.75, leftZ2], rotation: [0, Math.PI / 2, 0] });
    } else {
      slots.push({ position: [leftX, 1.75, leftZ1], rotation: [0, Math.PI / 2, 0] });
      slots.push({ position: [leftX, 1.75, leftZ2], rotation: [0, Math.PI / 2, 0] });
    }
  } else {
    slots.push({ position: [leftX, 1.75, zA], rotation: [0, Math.PI / 2, 0] });
    slots.push({ position: [leftX, 1.75, zB], rotation: [0, Math.PI / 2, 0] });
    slots.push({ position: [leftX, 1.75, zC], rotation: [0, Math.PI / 2, 0] });
  }

  if (doorRight) {
    let rightZ1 = z1;
    let rightZ2 = z2;
    if (isFelixRoom || isLucaRoom) {
      const doorMin = layout.centerZ - hallDoorHalf;
      const doorMax = layout.centerZ + hallDoorHalf;
      const segAEnd = Math.min(maxZ, doorMin - 0.4);
      const segBStart = Math.max(minZ, doorMax + 0.4);
      if (segAEnd > minZ + 0.2) {
        rightZ1 = (minZ + segAEnd) / 2;
      }
      if (maxZ > segBStart + 0.2) {
        rightZ2 = (segBStart + maxZ) / 2;
      }
    }
    if (isFelixRoom) {
      slots.push({ position: [rightX, 1.75, rightZ2], rotation: [0, -Math.PI / 2, 0] });
      slots.push({ position: [rightX, 1.75, rightZ1], rotation: [0, -Math.PI / 2, 0] });
    } else {
      slots.push({ position: [rightX, 1.75, rightZ2], rotation: [0, -Math.PI / 2, 0] });
      slots.push({ position: [rightX, 1.75, rightZ1], rotation: [0, -Math.PI / 2, 0] });
    }
  } else {
    slots.push({ position: [rightX, 1.75, zA], rotation: [0, -Math.PI / 2, 0] });
    slots.push({ position: [rightX, 1.75, zB], rotation: [0, -Math.PI / 2, 0] });
    slots.push({ position: [rightX, 1.75, zC], rotation: [0, -Math.PI / 2, 0] });
  }

  if (doorFront) {
    if (isFelixRoom) {
      slots.push({ position: [frontLeftX, 1.75, frontZ], rotation: [0, Math.PI, 0] });
      slots.push({ position: [frontRightX, 1.75, frontZ], rotation: [0, Math.PI, 0] });
    } else {
      slots.push({ position: [frontLeftX, 1.75, frontZ], rotation: [0, Math.PI, 0] });
      slots.push({ position: [frontRightX, 1.75, frontZ], rotation: [0, Math.PI, 0] });
    }
  } else {
    slots.push({ position: [xA, 1.75, frontZ], rotation: [0, Math.PI, 0] });
    if (!isFelixRoom) {
      slots.push({ position: [xB, 1.75, frontZ], rotation: [0, Math.PI, 0] });
    }
    slots.push({ position: [xC, 1.75, frontZ], rotation: [0, Math.PI, 0] });
  }

  if (doorBack) {
    if (isFelixRoom) {
      slots.push({ position: [backRightX, 1.75, backZ], rotation: [0, 0, 0] });
      slots.push({ position: [backLeftX, 1.75, backZ], rotation: [0, 0, 0] });
    } else {
      slots.push({ position: [backRightX, 1.75, backZ], rotation: [0, 0, 0] });
      slots.push({ position: [backLeftX, 1.75, backZ], rotation: [0, 0, 0] });
    }
  } else {
    slots.push({ position: [xA, 1.75, backZ], rotation: [0, 0, 0] });
    if (!isFelixRoom) {
      slots.push({ position: [xB, 1.75, backZ], rotation: [0, 0, 0] });
    }
    slots.push({ position: [xC, 1.75, backZ], rotation: [0, 0, 0] });
  }

  return slots;
}

export function selectSlotIndices(count: number, totalSlots: number): number[] {
  if (totalSlots <= 0 || count <= 0) return [];
  const indices: number[] = [];
  if (count >= totalSlots) {
    for (let i = 0; i < totalSlots; i += 1) indices.push(i);
  } else {
    const step = totalSlots / Math.max(count, 1);
    const used = new Set<number>();
    for (let i = 0; i < count; i += 1) {
      let idxSel = Math.floor((i + 0.5) * step) % totalSlots;
      while (used.has(idxSel)) {
        idxSel = (idxSel + 1) % totalSlots;
      }
      used.add(idxSel);
      indices.push(idxSel);
    }
  }
  return indices.sort((a, b) => a - b);
}
