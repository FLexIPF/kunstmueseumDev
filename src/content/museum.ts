import type { GalleryZone, MuseumGallery } from "@/content/types";
import { packs } from "@/content/artist_packs";

function buildZonesFromPacks(): GalleryZone[] {
  const zones: GalleryZone[] = [];
  packs.forEach((p) => {
    p.rooms.forEach((room) => {
      zones.push({
        id: `${p.artist.id}-${room.id}`,
        title: room.title,
        theme: room.theme,
        length: room.length,
        width: room.width,
        height: room.height,
        artistId: p.artist.id,
        accentColor: room.accentColor,
        categoryFilter: room.categoryFilter,
        artworkIds: room.artworkIds,
        maxArtworks: room.maxArtworks ?? 8,
        wallTexture: room.wallTexture,
        wallTextureAlt: room.wallTextureAlt,
        floorTexture: room.floorTexture,
        ceilingTexture: room.ceilingTexture,
      });
    });
  });
  return zones;
}

const flurLongWall = "/backgrounds/flur-longwall.png";
const flurShortWall = "/backgrounds/flur-shortwall.png";
const lucaShortWall = "/backgrounds/lobby-wall-3.jpg";

const ROOM_CON_BASE = "/backgrounds/room cons";
const ROOM_CONS = {
  con0: {
    wall: `${ROOM_CON_BASE}/con0/stand.png`,
    floor: `${ROOM_CON_BASE}/con0/floor.png`,
    ceiling: "/backgrounds/lobby-decke.jpg",
  },
  con1: {
    wall: `${ROOM_CON_BASE}/con1/flexroomWal.png`,
    floor: `${ROOM_CON_BASE}/con1/floor.png`,
    ceiling: `${ROOM_CON_BASE}/con1/lobby-decke Kopie 2.jpg`,
  },
  con2: {
    wall: `${ROOM_CON_BASE}/con2/all.png`,
    floor: `${ROOM_CON_BASE}/con2/all.png`,
    ceiling: `${ROOM_CON_BASE}/con2/all.png`,
  },
  con3: {
    wall: `${ROOM_CON_BASE}/con3/lobby-wall-4.jpg`,
    wallAlt: `${ROOM_CON_BASE}/con3/room2-b.jpg`,
    floor: `${ROOM_CON_BASE}/con3/room2-floor.jpg`,
    ceiling: `${ROOM_CON_BASE}/con3/tag-decke.png`,
  },
  con5: {
    wall: `${ROOM_CON_BASE}/con5/DSC08036.JPG`,
    floor: `${ROOM_CON_BASE}/con2/all.png`,
    ceiling: `${ROOM_CON_BASE}/con2/all.png`,
  },
} as const;
const FELIX_CON_ORDER = ["con0", "con2", "con2", "con0", "con5"] as const;

function applyRoomCon(zone: GalleryZone, con: { wall: string; wallAlt?: string; floor?: string; ceiling?: string }) {
  const wall = con.wall;
  const wallAlt = con.wallAlt ?? con.wall;
  return {
    ...zone,
    wallTexture: wall,
    wallTextureAlt: wallAlt,
    wallTextureLeft: wall,
    wallTextureRight: wall,
    wallTextureFront: wallAlt,
    wallTextureBack: wallAlt,
    floorTexture: con.floor ?? zone.floorTexture,
    ceilingTexture: con.ceiling ?? zone.ceilingTexture,
  };
}

function applyFlurWalls(zone: GalleryZone) {
  return {
    ...zone,
    wallTexture: flurLongWall,
    wallTextureAlt: flurShortWall,
    wallTextureLeft: flurLongWall,
    wallTextureRight: flurLongWall,
    wallTextureFront: flurShortWall,
    wallTextureBack: flurShortWall,
  };
}

const lobbyZone: GalleryZone = {
  id: "lobby",
  title: "Lobby",
  theme: "modern",
  length: 30,
  width: 30,
  height: 7.2,
  accentColor: "#7fc9ff",
  // Lobby wall backgrounds (door walls use con0)
  wallTexture: flurLongWall,
  wallTextureAlt: flurLongWall,
  wallTextureLeft: flurLongWall,
  wallTextureRight: flurLongWall,
  wallTextureFront: flurLongWall,
  wallTextureBack: flurLongWall,
  floorTexture: "/backgrounds/lobby-floor.jpg",
  ceilingTexture: "/backgrounds/lobby-decke.jpg",
};

