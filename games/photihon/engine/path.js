// Đường đi của thảm hoạ di chuyển (lốc xoáy, khủng long): dùng chung cho engine (tính sát thương) và render (vẽ).
// path = { x0, z0, x1, z1, w, f }: đi thẳng từ (x0,z0) tới (x1,z1), lượn ngang biên độ w, f vòng lượn.
export function pathAt(path, p) {
  const q = Math.max(0, Math.min(1, p));
  const dx = path.x1 - path.x0, dz = path.z1 - path.z0;
  const len = Math.hypot(dx, dz) || 1;
  const s = (path.w || 0) * Math.sin(q * (path.f || 1) * Math.PI * 2);
  return { x: path.x0 + dx * q - (dz / len) * s, z: path.z0 + dz * q + (dx / len) * s, dir: Math.atan2(dx, dz) };
}

/** Hình đảo (chữ nhật, rx / rz là nửa bề ngang / nửa bề dọc): điểm (x,z) có nằm trên đảo không. */
export const ISLAND = { rx: 6.2, rz: 8.6, riverZ: 0.2, riverW: 1.5 };
export const onIsland = (x, z, pad = 0) => Math.abs(x) <= ISLAND.rx - pad && Math.abs(z) <= ISLAND.rz - pad;
