// Đường đi của thảm hoạ di chuyển (lốc xoáy, khủng long): dùng chung cho engine (tính sát thương) và render (vẽ).
// path = { x0, z0, x1, z1, w, f }: đi thẳng từ (x0,z0) tới (x1,z1), lượn ngang biên độ w, f vòng lượn.
export function pathAt(path, p) {
  const q = Math.max(0, Math.min(1, p));
  const dx = path.x1 - path.x0, dz = path.z1 - path.z0;
  const len = Math.hypot(dx, dz) || 1;
  const s = (path.w || 0) * Math.sin(q * (path.f || 1) * Math.PI * 2);
  return { x: path.x0 + dx * q - (dz / len) * s, z: path.z0 + dz * q + (dx / len) * s, dir: Math.atan2(dx, dz) };
}

/** Hình đảo (elip): điểm (x,z) có nằm trên đảo không. */
export const ISLAND = { rx: 6.6, rz: 8.8, riverZ: 0.2, riverW: 1.5 };
export const onIsland = (x, z, pad = 0) => (x / (ISLAND.rx - pad)) ** 2 + (z / (ISLAND.rz - pad)) ** 2 <= 1;