// TEXTUR-PIXELGRÖSSEN EINTRAGEN
const LONG_W = 1510;
const LONG_H = 899;

const SHORT_W = 1024;
const SHORT_H = 1536;

// RAUMHÖHE (WANDHÖHE)
const WALL_HEIGHT = 9.2;

// AUTOMATISCHE RAUMMASSE
const ROOM_LENGTH = (LONG_W / LONG_H) * WALL_HEIGHT;   // Y-Achse
const ROOM_WIDTH  = (SHORT_W / SHORT_H) * WALL_HEIGHT; // X-Achse

const baseFelixHallZone: GalleryZone = {
  id: "felix-hall",
  title: "Felix Flur",
  theme: "modern",
  length: ROOM_LENGTH,
  width: ROOM_WIDTH,
  height: WALL_HEIGHT,
  accentColor: "#e6e6e6",
  artistId: "felix-hall",
  maxArtworks: 0,
  wallTexture: ROOM_CONS.con0.wall,
  wallTextureAlt: ROOM_CONS.con0.wall,
  wallTextureLeft: flurLongWall,
  wallTextureRight: flurLongWall,
  wallTextureFront: ROOM_CONS.con0.wall,
  wallTextureBack: ROOM_CONS.con0.wall,
  floorTexture: "/backgrounds/lobby-floor.jpg",
  ceilingTexture: "/backgrounds/lobby-decke.jpg",
};

const baseLucaHallZone: GalleryZone = {
  id: "luca-hall",
  title: "Luca Flur",
  theme: "modern",
  length: ROOM_LENGTH,
  width: ROOM_WIDTH,
  height: WALL_HEIGHT,
  accentColor: "#e6e6e6",
  artistId: "luca-hall",
  maxArtworks: 0,
  wallTexture: ROOM_CONS.con0.wall,
  wallTextureAlt: ROOM_CONS.con0.wall,
  wallTextureLeft: flurLongWall,
  wallTextureRight: flurLongWall,
  wallTextureFront: ROOM_CONS.con0.wall,
  wallTextureBack: ROOM_CONS.con0.wall,
  floorTexture: "/backgrounds/lobby-floor.jpg",
  ceilingTexture: "/backgrounds/lobby-decke.jpg",
};

const rawPackZones = buildZonesFromPacks();
const felixRooms = rawPackZones.filter((z) => z.artistId === "felix");
const lucaRooms = rawPackZones.filter((z) => z.artistId === "luca");
const ROOM_GAP = 1.2;
const HALL_GAP = 1.0;
const LUCA_HALL_GAP = 1.4;
const HALL_ROOM_GAP = 0.8;
type FelixRoomSide = "left" | "right" | "front";
const felixSideCount = Math.max(0, felixRooms.length - 1);
const felixSidePlan: FelixRoomSide[] = felixRooms.map((_, idx) => {
  if (idx >= felixSideCount) return "front";
  return idx % 2 === 0 ? "left" : "right";
});
const felixLeftRooms = felixRooms.filter((_, idx) => felixSidePlan[idx] === "left");
const felixRightRooms = felixRooms.filter((_, idx) => felixSidePlan[idx] === "right");
const sideSpan = (rooms: GalleryZone[]) => rooms.reduce((sum, room) => sum + room.length, 0) + Math.max(0, rooms.length - 1) * ROOM_GAP;
const hallLength = Math.max(baseFelixHallZone.length, sideSpan(felixLeftRooms), sideSpan(felixRightRooms));
const totalLucaLength = lucaRooms.reduce((sum, room) => sum + room.length, 0);
const totalLucaSpan = totalLucaLength + Math.max(0, lucaRooms.length - 1) * ROOM_GAP;
const lucaHallLength = Math.max(baseLucaHallZone.length, totalLucaSpan);
const lobbyCenterX = 0;
const lobbyCenterZ = -lobbyZone.length / 2;
const hallCenterX = 0;
const hallCenterZ = -lobbyZone.length - HALL_GAP - hallLength / 2;
const lucaHallCenterX = lobbyCenterX - lobbyZone.width / 2 - LUCA_HALL_GAP - baseLucaHallZone.width / 2;
const lucaHallCenterZ = lobbyCenterZ;
const felixHallZone: GalleryZone = {
  ...baseFelixHallZone,
  length: hallLength,
  centerX: hallCenterX,
  centerZ: hallCenterZ,
};
const lucaHallZone: GalleryZone = {
  ...baseLucaHallZone,
  length: lucaHallLength,
  centerX: lucaHallCenterX,
  centerZ: lucaHallCenterZ,
};
const hallStartZ = hallCenterZ + hallLength / 2;
const hallEndZ = hallCenterZ - hallLength / 2;
const hallRightX = hallCenterX + felixHallZone.width / 2;
const hallLeftX = hallCenterX - felixHallZone.width / 2;
const lucaHallStartZ = lucaHallCenterZ + lucaHallLength / 2;
const lucaHallLeftX = lucaHallCenterX - lucaHallZone.width / 2;

let lucaCursorZ = lucaHallStartZ;
let felixConIndex = 0;
let felixIndex = 0;
let felixLeftIndex = 0;
let felixRightIndex = 0;
const sideCenters = (rooms: GalleryZone[], startZ: number) => {
  const centers: number[] = [];
  let cursorZ = startZ;
  rooms.forEach((room) => {
    const endZ = cursorZ - room.length;
    centers.push((cursorZ + endZ) / 2);
    cursorZ = endZ - ROOM_GAP;
  });
  return centers;
};
const felixLeftCenters = sideCenters(felixLeftRooms, hallStartZ);
const felixRightCenters = sideCenters(felixRightRooms, hallStartZ);
const packZones = rawPackZones.map((zone) => {
  let baseZone: GalleryZone = zone;
  if (zone.artistId === "felix") {
    const conKey = FELIX_CON_ORDER[Math.min(felixConIndex, FELIX_CON_ORDER.length - 1)];
    const con = ROOM_CONS[conKey];
    if (con) {
      baseZone = applyRoomCon(zone, con);
    }
    felixConIndex += 1;
  } else if (zone.artistId === "luca") {
    baseZone = applyRoomCon(zone, ROOM_CONS.con0);
  } else {
    baseZone = applyFlurWalls(zone);
  }
  if (zone.artistId === "felix") {
    const side = felixSidePlan[felixIndex] ?? "front";
    let centerZ = hallStartZ;
    if (side === "left") {
      centerZ = felixLeftCenters[felixLeftIndex] ?? hallStartZ;
      felixLeftIndex += 1;
    } else if (side === "right") {
      centerZ = felixRightCenters[felixRightIndex] ?? hallStartZ;
      felixRightIndex += 1;
    } else {
      centerZ = hallEndZ - HALL_ROOM_GAP - zone.length / 2;
    }
    const centerX =
      side === "left"
        ? hallLeftX - HALL_ROOM_GAP - zone.width / 2
        : side === "right"
          ? hallRightX + HALL_ROOM_GAP + zone.width / 2
          : hallCenterX;
    felixIndex += 1;
    return {
      ...baseZone,
      centerX,
      centerZ,
    };
  }
  if (zone.artistId === "luca") {
    const startZ = lucaCursorZ;
    const endZ = startZ - zone.length;
    const centerZ = (startZ + endZ) / 2;
    const centerX = lucaHallLeftX - HALL_ROOM_GAP - zone.width / 2;
    lucaCursorZ = endZ - ROOM_GAP;
    return {
      ...baseZone,
      centerX,
      centerZ,
    };
  }
  return baseZone;
});

export const artistRoomRanges = (() => {
  const zones = [lobbyZone, felixHallZone, lucaHallZone, ...packZones];
  const ranges: Array<{ artistId: string; artistName: string; bioPdf?: string; startIndex: number; count: number }> = [];
  packs.forEach((p) => {
    const indices = zones
      .map((z, idx) => (z.artistId === p.artist.id ? idx : -1))
      .filter((idx) => idx >= 0);
    if (!indices.length) return;
    ranges.push({
      artistId: p.artist.id,
      artistName: p.artist.name,
      bioPdf: p.artist.bioPdf,
      startIndex: indices[0],
      count: indices.length,
    });
  });
  return ranges;
})();

export const gallery: MuseumGallery = {
  galleryId: "museum",
  artistId: packs[0]?.artist.id || "felix",
  zones: [lobbyZone, felixHallZone, lucaHallZone, ...packZones],
};
