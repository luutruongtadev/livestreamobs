// Phố Mới — lõi mô phỏng thành phố (không đụng DOM, chạy được cả trong Node để test).
// Đường là một graph (nút giao + đoạn đường cong Bezier bậc 2); ô đất theo lưới N x N.
// Người dân, doanh nghiệp (people.js), xe cộ (traffic.js) và giao thông công cộng (transit.js) cắm vào vòng lặp ở đây.
import {
  MK, N, T, HALF, LAND, LT, HOUR_SEC, upkeepRate, idx, inMap, cellOf, cellCenter, clamp, ZDEF, RAW, MAX_LEVEL, resCap, jobCap, utilUse, reqEdu, garbageLimit,
  MAP_SIZES, CELL_NEW, ROADS, pointAt, BRIDGE_MULT, BRIDGES, buildHours, LINES, sameLevel, roadLvl, lvlH, LIFT, DEPOT_FREE, SERVICES, MODULES, moduleCost, moduleUpkeep, svcVal, TECH, START_POINTS, LAND_PRICE, MILESTONES, LOANS, MAX_LOANS, BANKRUPT_AT, BANKRUPT_DAYS,
  WATER_LEVEL, TERRA, TERRA_COST, TERRA_STEP, TERRA_LEVEL_STEP, TERRA_MIN, TERRA_MAX, CANAL_BED,
  mulberry32, hash2, vnoise, makeField, MAPS, setMapSize, distSeg, nearestOnEdge, TRANSIT,
} from './base.js';
import { cityPay, cityGet, cityTake, citySet, world, resetLedger, ledgerDay, resetPop, restoreRural, RURAL, ruralDay, worldK, worldCan, issueDay, packLedger } from './ledger.js';
import { initReserve, reserveDay, applyDepletion, packReserve, unpackReserve } from './reserve.js';
import { outside, reportDay } from './world.js';
import { packLeague, unpackLeague, contract, tradeUse } from './league.js';
import { initTraffic, rebuildTraffic, stepTraffic, edgeLoad, BANS, TURNS } from './traffic.js';
import { RETAIL, procure, householdPay, wageAt, removeCitizen, saleIncome, initPeople, peopleHour, onArrive, onBuildingCleared, quickStats, packPeople, unpackPeople, bizKind, die, touristSpend, outsidePositions, addCitizen, isTro, trimStaff } from './people.js';
import { initTransit, maintainTransit, stepTransit, transitHour, transitUpkeep, addLine } from './transit.js';
import { stepFerries, canalToSea, syncFerries } from './ships.js';
import { initEcon, packEcon, marketDay, tourismHour, tourismDay, sectorOf, budgetK } from './econ.js';
import { intlHour, intlDay, promoCost, flyHappy, intlOutlook } from './intl.js';
import { initRail, packRail, planRail, addRail, removeRail, railsInRect, railCells, tunnelCells, railBonus, railUpkeep, railHour, railDay, railHappy } from './rail.js';
import { seasonHour, festMul, festHappy, flooded, initSeason, packSeason } from './seasons.js';
import { corpHour, initCorp, packCorp, corpNote, corpPayWare, corpFlow, corpPrice, investorFound } from './corp.js';
import { initChain, packChain, chainDay, chainCleared, watchLayoff } from './chain.js';
import { councilHour, councilMod, taxBreak, dealCost, initCouncil, packCouncil } from './council.js';
import { initStreet, packStreet, streetDay, streetBonus, applyStreet } from './street.js';
import { BEACH, beachRect, beachCount, packBeach, unpackBeach } from './beach.js';
import { computeFlow, flowAt, flowName, planDam, attachDam, damPower, damCells, damSpan, cliffDrop, seasonFlow, reservoirLevel } from './hydro.js';
import { solveWater, rainK } from './water.js';
import { fisheryOk, cleanFishery, packFishery, unpackFishery } from './fishery.js';
import { FALLS, fallsRect, clearFalls, fallsCount, packFalls, unpackFalls } from './falls.js';
import { decorRect, clearDecor, decorFx, decorUpkeep, decorHappy, packDecor, unpackDecor } from './decor.js';
import { initIncidents, incidentsStep, incidentsHour, heatUse } from './incidents.js';
import { initDistricts, packDistricts, districtHour, distFx, distCost, planCost, rebuildDmap } from './districts.js';
const planCostQ = (q) => planCost(q, q.prog);

export * from './base.js';
export { outside, registerWorld, dailyReport, prosperity, AI_WORLD } from './world.js';
export { RESERVE, reserveLeft } from './reserve.js';
export { RURAL, checkPop } from './ledger.js';
export { edgeLoad, signalState, findPath, cellPos, VKIND, LOOKS, pickLook, rampMerge, BANS, banned, TURNS, turnKind, turnBanned, BUMP_SLOW } from './traffic.js';
export { bizKind, wageAt, rentAt, incomeOf, tierOf, rentDay, isTro, TRO_RENT, RETAIL, retailDay, outsidePositions, ST, die, touristSpend, needOf, productOf, recipeOf } from './people.js';
export { shipRoutes, syncFerries, ferryPoint, stepFerries, canalToSea, landInfo, islandAttract, fareK } from './ships.js';
export { lunar, FESTIVALS, FEST_SCALE, VENUES, festivalNow, upcomingFestivals, canOrganize, organize, festMul, festHappy, fireworksAt, stormSeason, tideNow, flooded, MONTH_DAYS, YEAR_DAYS } from './seasons.js';
export { BEACH, beachOk, seaInfo, beachCount } from './beach.js';
export { RAIL, railPath, railGates, stationEnds, railSnap, lineGeo, railNet, linkedStations, railBonus, railUpkeep, railStats, trainsAt, TRAIN_HOURS, railCrossings, crossingsClosed, XING } from './rail.js';
export { computeFlow, flowAt, flowName, planDam, damPower, damSpan, cliffDrop, fallGeom, seasonFlow, DAM_MAX, reservoirLevel } from './hydro.js';
export { solveWater, rainK } from './water.js';
export { FISHERY, fisheryOk, fisheryMul, fisheryCount, fisheryAreas } from './fishery.js';
export { FALLS, fallsOk, fallsInfo, fallsAttract, fallsCount, cellMid } from './falls.js';
export { DECOR, DECOR_KEYS, decorById, decorOk, decorCount, decorFx, decorUpkeep } from './decor.js';
export { SIDEWALK, STREET_POLICY, FEE_MAX, setSidewalk, setPolicy, inCenter, vehicleOf, aqiLevel, computeAqi, streetBonus, centerOf } from './street.js';
export { DILEMMAS, DEALS, clampOffer, defaultOption, MAX_TURNS, decide, signDeal, rejectDeal, applyCounter, counterFallback, ratingAvg, ratingK, visitorExperience, councilMod, taxBreak, dealCost, svcNames } from './council.js';
export { DIST_UNLOCK, PROGRAMS, PKEYS, PERSONAS, MODES, KPIS, MAX_LV, maxDistricts, canSplit, splitDistricts, moveSeat, dissolve, districtOf, progCost, planCost, clampPlan, efficiency, setProgram, setMode, setCap, replaceChair, districtStats, distSummary, autoPlan, orderFallback, applyOrder, applyPlan, chairPick, distFx, distCost, rebuildDmap, BUILDS, BUILD_MODES, buildUpkeep, setBuildMode, setBuildCap, buildSpent, buildCands, buildPick, approveBuild, setTruckBan, districtBrief, askFallback, askTopics, noteAsk, noteExport } from './districts.js';
export { CLIMATES, climateOf } from './base.js';
export { TIERS, TIER_CFG, tierByWage, tierByEdu, homeTier, dayIncome, burden, canAfford, pickHome } from './tiers.js';
export { CORP, CEOS, STAGES, maxCorps, corpTitle, corpById, corpLog, cellsBuilt, jobsOf, effOf, corpSector, stageOf, influence, corpStats, corpAct, approveAsk, rejectAsk, counterAsk, corpCash, rootOf, subsOf, corpOptions, corpDo, corpBrief, corpResolve, corpNote, corpHour, marketShare, jobShare, monopolyOf, protectSme, inviteRival, hubScan, signals, signalOf, OPTS, TERMS, TERM_KEYS, termLine, termsFor, payDividend, fitsZone, landFeeOf, askBounds, corpCounter, corpCounterFallback, askBrief, ASK_TURNS, brkWant, brkOf, taxOf, investorFound, actorOf, actorPay, actorCells, lowEff } from './corp.js';
export { CHAIN, chron, chronById, causeChain, effectsOf, placeName, bizName, whoAt, areaStats, workerHousing, housingShort, freeIndustrial, landK, economyMix, mixLine, identityName, haltCell, dumpCell, fundCells } from './chain.js';
export { isIntlAirport, isAirport, flyHappy } from './intl.js';
export { VISA, PROMO, intlOutlook, simTime, FLY_H, SAIL_H, DOCK_H } from './intl.js';
export { seaGates } from './ships.js';
export { SECTORS, sectorOf, budgetK, MKT_KINDS, MKT_NAME, mkt, tourismScore, foodStreets, marketDay } from './econ.js';
export { WEATHER, hotSeason, heatUse, triggerDisaster, crash, wildCount, crashFactor } from './incidents.js';
export { planLine as planTransit, addLine as addTransit, removeLine as removeTransit, setVehicles, metroPoint, planRide, metroUnlocked, modeUnlocked, roadFleet } from './transit.js';

export const ZONE_NAME = ZDEF.map((z) => z.name);

// ───────────────────────── địa hình (heightmap) ─────────────────────────

const STEEP = 6; // ô chênh cao quá mức này giữa các đỉnh thì không xây nhà / công trình được

/**
 * Hàm cao độ của một thành phố: { f, isWater(tx, ty), mount(gx, gy), height(gx, gy) }.
 * Đáy nước -3.2, mép bờ 0, đất liền theo đồi thoải; bản đồ đời mới (tgen ≥ 2) có thêm dãy núi ở xa điểm xuất phát.
 */
export function heightFn(c) {
  const seed = c.seed, kind = MAPS[c.map] ? c.map : 'river', M = MAPS[kind], f = makeField(seed, kind), sx = c.start.x, sy = c.start.y, mountains = c.tgen >= 2;
  const nat = c.water0 || c.water; // mặt nước tự nhiên (trước khi đào đắp): cao độ nền tính theo mặt nước này
  const isWater = (tx, ty) => (inMap(tx, ty) ? c.water[idx(tx, ty)] === 1 : f(tx + 0.5, ty + 0.5) < 0.15);
  const isWater0 = (tx, ty) => (inMap(tx, ty) ? nat[idx(tx, ty)] === 1 : f(tx + 0.5, ty + 0.5) < 0.15);
  const ctx = { N, sx, sy, seed }, hills = M.hills ?? 1;
  const mount = (gx, gy) => {
    if (!mountains || !M.mount) return 0;
    let far;
    if (M.mask) far = M.mask(gx, gy, ctx);
    else { far = clamp((Math.hypot(gx - sx, gy - sy) - 40) / 18, 0, 1); far = far * far * (3 - 2 * far); }
    if (!far) return 0;
    const r = clamp((vnoise(gx * 0.045, gy * 0.045, seed + 51) - 0.5 + (M.cover || 0)) / 0.3, 0, 1), base = 38 * M.mount * r * r * (3 - 2 * r) * far;
    if (c.tgen >= 3) { // bản đồ đời 3: sống núi, khe rãnh (nhiễu gợn) thay cho vòm tròn trơn
      const rg = (fq, sd) => { const v = 1 - Math.abs(2 * vnoise(gx * fq, gy * fq, seed + sd) - 1); return v * v; };
      return base * (0.45 + 0.6 * rg(0.1, 57) + 0.3 * rg(0.22, 59) - 0.12 * vnoise(gx * 0.33, gy * 0.33, seed + 61));
    }
    return base * (0.75 + 0.25 * vnoise(gx * 0.21, gy * 0.21, seed + 53));
  };
  const height = (gx, gy) => {
    const wn = isWater0(gx - 1, gy - 1) + isWater0(gx, gy - 1) + isWater0(gx - 1, gy) + isWater0(gx, gy);
    if (wn === 4) return -3.2;
    if (wn > 0) return 0;
    const n = vnoise(gx * 0.034, gy * 0.034, seed + 41) * 0.75 + vnoise(gx * 0.09, gy * 0.09, seed + 43) * 0.25;
    return (15 * hills * Math.pow(n, 1.5) + mount(gx, gy)) * clamp((f(gx, gy) - 1.6) / 9, 0, 1);
  };
  return { f, isWater, mount, height };
}

/**
 * Địa hình = cao độ tự nhiên sinh từ seed (c.hv0) + phần người chơi đào đắp (c.terra, mỗi đỉnh lưới một số, đơn vị 0,1).
 * Mặt nước tự nhiên giữ ở c.water0; c.water là mặt nước hiện tại sau khi đào kênh, ao hoặc lấn đất.
 */
function makeTerrain(c) {
  const V = N + 1;
  if (!c.terra) c.terra = new Int16Array(V * V);
  c.water0 = c.water.slice();
  const hf = heightFn(c);
  c.hv0 = new Float32Array(V * V); c.hv = new Float32Array(V * V);
  for (let gy = 0; gy <= N; gy++) for (let gx = 0; gx <= N; gx++) { const k = gy * V + gx; c.hv0[k] = hf.height(gx, gy); c.hv[k] = vertexH(c, k); }
  c.cellH = new Float32Array(N * N); // cao độ nền nhà của ô = đỉnh cao nhất
  c.steep = new Uint8Array(N * N);
  for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) cellTerrain(c, x, y);
  waterSync(c, { quiet: true });
  for (let i = 0; i < N * N; i++) if (c.water[i]) { c.tree[i] = 0; c.zone[i] = 0; c.level[i] = 0; }
  makeResources(c, hf);
}

const vertexH = (c, k) => clamp(c.hv0[k] + c.terra[k] * 0.1, TERRA_MIN, Math.max(TERRA_MAX, c.hv0[k]));

/** Tính lại nền, độ dốc và đất / nước của một ô theo 4 đỉnh của nó. Trả về true nếu ô vừa đổi giữa đất và nước. */
function cellTerrain(c, x, y) {
  const V = N + 1, k = y * V + x, i = idx(x, y);
  const a = c.hv[k], b = c.hv[k + 1], d = c.hv[k + V], e = c.hv[k + V + 1], hi = Math.max(a, b, d, e);
  const touched = c.terra[k] || c.terra[k + 1] || c.terra[k + V] || c.terra[k + V + 1];
  c.cellH[i] = hi;
  c.steep[i] = (c.tgen >= 2 || touched) && hi - Math.min(a, b, d, e) > STEEP ? 1 : 0;
  return false; // đất / nước do waterSync quyết định (mực nước theo vùng trũng)
}

/**
 * Giải lại mực nước cả bản đồ (water.js): nước chảy từ cao xuống thấp, đọng ở chỗ trũng theo thể tích, đầy thì tràn;
 * thân đập thuỷ điện là tường chắn, hồ chứa sau đập là nước thật. Ô vừa ngập thì dỡ nhà, bỏ quy hoạch, cây, trang trí.
 * Trả về số ô đổi giữa đất và nước.
 */
export function waterSync(c, { quiet = false } = {}) {
  const walls = new Map();
  for (const s of c.services) if (s.type === 'hydro' && s.dam) { const crest = reservoirLevel(s); for (const i of damSpan(c, s)) walls.set(i, Math.max(crest, walls.get(i) ?? -Infinity)); } // thân đập + vai đập
  const r = solveWater(c, { walls, rain: rainK(c) });
  let changed = 0, moved = !c.wl;
  for (let i = 0; i < N * N; i++) {
    const w = Number.isNaN(r.wl[i]) ? 0 : 1;
    if (!moved && (Number.isNaN(c.wl[i]) ? !Number.isNaN(r.wl[i]) : Math.abs(c.wl[i] - r.wl[i]) > 0.01 || Number.isNaN(r.wl[i]))) moved = true;
    if (w === c.water[i]) continue;
    changed++;
    c.water[i] = w;
    if (w && !quiet) { c.zone[i] = 0; c.tree[i] = 0; if (c.level[i]) clearBuilding(c, i); clearDecor(c, i); if (c.beach) c.beach[i] = 0; }
  }
  c.wl = r.wl; c.wsolve = r;
  if (changed && c.fishery && c.res) { const before = c.fishery.reduce((a, b) => a + b, 0); cleanFishery(c); if (c.dirty && c.fishery.reduce((a, b) => a + b, 0) !== before) c.dirty.fishery = true; } // lấn biển: bỏ ngư trường trên đất mới
  if (changed || moved) {
    c.waterVer = (c.waterVer || 0) + 1;
    if (c.dirty) Object.assign(c.dirty, { water: true, terrain: changed ? 2 : Math.max(c.dirty.terrain | 0, 0), zones: true, trees: true, buildings: true });
  }
  return changed;
}

/**
 * Bản đồ tài nguyên (sinh lại từ seed, không lưu): c.res[i] = 1 đất màu mỡ, 2 rừng, 3 khoáng sản, 4 dầu trên đất liền;
 * 5 = vùng nước có cá. c.fishShore[i] = ô đất nằm sát vùng nước có cá.
 */
function makeResources(c, hf) {
  const seed = c.seed;
  c.res = new Uint8Array(N * N); c.fishShore = new Uint8Array(N * N);
  for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) {
    const i = idx(x, y);
    if (c.water[i]) { if (vnoise(x * 0.07, y * 0.07, seed + 71) > 0.45) c.res[i] = 5; continue; }
    const h = c.cellH[i], fv = hf.f(x + 0.5, y + 0.5);
    const rocky = c.tgen >= 2 ? hf.mount(x + 0.5, y + 0.5) > 5 : h > 6.5;
    if (rocky && vnoise(x * 0.13, y * 0.13, seed + 63) > 0.36) c.res[i] = 3;
    else if (h < 9 && vnoise(x * 0.06, y * 0.06, seed + 61) > 0.76) c.res[i] = 4;
    else if (fv < 12 && h < 5 && vnoise(x * 0.07, y * 0.07, seed + 65) > 0.38) c.res[i] = 1;
    else if (vnoise(x * 0.09, y * 0.09, seed + 11) > 0.55) c.res[i] = 2;
  }
  // dẫn nước tưới: đất trống trong 2 ô quanh kênh, ao do người chơi đào thành đất màu mỡ
  for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) {
    const i = idx(x, y);
    if (!c.water[i] || c.water0[i]) continue;
    for (let dy = -2; dy <= 2; dy++) for (let dx = -2; dx <= 2; dx++) {
      const j = idx(x + dx, y + dy);
      if (inMap(x + dx, y + dy) && !c.water[j] && !c.res[j] && c.cellH[j] < 9) c.res[j] = 1;
    }
  }
  for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) {
    if (c.res[idx(x, y)] !== 5) continue;
    for (let dy = -2; dy <= 2; dy++) for (let dx = -2; dx <= 2; dx++) if (inMap(x + dx, y + dy) && !c.water[idx(x + dx, y + dy)]) c.fishShore[idx(x + dx, y + dy)] = 1;
  }
  applyDepletion(c); // mỏ khoáng sản, dầu đã khai thác hết thì không còn trên bản đồ
}

/** Ô i có đúng tài nguyên cho khu chuyên biệt z không (khu thường thì luôn đúng). */
export function hasResource(c, i, z) {
  const raw = ZDEF[z].raw;
  if (!raw) return true;
  return raw === 'fish' ? c.fishShore[i] === 1 : c.res[i] === RAW[raw].id;
}

/** Cao độ mặt đất tại toạ độ thế giới (khớp đúng lưới tam giác của địa hình). */
export function heightAt(c, wx, wz) {
  const u = clamp((wx + HALF) / T, 0, N - 1e-6), v = clamp((wz + HALF) / T, 0, N - 1e-6);
  const i = Math.floor(u), j = Math.floor(v), fx = u - i, fy = v - j, V = N + 1;
  const a = c.hv[j * V + i], b = c.hv[j * V + i + 1], d = c.hv[(j + 1) * V + i], e = c.hv[(j + 1) * V + i + 1];
  return fx + fy <= 1 ? a + (b - a) * fx + (d - a) * fy : e + (d - e) * (1 - fx) + (b - e) * (1 - fy);
}

export function isWaterAt(c, wx, wz) {
  const x = cellOf(wx), y = cellOf(wz);
  return inMap(x, y) && c.water[idx(x, y)] === 1;
}

/** Có ô nước nào cách điểm (wx, wz) dưới r mét không. */
export function wetNear(c, wx, wz, r) {
  const x0 = cellOf(wx - r), x1 = cellOf(wx + r), y0 = cellOf(wz - r), y1 = cellOf(wz + r);
  for (let y = Math.max(0, y0); y <= Math.min(N - 1, y1); y++) for (let x = Math.max(0, x0); x <= Math.min(N - 1, x1); x++) {
    if (c.water[idx(x, y)] !== 1) continue;
    const cx = cellCenter(x), cz = cellCenter(y), dx = Math.max(0, Math.abs(wx - cx) - T / 2), dz = Math.max(0, Math.abs(wz - cz) - T / 2);
    if (dx * dx + dz * dz < r * r) return true;
  }
  return false;
}

/** Khoảng cách tối thiểu từ mép hầm chui tới mặt nước để lòng hầm còn hở được; gần hơn thì hầm phải kín (đi ngầm dưới đáy sông). */
export const TUNNEL_WET = 4;
/** Bán kính xét nước quanh tim hầm loại type. */
export const tunnelWetR = (type) => ROADS[type].w / 2 + TUNNEL_WET;

/**
 * Hầm chui qua sông, hồ: chỗ gần nước, mặt đường phải đã xuống hết độ sâu (đoạn kín đi dưới đáy sông);
 * còn trên đoạn dốc thì lòng hầm hở, nước tràn vào. hAt(s) = độ cao mặt đường tại quãng đường s. Trả về lý do không được, hoặc null.
 */
function tunnelWetCheck(c, type, pts, cum, hAt) {
  if (roadLvl(type) >= 0) return null;
  const n = pts.length / 2 - 1, r = tunnelWetR(type), H = lvlH(roadLvl(type));
  for (let k = 0; k <= n; k++) {
    if (!wetNear(c, pts[k * 2], pts[k * 2 + 1], r)) continue;
    if (hAt(cum[k]) > H + 0.5) return 'Hầm qua sông phải xuống hết độ sâu trước khi tới bờ (dốc hầm dài khoảng 40 m): bắt đầu hầm xa bờ hơn';
  }
  return null;
}

/**
 * Tự xử lý hầm chui qua sông (như sân bay quốc tế tự giải toả): chỗ dốc hầm còn gần nước thì đắp đất cửa hầm (lấn bờ
 * quanh dốc hầm cho khô), đoạn hầm kín chạy dưới sông thì nạo vét lòng sông cho đủ sâu (đáy ít nhất -3,2 m) để hầm
 * nằm dưới đáy. Sông phải còn lòng nước ở giữa (không lấp kín sông). Trả về { ok, verts: Map(đỉnh → cao độ mới), cost,
 * fill (ô đắp), dredge (đỉnh nạo vét) } hoặc { ok: false, reason }.
 */
function tunnelFix(c, type, pts, cum, hAt) {
  const n = pts.length / 2 - 1, r = tunnelWetR(type), H = lvlH(roadLvl(type)), V = N + 1, verts = new Map(), fillCells = new Set();
  const cellsNear = (wx, wz, rad, fn) => { for (let y = Math.max(0, cellOf(wz - rad)); y <= Math.min(N - 1, cellOf(wz + rad)); y++) for (let x = Math.max(0, cellOf(wx - rad)); x <= Math.min(N - 1, cellOf(wx + rad)); x++) { const dx = Math.max(0, Math.abs(wx - cellCenter(x)) - T / 2), dz = Math.max(0, Math.abs(wz - cellCenter(y)) - T / 2); if (dx * dx + dz * dz < rad * rad) fn(idx(x, y), x, y); } };
  const setV = (k, h, up) => { const cur = verts.has(k) ? verts.get(k) : c.hv[k]; verts.set(k, up ? Math.max(cur, h) : Math.min(cur, h)); };
  let deepWater = 0;
  for (let k = 0; k <= n; k++) {
    const wx = pts[k * 2], wz = pts[k * 2 + 1], ramp = hAt(cum[k]) > H + 0.5;
    if (ramp) cellsNear(wx, wz, r + 1, (i, x, y) => { if (c.water[i]) { if (c.occ[i]) return; fillCells.add(i); for (const kk of [y * V + x, y * V + x + 1, (y + 1) * V + x, (y + 1) * V + x + 1]) setV(kk, 0.6, true); } }); // đắp cửa hầm
    else cellsNear(wx, wz, ROADS[type].w / 2 + 2, (i, x, y) => { if (!c.water[i]) return; deepWater++; for (const kk of [y * V + x, y * V + x + 1, (y + 1) * V + x, (y + 1) * V + x + 1]) if (c.hv[kk] > -3.2) setV(kk, -3.2, false); }); // nạo vét
  }
  // đỉnh vừa bị đắp vừa bị nạo vét: ưu tiên đắp (cửa hầm phải khô)
  let left = 0;
  for (let k = 0; k <= n; k++) { if (hAt(cum[k]) > H + 0.5) continue; cellsNear(pts[k * 2], pts[k * 2 + 1], ROADS[type].w / 2 + 2, (i) => { if (c.water[i] && !fillCells.has(i)) left++; }); }
  if (deepWater && left < 2) return { ok: false, reason: 'Sông quá hẹp: đắp cửa hầm sẽ lấp kín lòng sông — bắt đầu hầm xa bờ hơn' };
  for (const [k, h] of verts) { // đỉnh chạm đường, nhà, công trình thì không đụng tới
    const gx = k % V, gy = (k / V) | 0;
    for (let dy = -1; dy <= 0; dy++) for (let dx = -1; dx <= 0; dx++) { const a = gx + dx, b = gy + dy; if (inMap(a, b) && (c.road[idx(a, b)] || c.occ[idx(a, b)] || c.level[idx(a, b)])) { verts.delete(k); break; } }
  }
  let cost = 0, dredge = 0;
  for (const [k, h] of verts) { cost += Math.abs(h - c.hv[k]) * TERRA_COST; if (h < c.hv[k]) dredge++; }
  return { ok: true, verts, cost: Math.ceil(cost), fill: fillCells.size, dredge };
}

// ───────────────────────── đào đắp địa hình ─────────────────────────

/**
 * Áp cọ đào đắp một lần tại ô (x, y). mode: 'dig' | 'raise' | 'level' | 'canal'; size: cạnh cọ (ô);
 * target: cao độ đích của san phẳng; dry: chỉ tính giá, không làm.
 * Đỉnh chạm ô có đường, nhà, công trình hoặc đất chưa mua thì giữ nguyên. Trả về { ok, cost, n, wet, reason }.
 * Gọi terraformDone() khi nhả chuột để tính lại tài nguyên, ô quy hoạch và mạng lưới.
 */
export function terraform(c, mode, x, y, { size = 1, target = 0, dry = false } = {}) {
  if (!TERRA[mode] || !inMap(x, y)) return { ok: false, cost: 0, reason: 'Ngoài bản đồ' };
  const V = N + 1, s = clamp(size | 0, 1, 6), x0 = x - ((s - 1) >> 1), y0 = y - ((s - 1) >> 1), cx = x0 + s / 2, cy = y0 + s / 2, R = s / 2 + 0.5;
  const plan = [];
  let cost = 0, blocked = 0, locked = 0;
  for (let gy = y0; gy <= y0 + s; gy++) for (let gx = x0; gx <= x0 + s; gx++) {
    if (gx < 1 || gy < 1 || gx > N - 1 || gy > N - 1) continue; // mép bản đồ giữ nguyên cho khớp địa hình bên ngoài
    let free = true, mine = true;
    for (let dy = -1; dy <= 0; dy++) for (let dx = -1; dx <= 0; dx++) {
      const i = idx(gx + dx, gy + dy);
      if (!c.own[i]) mine = false;
      if (c.road[i] || c.occ[i] || c.level[i] || (c.railCell && c.railCell[i]) || (c.tunnelCell && c.tunnelCell[i]) || (c.beach && c.beach[i]) || (c.damCell && c.damCell[i])) free = false;
    }
    if (!mine) { locked++; continue; }
    if (!free) { blocked++; continue; }
    const k = gy * V + gx, h = c.hv[k], w = s >= 3 ? clamp(1.25 - Math.hypot(gx - cx, gy - cy) / R, 0.3, 1) : 1;
    let nh = mode === 'dig' ? h - TERRA_STEP * w : mode === 'raise' ? h + TERRA_STEP * w : mode === 'level' ? h + clamp(target - h, -TERRA_LEVEL_STEP, TERRA_LEVEL_STEP) : Math.min(h, CANAL_BED);
    nh = clamp(nh, TERRA_MIN, Math.max(TERRA_MAX, h));
    const tv = Math.round((nh - c.hv0[k]) * 10);
    if (tv === c.terra[k]) continue;
    cost += Math.abs(c.hv0[k] + tv * 0.1 - h) * TERRA_COST;
    plan.push(k, tv);
  }
  cost = Math.ceil(cost);
  if (!plan.length) return { ok: false, cost: 0, reason: locked && !blocked ? LOCKED : blocked ? 'Không đào đắp được dưới đường, nhà, công trình, đường ray, hầm, bãi biển, thân đập' : mode === 'level' ? 'Chỗ này đã bằng cao độ cần san' : mode === 'canal' ? 'Chỗ này đã là nước' : 'Đã chạm giới hạn độ sâu / độ cao' };
  if (cost > c.money) return { ok: false, cost, reason: 'Không đủ tiền' };
  if (dry) return { ok: true, cost, n: plan.length / 2 };
  for (let p = 0; p < plan.length; p += 2) { c.terra[plan[p]] = plan[p + 1]; c.hv[plan[p]] = vertexH(c, plan[p]); }
  for (let b = y0 - 1; b <= y0 + s; b++) for (let a = x0 - 1; a <= x0 + s; a++) if (inMap(a, b)) cellTerrain(c, a, b);
  const wet = true; // mặt nước giải lại khi nhả chuột (terraformDone)
  cityPay(c, 'build', cost);
  c.terraWet = true;
  c.dirty.terrain = Math.max(c.dirty.terrain | 0, 1); c.dirty.zones = true;
  return { ok: true, cost, n: plan.length / 2, wet };
}

/** Giá đào kênh ra biển cho bến tàu thứ k: { ok, cells, cost } hoặc { ok: false, reason }. */
export function planSeaCanal(c, k) {
  const s = c.services[k];
  if (!s || s.type !== 'ferry') return { ok: false, reason: 'Không phải bến tàu khách' };
  const p = canalToSea(c, s);
  if (p.reason) return { ok: false, reason: p.reason };
  if (p.already) return { ok: false, reason: 'Bến đã thông ra biển', already: true };
  const V = N + 1, verts = new Set();
  for (const i of p.cells) { const x = i % N, y = (i / N) | 0; for (const k2 of [y * V + x, y * V + x + 1, (y + 1) * V + x, (y + 1) * V + x + 1]) verts.add(k2); }
  let cost = 0;
  for (const v of verts) cost += Math.max(0, c.hv[v] - CANAL_BED) * TERRA_COST;
  return { ok: true, cells: p.cells, cost: Math.ceil(cost) };
}

/** Đào kênh nối hồ của bến tàu thứ k ra biển (theo planSeaCanal), rồi dựng lại tuyến tàu. */
export function digSeaCanal(c, k) {
  const p = planSeaCanal(c, k);
  if (!p.ok) return p;
  if (p.cost > c.money) return { ok: false, reason: 'Không đủ tiền', cost: p.cost };
  const m0 = c.money;
  for (const i of p.cells) terraform(c, 'canal', i % N, (i / N) | 0, { size: 1 });
  terraformDone(c);
  c.ferrySig = null; syncFerries(c);
  return { ok: true, cost: m0 - c.money, cells: p.cells.length, open: c.ferryState[c.services[k].uid] === 'sea' };
}

/** Tô (hoặc xoá) bãi biển trong hình chữ nhật, rồi san địa hình cho thoải xuống biển. */
export function paintBeach(c, x0, y0, x1, y1, opts = {}) {
  const r = beachRect(c, x0, y0, x1, y1, opts);
  if (!r.ok || opts.dry || !c.beachTouched) return r;
  const V = N + 1, cells = new Set();
  for (const k of c.beachTouched) {
    c.hv[k] = vertexH(c, k);
    const gx = k % V, gy = (k / V) | 0;
    for (const [a, b] of [[gx - 1, gy - 1], [gx, gy - 1], [gx - 1, gy], [gx, gy]]) if (inMap(a, b)) cells.add(idx(a, b));
  }
  c.beachTouched = null;
  for (const i of cells) cellTerrain(c, i % N, (i / N) | 0);
  c.terraWet = true;
  terraformDone(c);
  recalc(c);
  return r;
}

/** Kết thúc một lượt đào đắp (nhả chuột): tính lại tài nguyên; nếu bờ nước đổi thì tính lại ô quy hoạch, mạng điện nước, ô nhiễm. */
/** Bật / tắt chuyến ra biển cho tuyến tàu nhiều bến (cờ đặt ở bến k; tuyến có một bến bật là chạy ra biển). */
export function setFerrySea(c, k, on) {
  const s = c.services[k];
  if (!s || s.type !== 'ferry') return { ok: false, reason: 'Không phải bến tàu khách' };
  const line = (c.ferries || []).find((l) => l.stops.some((t) => t.uid === s.uid));
  if (on) s.sea = 1; else { delete s.sea; if (line) for (const t of line.stops) { const o = c.services.find((v) => v.uid === t.uid); if (o) delete o.sea; } }
  c.ferrySig = null; syncFerries(c);
  const now = (c.ferries || []).find((l) => l.stops.some((t) => t.uid === s.uid));
  return { ok: true, out: !!(now && now.out), fail: !!(now && now.seaFail) };
}

export function terraformDone(c) {
  c.terraVer = (c.terraVer || 0) + 1; // thác nước, … tính lại theo địa hình mới
  if (c.terraWet) waterSync(c);
  makeResources(c, heightFn(c));
  if (c.terraWet) { c.terraWet = false; roadsChanged(c); computeMaps(c); }
  Object.assign(c.dirty, { terrain: 2, trees: true, roads: true, lines: true, transit: true, zones: true, land: true, services: true });
}

// ───────────────────────── tạo thành phố ─────────────────────────

/**
 * Thành phố mới. opts.size: cỡ bản đồ (MAP_SIZES, mặc định 96), opts.map: kiểu bản đồ (MAPS, mặc định 'river').
 * Đổi cỡ bản đồ cho mọi module, nên cảnh 3D phải dựng lại nếu cỡ khác cỡ đang vẽ.
 */
export function newCity(seed = (Math.random() * 1e9) | 0, opts = {}) {
  setMapSize(opts.size || 96, opts.cell || 10);
  const c = {
    v: 4, tgen: 3, seed, name: 'Phố Mới', style: 'vn', map: MAPS[opts.map] ? opts.map : 'river',
    water: new Uint8Array(N * N), tree: new Uint8Array(N * N),
    zone: new Uint8Array(N * N), level: new Uint8Array(N * N), variant: new Uint8Array(N * N), dir: new Uint8Array(N * N),
    nodes: new Map(), edges: new Map(), nextId: 1, lines: [], rings: [],
    services: [], money: 70000, hour: 6, day: 0, tax: { r: 9, c: 9, i: 9 }, milestone: 0, loans: [], debtHours: 0, over: false,
    tech: new Set(), points: START_POINTS, owned: new Uint8Array(LT * LT), terra: new Int16Array((N + 1) * (N + 1)),
  };
  if (opts.devTree) { c.devTree = 1; c.points += DEV_TREE_BONUS; } // cây công trình: công trình dịch vụ mở bằng điểm
  genLand(c);
  c.start = { x: pickStart(c), y: 7 };
  c.owned.fill(1); // không còn mua đất: cả bản đồ thuộc thành phố từ đầu
  attach(c);
  const a = addNode(c, cellCenter(c.start.x), -HALF + 1), b = addNode(c, cellCenter(c.start.x), cellCenter(7));
  addEdge(c, a, b, 'small');
  roadsChanged(c);
  initEcon(c);
  initSeason(c);
  initCouncil(c);
  initDistricts(c);
  initCorp(c);
  initChain(c);
  initStreet(c);
  initRail(c); c.railCell = railCells(c); c.tunnelCell = tunnelCells(c);
  applyStreet(c);
  computeMaps(c);
  resetLedger(c); resetPop(c); // sổ cái tiền, sổ dân: mốc bảo toàn
  return c;
}

/** Đường cao tốc dẫn vào thành phố từ mép bắc (cũng là cửa ngõ xuất nhập khẩu): chọn cột toàn đất liền gần 0,55·N. */
function pickStart(c) {
  for (let k = 0; k < N; k++) {
    const x = ((N * 0.55) | 0) + (k % 2 ? -1 : 1) * ((k + 1) >> 1);
    if (x < 6 || x >= N - 6) continue;
    let ok = true;
    for (let y = 0; y < 14; y++) for (let d = -4; d <= 4; d++) if (c.water[idx(x + d, y)]) ok = false;
    if (ok) return x;
  }
  return (N * 0.55) | 0;
}

/**
 * Ảnh xem trước một bản đồ (chưa tạo thành phố): RGBA n × n, nước xanh theo độ sâu, đất theo cao độ, có lối vào phía bắc.
 * Đổi tạm cỡ bản đồ rồi trả lại như cũ, nên gọi lúc nào cũng được.
 */
export function mapPreview(seed, kind, size) {
  const prev = N;
  setMapSize(size);
  try {
    const c = { seed, map: MAPS[kind] ? kind : 'river', tgen: 3, water: new Uint8Array(N * N) };
    const f = makeField(seed, c.map);
    for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) if (f(x + 0.5, y + 0.5) < 0.15) c.water[idx(x, y)] = 1;
    c.start = { x: pickStart(c), y: 7 };
    const hf = heightFn(c), px = new Uint8ClampedArray(N * N * 4);
    for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) {
      const i = idx(x, y), o = i * 4;
      let r, g, b;
      if (c.water[i]) { const d = clamp(-f(x + 0.5, y + 0.5) / 6, 0, 1); r = 40 - d * 20; g = 120 - d * 50; b = 190 - d * 40; }
      else {
        const h = hf.height(x + 0.5, y + 0.5), sh = clamp(h / 40, 0, 1);
        if (h > 26) { r = g = b = 150 + sh * 90; }
        else { r = 96 + sh * 90; g = 150 - sh * 30; b = 70 + sh * 40; }
        if (f(x + 0.5, y + 0.5) < 1.3) { r = 214; g = 200; b = 150; } // bãi cát ven nước
      }
      if (Math.abs(x - c.start.x) < 1 && y < 8) { r = 240; g = 200; b = 60; } // lối vào
      px[o] = r; px[o + 1] = g; px[o + 2] = b; px[o + 3] = 255;
    }
    return { n: N, px, start: c.start };
  } finally { setMapSize(prev); }
}

// ───────────────────────── chế độ Open (sáng tạo tự do) ─────────────────────────

/** Điểm thưởng thêm lúc bắt đầu và mỗi mốc dân số khi chơi với cây công trình (để đủ mở các công trình thiết yếu). */
export const DEV_TREE_BONUS = 3;
export const OPEN_MONEY = 999999999;
/** Bật chế độ Open: mở khoá mọi thứ, có cả bản đồ, tiền không giới hạn, không bao giờ phá sản. Không tắt lại được. */
export function enableSandbox(c) {
  c.sandbox = true;
  c.owned.fill(1); syncLand(c);
  for (const t in TECH) c.tech.add(t);
  citySet(c, 'sandbox', OPEN_MONEY); c.debtHours = 0; c.loans = []; c.over = false;
  Object.assign(c.dirty || (c.dirty = {}), { land: true, zones: true });
  recalc(c);
  return c;
}
export const newSandbox = (seed, opts) => enableSandbox(newCity(seed, opts));

function genLand(c) {
  const f = makeField(c.seed, MAPS[c.map] ? c.map : 'river'), seed = c.seed;
  for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) {
    const i = idx(x, y);
    if (f(x + 0.5, y + 0.5) < 0.15) { c.water[i] = 1; continue; }
    const n = vnoise(x * 0.09, y * 0.09, seed + 11), h = hash2(x, y, seed + 13);
    if ((n > 0.6 && h > 0.25) || h > 0.975) c.tree[i] = 1;
  }
}

// ───────────────────────── đất đã mua ─────────────────────────

/** Ô đất (0..LT*LT-1) chứa ô lưới (x, y). */
export const landOf = (x, y) => ((y / LAND) | 0) * LT + ((x / LAND) | 0);

/** Phần đất lúc mới chơi: 3 × 3 ô đất quanh đường dẫn vào, nới thêm tới khi chạm bờ nước (cống xả cần bờ nước). */
function startLand(c) {
  const tx = (c.start.x / LAND) | 0, wet = new Uint8Array(LT * LT);
  for (let i = 0; i < N * N; i++) if (c.water[i]) wet[landOf(i % N, (i / N) | 0)] = 1;
  for (let ty = 0; ty < 3; ty++) for (let dx = -1; dx <= 1; dx++) if (tx + dx >= 0 && tx + dx < LT) c.owned[ty * LT + tx + dx] = 1;
  if (c.owned.some((v, t) => v && wet[t])) return;
  const from = new Int32Array(LT * LT).fill(-2), queue = [];
  c.owned.forEach((v, t) => { if (v) { from[t] = -1; queue.push(t); } });
  for (let q = 0; q < queue.length; q++) {
    const t = queue[q];
    if (wet[t]) { for (let k = t; k >= 0; k = from[k]) c.owned[k] = 1; return; }
    for (const n of landNear(t)) if (from[n] === -2) { from[n] = t; queue.push(n); }
  }
}

function landNear(t) {
  const x = t % LT, y = (t / LT) | 0, out = [];
  if (x > 0) out.push(t - 1); if (x < LT - 1) out.push(t + 1); if (y > 0) out.push(t - LT); if (y < LT - 1) out.push(t + LT);
  return out;
}

/** Chép c.owned (theo ô đất) ra c.own (theo ô lưới) để tra nhanh. */
function syncLand(c) {
  for (let i = 0; i < N * N; i++) c.own[i] = c.owned[landOf(i % N, (i / N) | 0)];
  c.dirty.zones = c.dirty.land = true;
}

export function landPrice(c, t) {
  let have = 0, water = 0;
  for (const v of c.owned) have += v;
  const x0 = (t % LT) * LAND, y0 = ((t / LT) | 0) * LAND;
  for (let dy = 0; dy < LAND; dy++) for (let dx = 0; dx < LAND; dx++) water += c.water[idx(x0 + dx, y0 + dy)];
  const p = (LAND_PRICE.base + LAND_PRICE.step * have) * (1 - 0.5 * water / (LAND * LAND)) * (c.tech.has('landdeal') ? 0.75 : 1);
  return Math.round(p / 100) * 100;
}

export function canBuyLand(c, t) {
  if (!(t >= 0 && t < LT * LT)) return { ok: false, reason: 'Ngoài bản đồ' };
  const price = landPrice(c, t);
  if (c.owned[t]) return { ok: false, reason: 'Ô đất này đã là của thành phố', price };
  if (!landNear(t).some((n) => c.owned[n])) return { ok: false, reason: 'Chỉ mua được ô đất kề phần đất đã có', price };
  if (price > c.money) return { ok: false, reason: 'Không đủ tiền', price };
  return { ok: true, price };
}

export function buyLand(c, t) {
  const r = canBuyLand(c, t);
  if (!r.ok) return r;
  c.owned[t] = 1; cityPay(c, 'land', r.price);
  syncLand(c);
  return r;
}

/** Đập thuỷ điện: thân đập theo vị trí (đặt, dời, nạp lại), công suất theo dòng sông và mùa; ô bị đập chắn (tàu thuyền). */
function hydroSync(c) {
  let any = false, fresh = false;
  for (const s of c.services) {
    if (s.type !== 'hydro') continue;
    any = true;
    const key = `${s.x},${s.y},${s.dir}`;
    if (s.damAt === undefined && s.dam) s.damAt = key; // nạp từ bản lưu: thân đập đã lưu sẵn
    if (s.damAt !== key) { // đặt mới hoặc dời: tính thân đập trên mặt nước khi chưa có đập này
      if (s.dam) { s.dam = null; waterSync(c); }
      attachDam(c, s); fresh = true;
    }
    s.hp = damPower(c, s);
  }
  c.damCell = any ? damCells(c) : null;
  const sig = c.services.filter((s) => s.type === 'hydro' && s.dam).map((s) => s.damAt).join('|');
  if (fresh || sig !== (c._damSig || '')) { // đập mới, dời hoặc phá: hồ chứa dâng hoặc rút theo mực nước giải lại
    c._damSig = sig;
    const before = c.water.slice(), lv0 = c.level.slice();
    waterSync(c);
    let flooded = 0, houses = 0;
    for (let i = 0; i < N * N; i++) if (c.water[i] && !before[i]) { flooded++; if (lv0[i]) houses++; }
    if (flooded && c.events && fresh) c.events.push({ type: 'reservoir', text: `🏞️ Hồ thuỷ điện tích nước: mặt hồ dâng lên, ${flooded} ô đất ven sông ngập thành lòng hồ${houses ? `, ${houses} nhà phải giải toả` : ''}` });
  }
}

/** Đường ray đổi: tính lại ô có ray, ô quy hoạch, mạng lưới; báo cảnh 3D vẽ lại. */
function railChanged(c) {
  c.railCell = railCells(c);
  c.tunnelCell = tunnelCells(c); // không đào đắp trên hầm ray
  for (let i = 0; i < N * N; i++) if (c.railCell[i]) { if (c.level[i]) clearBuilding(c, i); c.zone[i] = 0; c.tree[i] = 0; clearDecor(c, i); }
  c._railNet = null;
  Object.assign(c.dirty, { rail: true, trees: true, zones: true, buildings: true });
}

/**
 * Xây đường ray qua các điểm pts (phẳng [x, z, ...]); a, b: điểm bắt dính railSnap ở hai đầu (ga, cửa khẩu, đầu ray) hoặc null.
 * dry: chỉ lập kế hoạch (giá, chiều dài cầu / hầm, lý do không xây được).
 */
export function buildRail(c, pts, { a = null, b = null, dry = false } = {}) {
  const plan = planRail(c, pts, { a, b });
  if (!plan.ok || dry) return plan;
  const r = addRail(c, plan);
  if (r.cut) { // xẻ đất hai bên ray
    for (let q = 0; q < plan.cuts.length; q += 2) c.hv[plan.cuts[q]] = vertexH(c, plan.cuts[q]);
    for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) cellTerrain(c, x, y);
    c.terraWet = true; terraformDone(c);
  }
  railChanged(c); roadsChanged(c); computeNetworks(c); recalc(c);
  return { ...plan, ...r };
}
export function demolishRail(c, id) { const r = removeRail(c, id); if (r.ok) { railChanged(c); roadsChanged(c); recalc(c); } return r; }

/** Tô (hoặc xoá) thác nước theo ô, rồi tính lại giá đất, sức hút du lịch. */
export function paintFalls(c, x0, y0, x1, y1, opts = {}) {
  if (!opts.erase && !opts.dry && !c.sandbox && !MILESTONES.some((m, k) => k < c.milestone && m.pop >= FALLS.unlock)) return { ok: false, reason: `Thác nước mở khi đạt ${FALLS.unlock} dân` };
  const r = fallsRect(c, x0, y0, x1, y1, opts);
  if (r.ok && !opts.dry) { computeMaps(c); recalc(c); }
  return r;
}

/** Tô (hoặc xoá) trang trí — cây xanh, thảm cỏ, lối đi bộ, bồn hoa — trong hình chữ nhật, rồi tính lại giá đất. */
export function paintDecor(c, x0, y0, x1, y1, kind, opts = {}) {
  const r = decorRect(c, x0, y0, x1, y1, kind, opts);
  if (r.ok && !opts.dry) { computeMaps(c); recalc(c); }
  return r;
}

const LOCKED = 'Đất chưa mua: mở rộng bằng 🧭 Mua đất';
const ownedAt = (c, wx, wz) => c.own[idx(clamp(cellOf(wx), 0, N - 1), clamp(cellOf(wz), 0, N - 1))] === 1;

/** Gắn phần dữ liệu tính lại được (không lưu). */
function attach(c) {
  initReserve(c);
  const mk = () => new Uint8Array(N * N), fl = () => new Float32Array(N * N);
  c.own = mk(); c.bonus = { happy: 0, pull: 0, comm: 0 };
  c.road = mk(); c.alley = mk(); c.beach = c.beach && c.beach.length === N * N ? c.beach : mk(); c.decor = c.decor && c.decor.length === N * N ? c.decor : mk(); c.decorFx = null; c.falls = c.falls && c.falls.length === N * N ? c.falls : mk(); c.fishery = c.fishery && c.fishery.length === N * N ? c.fishery : mk(); c.acc = mk(); c.rdir = mk(); c.cedge = new Int32Array(N * N).fill(-1);
  c.pOk = mk(); c.wOk = mk(); c.sOk = mk();
  c.age = new Uint16Array(N * N);
  c.occ = new Int16Array(N * N);
  c.landValue = fl().fill(30);
  c.pollution = fl(); c.air = fl(); c.ground = fl(); c.noise = fl(); c.waterPol = fl();
  c.cover = { park: fl(), police: fl(), fire: fl(), health: fl(), edu: fl(), trash: fl(), care: fl(), death: fl(), sci: fl(), watch: fl(), shelter: fl(), flood: fl(), levee: fl() };
  c.crime = fl(); c.gloom = fl();
  c.dirty = { roads: true, buildings: true, trees: true, zones: true, services: true, lines: true, transit: true, fx: true, land: true, decor: true, terrain: 0 };
  syncLand(c);
  c.events = [];
  c.research = c.research || 0; c.prisoners = c.prisoners || 0;
  c.stats = { pop: 0, jobs: 0, housing: 0, workers: 0, employed: 0, powerCap: 0, powerUse: 0, waterCap: 0, waterUse: 0, sewCap: 0, trashCap: 0, trashUse: 0, noPower: 0, noWater: 0, income: 0, expense: 0, roadLen: 0, happy: 55, exp: { roads: 0, power: 0, water: 0, trash: 0, park: 0, civic: 0, transit: 0, loans: 0 }, inc: { r: 0, c: 0, i: 0, t: 0 }, none: {}, tight: {} };
  c.demand = { r: 0.6, c: 0.2, i: 0.2, o: 0, x: 0.6 };
  c.rng = mulberry32(c.seed ^ Math.imul(c.hour + 1, 2654435761));
  c.adj = new Map();
  c.clock = 0; c.hourSec = HOUR_SEC; c.day = Math.floor(c.hour / 24);
  c.hourInc = { r: 0, c: 0, i: 0 }; c.fareSeen = 0;
  c.entry = { x: cellCenter(c.start.x), z: -HALF + 1 };
  c.fn = { corpNote, corpPayWare, corpFlow, corpPrice, investorFound, trimStaff, watchLayoff, computeMaps, saleIncome, zoneRect, clearBuilding, cellHappy, die, syncHalls, moveHall, distBuildPlan, distBuild, procure, wageAt, householdPay, removeCitizen, contract, tradeUse, saleIncome };
  c.onArrive = onArrive; c.onTourists = touristSpend;
  for (const s of c.services) if (!s.uid) s.uid = c.nextId++;
  initTraffic(c); initPeople(c); initTransit(c); initIncidents(c);
  makeTerrain(c);
  if (c.tgen >= 3) forestMountains(c);
  rebuildOcc(c);
  return c;
}

/** Bản đồ đời 3: rừng phủ sườn núi (núi Việt Nam phần lớn có rừng); vách quá dốc thưa cây hơn. Chỉ chạy khi tạo thành phố mới. */
function forestMountains(c) {
  const hf = heightFn(c);
  for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) {
    const i = idx(x, y), m = hf.mount(x + 0.5, y + 0.5);
    if (c.water[i] || m < 3 || Math.abs(x - c.start.x) + y < 12) continue;
    if (hash2(x, y, c.seed + 77) < (c.steep[i] ? 0.35 : 0.8) * clamp((m - 3) / 6, 0.3, 1)) c.tree[i] = 1;
  }
}

function rebuildOcc(c) {
  c.occ.fill(0);
  c.services.forEach((s, k) => {
    const sz = SERVICES[s.type].size;
    for (let dy = 0; dy < sz; dy++) for (let dx = 0; dx < sz; dx++) c.occ[idx(s.x + dx, s.y + dy)] = k + 1;
  });
}

// ───────────────────────── graph đường ─────────────────────────

const bez = (ax, az, cx, cz, bx, bz, t) => { const u = 1 - t; return [u * u * ax + 2 * u * t * cx + t * t * bx, u * u * az + 2 * u * t * cz + t * t * bz]; };

function addNode(c, x, z) {
  const id = c.nextId++;
  c.nodes.set(id, { id, x, z });
  return id;
}

function sampleCurve(ax, az, cx, cz, bx, bz, step) {
  const approx = Math.hypot(cx - ax, cz - az) + Math.hypot(bx - cx, bz - cz);
  const n = clamp(Math.ceil(approx / step), 2, 96), pts = new Float32Array((n + 1) * 2);
  for (let k = 0; k <= n; k++) { const p = bez(ax, az, cx, cz, bx, bz, k / n); pts[k * 2] = p[0]; pts[k * 2 + 1] = p[1]; }
  return pts;
}

function measure(pts) {
  const n = pts.length / 2, cum = new Float32Array(n);
  for (let k = 1; k < n; k++) cum[k] = cum[k - 1] + Math.hypot(pts[k * 2] - pts[k * 2 - 2], pts[k * 2 + 1] - pts[k * 2 - 1]);
  return cum;
}

/** Thêm đoạn đường giữa hai nút; (cx, cz) là điểm điều khiển, bỏ trống = đường thẳng. */
function addEdge(c, a, b, type, cx, cz) {
  const A = c.nodes.get(a), B = c.nodes.get(b);
  if (cx == null) { cx = (A.x + B.x) / 2; cz = (A.z + B.z) / 2; }
  const e = { id: c.nextId++, a, b, type, cx, cz };
  e.pts = sampleCurve(A.x, A.z, cx, cz, B.x, B.z, 4);
  e.cum = measure(e.pts); e.len = e.cum[e.cum.length - 1];
  c.edges.set(e.id, e);
  return e;
}

const edgePoint = (c, e, t) => { const A = c.nodes.get(e.a), B = c.nodes.get(e.b); return bez(A.x, A.z, e.cx, e.cz, B.x, B.z, t); };

/** Điểm điều khiển của đoạn con [t0, t1] trên một Bezier bậc 2. */
function subCtrl(ax, az, cx, cz, bx, bz, t0, t1) {
  const wa = (1 - t0) * (1 - t1), wc = t0 * (1 - t1) + t1 * (1 - t0), wb = t0 * t1;
  return [wa * ax + wc * cx + wb * bx, wa * az + wc * cz + wb * bz];
}

function rebuildAdj(c) {
  c.adj = new Map();
  for (const id of c.nodes.keys()) c.adj.set(id, []);
  for (const e of c.edges.values()) { c.adj.get(e.a).push(e.id); c.adj.get(e.b).push(e.id); }
}

function edgeBetween(c, n1, n2) {
  for (const e of c.edges.values()) if ((e.a === n1 && e.b === n2) || (e.a === n2 && e.b === n1)) return e;
  return null;
}

/** Đoạn đường dưới điểm (x, z), hoặc null. */
export function edgeAt(c, x, z, slack = 1) {
  let best = null, bd = Infinity;
  for (const e of c.edges.values()) {
    const r = nearestOnEdge(e, x, z), lim = ROADS[e.type].w / 2 + slack;
    if (r.d < lim && r.d < bd) { bd = r.d; best = e; }
  }
  return best;
}

/**
 * Bắt điểm khi vẽ đường (kiểu Cities: Skylines): ưu tiên nút giao gần đó, rồi thân đường khác, rồi hướng dẫn góc từ điểm đầu
 * (nối thẳng tiếp đường cũ, vuông góc, song song, trục bản đồ, 45°), rồi lưới ô.
 * from: điểm đầu đang vẽ (kết quả snapPoint trước) để bắt góc. Trả về { x, z, node?, edge?, t?, guide?, len? }.
 */
export function snapPoint(c, x, z, { grid = true, type = 'small', from = null, h = null } = {}) {
  // h: độ cao đang vẽ (độ cao tuỳ chỉnh) — chỉ bắt vào nút / đường ở gần độ cao đó (vòng xoắn ốc không bắt nhầm vòng dưới)
  const myW = (ROADS[type] || ROADS.small).w, far = (v) => h != null && Math.abs(v - h) >= ELEV.clear;
  let bn = null, bd = Math.max(11, myW * 0.55 + 6);
  for (const n of c.nodes.values()) { const d = Math.hypot(n.x - x, n.z - z); if (d < bd && !(from && from.node === n.id) && !far(nodeH(c, n.id))) { bd = d; bn = n; } }
  if (bn) return { x: bn.x, z: bn.z, node: bn.id };
  // cổng ra ngoài thành phố ở mép bản đồ: bám vào để nối lại đường cao tốc khi đã lỡ phá
  if (c.entry && Math.hypot(c.entry.x - x, c.entry.z - z) < 16) return { x: c.entry.x, z: c.entry.z, entry: true };
  let be = null, br = null;
  for (const e of c.edges.values()) {
    if (from && from.edge === e.id) continue;
    const r = nearestOnEdge(e, x, z);
    if (r.d < (ROADS[e.type].w + myW) / 2 + 1.5 && (!br || r.d < br.d) && !(h != null && far(ROADS[e.type].elevated ? liftAt(c, e, r.along) : 0))) { br = r; be = e; }
  }
  if (be) {
    // gần đầu mút thì dùng luôn nút ở đầu đó (tránh đoạn đường cụt vài mét)
    const near = Math.max(10, myW * 0.6);
    if (br.t * be.len < near && !far(nodeH(c, be.a))) { const n = c.nodes.get(be.a); return { x: n.x, z: n.z, node: n.id }; }
    if ((1 - br.t) * be.len < near && !far(nodeH(c, be.b))) { const n = c.nodes.get(be.b); return { x: n.x, z: n.z, node: n.id }; }
    return { x: br.x, z: br.z, edge: be.id, t: br.t };
  }
  const lim = HALF - 2;
  const g = from ? guideSnap(c, from, x, z, grid) : null;
  if (g) return { x: clamp(g.x, -lim, lim), z: clamp(g.z, -lim, lim), guide: g.guide, len: g.len };
  if (grid) {
    if (myW > 15) { x = Math.round((x + HALF) / T) * T - HALF; z = Math.round((z + HALF) / T) * T - HALF; } // đại lộ bám mép ô
    else { x = cellCenter(cellOf(x)); z = cellCenter(cellOf(z)); }
  }
  return { x: clamp(x, -lim, lim), z: clamp(z, -lim, lim) };
}

export const GUIDE_NAMES = { cont: 'nối thẳng', perp: 'vuông góc', par: 'song song', axis: 'thẳng trục', d45: 'chéo 45°' };

/**
 * Hướng dẫn góc từ điểm đầu `from`: lệch dưới ~6° so với một hướng gợi ý thì kéo con trỏ vào đúng hướng đó
 * (bám lưới thì độ dài làm tròn theo bội số 1 ô). Trả về { x, z, guide, len } hoặc null.
 */
export function guideSnap(c, from, x, z, grid = true) {
  const dx = x - from.x, dz = z - from.z, L = Math.hypot(dx, dz);
  if (L < 12) return null;
  const dirs = []; // [ux, uz, kiểu]
  const push = (ux, uz, kind) => { const l = Math.hypot(ux, uz); if (l > 1e-6) dirs.push([ux / l, uz / l, kind]); };
  if (from.node != null && c.nodes.has(from.node)) {
    for (const id of c.adj.get(from.node) || []) {
      const e = c.edges.get(id); if (!e) continue;
      const p = e.pts, m = p.length / 2 - 1, atA = e.a === from.node;
      const tx = atA ? p[2] - p[0] : p[m * 2 - 2] - p[m * 2], tz = atA ? p[3] - p[1] : p[m * 2 - 1] - p[m * 2 + 1]; // hướng đi vào đường cũ
      push(-tx, -tz, 'cont'); push(-tz, tx, 'perp'); push(tz, -tx, 'perp');
    }
  } else if (from.edge != null && c.edges.has(from.edge)) {
    const e = c.edges.get(from.edge), r = nearestOnEdge(e, from.x, from.z), pe = pointAt(e.pts, e.cum, r.along);
    push(-pe[3], pe[2], 'perp'); push(pe[3], -pe[2], 'perp'); push(pe[2], pe[3], 'par'); push(-pe[2], -pe[3], 'par');
  }
  for (let k = 0; k < 8; k++) { const a = (k * Math.PI) / 4; push(Math.cos(a), Math.sin(a), k % 2 ? 'd45' : 'axis'); }
  const ux = dx / L, uz = dz / L, tol = Math.cos((6 * Math.PI) / 180);
  let best = null, bc = tol;
  let bs = -1; // hướng theo đường cũ (nối thẳng, vuông góc, song song) được ưu tiên hơn trục bản đồ khi cùng khớp
  for (const d of dirs) { const cs = ux * d[0] + uz * d[1]; if (cs < tol) continue; const sc = cs + (d[2] === 'axis' || d[2] === 'd45' ? 0 : 0.004); if (sc > bs) { bs = sc; bc = cs; best = d; } }
  if (!best) return null;
  let len = L * bc;
  if (grid) len = Math.max(T, Math.round(len / T) * T);
  return { x: from.x + best[0] * len, z: from.z + best[1] * len, guide: best[2], len };
}

function segInt(ax, az, bx, bz, cx, cz, dx, dz) {
  const rx = bx - ax, rz = bz - az, sx = dx - cx, sz = dz - cz, den = rx * sz - rz * sx;
  if (Math.abs(den) < 1e-9) return null;
  const t = ((cx - ax) * sz - (cz - az) * sx) / den, u = ((cx - ax) * rz - (cz - az) * rx) / den;
  return t >= 0 && t <= 1 && u >= 0 && u <= 1 ? { t, u } : null;
}

/** Nửa bề rộng đường tính để chặn ô: ô nhỏ (thành phố mới) cho vỉa hè lấn mép lô đất tới 1,8 m, khỏi mất cả hàng ô vì vài chục phân. */
const blockHalf = (half) => (T < 10 ? Math.max(T / 2, half - 1.8) : half);

/** Duyệt các ô bị một polyline rộng `half` đè lên (để chặn xây / dỡ nhà). */
function cellsUnder(pts, half, fn) {
  const n = pts.length / 2 - 1, seen = new Set();
  for (let k = 0; k < n; k++) {
    const x0 = pts[k * 2], z0 = pts[k * 2 + 1], x1 = pts[k * 2 + 2], z1 = pts[k * 2 + 3];
    const l = Math.hypot(x1 - x0, z1 - z0) || 1, ext = (T / 2) * (Math.abs((z1 - z0) / l) + Math.abs((x1 - x0) / l)), lim = blockHalf(half) + ext - 0.6;
    const cx0 = Math.max(0, cellOf(Math.min(x0, x1) - lim)), cx1 = Math.min(N - 1, cellOf(Math.max(x0, x1) + lim));
    const cy0 = Math.max(0, cellOf(Math.min(z0, z1) - lim)), cy1 = Math.min(N - 1, cellOf(Math.max(z0, z1) + lim));
    for (let y = cy0; y <= cy1; y++) for (let x = cx0; x <= cx1; x++) {
      const i = idx(x, y);
      if (seen.has(i)) continue;
      if (distSeg(cellCenter(x), cellCenter(y), x0, z0, x1, z1).d < lim) { seen.add(i); fn(i); }
    }
  }
}

function pathCost(c, pts, perUnit, mult = 1) {
  let cost = 0;
  const n = pts.length / 2 - 1;
  for (let k = 0; k < n; k++) {
    const l = Math.hypot(pts[k * 2 + 2] - pts[k * 2], pts[k * 2 + 3] - pts[k * 2 + 1]);
    cost += l * perUnit * (isWaterAt(c, (pts[k * 2] + pts[k * 2 + 2]) / 2, (pts[k * 2 + 1] + pts[k * 2 + 3]) / 2) ? BRIDGE_MULT * mult : 1);
  }
  return Math.round(cost);
}

/**
 * Tính trước một đoạn đường sắp vẽ: a, b là kết quả snapPoint; ctrl = điểm điều khiển (đường cong) hoặc null.
 * Tự tìm chỗ cắt đường khác để tạo nút giao. Trả về { ok, reason, cost, pts, len, stops, ... }.
 */
export function planRoad(c, { a, b, ctrl = null, type = 'small', bridge = 'auto', elev = null }) {
  // elev = { a, b }: vẽ với độ cao tuỳ chỉnh (m so với mặt đất) cho đầu tự do; đầu bắt vào nút / đường có sẵn lấy độ cao của chỗ đó
  let hA = 0, hB = 0, custom = false;
  if (elev && LEVEL_CHAIN.includes(type) && type !== 'tunnel') {
    hA = snapHeight(c, a) ?? (+elev.a || 0); hB = snapHeight(c, b) ?? (+elev.b || 0);
    if (Math.max(hA, hB) > 0.05 && Math.min(hA, hB) >= -0.05) { custom = true; type = elevType(Math.max(hA, hB)); }
  }
  const def = ROADS[type];
  if (!BRIDGES[bridge] || (def && def.elevated)) bridge = 'auto';
  if (!def) return { ok: false, reason: 'Không có loại đường này' };
  if (!roadUnlocked(c, type)) return { ok: false, reason: `${def.name}: mở khi đạt ${def.unlock} dân` };
  const fix = (s) => {
    if (s.node != null && c.nodes.has(s.node)) { const n = c.nodes.get(s.node); return { x: n.x, z: n.z, node: s.node }; }
    if (s.edge != null && c.edges.has(s.edge)) return { x: s.x, z: s.z, edge: s.edge, te: s.t };
    return { x: s.x, z: s.z };
  };
  const A = fix(a), B = fix(b);
  const cx = ctrl ? ctrl.x : (A.x + B.x) / 2, cz = ctrl ? ctrl.z : (A.z + B.z) / 2;
  const pts = sampleCurve(A.x, A.z, cx, cz, B.x, B.z, 2.5), n = pts.length / 2 - 1, cum = measure(pts), len = cum[n];
  const out = { ok: false, pts, len, type, cost: 0, A, B, cx, cz, bridge, custom, hA, hB };
  if (len < 8 || (A.node != null && A.node === B.node)) return { ...out, reason: 'Đoạn quá ngắn' };
  if (custom && Math.max(hA, hB) > ELEV.max + 0.01) return { ...out, reason: `Cao nhất ${ELEV.max} m` };
  if (custom && Math.abs(hB - hA) / len > ELEV.grade + 1e-6) return { ...out, reason: `Dốc ${Math.round((Math.abs(hB - hA) / len) * 100)}%, tối đa ${Math.round(ELEV.grade * 100)}%: kéo nhịp dài thêm (≥ ${Math.ceil(Math.abs(hB - hA) / ELEV.grade)} m) hoặc đổi độ cao ít hơn` };
  for (let k = 0; k <= n; k++) if (Math.abs(pts[k * 2]) > HALF - 1 || Math.abs(pts[k * 2 + 1]) > HALF - 1) return { ...out, reason: 'Ra ngoài bản đồ' };
  for (let k = 0; k <= n; k++) if (!ownedAt(c, pts[k * 2], pts[k * 2 + 1])) return { ...out, reason: LOCKED };
  out.cost = pathCost(c, pts, def.cost, BRIDGES[bridge].mult);

  const stops = [{ t: 0, ...A }, { t: 1, ...B }];
  const touches = (s, e) => s.edge === e.id || s.node === e.a || s.node === e.b;
  let minX = Infinity, maxX = -Infinity, minZ = Infinity, maxZ = -Infinity;
  for (let k = 0; k <= n; k++) { minX = Math.min(minX, pts[k * 2]); maxX = Math.max(maxX, pts[k * 2]); minZ = Math.min(minZ, pts[k * 2 + 1]); maxZ = Math.max(maxZ, pts[k * 2 + 1]); }
  // độ cao dự kiến của đoạn mới: hai đầu ở độ cao nút sẽ thành (nút có nhánh mặt đất thì ở mặt đất), giữa ở độ cao tầng
  const H = lvlH(roadLvl(type)), endH = (s) => {
    const lv = [roadLvl(type)];
    if (s.node != null) for (const id of c.adj.get(s.node) || []) lv.push(roadLvl(c.edges.get(id).type));
    else if (s.edge != null) { const t = roadLvl(c.edges.get(s.edge).type); lv.push(t, t); } else return 0;
    if (lv.includes(0)) return 0;
    return lvlH(lv.reduce((a, b) => (Math.abs(b) < Math.abs(a) ? b : a)));
  };
  // độ dốc ở hai đầu đoạn tuỳ chỉnh: nối thẳng vào một đoạn tuỳ chỉnh khác thì khớp dốc (liền mạch), nút đường thường thì phẳng
  const endSlope = (S, atA) => {
    const chord = (hB - hA) / len;
    if (S.node == null) return S.edge != null ? 0 : chord;
    const list = c.adj.get(S.node) || [];
    if (list.length !== 1) return 0;
    const o = c.edges.get(list[0]);
    if (!o.ch) return 0;
    const far = nodeH(c, o.a === S.node ? o.b : o.a), L = len + o.len;
    return atA ? (hB - far) / L : (far - hA) / L;
  };
  const mA = custom ? endSlope(A, true) : 0, mB = custom ? endSlope(B, false) : 0;
  const rA = endH(A), rB = endH(B), myH = (s) => {
    if (custom) return clamp(hermite(hA, hB, mA, mB, len, clamp(s / len, 0, 1)), Math.min(hA, hB) - 0.5, Math.max(hA, hB) + 0.5);
    if (!H) return 0;
    const va = rA + (H - rA) * rampAt(s, H - rA), vb = rB + (H - rB) * rampAt(len - s, H - rB);
    return Math.abs(va - H) >= Math.abs(vb - H) ? va : vb;
  };
  if (H || custom) { out.lift = new Float32Array(n + 1); for (let k = 0; k <= n; k++) out.lift[k] = myH(cum[k]); } // độ cao mặt đường dọc tuyến (xem trước cầu / hầm)
  for (const e of c.edges.values()) {
    if (custom || e.ch) {
      // độ cao tuỳ chỉnh: so độ cao thật ở chỗ giao — cách đủ xa thì bắc qua nhau, bằng nhau thì thành nút giao, lưng chừng thì không làm được
      const q = e.pts, m = q.length / 2 - 1, Na = c.nodes.get(e.a), Nb = c.nodes.get(e.b), found = [];
      for (let k = 0; k < n; k++) for (let j = 0; j < m; j++) {
        const r = segInt(pts[k * 2], pts[k * 2 + 1], pts[k * 2 + 2], pts[k * 2 + 3], q[j * 2], q[j * 2 + 1], q[j * 2 + 2], q[j * 2 + 3]);
        if (!r) continue;
        const ux = pts[k * 2 + 2] - pts[k * 2], uz = pts[k * 2 + 3] - pts[k * 2 + 1], wx = q[j * 2 + 2] - q[j * 2], wz = q[j * 2 + 3] - q[j * 2 + 1];
        if (Math.abs(ux * wz - uz * wx) < 0.42 * Math.hypot(ux, uz) * Math.hypot(wx, wz)) continue;
        const x = pts[k * 2] + ux * r.t, z = pts[k * 2 + 1] + uz * r.t, te = (j + r.u) / m;
        if ((Math.hypot(x - A.x, z - A.z) < 9 && touches(A, e)) || (Math.hypot(x - B.x, z - B.z) < 9 && touches(B, e))) continue;
        if (found.some((o) => Math.abs(o - te) * e.len < 6)) continue;
        found.push(te);
        const h1 = myH(cum[k] + (cum[k + 1] - cum[k]) * r.t), h2 = liftAt(c, e, e.cum[j] + (e.cum[j + 1] - e.cum[j]) * r.u), dh = Math.abs(h1 - h2);
        if (dh >= ELEV.clear) continue; // bắc qua / chui dưới
        if (dh > ELEV.join || roadLvl(e.type) < 0) return { ...out, reason: `Chỗ giao với ${ROADS[e.type].name.toLowerCase()} lệch ${dh.toFixed(1)} m: cao / thấp hơn ít nhất ${ELEV.clear} m để bắc qua, hoặc cùng độ cao để nối` };
        const tn = (k + r.t) / n;
        if (Math.hypot(x - Na.x, z - Na.z) < 11) stops.push({ t: tn, x: Na.x, z: Na.z, node: e.a, h: h2 });
        else if (Math.hypot(x - Nb.x, z - Nb.z) < 11) stops.push({ t: tn, x: Nb.x, z: Nb.z, node: e.b, h: h2 });
        else stops.push({ t: tn, x, z, edge: e.id, te, h: h2 });
      }
      continue;
    }
    if (!sameLevel(type, e.type)) {
      // khác tầng thì đi qua nhau, trừ khi chỗ gặp nằm trên đoạn dốc lên / xuống (hai mặt đường còn sát nhau)
      if (H || roadLvl(e.type)) {
        const q = e.pts, m = q.length / 2 - 1;
        for (let k = 0; k < n; k++) for (let j = 0; j < m; j++) {
          const r = segInt(pts[k * 2], pts[k * 2 + 1], pts[k * 2 + 2], pts[k * 2 + 3], q[j * 2], q[j * 2 + 1], q[j * 2 + 2], q[j * 2 + 3]);
          if (!r) continue;
          // hai đoạn gần song song (chạy dọc theo nhau): không phải chỗ cắt ngang, phần chồng lên nhau xét riêng ở dưới
          const ux = pts[k * 2 + 2] - pts[k * 2], uz = pts[k * 2 + 3] - pts[k * 2 + 1], wx = q[j * 2 + 2] - q[j * 2], wz = q[j * 2 + 3] - q[j * 2 + 1];
          if (Math.abs(ux * wz - uz * wx) < 0.42 * Math.hypot(ux, uz) * Math.hypot(wx, wz)) continue;
          const x = pts[k * 2] + (pts[k * 2 + 2] - pts[k * 2]) * r.t, z = pts[k * 2 + 1] + (pts[k * 2 + 3] - pts[k * 2 + 1]) * r.t;
          if ((Math.hypot(x - A.x, z - A.z) < 9 && touches(A, e)) || (Math.hypot(x - B.x, z - B.z) < 9 && touches(B, e))) continue;
          const h1 = myH(cum[k] + (cum[k + 1] - cum[k]) * r.t), h2 = liftAt(c, e, e.cum[j] + (e.cum[j + 1] - e.cum[j]) * r.u);
          if (Math.abs(h1 - h2) < 4) return { ...out, reason: 'Chỗ giao nằm trên dốc lên xuống của cầu / hầm: hai mặt đường còn sát nhau, hãy cho chúng gặp nhau xa đầu dốc hơn' };
        }
      }
      continue; // khác tầng: cầu bắc qua / hầm chui qua, không tạo nút giao
    }
    const q = e.pts, m = q.length / 2 - 1, Na = c.nodes.get(e.a), Nb = c.nodes.get(e.b);
    let ex0 = Infinity, ex1 = -Infinity, ez0 = Infinity, ez1 = -Infinity;
    for (let j = 0; j <= m; j++) { ex0 = Math.min(ex0, q[j * 2]); ex1 = Math.max(ex1, q[j * 2]); ez0 = Math.min(ez0, q[j * 2 + 1]); ez1 = Math.max(ez1, q[j * 2 + 1]); }
    if (ex0 > maxX || ex1 < minX || ez0 > maxZ || ez1 < minZ) continue;
    const found = [];
    for (let k = 0; k < n; k++) for (let j = 0; j < m; j++) {
      const r = segInt(pts[k * 2], pts[k * 2 + 1], pts[k * 2 + 2], pts[k * 2 + 3], q[j * 2], q[j * 2 + 1], q[j * 2 + 2], q[j * 2 + 3]);
      if (!r) continue;
      const x = pts[k * 2] + (pts[k * 2 + 2] - pts[k * 2]) * r.t, z = pts[k * 2 + 1] + (pts[k * 2 + 3] - pts[k * 2 + 1]) * r.t, te = (j + r.u) / m;
      if ((Math.hypot(x - A.x, z - A.z) < 9 && touches(A, e)) || (Math.hypot(x - B.x, z - B.z) < 9 && touches(B, e))) continue;
      if (found.some((o) => Math.abs(o.te - te) * e.len < 6)) continue;
      found.push({ te });
      const tn = (k + r.t) / n;
      if (Math.hypot(x - Na.x, z - Na.z) < 11) stops.push({ t: tn, x: Na.x, z: Na.z, node: e.a }); // sát nút có sẵn: nhập vào nút đó, khỏi tạo hai ngã tư dính nhau
      else if (Math.hypot(x - Nb.x, z - Nb.z) < 11) stops.push({ t: tn, x: Nb.x, z: Nb.z, node: e.b });
      else stops.push({ t: tn, x, z, edge: e.id, te });
    }
  }
  stops.sort((p, q) => p.t - q.t);
  // bỏ điểm dừng trùng nút liền nhau
  const uniq = [];
  for (const s of stops) { const last = uniq[uniq.length - 1]; if (last && s.node != null && last.node === s.node) continue; uniq.push(s); }
  // đầu tự do vượt quá đường kia vài mét (lỡ tay kéo quá): cắt bỏ đoạn cụt, dừng ngay ở nút giao
  const free = (s) => s.node == null && s.edge == null;
  if (uniq.length > 2 && free(uniq[0]) && (uniq[1].t - uniq[0].t) * len < 12) uniq.shift();
  if (uniq.length > 2 && free(uniq[uniq.length - 1]) && (uniq[uniq.length - 1].t - uniq[uniq.length - 2].t) * len < 12) uniq.pop();
  out.stops = uniq;
  if (uniq.length < 2) return { ...out, reason: 'Đoạn quá ngắn' };

  // chạy trùng / song song sát đường khác, hoặc cắt góc quá hẹp
  let over = 0;
  for (let k = 1; k < n; k++) {
    const x = pts[k * 2], z = pts[k * 2 + 1];
    let near = Infinity;
    for (const s of uniq) near = Math.min(near, Math.hypot(s.x - x, s.z - z));
    if (near < 14) continue;
    // tim đường gần như trùng nhau, hoặc ở xa chỗ giao mà hai mặt đường vẫn đè lên nhau
    for (const e of c.edges.values()) { const ne = nearestOnEdge(e, x, z); if (custom || e.ch) { if (Math.abs(myH(cum[k]) - liftAt(c, e, ne.along)) >= ELEV.clear) continue; } else if (!sameLevel(type, e.type)) continue; const d = ne.d; if (d < 4 || (near > 40 && d < (ROADS[e.type].w + def.w) / 2 - 1)) { over += cum[k] - cum[k - 1]; break; } }
  }
  if (over > 7) return { ...out, reason: 'Trùng hoặc quá sát đường khác' };
  // chạy dọc chồng lên đường khác tầng (cầu vượt giữa đại lộ): chỉ được khi bên dưới là đại lộ đủ rộng, trụ cầu đứng ở dải phân cách
  const stack = stackedOver(c, type, pts, cum, custom ? myH : null);
  if (stack.len > 6) {
    if (roadLvl(type) < 0) return { ...out, reason: 'Hầm chui chưa chạy dọc dưới lòng đường được: cho hầm cắt ngang đường, hoặc làm cầu vượt giữa đại lộ' };
    if (stack.upper) return { ...out, reason: 'Hai cầu khác tầng không chạy chồng dọc lên nhau được: cho chúng cắt chéo nhau' };
    if (stack.narrow) return { ...out, reason: `Cầu vượt chạy dọc phía trên đường chỉ làm được trên ${ROADS.large.name.toLowerCase()} (trụ cầu ở dải phân cách, hai bên vẫn có làn xe): hãy nâng cấp đường bên dưới trước` };
  }
  const wet = !custom && tunnelWetCheck(c, type, pts, cum, myH);
  if (wet) { // hầm qua sông: tự đắp cửa hầm, nạo vét lòng sông thay vì từ chối
    const fix = tunnelFix(c, type, pts, cum, myH);
    if (!fix.ok) return { ...out, reason: fix.reason };
    out.fix = fix; out.cost += fix.cost;
  }
  let blocked = false;
  cellsUnder(pts, def.w / 2, (i) => { if (c.occ[i]) blocked = true; });
  if (blocked) return { ...out, reason: 'Vướng công trình, hãy san ủi trước' };
  if (out.cost > c.money) return { ...out, reason: 'Không đủ tiền' };
  return { ...out, ok: true };
}

/**
 * Đất bị bỏ sót khi vẽ đường: ô đất trống không có mặt tiền nằm trong dải hẹp (≤ 4 ô) kẹp giữa dãy ô mặt tiền / mặt đường
 * và vật cản (dãy mặt tiền khác, sông, dốc, mép bản đồ) — hẹp quá không chen thêm được một con đường. Uint8Array 0/1.
 */
export function landGaps(c) {
  const out = new Uint8Array(N * N);
  const empty = (i) => !c.acc[i] && !c.road[i] && !c.water[i] && !c.steep[i] && !c.occ[i] && !c.level[i] && !(c.decor && c.decor[i]) && !(c.beach && c.beach[i]) && !(c.falls && c.falls[i]) && !(c.railCell && c.railCell[i]);
  const served = (i) => c.acc[i] > 0 || c.road[i];
  for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) {
    const i = idx(x, y);
    if (!empty(i)) continue;
    for (const [dx, dy] of [[1, 0], [0, 1]]) {
      let dl = 0, dr = 0, sl = false, sr = false;
      for (let k = 1; k <= 5; k++) { const a = x - dx * k, b = y - dy * k; if (!inMap(a, b)) { dl = k; break; } const j = idx(a, b); if (!empty(j)) { dl = k; sl = served(j); break; } }
      for (let k = 1; k <= 5; k++) { const a = x + dx * k, b = y + dy * k; if (!inMap(a, b)) { dr = k; break; } const j = idx(a, b); if (!empty(j)) { dr = k; sr = served(j); break; } }
      if (dl && dr && dl + dr - 1 <= 4 && (sl || sr)) { out[i] = 1; break; }
    }
  }
  return out;
}

/**
 * Xem trước ảnh hưởng của đoạn đường sắp vẽ lên lưới ô (như vùng quy hoạch hiện dọc đường trong Cities: Skylines):
 * gain = ô đất trống sẽ có mặt tiền (thêm đất xây nhà), lose = ô có nhà / trang trí sẽ bị giải toả dưới mặt đường.
 */
export function roadPreview(c, plan) {
  const gain = [], lose = [];
  if (!plan || !plan.pts) return { gain, lose };
  const def = ROADS[plan.type] || ROADS.small, half = def.w / 2, under = new Set();
  cellsUnder(plan.pts, half, (i) => { under.add(i); if (c.level[i] || (c.decor && c.decor[i]) || (c.zone[i] && !c.road[i])) lose.push(i); });
  if (!def.elevated) {
    const p = plan.pts, n = p.length / 2 - 1, seen = new Set();
    for (let k = 0; k < n; k++) {
      const x0 = p[k * 2], z0 = p[k * 2 + 1], x1 = p[k * 2 + 2], z1 = p[k * 2 + 3], reach = half + 2 * T + 1;
      for (let y = Math.max(0, cellOf(Math.min(z0, z1) - reach)); y <= Math.min(N - 1, cellOf(Math.max(z0, z1) + reach)); y++)
        for (let x = Math.max(0, cellOf(Math.min(x0, x1) - reach)); x <= Math.min(N - 1, cellOf(Math.max(x0, x1) + reach)); x++) {
          const i = idx(x, y);
          if (seen.has(i) || under.has(i)) continue;
          if (distSeg(cellCenter(x), cellCenter(y), x0, z0, x1, z1).d - half >= 2 * T + 0.5) continue;
          seen.add(i);
          if (!c.acc[i] && !c.road[i] && !c.water[i] && !c.occ[i] && !c.steep[i] && c.own[i]) gain.push(i);
        }
    }
  }
  return { gain, lose };
}

/**
 * Phần đoạn mới (đường khác tầng) chạy dọc chồng lên đường có sẵn: { len, narrow (đường bên dưới hẹp hơn đại lộ), upper (chồng lên đường trên cao / hầm khác) }.
 * Chồng = điểm mẫu nằm trong lòng đường kia và hướng gần song song (lệch dưới 25°).
 */
function stackedOver(c, type, pts, cum, hFn = null) {
  const L = roadLvl(type), res = { len: 0, narrow: false, upper: false };
  if (!L) return res;
  const n = pts.length / 2 - 1;
  for (let k = 0; k < n; k++) {
    const x = (pts[k * 2] + pts[k * 2 + 2]) / 2, z = (pts[k * 2 + 1] + pts[k * 2 + 3]) / 2, l = cum[k + 1] - cum[k] || 1;
    const tx = (pts[k * 2 + 2] - pts[k * 2]) / l, tz = (pts[k * 2 + 3] - pts[k * 2 + 1]) / l;
    for (const e of c.edges.values()) {
      const le = roadLvl(e.type);
      if (le === L && !hFn && !e.ch) continue;
      const r = nearestOnEdge(e, x, z);
      if ((hFn || e.ch) && le !== 0) { const h1 = hFn ? hFn((cum[k] + cum[k + 1]) / 2) : lvlH(L); const dh = Math.abs(h1 - liftAt(c, e, r.along)); if (dh >= ELEV.clear || dh < 1.5) continue; } // vòng xoắn ốc chồng lên vòng dưới: cách đủ cao thì được
      if (r.d > Math.min(ROADS[e.type].w, ROADS[type].w) / 2 - 1) continue;
      const pe = pointAt(e.pts, e.cum, r.along);
      if (Math.abs(tx * pe[3] - tz * pe[2]) > 0.42) continue; // cắt ngang, không phải chạy dọc
      res.len += l;
      if (le !== 0) res.upper = true;
      else if (ROADS[e.type].w < 20) res.narrow = true;
      break;
    }
  }
  return res;
}

/** Đường mặt đất có cầu vượt chạy dọc phía trên (giữa đại lộ): xe chỉ chạy làn ngoài, nhường dải giữa cho trụ, chân dốc cầu. */
function markStacked(c) {
  for (const e of c.edges.values()) {
    e.squeeze = false;
    if (roadLvl(e.type) !== 0 || ROADS[e.type].lanes < 2) continue;
    for (let s = 2; s < e.len - 2 && !e.squeeze; s += 6) {
      const p = pointAt(e.pts, e.cum, s);
      for (const o of c.edges.values()) {
        if (roadLvl(o.type) === 0) continue;
        const r = nearestOnEdge(o, p[0], p[1]);
        if (r.d > 2.5) continue;
        const po = pointAt(o.pts, o.cum, r.along);
        if (Math.abs(p[2] * po[3] - p[3] * po[2]) < 0.42) { e.squeeze = true; break; }
      }
    }
  }
}

/** Cắt một đoạn đường tại các tham số ts, trả về id nút tương ứng từng t. */
function splitEdge(c, e, ts) {
  const A = c.nodes.get(e.a), B = c.nodes.get(e.b);
  const order = ts.map((t, k) => ({ t, k })).sort((p, q) => p.t - q.t), res = new Array(ts.length);
  const chain = [{ t: 0, node: e.a }];
  for (const o of order) {
    const last = chain[chain.length - 1];
    if (o.t * e.len < 5) { res[o.k] = e.a; continue; }
    if ((1 - o.t) * e.len < 5) { res[o.k] = e.b; continue; }
    if (last.t > 0 && (o.t - last.t) * e.len < 5) { res[o.k] = last.node; continue; }
    const p = bez(A.x, A.z, e.cx, e.cz, B.x, B.z, o.t), id = addNode(c, p[0], p[1]);
    if (e.ch) c.nodes.get(id).h = Math.round(liftAt(c, e, nearestOnEdge(e, p[0], p[1]).along) * 100) / 100; // đoạn độ cao tuỳ chỉnh: giữ đúng độ cao chỗ cắt
    chain.push({ t: o.t, node: id }); res[o.k] = id;
  }
  chain.push({ t: 1, node: e.b });
  if (chain.length > 2) {
    c.edges.delete(e.id);
    for (let k = 0; k + 1 < chain.length; k++) {
      const m = subCtrl(A.x, A.z, e.cx, e.cz, B.x, B.z, chain[k].t, chain[k + 1].t);
      const part = addEdge(c, chain[k].node, chain[k + 1].node, e.type, m[0], m[1]);
      if (e.br) part.br = e.br;
      if (e.ch) part.ch = 1;
      if (e.ban) part.ban = e.ban; // biển cấm giữ trên cả hai nửa đoạn bị cắt
      if (e.bump) part.bump = 1; // gờ giảm tốc cũng vậy
    }
  }
  return res;
}

export function buildRoad(c, spec) {
  const plan = planRoad(c, spec);
  if (!plan.ok) return plan;
  if (plan.fix && plan.fix.verts.size) { // hầm qua sông: đắp cửa hầm, nạo vét lòng sông trước khi làm đường
    for (const [k, h] of plan.fix.verts) { c.terra[k] = clamp(Math.round((h - c.hv0[k]) * 10), -800, 800); c.hv[k] = vertexH(c, k); }
    for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) cellTerrain(c, x, y);
    c.terraWet = true; waterSync(c); makeResources(c, heightFn(c)); c.terraWet = false;
    Object.assign(c.dirty, { terrain: 2, trees: true, zones: true, land: true });
  }
  const { stops, A, B, cx, cz, type, bridge } = plan;
  const byEdge = new Map();
  for (const s of stops) if (s.node == null && s.edge != null) { if (!byEdge.has(s.edge)) byEdge.set(s.edge, []); byEdge.get(s.edge).push(s); }
  for (const [eid, list] of byEdge) {
    const ids = splitEdge(c, c.edges.get(eid), list.map((s) => s.te));
    list.forEach((s, k) => { s.node = ids[k]; });
  }
  for (const s of stops) if (s.node == null) s.node = addNode(c, s.x, s.z);
  let made = 0;
  for (let k = 0; k + 1 < stops.length; k++) {
    const p = stops[k], q = stops[k + 1];
    if (p.node === q.node || edgeBetween(c, p.node, q.node)) continue;
    const m = subCtrl(A.x, A.z, cx, cz, B.x, B.z, p.t, q.t);
    const e = addEdge(c, p.node, q.node, type, m[0], m[1]);
    if (bridge !== 'auto') e.br = bridge;
    if (plan.custom) e.ch = 1;
    made++;
  }
  if (!made) return { ...plan, ok: false, reason: 'Đã có đường ở đây' };
  if (plan.custom) { // ghim độ cao các nút của đoạn tuỳ chỉnh (nút có sẵn giữ nguyên độ cao đang thấy)
    stops[0].h = plan.hA; stops[stops.length - 1].h = plan.hB;
    rebuildAdj(c);
    for (const s of stops) { const nd = c.nodes.get(s.node); if (nd && s.h != null && nd.h == null && Math.abs(nodeH(c, s.node) - s.h) > 0.05) nd.h = Math.round(s.h * 100) / 100; }
  }
  cityPay(c, 'build', plan.cost);
  roadsChanged(c);
  return { ...plan, endNode: stops[stops.length - 1].node };
}

/** Giá nâng cấp / đổi loại một đoạn đường (đảo chiều đường một chiều thì miễn phí). */
// ───────────────────────── nâng / hạ tầng một đoạn đường ─────────────────────────

/** Thang tầng của đường 2 làn: hầm ← mặt đất → cầu tầng 1 → 2 → 3. */
export const LEVEL_CHAIN = ['tunnel', 'small', 'overpass', 'overpass2', 'overpass3'];

/**
 * Xem trước nâng (dir = 1) / hạ (dir = -1) một tầng cho đoạn đường: { ok, type, cost, reason }.
 * Đoạn mới phải không cắt ngang đường cùng tầng (sẽ thành nút giao giữa trời), chỗ bắc qua đường khác tầng phải đủ cao,
 * không chạy dọc chồng lên đường khác (trừ cầu giữa đại lộ).
 */
export function planLevel(c, edgeId, dir) {
  const e = c.edges.get(edgeId);
  if (!e) return { ok: false, reason: 'Không có đường ở đây' };
  if (e.ch) return { ok: false, reason: 'Đoạn này có độ cao tuỳ chỉnh: vẽ lại với PageUp / PageDown để đổi độ cao từng nhịp' };
  const k = LEVEL_CHAIN.indexOf(e.type);
  if (k < 0) return { ok: false, reason: `${ROADS[e.type].name} chưa đổi tầng được: chỉ đường 2 làn, cầu vượt, hầm chui (đại lộ, cao tốc thì vẽ cầu mới)` };
  const type = LEVEL_CHAIN[k + dir];
  if (!type) return { ok: false, reason: dir > 0 ? 'Đã ở tầng cao nhất (tầng 3, 21 m)' : 'Đã ở tầng thấp nhất (hầm chui)' };
  if (!roadUnlocked(c, type)) return { ok: false, reason: `${ROADS[type].name}: mở khi đạt ${ROADS[type].unlock} dân` };
  const old = e.type, cost = Math.round(e.len * Math.max(2, Math.abs(ROADS[type].cost - ROADS[old].cost)) * 1.2);
  if (cost > c.money) return { ok: false, type, cost, reason: 'Không đủ tiền' };
  let reason = null;
  e.type = type;
  try {
    const near = (x, z, o) => [e.a, e.b].some((nid) => (nid === o.a || nid === o.b) && Math.hypot(c.nodes.get(nid).x - x, c.nodes.get(nid).z - z) < 12);
    const p = e.pts, n = p.length / 2 - 1;
    for (const o of c.edges.values()) {
      if (o === e || reason) continue;
      const q = o.pts, m = q.length / 2 - 1;
      for (let i = 0; i < n && !reason; i++) for (let j = 0; j < m && !reason; j++) {
        const r = segInt(p[i * 2], p[i * 2 + 1], p[i * 2 + 2], p[i * 2 + 3], q[j * 2], q[j * 2 + 1], q[j * 2 + 2], q[j * 2 + 3]);
        if (!r) continue;
        const ux = p[i * 2 + 2] - p[i * 2], uz = p[i * 2 + 3] - p[i * 2 + 1], wx = q[j * 2 + 2] - q[j * 2], wz = q[j * 2 + 3] - q[j * 2 + 1];
        if (Math.abs(ux * wz - uz * wx) < 0.42 * Math.hypot(ux, uz) * Math.hypot(wx, wz)) continue;
        const x = p[i * 2] + ux * r.t, z = p[i * 2 + 1] + uz * r.t;
        if (near(x, z, o)) continue; // gặp nhau ở nút chung
        if (sameLevel(type, o.type)) { reason = `Đoạn này sẽ cắt ngang ${ROADS[o.type].name.toLowerCase()} cùng tầng giữa chừng: đổi tầng đường kia trước, hoặc vẽ lại`; break; }
        const h1 = liftAt(c, e, e.cum[i] + (e.cum[i + 1] - e.cum[i]) * r.t), h2 = liftAt(c, o, o.cum[j] + (o.cum[j + 1] - o.cum[j]) * r.u);
        if (Math.abs(h1 - h2) < 4) reason = `Chỗ bắc qua ${ROADS[o.type].name.toLowerCase()} nằm trên đoạn dốc, chưa đủ cao: đoạn đường quá ngắn để đổi tầng ở đây`;
      }
    }
    if (!reason) {
      const others = new Map(c.edges); others.delete(e.id);
      const st = stackedOver({ ...c, edges: others }, type, p, e.cum);
      if (st.len > 6 && (st.upper || roadLvl(type) < 0 || st.narrow)) reason = 'Đoạn này chạy dọc chồng lên đường khác: không đổi tầng được';
    }
    if (!reason) reason = tunnelWetCheck(c, type, p, e.cum, (s) => liftAt(c, e, s));
  } finally { e.type = old; }
  return reason ? { ok: false, type, cost, reason } : { ok: true, type, cost };
}

/** Nâng / hạ một tầng (xem planLevel). Nhà cạnh đường thành cầu / hầm mất lối vào. */
export function changeLevel(c, edgeId, dir) {
  const r = planLevel(c, edgeId, dir);
  if (!r.ok) return r;
  const e = c.edges.get(edgeId);
  e.type = r.type; cityPay(c, 'build', r.cost);
  roadsChanged(c);
  return r;
}

/** Giá nâng cấp đoạn e lên loại type; truyền c thì phần qua nước tính giá cầu (× BRIDGE_MULT × kiểu cầu) như khi vẽ mới. */
export function upgradeCost(e, type, c) {
  if (e.type === type) return 0;
  const per = Math.max(1, ROADS[type].cost - ROADS[e.type].cost * 0.5), wl = c ? bridgeLen(c, e) : 0;
  return Math.round(e.len * per + wl * per * (BRIDGE_MULT * BRIDGES[bridgeOf(e)].mult - 1));
}

export function upgradeRoad(c, edgeId, type) {
  const e = c.edges.get(edgeId);
  if (!e || !ROADS[type]) return { ok: false, reason: 'Không có đường ở đây' };
  if (e.type === type) {
    if (type !== 'oneway') return { ok: false, reason: 'Đường đã là loại này' };
    const t = e.a; e.a = e.b; e.b = t; // đảo chiều
    const p = e.pts, n = p.length / 2;
    for (let k = 0; k < n >> 1; k++) for (const o of [0, 1]) { const u = p[k * 2 + o]; p[k * 2 + o] = p[(n - 1 - k) * 2 + o]; p[(n - 1 - k) * 2 + o] = u; }
    e.cum = measure(p);
    roadsChanged(c);
    return { ok: true, cost: 0, flipped: true };
  }
  if (!roadUnlocked(c, type)) return { ok: false, reason: `${ROADS[type].name}: mở khi đạt ${ROADS[type].unlock} dân` };
  if (!sameLevel(e.type, type)) return { ok: false, reason: 'Không đổi được giữa đường dưới đất và đường trên cao: hãy vẽ đường mới' };
  const cost = upgradeCost(e, type, c);
  if (cost > c.money) return { ok: false, reason: 'Không đủ tiền' };
  let blocked = false;
  cellsUnder(e.pts, ROADS[type].w / 2, (i) => { if (c.occ[i]) blocked = true; });
  if (blocked) return { ok: false, reason: 'Vướng công trình, hãy san ủi trước' };
  e.type = type; cityPay(c, 'build', cost);
  roadsChanged(c);
  return { ok: true, cost };
}

/** Chiều dài phần qua nước của một đoạn đường dưới đất (0 với đường trên cao / hầm). */
export function bridgeLen(c, e) {
  if (ROADS[e.type].elevated) return 0;
  const p = e.pts;
  let l = 0;
  for (let k = 0; k + 3 < p.length; k += 2) if (isWaterAt(c, (p[k] + p[k + 2]) / 2, (p[k + 1] + p[k + 3]) / 2)) l += Math.hypot(p[k + 2] - p[k], p[k + 3] - p[k + 1]);
  return l;
}

/** Kiểu cầu đang dùng của đoạn e: 'auto' tự chọn theo nhịp. */
export const bridgeOf = (e) => (BRIDGES[e.br] ? e.br : 'auto');

/** Giá đổi kiểu cầu: trả phần chênh khi lên kiểu đắt hơn, đổi xuống kiểu rẻ hơn thì mất phí tháo dỡ nhỏ. */
export function bridgeCost(c, e, style) {
  const wl = bridgeLen(c, e), d = BRIDGES[style].mult - BRIDGES[bridgeOf(e)].mult;
  return Math.round(wl * ROADS[e.type].cost * BRIDGE_MULT * (d > 0 ? d : 0.1));
}

export function setBridge(c, edgeId, style) {
  const e = c.edges.get(edgeId);
  if (!e || !BRIDGES[style]) return { ok: false, reason: 'Không có cầu ở đây' };
  if (bridgeLen(c, e) < 4) return { ok: false, reason: 'Đoạn đường này không bắc qua sông' };
  if (bridgeOf(e) === style) return { ok: false, reason: 'Cầu đã là kiểu này' };
  const cost = bridgeCost(c, e, style);
  if (cost > c.money) return { ok: false, reason: 'Không đủ tiền' };
  if (style === 'auto') delete e.br; else e.br = style;
  cityPay(c, 'build', cost); c.dirty.roads = true;
  recalc(c);
  return { ok: true, cost };
}

export function removeRoad(c, edgeId) {
  if (!c.edges.delete(edgeId)) return { ok: false };
  roadsChanged(c);
  return { ok: true };
}

/** Gọi sau mọi thay đổi của graph đường. */
export function roadsChanged(c) {
  c._roadVer = (c._roadVer || 0) + 1; // đường ngang (rail.js) tính lại theo phiên bản đường
  rebuildAdj(c);
  for (const [id, list] of c.adj) if (!list.length) { c.nodes.delete(id); c.adj.delete(id); }
  rebuildRoadCells(c);
  markStacked(c);
  applyStreet(c);
  computeNetworks(c);
  rebuildTraffic(c);
  maintainTransit(c);
  recalc(c);
  c.dirty.roads = c.dirty.zones = c.dirty.buildings = c.dirty.trees = c.dirty.transit = true;
}

/**
 * Chiếu graph đường xuống lưới ô: ô bị đường đè (road), ô quy hoạch tự sinh hai bên đường
 * (acc = 1 hàng sát đường, 2 hàng thứ hai), hướng quay mặt ra đường (rdir), đoạn đường phục vụ ô (cedge).
 */
function rebuildRoadCells(c) {
  const minD = new Float32Array(N * N).fill(1e9);
  c.road.fill(0); c.cedge.fill(-1);
  for (const e of c.edges.values()) {
    const half = ROADS[e.type].w / 2, p = e.pts, n = p.length / 2 - 1, reach = half + 3.2 * T, high = ROADS[e.type].elevated;
    for (let k = 0; k < n; k++) {
      const x0 = p[k * 2], z0 = p[k * 2 + 1], x1 = p[k * 2 + 2], z1 = p[k * 2 + 3];
      const l = Math.hypot(x1 - x0, z1 - z0) || 1, ext = (T / 2) * (Math.abs((z1 - z0) / l) + Math.abs((x1 - x0) / l));
      const cx0 = Math.max(0, cellOf(Math.min(x0, x1) - reach)), cx1 = Math.min(N - 1, cellOf(Math.max(x0, x1) + reach));
      const cy0 = Math.max(0, cellOf(Math.min(z0, z1) - reach)), cy1 = Math.min(N - 1, cellOf(Math.max(z0, z1) + reach));
      for (let y = cy0; y <= cy1; y++) for (let x = cx0; x <= cx1; x++) {
        const px = cellCenter(x), pz = cellCenter(y), r = distSeg(px, pz, x0, z0, x1, z1), i = idx(x, y);
        if (r.d < blockHalf(half) + ext - 0.6) c.road[i] = 1;
        const dd = r.d - half;
        if (!high && dd < minD[i]) { // đường trên cao: chặn ô bên dưới nhưng không có nhà quay mặt ra
          minD[i] = dd; c.cedge[i] = e.id;
          const dx = r.x - px, dz = r.z - pz;
          c.rdir[i] = Math.abs(dx) >= Math.abs(dz) ? (dx >= 0 ? 0 : 2) : dz >= 0 ? 1 : 3;
        }
      }
    }
  }
  // đảo giữa vòng xuyến: chặn như mặt đường; vòng nào đã bị phá hết nút thì bỏ
  c.rings = c.rings.filter((g) => [...c.nodes.values()].some((n) => n.rb && Math.hypot(n.x - g.x, n.z - g.z) < ROUNDABOUT_R + 2));
  for (const g of c.rings) {
    const gx = cellOf(g.x), gy = cellOf(g.z);
    for (let y = gy - 2; y <= gy + 2; y++) for (let x = gx - 2; x <= gx + 2; x++) if (inMap(x, y) && Math.hypot(cellCenter(x) - g.x, cellCenter(y) - g.z) < ROUNDABOUT_R) c.road[idx(x, y)] = 1;
  }
  for (let i = 0; i < N * N; i++) {
    const alley = !!(c.street && c.street.alley) && !c.road[i] && !c.water[i] && minD[i] >= 2 * T + 0.5 && minD[i] < 3 * T + 0.5; // hẻm: hàng thứ ba sau mặt đường
    c.acc[i] = c.road[i] || c.water[i] || (c.railCell && c.railCell[i]) || (c.resvCell && c.resvCell[i]) ? 0 : minD[i] < T + 0.5 ? 1 : minD[i] < 2 * T + 0.5 || alley ? 2 : 0;
    if (c.alley) c.alley[i] = alley ? 1 : 0;
    if (!c.acc[i] && !c.road[i]) c.cedge[i] = -1;
    if (c.road[i]) {
      if (c.beach) c.beach[i] = 0; // làm đường qua bãi
      clearDecor(c, i); clearFalls(c, i);
      clearBuilding(c, i);
      c.zone[i] = 0; c.tree[i] = 0;
    } else if (!c.acc[i] && c.zone[i] && !c.level[i]) c.zone[i] = 0;
  }
}

/** Hướng (0..3: đông, nam, tây, bắc) quay ra đường của ô, -1 nếu ô không nằm cạnh đường. */
export function roadDir(c, x, y) {
  const i = idx(x, y);
  return inMap(x, y) && c.acc[i] ? c.rdir[i] : -1;
}

export const roadUnlocked = (c, type) => !!ROADS[type] && unlockedAt(c, ROADS[type]);

/** Nút giao gần điểm (x, z) nhất trong bán kính r, hoặc null. */
export function nodeAt(c, x, z, r = 12) {
  let best = null, bd = r;
  for (const n of c.nodes.values()) { const d = Math.hypot(n.x - x, n.z - z); if (d < bd) { bd = d; best = n; } }
  return best;
}

/**
 * Độ cao của một nút đường so với mặt đất: có nhánh dưới đất thì nằm ở mặt đất (cầu, hầm dốc xuống / lên nối vào);
 * mọi nhánh khác tầng mặt đất thì nằm ở tầng gần mặt đất nhất trong số đó (cầu tầng 2 nối vào cầu tầng 1 thì dốc từ tầng 1).
 */
export function nodeH(c, nid) {
  const nd = c.nodes.get(nid);
  if (nd && nd.h != null) return nd.h; // nút có độ cao tuỳ chỉnh (vẽ bằng PageUp / PageDown)
  const l = c.adj.get(nid);
  if (!l || l.length < 2) return 0;
  let best = null;
  for (const id of l) { const v = roadLvl(c.edges.get(id).type); if (v === 0) return 0; if (best == null || Math.abs(v) < Math.abs(best)) best = v; }
  return lvlH(best);
}
/** Nút nằm khác tầng mặt đất (trên cao hoặc dưới hầm). */
export const nodeElevated = (c, nid) => nodeH(c, nid) !== 0;

/** Dốc êm 0 → 1 trên quãng đường d kể từ đầu dốc; dốc dài theo độ chênh cao. */
export function rampAt(d, dh, start = 3) {
  const t = clamp((d - start) / (34 * Math.max(1, Math.abs(dh) / LIFT)), 0, 1);
  return t * t * (3 - 2 * t);
}

/**
 * Độ cao mặt đường so với mặt đất tại quãng đường s trên đoạn e: đường khác tầng mặt đất dốc dần từ độ cao nút ở hai đầu
 * lên (hoặc xuống) độ cao tầng của nó. startA / startB: chỗ bắt đầu dốc tính từ mỗi đầu (phần nút giao chiếm chỗ).
 */
export function liftAt(c, e, s, startA = 3, startB = 3) {
  if (e.ch) return customLift(c, e, s);
  const H = lvlH(roadLvl(e.type));
  if (!H) return 0;
  const hA = nodeH(c, e.a), hB = nodeH(c, e.b);
  const va = hA + (H - hA) * rampAt(s, H - hA, startA), vb = hB + (H - hB) * rampAt(e.len - s, H - hB, startB);
  return Math.abs(va - H) >= Math.abs(vb - H) ? va : vb;
}

// ───────────────────────── độ cao tuỳ chỉnh từng nhịp (kiểu Cities: Skylines) ─────────────────────────

/** step: mỗi lần PageUp / PageDown; max: cao nhất; clear: hai mặt đường cách nhau từng này mét thì đi qua nhau; grade: dốc tối đa. */
export const ELEV = { step: 2.5, max: 30, clear: 5, grade: 0.12, join: 1.2 };

/** Loại cầu vượt 2 làn theo độ cao tuỳ chỉnh cao nhất của đoạn (giá, lúc mở khoá): ≤ 9 m tầng 1, ≤ 16 m tầng 2, cao hơn tầng 3. */
export const elevType = (h) => (h <= 0.05 ? 'small' : h <= 9 ? 'overpass' : h <= 16 ? 'overpass2' : 'overpass3');

const hermite = (hA, hB, mA, mB, L, t) => {
  const t2 = t * t, t3 = t2 * t;
  return (2 * t3 - 3 * t2 + 1) * hA + (t3 - 2 * t2 + t) * L * mA + (-2 * t3 + 3 * t2) * hB + (t3 - t2) * L * mB;
};

/**
 * Độ dốc (m / m, theo chiều a → b của e) của mặt đường tại nút đầu (atA) của đoạn độ cao tuỳ chỉnh e:
 * nối thẳng với đúng một đoạn tuỳ chỉnh khác thì lấy dốc trung bình hai nhịp (mặt cầu liền mạch, không gãy khúc);
 * nút có đường thường / nút giao nhiều nhánh thì phẳng (xe vào nút êm); đầu cụt thì theo dốc của chính nhịp.
 */
function nodeSlope(c, e, atA) {
  const nid = atA ? e.a : e.b, list = c.adj.get(nid) || [], hA = nodeH(c, e.a), hB = nodeH(c, e.b);
  if (list.length <= 1) return (hB - hA) / (e.len || 1);
  if (list.length > 2) return 0;
  const o = c.edges.get(list[0] === e.id ? list[1] : list[0]);
  if (!o || !o.ch) return 0;
  const far = nodeH(c, o.a === nid ? o.b : o.a), L = (e.len || 1) + (o.len || 1);
  return atA ? (hB - far) / L : (far - hA) / L;
}

/** Độ cao mặt đường của đoạn tuỳ chỉnh e tại quãng đường s: nội suy Hermite giữa độ cao hai nút, khớp dốc ở nút chung. */
function customLift(c, e, s) {
  const hA = nodeH(c, e.a), hB = nodeH(c, e.b), L = e.len || 1, t = clamp(s / L, 0, 1);
  const v = hermite(hA, hB, nodeSlope(c, e, true), nodeSlope(c, e, false), L, t);
  return clamp(v, Math.min(hA, hB) - 0.5, Math.max(hA, hB) + 0.5);
}

/** Độ cao (so với mặt đất) tại điểm bắt s của snapPoint: nút, thân đường có sẵn; null nếu là điểm tự do. */
export function snapHeight(c, s) {
  if (!s) return null;
  if (s.node != null && c.nodes.has(s.node)) return nodeH(c, s.node);
  if (s.edge != null && c.edges.has(s.edge)) { const e = c.edges.get(s.edge); return ROADS[e.type].elevated ? liftAt(c, e, nearestOnEdge(e, s.x, s.z).along) : 0; }
  return null;
}

/**
 * Điểm điều khiển cho đoạn cong nối liền (chế độ 🌀 Cong liền): tiếp tuyến ở đầu A trùng hướng đi ra của đường đang có ở nút A
 * (không lệch góc), Bezier đối xứng gần với cung tròn. Trả về { x, z } hoặc { reason } nếu cong gắt quá / không có hướng để nối.
 */
export function smoothCtrl(c, A, B) {
  const dir = A && A.node != null ? exitDir(c, A.node) : A && A.dir ? A.dir : null;
  if (!dir) return null;
  const abx = B.x - A.x, abz = B.z - A.z, L = Math.hypot(abx, abz);
  if (L < 1) return null;
  const cs = (dir[0] * abx + dir[1] * abz) / L;
  if (cs > 0.9998) return null; // thẳng hàng: đường thẳng
  if (cs < 0.5) return { reason: 'Cong gắt quá: mỗi nhịp chỉ ngoặt tối đa 120°, hãy bấm điểm cuối gần hơn theo hướng đang đi' };
  const k = L / (2 * cs);
  return { x: A.x + dir[0] * k, z: A.z + dir[1] * k };
}

/** Hướng đi tiếp (đơn vị) ra khỏi nút nid: nối thẳng đoạn đường duy nhất đang vào nút đó. */
export function exitDir(c, nid) {
  const list = c.adj.get(nid) || [];
  if (list.length !== 1) return null;
  const e = c.edges.get(list[0]), p = e.pts, m = p.length / 2 - 1, atA = e.a === nid;
  const tx = atA ? p[0] - p[2] : p[m * 2] - p[m * 2 - 2], tz = atA ? p[1] - p[3] : p[m * 2 + 1] - p[m * 2 - 1], l = Math.hypot(tx, tz) || 1;
  return [tx / l, tz / l];
}

/** Tham số t (0..1) trên đường cong của đoạn e ứng với quãng đường s tính từ đầu a. */
function tAtLength(e, s) {
  const n = e.cum.length - 1;
  let k = 0;
  while (k < n - 1 && e.cum[k + 1] < s) k++;
  return (k + clamp((s - e.cum[k]) / (e.cum[k + 1] - e.cum[k] || 1), 0, 1)) / n;
}

export const ROUNDABOUT_R = 15;
export const roundaboutCost = () => Math.round(2 * Math.PI * ROUNDABOUT_R * ROADS.oneway.cost * 1.6);

/** Kiểm tra làm vòng xuyến tại nút nid. */
export function canRoundabout(c, nid) {
  const n = c.nodes.get(nid), list = c.adj.get(nid), cost = roundaboutCost();
  if (!n || !list) return { ok: false, reason: 'Bấm vào một nút giao', cost };
  if (n.rb) return { ok: false, reason: 'Nút này đã thuộc một vòng xuyến', cost };
  if (list.length < 3) return { ok: false, reason: 'Chỉ làm vòng xuyến ở ngã ba, ngã tư trở lên', cost };
  const edges = list.map((id) => c.edges.get(id));
  if (edges.some((e) => ROADS[e.type].elevated)) return { ok: false, reason: 'Không làm vòng xuyến trên đường trên cao', cost };
  if (edges.some((e) => e.len < ROUNDABOUT_R + 12)) return { ok: false, reason: 'Các nhánh quá ngắn, hãy kéo dài đường ra', cost };
  const r = ROUNDABOUT_R + 4, cx = cellOf(n.x), cy = cellOf(n.z), rc = Math.ceil(r / T);
  for (let y = cy - rc; y <= cy + rc; y++) for (let x = cx - rc; x <= cx + rc; x++) {
    if (!inMap(x, y)) return { ok: false, reason: 'Sát mép bản đồ quá', cost };
    if (Math.hypot(cellCenter(x) - n.x, cellCenter(y) - n.z) > r) continue;
    if (c.occ[idx(x, y)]) return { ok: false, reason: 'Vướng công trình, hãy san ủi trước', cost };
    if (!c.own[idx(x, y)]) return { ok: false, reason: LOCKED, cost };
  }
  if (cost > c.money) return { ok: false, reason: 'Không đủ tiền', cost };
  return { ok: true, cost };
}

/**
 * Đổi nút giao thành vòng xuyến: cắt mỗi nhánh cách tâm R, nối các đầu cắt bằng vòng đường một chiều
 * chạy ngược chiều kim đồng hồ (xe đi bên phải). Xe trong vòng được ưu tiên, không có đèn.
 */
export function makeRoundabout(c, nid) {
  const r = canRoundabout(c, nid);
  if (!r.ok) return r;
  const n = c.nodes.get(nid), R = ROUNDABOUT_R, arms = [];
  for (const id of [...c.adj.get(nid)]) {
    const e = c.edges.get(id), atA = e.a === nid;
    const [arm] = splitEdge(c, e, [tAtLength(e, atA ? R : e.len - R)]);
    const inner = edgeBetween(c, nid, arm);
    if (inner) c.edges.delete(inner.id);
    const A = c.nodes.get(arm);
    arms.push({ id: arm, ang: Math.atan2(A.z - n.z, A.x - n.x) });
  }
  arms.sort((p, q) => q.ang - p.ang); // góc giảm dần = ngược chiều kim đồng hồ khi nhìn từ trên xuống
  const ring = [];
  arms.forEach((a, k) => {
    const b = arms[(k + 1) % arms.length], span = k + 1 < arms.length ? a.ang - b.ang : a.ang - (b.ang - 2 * Math.PI);
    const parts = Math.max(1, Math.ceil(span / (Math.PI / 2 + 0.01)));
    let from = a.id;
    for (let j = 1; j <= parts; j++) {
      const ang = a.ang - (span * j) / parts, mid = a.ang - (span * (j - 0.5)) / parts, k2 = R / Math.cos(span / parts / 2);
      const to = j === parts ? b.id : addNode(c, n.x + Math.cos(ang) * R, n.z + Math.sin(ang) * R);
      addEdge(c, from, to, 'oneway', n.x + Math.cos(mid) * k2, n.z + Math.sin(mid) * k2);
      ring.push(to); from = to;
    }
  });
  for (const id of ring) c.nodes.get(id).rb = 1;
  c.rings.push({ x: Math.round(n.x * 10) / 10, z: Math.round(n.z * 10) / 10 });
  cityPay(c, 'build', r.cost);
  roadsChanged(c);
  return { ok: true, cost: r.cost };
}

export const JUNCTION_CTL = ['Tự động', 'Đèn tín hiệu', 'Biển dừng'];
/** Đặt cách điều khiển nút giao: 0 tự động (ngã tư hoặc có đại lộ thì có đèn), 1 luôn có đèn, 2 biển dừng (dừng hẳn rồi lần lượt đi). */
export function setJunction(c, nid, ctl) {
  const n = c.nodes.get(nid), list = c.adj.get(nid);
  if (!n || !list || list.length < 3) return { ok: false, reason: 'Chỉ đặt được ở ngã ba, ngã tư' };
  if (n.rb) return { ok: false, reason: 'Vòng xuyến không cần đèn hay biển dừng' };
  if (nodeElevated(c, nid)) return { ok: false, reason: 'Nút trên cao không đặt đèn' };
  n.ctl = clamp(ctl | 0, 0, 2);
  rebuildTraffic(c);
  c.dirty.roads = true;
  return { ok: true, ctl: n.ctl };
}

/** Cắm biển cấm lên một đoạn đường (ban: chỉ số trong BANS, 0 là gỡ biển). Miễn phí. */
export function setRoadSign(c, edgeId, ban) {
  const e = c.edges.get(edgeId);
  if (!e) return { ok: false, reason: 'Bấm vào một đoạn đường' };
  e.ban = clamp(ban | 0, 0, BANS.length - 1);
  if (!e.ban) delete e.ban;
  rebuildTraffic(c);
  c.dirty.roads = true;
  return { ok: true, ban: e.ban || 0 };
}

/** Cắm biển cấm rẽ ở nút (turn: chỉ số trong TURNS, cờ bit 1 cấm rẽ trái, 2 cấm quay đầu; 0 là gỡ). Miễn phí. */
export function setTurnBan(c, nid, turn) {
  const n = c.nodes.get(nid), list = c.adj.get(nid);
  if (!n || !list) return { ok: false, reason: 'Bấm vào một nút đường' };
  if (list.length < 2) return { ok: false, reason: 'Đầu đường cụt: xe phải quay đầu ở đây' };
  if (n.rb) return { ok: false, reason: 'Vòng xuyến không cần biển cấm rẽ' };
  n.turn = clamp(turn | 0, 0, TURNS.length - 1);
  if (!n.turn) delete n.turn;
  rebuildTraffic(c);
  c.dirty.roads = true;
  return { ok: true, turn: n.turn || 0 };
}

export const BUMP_COST = 300; // ₫ mỗi đoạn đường
/** Đặt / gỡ gờ giảm tốc trên một đoạn đường. Xe chạy chậm, ít tai nạn; xe đi xuyên sẽ tìm đường khác. */
export function setBump(c, edgeId, on) {
  const e = c.edges.get(edgeId);
  if (!e) return { ok: false, reason: 'Bấm vào một đoạn đường' };
  if (e.type === 'highway' || ROADS[e.type].elevated) return { ok: false, reason: 'Không làm gờ giảm tốc trên cao tốc, cầu vượt' };
  if (on && !e.bump) { if (c.money < BUMP_COST) return { ok: false, reason: 'Không đủ tiền' }; cityPay(c, 'build', BUMP_COST); }
  if (on) e.bump = 1; else delete e.bump;
  rebuildTraffic(c);
  c.dirty.roads = true;
  return { ok: true, bump: !!e.bump };
}

// ───────────────────────── di chuyển ─────────────────────────

/** Phí dời một công trình: 10% giá xây. */
export const moveFee = (type) => Math.round(SERVICES[type].cost * 0.1);

/** Thử dời công trình thứ k tới ô (x, y); dry = chỉ kiểm tra. Giữ nguyên uid, phần mở rộng và mọi thuộc tính khác. */
export function moveService(c, k, x, y, dry = false) {
  const s = c.services[k];
  if (!s) return { ok: false, reason: 'Không có công trình ở đây' };
  const fee = moveFee(s.type);
  c.services.splice(k, 1); rebuildOcc(c);
  const back = () => { c.services.splice(k, 0, s); rebuildOcc(c); };
  const r = canPlace(c, s.type, x, y, { move: true });
  if (!r.ok) { back(); return r; }
  if (r.fp.x === s.x && r.fp.y === s.y) { back(); return { ok: false, reason: 'Vẫn ở chỗ cũ', fp: r.fp }; }
  if (fee > c.money) { back(); return { ok: false, reason: 'Không đủ tiền', fp: r.fp }; }
  if (dry) { back(); return { ok: true, fee, fp: r.fp }; }
  const { fp } = r, votes = [0, 0, 0, 0];
  for (let dy = 0; dy < fp.size; dy++) for (let dx = 0; dx < fp.size; dx++) {
    const i = idx(fp.x + dx, fp.y + dy);
    if (c.acc[i] === 1) votes[c.rdir[i]]++;
    c.zone[i] = 0; c.tree[i] = 0; clearBuilding(c, i);
  }
  s.x = fp.x; s.y = fp.y;
  if (Math.max(...votes)) s.dir = votes.indexOf(Math.max(...votes));
  if (SERVICES[s.type].faceWater) s.dir = waterDir(c, fp, s.dir);
  back();
  cityPay(c, 'build', fee);
  c.dirty.services = c.dirty.zones = c.dirty.trees = c.dirty.buildings = true;
  computeMaps(c); computeNetworks(c); rebuildTraffic(c); recalc(c);
  return { ok: true, fee, fp };
}

/**
 * Dời một nút đường (ngã ba, ngã tư, đầu đường) tới (x, z); các đoạn nối vào uốn theo.
 * Từ chối nếu đường mới cắt ngang đường khác cùng tầng, quá ngắn, vướng công trình, ra khỏi đất đã mua.
 */
export function moveNode(c, nid, x, z, dry = false) {
  const n = c.nodes.get(nid);
  if (!n) return { ok: false, reason: 'Không có nút đường ở đây' };
  if (n.rb) return { ok: false, reason: 'Nút thuộc vòng xuyến: hãy san ủi vòng xuyến trước' };
  if (Math.abs(n.z + HALF - 1) < 2 || Math.abs(n.x) > HALF - 3 || Math.abs(n.z) > HALF - 3) return { ok: false, reason: 'Không dời được cửa ngõ ra ngoài thành phố' };
  if (Math.abs(x) > HALF - 2 || Math.abs(z) > HALF - 2 || !ownedAt(c, x, z)) return { ok: false, reason: LOCKED };
  for (const o of c.nodes.values()) if (o !== n && Math.hypot(o.x - x, o.z - z) < 9) return { ok: false, reason: 'Quá sát nút đường khác' };
  const list = (c.adj.get(nid) || []).map((id) => c.edges.get(id));
  const dx = x - n.x, dz = z - n.z, ox = n.x, oz = n.z, old = list.map((e) => ({ e, cx: e.cx, cz: e.cz, pts: e.pts, cum: e.cum, len: e.len }));
  n.x = x; n.z = z;
  for (const e of list) {
    e.cx += dx / 2; e.cz += dz / 2;
    const A = c.nodes.get(e.a), B = c.nodes.get(e.b);
    e.pts = sampleCurve(A.x, A.z, e.cx, e.cz, B.x, B.z, 4); e.cum = measure(e.pts); e.len = e.cum[e.cum.length - 1];
  }
  const restore = () => { n.x = ox; n.z = oz; for (const o of old) Object.assign(o.e, { cx: o.cx, cz: o.cz, pts: o.pts, cum: o.cum, len: o.len }); };
  let reason = '';
  for (const e of list) {
    if (e.len < 8) { reason = 'Đoạn đường quá ngắn'; break; }
    for (let k = 0; k < e.pts.length && !reason; k += 2) if (!ownedAt(c, e.pts[k], e.pts[k + 1])) reason = LOCKED;
    if (reason) break;
    cellsUnder(e.pts, ROADS[e.type].w / 2, (i) => { if (c.occ[i]) reason = 'Vướng công trình, hãy san ủi trước'; });
    if (reason) break;
    const p = e.pts, m = p.length / 2 - 1;
    for (const o of c.edges.values()) {
      if (o === e || o.a === e.a || o.a === e.b || o.b === e.a || o.b === e.b) continue;
      const q = o.pts, mo = q.length / 2 - 1;
      for (let k = 0; k < m && !reason; k++) for (let j = 0; j < mo; j++) {
        const r = segInt(p[k * 2], p[k * 2 + 1], p[k * 2 + 2], p[k * 2 + 3], q[j * 2], q[j * 2 + 1], q[j * 2 + 2], q[j * 2 + 3]);
        if (r && Math.abs(liftAt(c, e, e.cum[k]) - liftAt(c, o, o.cum[j])) < 3) { reason = 'Đường sẽ cắt ngang đường khác: hãy dùng cầu vượt hoặc vẽ nút giao'; break; }
      }
      if (reason) break;
    }
    if (reason) break;
  }
  if (reason || dry) { restore(); return reason ? { ok: false, reason } : { ok: true }; }
  roadsChanged(c);
  return { ok: true };
}

// ───────────────────────── dây điện, ống nước ─────────────────────────

function serviceAt(c, x, z, slack = 0) {
  for (let k = 0; k < c.services.length; k++) {
    const s = c.services[k], sz = SERVICES[s.type].size * T, x0 = s.x * T - HALF, z0 = s.y * T - HALF;
    if (x >= x0 - slack && x <= x0 + sz + slack && z >= z0 - slack && z <= z0 + sz + slack) return k;
  }
  return -1;
}

export function planLine(c, kind, a, b) {
  const def = LINES[kind], len = Math.hypot(b.x - a.x, b.z - a.z);
  const cost = Math.round(len * def.cost);
  if (len < 8) return { ok: false, reason: 'Đoạn quá ngắn', cost, len };
  if (Math.max(Math.abs(a.x), Math.abs(a.z), Math.abs(b.x), Math.abs(b.z)) > HALF) return { ok: false, reason: 'Ra ngoài bản đồ', cost, len };
  for (let k = 0; k <= 24; k++) if (!ownedAt(c, a.x + ((b.x - a.x) * k) / 24, a.z + ((b.z - a.z) * k) / 24)) return { ok: false, reason: LOCKED, cost, len };
  if (cost > c.money) return { ok: false, reason: 'Không đủ tiền', cost, len };
  return { ok: true, cost, len };
}

export function buildLine(c, kind, a, b) {
  const r = planLine(c, kind, a, b);
  if (!r.ok) return r;
  c.lines.push({ kind, ax: a.x, az: a.z, bx: b.x, bz: b.z });
  cityPay(c, 'build', r.cost);
  c.dirty.lines = true;
  computeNetworks(c); recalc(c);
  return r;
}

/**
 * Mạng điện và mạng nước: đường tự dẫn điện + ống ngầm; dây điện / ống nước nối thêm chỗ xa đường.
 * Mỗi cụm liên thông có nguồn cung và nhu cầu riêng → cờ theo ô: 1 đủ, 2 thiếu, 0 không có.
 */
export function computeNetworks(c) {
  hydroSync(c);
  const eIds = [...c.edges.keys()], eIx = new Map(eIds.map((id, k) => [id, k]));
  const E = eIds.length, S = c.services.length, L = c.lines.length, total = E + S + L;
  const mkUF = () => { const p = new Int32Array(total); for (let k = 0; k < total; k++) p[k] = k; return p; };
  const find = (p, a) => { while (p[a] !== a) { p[a] = p[p[a]]; a = p[a]; } return a; };
  const union = (p, a, b) => { a = find(p, a); b = find(p, b); if (a !== b) p[a] = b; };
  const P = mkUF(), W = mkUF();
  for (const list of c.adj.values()) for (let k = 1; k < list.length; k++) { union(P, eIx.get(list[0]), eIx.get(list[k])); union(W, eIx.get(list[0]), eIx.get(list[k])); }
  c.services.forEach((s, k) => {
    const sz = SERVICES[s.type].size;
    let best = -1, rank = 9;
    s.cell = -1; // ô của công trình nằm sát đường nhất: cửa ra vào cho xe dịch vụ
    for (let dy = 0; dy < sz; dy++) for (let dx = 0; dx < sz; dx++) { const i = idx(s.x + dx, s.y + dy); if (c.acc[i] && c.cedge[i] >= 0 && c.acc[i] < rank) { rank = c.acc[i]; best = c.cedge[i]; s.cell = i; } }
    s.linked = best >= 0;
    if (best >= 0) { union(P, E + k, eIx.get(best)); union(W, E + k, eIx.get(best)); }
  });
  c.lines.forEach((ln, k) => {
    const U = ln.kind === 'power' ? P : W, me = E + S + k;
    for (const [x, z] of [[ln.ax, ln.az], [ln.bx, ln.bz]]) {
      const sv = serviceAt(c, x, z, 4);
      if (sv >= 0) { union(U, me, E + sv); c.services[sv].linked = true; }
      const e = edgeAt(c, x, z, 7);
      if (e) union(U, me, eIx.get(e.id));
      c.lines.forEach((o, j) => { if (j !== k && o.kind === ln.kind && distSeg(x, z, o.ax, o.az, o.bx, o.bz).d < 4) union(U, me, E + S + j); });
    }
  });
  const pSup = new Float64Array(total), pUse = new Float64Array(total), wSup = new Float64Array(total), wUse = new Float64Array(total), sSup = new Float64Array(total);
  c.services.forEach((s, k) => {
    const d = SERVICES[s.type];
    if (d.power) pSup[find(P, E + k)] += svcVal(s, 'power');
    if (d.water) wSup[find(W, E + k)] += svcVal(s, 'water');
    if (d.sewage) sSup[find(W, E + k)] += svcVal(s, 'sewage');
  });
  const rootP = new Int32Array(N * N).fill(-1), rootW = new Int32Array(N * N).fill(-1), hk = heatUse(c);
  for (let i = 0; i < N * N; i++) {
    if (c.cedge[i] < 0 || !c.acc[i]) continue;
    const k = eIx.get(c.cedge[i]);
    rootP[i] = find(P, k); rootW[i] = find(W, k);
    const L2 = c.level[i];
    if (L2) { const u = utilUse(c.zone[i], L2); pUse[rootP[i]] += u * hk.power; wUse[rootW[i]] += u * hk.water; } // nắng nóng: dùng nhiều điện, nước hơn
  }
  // thiếu điện / nước theo tỷ lệ: mạng thiếu 10% thì chừng 10% số ô bị cắt luân phiên (đổi theo ngày), không phải cả mạng cùng chập chờn
  const flag = (sup, use, i, salt) => netFlag(sup, use, i, c.day + salt);
  let noP = 0, noW = 0, noU = 0;
  for (let i = 0; i < N * N; i++) {
    if (rootP[i] < 0) { c.pOk[i] = c.wOk[i] = c.sOk[i] = 0; continue; }
    c.pOk[i] = flag(pSup[rootP[i]], pUse[rootP[i]], i, 0);
    c.wOk[i] = flag(wSup[rootW[i]], wUse[rootW[i]], i, 31);
    c.sOk[i] = flag(sSup[rootW[i]], wUse[rootW[i]], i, 57);
    if (c.level[i]) { const p = c.pOk[i] !== 1, w = c.wOk[i] !== 1 || c.sOk[i] !== 1; if (p) noP++; if (w) noW++; if (p || w) noU++; }
  }
  // tình trạng theo các ô đã quy hoạch: none = mạng không có nguồn, tight = hết công suất dư
  const none = { p: false, w: false, s: false }, tight = { p: false, w: false, s: false };
  for (let i = 0; i < N * N; i++) {
    if (!c.zone[i] || rootP[i] < 0) continue;
    const rp = rootP[i], rw = rootW[i];
    if (pSup[rp] <= 0) none.p = true; else if (pSup[rp] - pUse[rp] < 3) tight.p = true;
    if (wSup[rw] <= 0) none.w = true; else if (wSup[rw] - wUse[rw] < 3) tight.w = true;
    if (sSup[rw] <= 0) none.s = true; else if (sSup[rw] - wUse[rw] < 3) tight.s = true;
  }
  c.stats.none = none; c.stats.tight = tight;
  // còn dư công suất cho nhà mới?
  c.room = (i, need = 3) => rootP[i] >= 0 && pSup[rootP[i]] - pUse[rootP[i]] >= need && wSup[rootW[i]] - wUse[rootW[i]] >= need && sSup[rootW[i]] - wUse[rootW[i]] >= need;
  c.stats.noPower = noP; c.stats.noWater = noW; c.stats.noUtil = noU; // noUtil: nhà thiếu điện hoặc nước (đếm một lần)
}

// ───────────────────────── quy hoạch, công trình, san ủi ─────────────────────────

function clearBuilding(c, i) {
  if (!c.level[i]) { c._why = null; return; }
  chainCleared(c, i); // biên niên: mất việc, đứt nguồn hàng (trước khi toà nhà biến mất, còn biết số người làm)
  c.level[i] = 0; c.age[i] = 0; c.dirty.buildings = true;
  onBuildingCleared(c, i);
}

const unlockedAt = (c, d) => c.sandbox || (!d.unlock || MILESTONES.some((m, k) => k < c.milestone && m.pop >= d.unlock)) && (!d.tech || c.tech.has(d.tech)) && (!d.tree || !c.devTree || c.tech.has(d.tree));
export const zoneUnlocked = (c, z) => unlockedAt(c, ZDEF[z]);
export const isUnlocked = (c, type) => unlockedAt(c, SERVICES[type]);
/** Câu giải thích vì sao một khu / công trình còn khoá. */
export const lockText = (d, c = null) => (d.tech ? `mở trong 🔬 Phát triển (${TECH[d.tech].name})` : c && c.devTree && d.tree && !c.tech.has(d.tree) ? `mở trong 🔬 Phát triển · cây công trình (${TECH[d.tree].cost} điểm${d.unlock ? `, từ ${d.unlock} dân` : ''})` : `mở khi đạt ${d.unlock} dân`);

/** Tô quy hoạch: chỉ ô quy hoạch tự sinh cạnh đường (acc > 0) mới nhận. z = 0 là bỏ quy hoạch. */
export function zoneRect(c, x0, y0, x1, y1, z) {
  if (!ZDEF[z]) return { ok: false, reason: 'Không có loại khu này' };
  if (!zoneUnlocked(c, z)) return { ok: false, reason: `${ZDEF[z].name}: ${lockText(ZDEF[z])}` };
  let n = 0, locked = 0, noRes = 0, sea = 0;
  for (let y = Math.min(y0, y1); y <= Math.max(y0, y1); y++) for (let x = Math.min(x0, x1); x <= Math.max(x0, x1); x++) {
    if (!inMap(x, y)) continue;
    const i = idx(x, y);
    if (!c.own[i]) { locked++; continue; }
    if (c.water[i]) { // ngư nghiệp tô lên mặt nước có cá: ngư trường; bỏ quy hoạch thì xoá ngư trường
      if (z === 12 && !c.fishery[i] && fisheryOk(c, i)) { c.fishery[i] = 1; n++; sea++; }
      else if (z === 0 && c.fishery[i]) { c.fishery[i] = 0; n++; sea++; }
      continue;
    }
    if (c.water[i] || c.road[i] || c.occ[i] || c.beach[i] || (c.decor && c.decor[i]) || (c.falls && c.falls[i]) || (c.resvCell && c.resvCell[i]) || c.zone[i] === z) continue;
    if (z !== 0 && (!c.acc[i] || c.steep[i])) continue;
    if (!hasResource(c, i, z)) { noRes++; continue; }
    if (c.level[i]) { if (z !== 0) continue; clearBuilding(c, i); } // chỉ "bỏ quy hoạch" mới dỡ nhà
    c.zone[i] = z; n++;
  }
  if (sea) { c._fishMul = null; c.dirty.fishery = true; }
  if (n) { c.dirty.zones = true; computeNetworks(c); recalc(c); }
  if (z === 12 && !n) return { ok: false, count: 0, reason: 'Ngư nghiệp: tô lên mặt nước có cá (ngư trường, xem lớp 🗺️ tài nguyên: màu lam) hoặc ô đất cạnh đường sát vùng nước có cá (bến cá)' };
  const why = noRes ? `${ZDEF[z].name} chỉ đặt được trên ô có ${RAW[ZDEF[z].raw].name.toLowerCase()} (xem lớp 🗺️ tài nguyên)` : locked ? LOCKED : 'Chỉ quy hoạch được ô nằm cạnh đường (tối đa 2 ô), không quá dốc';
  return { ok: n > 0, count: n, reason: n ? '' : why };
}

export function bulldozeRect(c, x0, y0, x1, y1) {
  let n = 0;
  const kill = new Set(), roads = new Set();
  const ax = Math.min(x0, x1), bx = Math.max(x0, x1), ay = Math.min(y0, y1), by = Math.max(y0, y1);
  for (let y = ay; y <= by; y++) for (let x = ax; x <= bx; x++) {
    if (!inMap(x, y) || !c.own[idx(x, y)]) continue;
    const i = idx(x, y);
    if (c.occ[i]) { kill.add(c.occ[i] - 1); continue; }
    if (c.road[i] || c.water[i]) for (const e of c.edges.values()) if (nearestOnEdge(e, cellCenter(x), cellCenter(y)).d < ROADS[e.type].w / 2 + 4.4) roads.add(e.id);
    if (c.level[i]) { clearBuilding(c, i); n++; }
    if (c.tree[i]) { c.tree[i] = 0; n++; c.dirty.trees = true; }
    if (c.decor && c.decor[i]) { clearDecor(c, i); n++; c.dirty.trees = true; }
    if (c.falls && c.falls[i]) { clearFalls(c, i); n++; }
  }
  let railGone = false;
  if (c.rail) for (const id of railsInRect(c, ax, ay, bx, by)) { removeRail(c, id); n++; railGone = true; }
  if (railGone) railChanged(c);
  const wx0 = ax * T - HALF, wx1 = (bx + 1) * T - HALF, wz0 = ay * T - HALF, wz1 = (by + 1) * T - HALF;
  const before = c.lines.length;
  c.lines = c.lines.filter((ln) => {
    for (let k = 0; k <= 24; k++) { const x = ln.ax + ((ln.bx - ln.ax) * k) / 24, z = ln.az + ((ln.bz - ln.az) * k) / 24; if (x >= wx0 && x <= wx1 && z >= wz0 && z <= wz1) return false; }
    return true;
  });
  if (c.lines.length !== before) { n += before - c.lines.length; c.dirty.lines = true; }
  if (kill.size) {
    c.services = c.services.filter((_, k) => !kill.has(k));
    rebuildOcc(c); c.dirty.services = true; n += kill.size;
    computeMaps(c);
  }
  for (const id of roads) { c.edges.delete(id); n++; }
  if (roads.size || railGone) roadsChanged(c);
  else if (n) { computeNetworks(c); recalc(c); }
  return { ok: n > 0, count: n };
}

export function footprint(type, x, y) {
  const sz = SERVICES[type].size, h = (sz - 1) >> 1;
  return { x: x - h, y: y - h, size: sz };
}

/** Kiểm tra đặt công trình, (x, y) là ô dưới con trỏ. */
export function canPlace(c, type, x, y, { move = false } = {}) {
  const def = SERVICES[type];
  if (!def) return { ok: false, reason: 'Không có công trình này' };
  const fp = footprint(type, x, y);
  let nearWater = false, nearRoad = false;
  for (let dy = -1; dy <= fp.size; dy++) for (let dx = -1; dx <= fp.size; dx++) {
    const a = fp.x + dx, b = fp.y + dy;
    const inside = dx >= 0 && dy >= 0 && dx < fp.size && dy < fp.size;
    if (!inMap(a, b)) { if (inside) return { ok: false, reason: 'Ra ngoài bản đồ', fp }; continue; }
    const i = idx(a, b);
    if (inside) {
      if (!c.own[i]) return { ok: false, reason: LOCKED, fp };
      if (c.water[i]) return { ok: false, reason: 'Không xây được trên nước', fp };
      if (c.road[i]) return { ok: false, reason: 'Đang có đường', fp };
      if (c.occ[i]) return { ok: false, reason: 'Đang có công trình khác', fp };
      if (c.beach && c.beach[i]) return { ok: false, reason: 'Đang là bãi biển (xoá bãi trước)', fp };
      if (c.railCell && c.railCell[i]) return { ok: false, reason: 'Đang có đường ray', fp };
      if (c.resvCell && c.resvCell[i]) return { ok: false, reason: 'Trong lòng hồ thuỷ điện (ngập nước)', fp };
      if (c.steep[i] && !def.cliff) return { ok: false, reason: 'Đất quá dốc', fp };
      if (c.acc[i] === 1) nearRoad = true;
    } else if (c.water[i]) nearWater = true;
  }
  if (def.needWater && !nearWater) return { ok: false, reason: 'Phải đặt sát bờ nước', fp };
  if (def.cliff && cliffDrop(c, fp.x, fp.y, fp.size) < def.cliff) return { ok: false, reason: `Thác nước cần sườn dốc: chênh cao trong lô từ ${def.cliff} m (đang ${cliffDrop(c, fp.x, fp.y, fp.size).toFixed(1)} m)`, fp };
  if (type === 'hydro') { const p = planDam(c, fp.x, fp.y, fp.size, waterDir(c, fp, 1)); if (!p.ok) return { ok: false, reason: p.reason, fp }; }
  if (def.road && !nearRoad) return { ok: false, reason: 'Phải đặt sát đường', fp };
  if (move) return { ok: true, fp }; // dời công trình đã có: không xét mở khoá, phí trả riêng
  if (!isUnlocked(c, type)) return { ok: false, reason: `${def.name}: ${lockText(def, c)}`, fp };
  if (def.unique && c.services.some((s) => s.type === type)) return { ok: false, reason: 'Mỗi thành phố chỉ có một công trình biểu tượng này', fp };
  if (def.cost > c.money) return { ok: false, reason: 'Không đủ tiền', fp };
  return { ok: true, fp };
}

// ───────────────────────── module, cây công nghệ ─────────────────────────

/** Các module một công trình nhận được: [{ id, cost, state: 'done' | 'ok' | 'lock' | 'poor' }] */
export function moduleList(c, s) {
  return Object.keys(MODULES).filter((m) => MODULES[m].for.includes(s.type)).map((id) => {
    const cost = moduleCost(s.type, id);
    return { id, cost, state: s.mods && s.mods.includes(id) ? 'done' : !unlockedAt(c, MODULES[id]) ? 'lock' : cost > c.money ? 'poor' : 'ok' };
  });
}

/**
 * Chỗ mở rộng sân bay nội địa (5×5) thành sân bay quốc tế 8×8 bao trùm lô cũ: phần đất thêm phải là đất trống trong bản đồ
 * (không nước, đường, ray, công trình khác, đất quá dốc); nhà dân trên đó bị giải toả. Ưu tiên lô có mặt sát đường, ít nhà phải dỡ.
 * Trả về { ok, x, y, houses, reason }.
 */
export function airportExpand(c, s) {
  const big = SERVICES.airportIntl.size, sz = SERVICES[s.type].size, k = c.services.indexOf(s) + 1;
  let best = null, why = 'Không đủ chỗ quanh sân bay để mở rộng thành 8×8 ô: vướng sông nước, công trình khác, đất quá dốc hoặc mép bản đồ — dời sân bay ra chỗ rộng hơn';
  const near = (e, x, y) => nearestOnEdge(e, cellCenter(x), cellCenter(y)).d < ROADS[e.type].w / 2 + 4.4;
  for (let oy = sz - big; oy <= 0; oy++) for (let ox = sz - big; ox <= 0; ox++) {
    const x0 = s.x + ox, y0 = s.y + oy;
    let ok = true, houses = 0, roadCells = 0;
    const roads = new Set();
    for (let dy = 0; dy < big && ok; dy++) for (let dx = 0; dx < big; dx++) {
      const a = x0 + dx, b = y0 + dy;
      if (!inMap(a, b)) { ok = false; break; }
      const i = idx(a, b);
      if (c.occ[i] === k) continue;
      if (c.water[i] || c.occ[i] || c.steep[i]) { ok = false; break; } // không lấp sông, không phá công trình khác
      if (c.level[i]) houses++;
      if (c.road[i]) { roadCells++; for (const e of c.edges.values()) if (near(e, a, b)) roads.add(e.id); } // đường trong lô: giải toả
    }
    if (!ok) continue;
    // còn đường sát lô (sau khi giải toả) để xe ra vào
    let link = 0;
    for (let dy = -1; dy <= big; dy++) for (let dx = -1; dx <= big; dx++) {
      if (dx >= 0 && dy >= 0 && dx < big && dy < big) continue;
      const a = x0 + dx, b = y0 + dy;
      if (!inMap(a, b) || !c.road[idx(a, b)]) continue;
      for (const e of c.edges.values()) if (!roads.has(e.id) && near(e, a, b)) { link++; break; }
    }
    if (!link) { why = 'Mở rộng xong sân bay sẽ không còn đường nào sát lô: làm thêm một con đường quanh sân bay rồi thử lại'; continue; }
    const score = houses * 3 + roadCells * 2 + roads.size * 4 - Math.min(link, 6);
    if (!best || score < best.score) best = { x: x0, y: y0, houses, roads, roadCells, score };
  }
  return best ? { ok: true, ...best } : { ok: false, reason: why };
}

/** Gắn module id vào công trình thứ k. */
export function addModule(c, k, id) {
  const s = c.services[k], m = s && moduleList(c, s).find((o) => o.id === id);
  if (!m) return { ok: false, reason: 'Công trình này không gắn được module đó' };
  if (m.state !== 'ok') return { ok: false, reason: { done: 'Đã có module này', lock: `Module ${lockText(MODULES[id])}`, poor: 'Không đủ tiền' }[m.state] };
  if (id === 'intl' && s.type === 'airport') { // sân bay quốc tế: mở rộng lô thành 8×8
    const ex = airportExpand(c, s);
    if (!ex.ok) return ex;
    const big = SERVICES.airportIntl.size;
    for (let dy = 0; dy < big; dy++) for (let dx = 0; dx < big; dx++) { const i = idx(ex.x + dx, ex.y + dy); c.zone[i] = 0; c.tree[i] = 0; clearBuilding(c, i); clearDecor(c, i); clearFalls(c, i); if (c.beach) c.beach[i] = 0; }
    // giải toả: đường, đường ray, dây điện, ống nước chạy qua lô mở rộng
    for (const id of ex.roads) c.edges.delete(id);
    if (c.rail) { let gone = false; for (const id of railsInRect(c, ex.x, ex.y, ex.x + big - 1, ex.y + big - 1)) { removeRail(c, id); gone = true; } if (gone) railChanged(c); }
    { const wx0 = ex.x * T - HALF, wx1 = (ex.x + big) * T - HALF, wz0 = ex.y * T - HALF, wz1 = (ex.y + big) * T - HALF, n0 = c.lines.length; c.lines = c.lines.filter((ln) => { for (let q = 0; q <= 24; q++) { const x = ln.ax + ((ln.bx - ln.ax) * q) / 24, z = ln.az + ((ln.bz - ln.az) * q) / 24; if (x >= wx0 && x <= wx1 && z >= wz0 && z <= wz1) return false; } return true; }); if (c.lines.length !== n0) c.dirty.lines = true; }
    { const votes = [0, 0, 0, 0]; for (let dy = 0; dy < big; dy++) for (let dx = 0; dx < big; dx++) { const i = idx(ex.x + dx, ex.y + dy); if (c.acc[i] === 1) votes[c.rdir[i]]++; } if (Math.max(...votes)) s.dir = votes.indexOf(Math.max(...votes)); } // mặt nhà ga quay ra đường
    s.type = 'airportIntl'; s.x = ex.x; s.y = ex.y;
    (s.mods || (s.mods = [])).push(id);
    cityPay(c, 'build', m.cost);
    rebuildOcc(c);
    Object.assign(c.dirty, { services: true, zones: true, trees: true, buildings: true });
    if (ex.roads.size) roadsChanged(c);
    computeMaps(c); computeNetworks(c); recalc(c);
    return { ok: true, cost: m.cost, expanded: true, houses: ex.houses, roads: ex.roads.size };
  }
  (s.mods || (s.mods = [])).push(id);
  cityPay(c, 'build', m.cost);
  c.dirty.services = true;
  computeMaps(c); computeNetworks(c); recalc(c);
  return { ok: true, cost: m.cost };
}

/** 'done' đã mở | 'ok' mở được | 'req' thiếu mục trước | 'rank' chưa đủ mốc dân số | 'poor' thiếu điểm */
export function techState(c, id) {
  const t = TECH[id];
  if (!t) return 'none';
  if (c.tech.has(id)) return 'done';
  if (t.req && !c.tech.has(t.req)) return 'req';
  if (t.rank && c.milestone < t.rank) return 'rank';
  return c.points >= t.cost ? 'ok' : 'poor';
}

export function unlockTech(c, id) {
  const st = techState(c, id), t = TECH[id];
  if (st !== 'ok') return { ok: false, reason: { none: 'Không có mục này', done: 'Đã mở rồi', req: `Cần mở "${TECH[t?.req]?.name}" trước`, rank: `Cần đạt mốc ${MILESTONES[(t?.rank || 1) - 1].name}`, poor: 'Không đủ điểm phát triển' }[st] };
  c.points -= t.cost; c.tech.add(id);
  c.dirty.zones = true;
  recalc(c);
  return { ok: true };
}

/** Hướng đặt để mặt sau công trình (cầu tàu, mép sóng) nhìn ra phía có nhiều ô nước nhất. dir: 0 mặt tiền +x, 1 +z, 2 −x, 3 −z. */
function waterDir(c, fp, dflt) {
  const n = fp.size, wet = (x, y) => (inMap(x, y) && c.water[idx(x, y)] ? 1 : 0);
  const side = [0, 0, 0, 0]; // nước ở phía +x, +y, −x, −y
  for (let k = -1; k <= n; k++) for (let d = 1; d <= 2; d++) {
    side[0] += wet(fp.x + n - 1 + d, fp.y + k); side[2] += wet(fp.x - d, fp.y + k);
    side[1] += wet(fp.x + k, fp.y + n - 1 + d); side[3] += wet(fp.x + k, fp.y - d);
  }
  const best = side.indexOf(Math.max(...side));
  return Math.max(...side) ? [2, 3, 0, 1][best] : dflt; // nước phía +x thì mặt tiền quay −x, ...
}

export function placeService(c, type, x, y) {
  const r = canPlace(c, type, x, y);
  if (!r.ok) return r;
  const { fp } = r;
  // quay mặt ra đường: hướng được nhiều ô sát đường chọn nhất
  const votes = [0, 0, 0, 0];
  for (let dy = 0; dy < fp.size; dy++) for (let dx = 0; dx < fp.size; dx++) {
    const i = idx(fp.x + dx, fp.y + dy);
    if (c.acc[i] === 1) votes[c.rdir[i]]++;
    c.zone[i] = 0; c.tree[i] = 0; clearBuilding(c, i); clearDecor(c, i); clearFalls(c, i);
  }
  let dir = Math.max(...votes) ? votes.indexOf(Math.max(...votes)) : 1;
  if (SERVICES[type].faceWater) dir = waterDir(c, fp, dir); // bến tàu, cảng, bãi biển: quay cầu tàu / mép sóng ra phía nước
  const hrs = buildHours(SERVICES[type]);
  c.services.push({ type, x: fp.x, y: fp.y, dir, uid: c.nextId++, build: hrs, buildTot: hrs }); // build: số giờ còn lại của công trường (chỉ để xem)
  cityPay(c, 'build', SERVICES[type].cost);
  rebuildOcc(c);
  c.dirty.services = c.dirty.zones = c.dirty.trees = c.dirty.buildings = true;
  computeMaps(c); computeNetworks(c); recalc(c);
  return { ok: true, cost: SERVICES[type].cost, linked: c.services[c.services.length - 1].linked };
}

// ───────────────────────── trụ sở UBND quận ─────────────────────────

/** Chỗ trống gần (x, y) để xây trụ sở quận: không phá nhà, ưu tiên sát đường. */
function hallSpot(c, x, y) {
  let best = null, bs = Infinity;
  for (let r = 0; r <= 14 && (!best || r * r < bs); r++) for (let dy = -r; dy <= r; dy++) for (let dx = -r; dx <= r; dx++) {
    if (Math.max(Math.abs(dx), Math.abs(dy)) !== r) continue;
    const px = x + dx, py = y + dy, ck = canPlace(c, 'dhall', px, py, { move: true });
    if (!ck.ok) continue;
    let built = false, road = false;
    for (let a = 0; a < 2; a++) for (let b = 0; b < 2; b++) { const i = idx(ck.fp.x + a, ck.fp.y + b); if (c.level[i]) built = true; if (c.acc[i] === 1) road = true; }
    if (built) continue;
    const score = dx * dx + dy * dy - (road ? 30 : 0);
    if (score < bs) { bs = score; best = ck.fp; }
  }
  return best;
}

/**
 * Giữ mỗi quận đúng một toà trụ sở: xây khi thiếu (mới chia quận, bị phá), bỏ toà thừa (giải thể, chia lại ít quận hơn),
 * trụ sở bị dời bằng ✋ thì quận dời theo. Trả về true nếu ranh giới quận phải vẽ lại.
 */
export function syncHalls(c) {
  const D = c.dist, keep = new Set();
  let occ = false, moved = false;
  if (D && D.on) for (const q of D.list) {
    let s = q.hall != null ? c.services.find((v) => v.uid === q.hall && v.type === 'dhall') : null;
    if (!s) { // nạp bản lưu (uid không lưu): nhận lại toà UBND đang đứng đúng chỗ trụ sở
      s = c.services.find((v) => v.type === 'dhall' && v.x === q.x && v.y === q.y && !keep.has(v.uid)) || null;
      if (s) q.hall = s.uid;
    }
    if (!s) {
      const fp = hallSpot(c, q.x, q.y);
      if (!fp) continue;
      for (let a = 0; a < 2; a++) for (let b = 0; b < 2; b++) { const i = idx(fp.x + a, fp.y + b); c.zone[i] = 0; c.tree[i] = 0; }
      s = { type: 'dhall', x: fp.x, y: fp.y, dir: c.acc[idx(fp.x, fp.y)] === 1 ? c.rdir[idx(fp.x, fp.y)] : 1, uid: c.nextId++ };
      c.services.push(s); q.hall = s.uid; occ = true;
    }
    keep.add(s.uid);
    if (q.x !== s.x || q.y !== s.y) { q.x = s.x; q.y = s.y; moved = true; }
  }
  const n = c.services.length;
  c.services = c.services.filter((s) => s.type !== 'dhall' || keep.has(s.uid));
  if (occ || c.services.length !== n) { rebuildOcc(c); c.dirty.services = c.dirty.zones = c.dirty.trees = true; }
  if (moved) { rebuildDmap(c); c.dirty.zones = true; }
  return moved;
}

/** Dời trụ sở quận d tới ô (x, y): dời luôn toà nhà. */
export function moveHall(c, d, x, y) {
  const q = c.dist.list[d], k = q ? c.services.findIndex((v) => v.uid === q.hall) : -1;
  if (k < 0) return { ok: false, reason: 'Quận chưa có trụ sở' };
  const r = moveService(c, k, x, y);
  if (r.ok) syncHalls(c);
  return r;
}

// ───────────────────────── công trình do chủ tịch quận xây (chủ tịch chọn loại, game chọn chỗ) ─────────────────────────

/**
 * Chỗ xây công trình type trong quận d: ô trống (không phá nhà) có tâm trong quận, phủ được nhiều dân đang thiếu
 * công trình đó nhất (cùng loại phủ: công viên, trường, y tế, công an, cứu hoả, chống ngập ở vùng trũng).
 * Trả về { need: số dân thiếu, gain: số dân chỗ tốt nhất phủ thêm, x, y } hoặc { need, reason } nếu không xây được.
 */
export function distBuildPlan(c, d, type) {
  const def = SERVICES[type];
  if (!def || !c.dist || !c.dist.on || !c.dist.list[d]) return { need: 0, reason: 'Không có quận này' };
  if (!isUnlocked(c, type)) return { need: 0, reason: `${def.name}: ${lockText(def, c)}` };
  const cv = def.cover, map = c.cover[cv], pts = [], q = c.dist.list[d];
  let need = 0;
  for (let i = 0; i < N * N; i++) {
    const rc = c.resCount[i];
    if (!rc || c.dmap[i] !== d || map[i] >= 0.05) continue;
    if (cv === 'flood' && !(c.floodRisk && c.floodRisk[i] > 0.3)) continue;
    pts.push(i % N, (i / N) | 0, rc); need += rc;
  }
  const R = def.radius || 6;
  let best = null, bs = -Infinity, bg = 0;
  for (let y = 1; y < N - 1; y++) for (let x = 1; x < N - 1; x++) {
    if (c.dmap[idx(x, y)] !== d) continue;
    const ck = canPlace(c, type, x, y);
    if (!ck.ok) continue;
    let built = false, zoned = 0;
    for (let a = 0; a < ck.fp.size && !built; a++) for (let b = 0; b < ck.fp.size; b++) { const i = idx(ck.fp.x + a, ck.fp.y + b); if (c.level[i]) { built = true; break; } if (c.zone[i]) zoned++; }
    if (built) continue;
    let g = 0;
    for (let k = 0; k < pts.length; k += 3) { const dd = Math.hypot(pts[k] - x, pts[k + 1] - y); if (dd <= R) g += pts[k + 2] * (1 - dd / (R + 1)); }
    const s = g - zoned * 2 - Math.hypot(x - q.x, y - q.y) * 0.05; // bằng nhau thì chọn đất chưa quy hoạch, gần trụ sở
    if (s > bs) { bs = s; best = ck.fp; bg = g; }
  }
  if (!best) return { need, reason: def.cost > c.money ? 'Không đủ tiền' : 'Quận không còn đất trống hợp lệ' };
  const h = (def.size - 1) >> 1;
  return { need, gain: Math.round(bg), x: best.x + h, y: best.y + h };
}

/** Xây công trình type cho quận d ở chỗ game chọn; đánh dấu là công trình của quận. */
export function distBuild(c, d, type) {
  const p = distBuildPlan(c, d, type);
  if (p.x == null) return { ok: false, reason: p.reason };
  const r = placeService(c, type, p.x, p.y);
  if (!r.ok) return r;
  const s = c.services[c.services.length - 1], q = c.dist.list[d];
  s.dq = q.name; s.dby = q.chair;
  return { ok: true, cost: r.cost, uid: s.uid, x: p.x, y: p.y, gain: p.gain };
}

// ───────────────────────── bản đồ phủ, ô nhiễm, giá đất ─────────────────────────

function stamp(map, cx, cy, radius, strength, add) {
  const r = Math.ceil(radius);
  for (let y = Math.max(0, cy - r); y <= Math.min(N - 1, cy + r); y++) for (let x = Math.max(0, cx - r); x <= Math.min(N - 1, cx + r); x++) {
    const d = Math.hypot(x - cx, y - cy);
    if (d > radius) continue;
    const v = strength * (1 - d / (radius + 1)), i = idx(x, y);
    map[i] = add ? Math.min(1, map[i] + v) : Math.max(map[i], v);
  }
}

const AIR = [0.3, 0.38, 0.45, 0.32, 0.2]; // khói công nghiệp theo cấp (cấp cao sạch dần)
const RES_POL = { 8: [0, 0.04, 0], 9: [0, 0, 0.15], 10: [0.16, 0.35, 0.35], 11: [0.4, 0.42, 0.2], 21: [0.06, 0.08, 0.14] }; // khu chuyên biệt, xưởng chế biến: [khí, đất, ồn]

/**
 * Vùng phủ dịch vụ, bốn loại ô nhiễm (không khí, đất, nước, tiếng ồn) và giá trị đất.
 * Cây xanh và công viên lọc bớt bụi và tiếng ồn.
 */
export function computeMaps(c) {
  for (const m of Object.values(c.cover)) m.fill(0);
  c.air.fill(0); c.ground.fill(0); c.noise.fill(0); c.waterPol.fill(0); c.gloom.fill(0);
  for (const s of c.services) {
    const def = SERVICES[s.type], cx = s.x + ((def.size - 1) >> 1), cy = s.y + ((def.size - 1) >> 1);
    const air = svcVal(s, 'air');
    if (def.cover) stamp(c.cover[def.cover], cx, cy, svcVal(s, 'radius'), 1, false);
    if (def.care) stamp(c.cover.care, cx, cy, svcVal(s, 'radius'), 1, false);
    if (def.noise) stamp(c.noise, cx, cy, def.noise, Math.min(0.75, 0.25 + def.noise * 0.03), true);
    if (def.gloom) stamp(c.gloom, cx, cy, def.gloom, 1, false);
    if (def.graves) stamp(c.gloom, cx, cy, 3, 0.5, false);
    if (def.air) stamp(c.air, cx, cy, air, Math.min(1, air / 6), true);
    if (def.ground) stamp(c.ground, cx, cy, def.ground, Math.min(1, def.ground / 5), true);
    if (def.waterPol) stamp(c.waterPol, cx, cy, def.waterPol, Math.min(1, def.waterPol / 6), true);
    if (def.air || def.ground) stamp(c.noise, cx, cy, 3, 0.3, true);
  }
  for (let i = 0; i < N * N; i++) {
    const L = c.level[i];
    if (!L) continue;
    const z = c.zone[i], x = i % N, y = (i / N) | 0;
    if (z === 3 && c.ware && c.ware[i]) stamp(c.noise, x, y, 3, 0.2 + 0.03 * L, true); // kho bãi: không xả khói, chỉ ồn vì xe tải ra vào
    else if (z === 3) {
      const k = c.halted && c.halted[i] ? 0.2 : c.corpTech && c.owner && c.owner[i] ? 1 - 0.12 * (c.corpTech[c.owner[i]] || 0) : 1; // đình chỉ: gần như hết khói; máy móc mới: ít khói hơn
      stamp(c.air, x, y, 6, AIR[L - 1] * k, true); stamp(c.ground, x, y, 3, 0.3, true); stamp(c.noise, x, y, 3, 0.3, true);
    } else if (RES_POL[z]) {
      const [a, g, n] = RES_POL[z];
      if (a) stamp(c.air, x, y, 5, a, true);
      if (g) stamp(c.ground, x, y, 3, g, true);
      if (n) stamp(c.noise, x, y, 3, n, true);
    } else if (ZDEF[z].biz === 'shop' || ZDEF[z].biz === 'market') stamp(c.noise, x, y, 2, 0.1 + 0.03 * L, true);
    else if (ZDEF[z].biz === 'leisure') stamp(c.noise, x, y, 2.5, 0.16 + 0.03 * L, true);
  }
  for (const i of c.dumped || []) if (c.level[i]) stamp(c.waterPol, i % N, (i / N) | 0, 5, 0.55, true); // nhà máy được cho xả thải ra sông (hộp thư thị trưởng)
  // tiếng ồn giao thông: đường càng đông càng ồn
  for (const e of c.edges.values()) {
    const s = (0.1 + 0.55 * edgeLoad(c, e)) * (e.type === 'large' ? 1.35 : e.type === 'highway' ? 1.7 : 1);
    for (let k = 0; k < e.pts.length; k += 6) stamp(c.noise, cellOf(e.pts[k]), cellOf(e.pts[k + 1]), 2.6, s, false);
  }
  // trạm bơm hút phải nước bẩn?
  c.dirtyWater = false;
  for (const s of c.services) if (s.type === 'pump') for (let dy = -1; dy <= 2; dy++) for (let dx = -1; dx <= 2; dx++) { const a = s.x + dx, b = s.y + dy; if (inMap(a, b) && c.water[idx(a, b)] && c.waterPol[idx(a, b)] > 0.12) c.dirtyWater = true; }
  const dfx = decorFx(c); // cây xanh, thảm cỏ, lối đi bộ, bồn hoa
  for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) {
    const i = idx(x, y);
    let green = 0, shore = 0;
    for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) if (inMap(x + dx, y + dy) && c.tree[idx(x + dx, y + dy)]) green++;
    const dg = distFx(c, i, 'green'); // chương trình cây xanh của quận
    const filter = clamp(1 - green * 0.055 - c.cover.park[i] * 0.3 - dg * 0.08 - dfx.green[i] * 0.35, 0.25, 1);
    c.air[i] *= filter; c.noise[i] *= filter;
    c.pollution[i] = clamp(c.air[i] * 0.7 + c.ground[i] * 0.6 + c.noise[i] * 0.3 + (c.water[i] ? 0 : c.waterPol[i] * 0.3), 0, 1);
    let v = 26 + c.cover.park[i] * 20 + c.cover.police[i] * 10 + c.cover.fire[i] * 8 + c.cover.health[i] * 11 + c.cover.edu[i] * 13 - c.pollution[i] * 50;
    if (c.garbage && c.level[i] && c.garbage[i] > garbageLimit(c.zone[i], c.level[i])) v -= 10;
    v -= c.gloom[i] * 12 + c.crime[i] * 14;
    for (let d = 0; d < 4 && !shore; d++) for (let k = 1; k <= 3; k++) { const a = x + [1, 0, -1, 0][d] * k, b = y + [0, 1, 0, -1][d] * k; if (inMap(a, b) && c.water[idx(a, b)]) { shore = 1; break; } }
    v += shore * (10 - c.waterPol[i] * 14) + dg * 3 + distFx(c, i, 'business') * 1 + dfx.val[i] * 14;
    c.landValue[i] = clamp(v, 0, 100);
  }
}

/** Mức hài lòng của một ô nhà (0..100) và những thứ đang thiếu. */
/** Trạng thái điện / nước của ô i trong mạng: 0 không có, 1 đủ, 2 bị cắt (thiếu thì chỉ chừng phần thiếu số ô bị cắt, đổi theo ngày). */
export const netFlag = (sup, use, i, day) => (sup <= 0 ? 0 : use <= sup ? 1 : hash2(i, day, 97) < 1 - sup / use ? 2 : 1);

/** Mỗi điểm thuế dân cư trên 9% trừ bấy nhiêu điểm vui (trước đây 3: thuế 12% làm dân bỏ đi hàng loạt). */
export const TAX_MOOD = 1.5;
/** Uy tín thị trưởng (chế độ đi bộ): việc tốt cộng, quậy phá trừ; cộng thẳng vào hài lòng của mọi nhà, mỗi ngày phai bớt. */
export const MAYOR_REP = { min: 12, max: 5, fade: 0.85 };
export function cellHappy(c, i) {
  const needs = [], pop = c.pp.count;
  let h = 40 + c.landValue[i] * 0.5 - (c.tax.r - 9) * TAX_MOOD + c.bonus.happy + distFx(c, i, 'culture') * 2.5 + (c.mayorRep || 0);
  if ((c.mayorRep || 0) <= -2) needs.push('Thị trưởng gây rối ngoài đường, mất uy tín');
  if (flooded(c, i)) { h -= 18; needs.push('🌊 Nhà đang bị ngập nước'); }
  if (c.alley && c.alley[i]) { h -= 3; needs.push('Nhà trong hẻm chật chội'); }
  if (c.pOk[i] !== 1) { h -= 30; needs.push(c.pOk[i] ? 'Điện chập chờn' : 'Không có điện'); }
  if (c.wOk[i] !== 1) { h -= 20; needs.push(c.wOk[i] ? 'Nước yếu' : 'Không có nước'); }
  if (c.sOk[i] !== 1) { h -= 12; needs.push(c.sOk[i] ? 'Cống quá tải' : 'Không có chỗ xả nước thải'); }
  if (c.level[i] && c.garbage[i] > garbageLimit(c.zone[i], c.level[i])) { h -= 8; needs.push('Rác chất đống, chưa có xe tới thu gom'); }
  if (c.air[i] > 0.25) needs.push('Không khí ô nhiễm');
  if (c.ground[i] > 0.25) needs.push('Đất ô nhiễm');
  if (c.noise[i] > 0.4) { h -= 6; needs.push('Ồn ào'); }
  if (c.dirtyWater) { h -= 6; needs.push('Nước máy bẩn: trạm bơm hút gần cống xả'); }
  { const ri = c.retailIdx || 1; if (ri > RETAIL.hi) { h -= Math.min(4, Math.round((ri - RETAIL.hi) * 20)); needs.push(`Giá hàng đắt đỏ (×${ri.toFixed(2)}): cần nhiều hàng hơn`); } else if (ri < RETAIL.lo) h += 1; } // mặt bằng giá bán lẻ
  if (c.inc && c.inc.weather === 'heat' && c.level[i] && !(c.cover.park[i] > 0.05)) { h -= 4; needs.push('🥵 Nắng nóng, quanh nhà không có bóng cây'); }
  if (!c.water[i] && c.waterPol[i] > 0.35) { const k = 1 - 0.25 * distFx(c, i, 'drain'); h -= Math.round(c.waterPol[i] * 10 * k); needs.push(k < 1 ? 'Kênh rạch hôi (quận đang nạo vét)' : 'Kênh rạch, sông gần nhà bốc mùi hôi'); } // nạo vét của quận giảm mùi
  if (isTro(c, i)) { h -= 2; needs.push('Phòng trọ chật, rẻ'); }
  if (c.dead && c.dead[i]) { h -= 10; needs.push(c.cover.death[i] > 0.05 ? 'Người mất chưa được xe tang đưa đi' : 'Không có nghĩa trang hay đài hoá thân gần đây'); }
  if (c.crime[i] > 0.3) { h -= Math.round(c.crime[i] * 16); needs.push(c.cover.police[i] < 0.05 ? 'Tội phạm nhiều, ngoài vùng công an' : 'Tội phạm nhiều'); }
  const who = ZDEF[c.zone[i]].who;
  if (who === 'senior') h += 8; else if (who === 'student') h += 4;
  if (c.cover.health[i] < 0.05 && pop >= 120) needs.push('Xa trạm y tế');
  if (c.cover.death[i] < 0.05 && pop >= 1000) needs.push('Xa nghĩa trang, đài hoá thân');
  if (c.cover.fire[i] < 0.05 && pop >= 400) needs.push('Xa trạm cứu hoả');
  if (c.cover.police[i] < 0.05 && pop >= 400) needs.push('Ngoài vùng công an');
  return { happy: clamp(h, 0, 100), needs };
}

/** Thống kê: sức chứa, điện nước, thu chi, nhu cầu từng loại khu. */
export function recalc(c) {
  const s = c.stats, ps = c.pstats;
  quickStats(c);
  let housing = 0, jc = 0, ji = 0, jo = 0, use = 0, companies = 0;
  for (let i = 0; i < N * N; i++) {
    const L = c.level[i];
    if (!L) continue;
    const z = c.zone[i], jb = jobCap(z, L);
    housing += resCap(z, L); use += utilUse(z, L);
    if (jb) { companies++; if (ZDEF[z].biz === 'ind' || ZDEF[z].biz === 'res') ji += jb; else if (ZDEF[z].biz === 'office') jo += jb; else jc += jb; }
  }
  let pCap = 0, wCap = 0, sCap = 0, tCap = 0, civic = 0, roadLen = 0;
  const exp = { roads: 0, power: 0, water: 0, trash: 0, park: 0, civic: 0, transit: 0, tourism: 0, district: 0, loans: 0 };
  const kT = budgetK(c, 'transport');
  for (const e of c.edges.values()) { roadLen += e.len; exp.roads += (e.len * ROADS[e.type].upkeep + bridgeLen(c, e) * BRIDGES[bridgeOf(e)].upkeep) * kT; }
  const lineUp = { power: 0, pipe: 0 };
  for (const ln of c.lines) lineUp[ln.kind] += Math.hypot(ln.bx - ln.ax, ln.bz - ln.az) * LINES[ln.kind].upkeep;
  const bonus = { happy: 0, pull: 0, comm: 0 }, secUp = {};
  for (const sv of c.services) if (sv.type === 'hydro' && sv.dam) sv.hp = damPower(c, sv); // mùa nước lên xuống
  for (const sv of c.services) {
    const def = SERVICES[sv.type];
    if (sv.linked) { pCap += svcVal(sv, 'power'); wCap += svcVal(sv, 'water'); sCap += svcVal(sv, 'sewage'); } // chưa nối mạng thì chưa tính
    const sec = sectorOf(sv.type), kb = budgetK(c, sec);
    if (sec) sv.bud = kb; else delete sv.bud; // ngân sách ngành: công trình mạnh / yếu theo mức chi (svcVal)
    let up = def.upkeep;
    for (const m of sv.mods || []) up += moduleUpkeep(sv.type, m);
    tCap += svcVal(sv, 'trash'); exp[def.budget || def.group] += up * kb;
    if (sec) secUp[sec] = (secUp[sec] || 0) + up;
    for (const k in def.bonus || {}) bonus[k] += def.bonus[k];
    if (def.group === 'civic') civic++;
  }
  // dân thấy dịch vụ tốt lên / tệ đi: nhân theo độ lớn của ngành so với dân số (một tháp canh lửa không đủ làm cả thành phố vui)
  for (const k in c.budget || {}) if (secUp[k]) bonus.happy += ((c.budget[k] - 100) / 50) * Math.min(1, secUp[k] / (100 + ps.pop * 0.5));
  if (c.fest) { bonus.happy += festHappy(c); bonus.comm += festMul(c, 'comm'); } // lễ hội
  { const nb = beachCount(c); if (nb) bonus.happy += Math.min(3, nb / 25); } // bãi biển: dân cả thành phố vui hơn
  bonus.happy += decorHappy(c, c.pstats ? c.pstats.pop : 0); // cây xanh, lối đi bộ, bồn hoa
  if (c.rail) { const rb = railBonus(c); bonus.pull += rb.pull; bonus.comm += rb.comm; c.railExport = rb.exportK; bonus.happy += railHappy(c); } // ga thông ra cửa khẩu
  if (c.street) { const sb = streetBonus(c); bonus.happy += sb.happy; bonus.comm += sb.comm; } // vỉa hè, bụi mịn, cấm xe
  bonus.happy += flyHappy(c); // dân được bay đi chơi, công tác
  if (c.council) { bonus.happy += councilMod(c, 'happy'); bonus.pull += councilMod(c, 'pull'); bonus.comm += councilMod(c, 'comm'); } // quyết định của thị trưởng, hợp đồng
  c.bonus = bonus;
  let depots = 0, graves = 0, used = 0, cremate = 0, cells = 0;
  for (const sv of c.services) { const d = SERVICES[sv.type]; depots += d.depot || 0; if (d.graves) { graves += d.graves; used += sv.fill || 0; } cremate += d.cremate || 0; cells += d.cells || 0; }
  Object.assign(s, { depotCap: DEPOT_FREE + depots, graves, gravesUsed: used, cremate, prisonCap: cells, prisoners: Math.round(c.prisoners), research: c.research });
  exp.power += lineUp.power; exp.water += lineUp.pipe; exp.transit += transitUpkeep(c) * kT;
  const RATE = upkeepRate(c); // phí duy trì tăng dần theo dân số
  for (const k in exp) exp[k] = Math.round(exp[k] * RATE);
  exp.transit += c.rail ? railUpkeep(c) : 0; // bảo trì đường ray (theo ngày)
  exp.park += beachCount(c) * BEACH.upkeep + decorUpkeep(c) + fallsCount(c) * FALLS.upkeep; // thác nước: giữ nước chảy, dọn rêu // giữ vệ sinh, cứu hộ bãi biển; chăm cây, cỏ, hoa (theo ngày)
  exp.transit += c.street ? streetBonus(c).cost : 0; // quản lý vỉa hè, cấm xe, làn buýt (theo ngày)
  exp.tourism += promoCost(c) + dealCost(c);
  exp.district = distCost(c); // chương trình các quận (đã tính theo ngày) // quảng bá du lịch quốc tế, trợ giá đường bay (đã tính theo ngày)
  for (const ln of c.loans) exp.loans += ln.daily;
  const jobs = jc + ji + jo, pop = ps.pop, workers = ps.workers, employed = ps.employed, unemployed = workers - employed, vacJobs = Math.max(0, jobs - employed);
  const inc = { r: 0, c: 0, i: 0, t: 0, u: 0 };
  for (const slot of c.econ.ring) { inc.r += slot.r; inc.c += slot.c; inc.i += slot.i; inc.t += slot.t || 0; inc.u += slot.u || 0; }
  for (const k in inc) inc[k] = Math.round(inc[k]);
  Object.assign(s, {
    pop, jobs, jobsBy: { c: jc, i: ji, o: jo }, housing, workers, employed, unemployed, vacJobs, companies, happy: ps.happy,
    powerCap: pCap, powerUse: Math.round(use * heatUse(c).power), waterCap: wCap, waterUse: Math.round(use * heatUse(c).water), sewCap: sCap, trashCap: tCap, trashUse: Math.round(use * 2.2), roadLen,
    inc, income: inc.r + inc.c + inc.i + inc.t + inc.u, expense: Object.values(exp).reduce((a, b) => a + b, 0), exp,
  });
  // nhu cầu: dân tới khi có việc và nhà trống ít; việc làm mở thêm khi có người làm và người mua
  const tm = (t) => (9 - t) * 0.05;
  const early = 0.6 * Math.max(0, 1 - pop / 400);
  const spare = clamp((housing - pop - 14) / Math.max(30, housing * 0.25), 0, 1.3);
  const short = vacJobs > workers * 0.3 + 30 ? 0.45 : 0; // việc đang ế người làm thì đừng mở thêm
  // việc làm cần có tính theo số người trong tuổi lao động; có văn phòng thì bớt phần công nghiệp
  // tổng việc cần mở ≈ 1,07 × người lao động + 18: luôn dư chút việc để thành phố còn hút người tới
  const needO = (ps.edu[2] + ps.edu[3]) * 0.5, needC = workers * 0.45 + 8, needI = Math.max(10, workers * 0.62 + 10 - jo * 0.7);
  // pull: sức hút người tới ở (có việc, sống ổn); nhu cầu xây thêm nhà = pull trừ phần nhà đang bỏ trống
  c.pull = clamp(early + clamp((vacJobs - unemployed) / Math.max(40, workers * 0.3), -1, 0.6) + (ps.happy - 45) / 80 - (ps.burdenShare || 0) * 0.3 + tm(c.tax.r) + bonus.pull, -1, 1); // tiền nhà quá nặng với nhiều hộ: bớt người muốn đến
  c.demand.x = clamp(0.7 + tm(c.tax.i) * 2 - short * 2, -1, 1); // khu chuyên biệt bán ra ngoài được nên chỉ cần có người làm
  c.demand.r = clamp(c.pull - spare, -1, 1);
  const gap = pop > 150 ? clamp((0.8 - (c.econ.shopFill ?? 1)) * 1.2, 0, 0.5) : 0; // dân có tiền mà không mua được (kệ trống, ít cửa hàng): cần thêm cửa hàng
  c.demand.c = clamp((needC - jc) / Math.max(30, needC) + tm(c.tax.c) - short + gap, -1, 1);
  c.demand.i = clamp((needI - ji) / Math.max(30, needI) + tm(c.tax.i) - short, -1, 1);
  c.demand.o = zoneUnlocked(c, 6) ? clamp((needO - jo) / Math.max(30, needO) + tm(c.tax.c) - short, -1, 1) : 0;
  { const kB = c.league && c.league.alloc && +c.league.alloc.invest > 0 ? +c.league.alloc.invest : 1; // nhóm cạnh tranh: đầu tư máy chủ chia theo môi trường kinh doanh
    if (kB !== 1) for (const k of ['c', 'i', 'o']) if (c.demand[k] > 0) c.demand[k] = clamp(c.demand[k] * kB, -1, 1); }
  return s;
}

const BUDGET_NAME = { roads: ['🛣️', 'Đường sá, cầu'], power: ['⚡', 'Điện'], water: ['💧', 'Nước và thoát nước'], trash: ['🗑️', 'Rác'], park: ['🌳', 'Công viên'], civic: ['🏛️', 'Dịch vụ công'], transit: ['🚌', 'Xe buýt, metro'], tourism: ['🛎️', 'Du lịch'], district: ['🏙️', 'Chương trình các quận'], loans: ['🏦', 'Trả nợ'] };

/**
 * Chi tiết khoản chi mỗi ngày: từng nhóm (khớp c.stats.exp) với danh sách từng công trình / tuyến / loại đường tốn tiền,
 * xếp từ đắt tới rẻ. Mỗi mục: { icon, name, cost, note?, x?, z? } (x, z: toạ độ thế giới để camera bay tới).
 */
export function expenseItems(c) {
  const RATE = upkeepRate(c);
  const groups = {};
  for (const k in BUDGET_NAME) groups[k] = { key: k, icon: BUDGET_NAME[k][0], name: BUDGET_NAME[k][1], total: c.stats.exp?.[k] || 0, items: [] };
  const byType = {}, kT = budgetK(c, 'transport'); // phí nhân theo mức chi từng ngành, khớp recalc
  for (const e of c.edges.values()) {
    const t = byType[e.type] || (byType[e.type] = { len: 0, up: 0 });
    t.len += e.len; t.up += e.len * ROADS[e.type].upkeep * kT;
    const wl = bridgeLen(c, e);
    if (wl >= 4) {
      const st = bridgeOf(e), B = BRIDGES[st], m = midOf(e);
      groups.roads.items.push({ icon: B.icon, name: st === 'auto' ? (wl >= 46 ? BRIDGES.arch.full : BRIDGES.beam.full) : B.full, note: `${Math.round(wl)} m qua sông`, cost: wl * B.upkeep * kT * RATE, x: m[0], z: m[1] });
    }
  }
  for (const t in byType) groups.roads.items.push({ icon: ROADS[t].icon, name: ROADS[t].name, note: `${(byType[t].len / 1000).toFixed(2)} km`, cost: byType[t].up * RATE });
  for (const sv of c.services) {
    const def = SERVICES[sv.type], g = groups[def.budget || def.group];
    if (!g || def.district) continue; // trụ sở quận không tốn phí riêng
    const kb = budgetK(c, sectorOf(sv.type));
    let up = def.upkeep * kb;
    for (const m of sv.mods || []) up += moduleUpkeep(sv.type, m) * kb;
    const notes = [];
    if (sv.mods && sv.mods.length) notes.push(`${sv.mods.length} mô-đun`);
    if (sv.build) notes.push(`🚧 đang xây ${Math.round((1 - sv.build / sv.buildTot) * 100)}%`);
    g.items.push({ icon: def.icon, name: def.name, note: notes.join(' · '), cost: up * RATE, x: (sv.x + def.size / 2) * T - HALF, z: (sv.y + def.size / 2) * T - HALF });
  }
  const lineLen = { power: 0, pipe: 0 };
  for (const ln of c.lines) lineLen[ln.kind] += Math.hypot(ln.bx - ln.ax, ln.bz - ln.az);
  if (lineLen.power) groups.power.items.push({ icon: LINES.power.icon, name: LINES.power.name, note: `${(lineLen.power / 1000).toFixed(2)} km`, cost: lineLen.power * LINES.power.upkeep * RATE });
  if (lineLen.pipe) groups.water.items.push({ icon: LINES.pipe.icon, name: LINES.pipe.name, note: `${(lineLen.pipe / 1000).toFixed(2)} km`, cost: lineLen.pipe * LINES.pipe.upkeep * RATE });
  c.transit.lines.forEach((l, k) => {
    const s0 = l.stops[0];
    groups.transit.items.push({ icon: TRANSIT[l.mode].icon, name: `${TRANSIT[l.mode].name} số ${k + 1}`, note: `${l.count} xe · ${l.stops.length} trạm`, cost: (l.count * TRANSIT[l.mode].upkeep + l.stops.length * 4) * kT * RATE, ...(s0 ? { x: s0.x, z: s0.z } : {}) });
  });
  if (c.dist && c.dist.on) for (const q of c.dist.list) { const v = Math.round(planCostQ(q)); if (v) groups.district.items.push({ icon: '🏙️', name: `${q.name} · ${q.chair}`, note: q.mode === 'self' ? 'thị trưởng tự làm' : `trần ${q.cap.toLocaleString('vi-VN')} ₫/ngày`, cost: v, x: (q.x + 0.5) * T - HALF, z: (q.y + 0.5) * T - HALF }); }
  c.loans.forEach((ln) => groups.loans.items.push({ icon: '🏦', name: `Khoản vay ${Math.round(ln.amount).toLocaleString('vi-VN')}`, note: `còn ${Math.ceil(ln.left)} ngày`, cost: ln.daily }));
  const out = Object.values(groups);
  for (const g of out) { for (const it of g.items) it.cost = Math.round(it.cost); g.items.sort((a, b) => b.cost - a.cost); }
  return out;
}
const midOf = (e) => { const n = e.pts.length / 2, k = n >> 1; return [e.pts[k * 2], e.pts[k * 2 + 1]]; };

const LV_NEED = { 1: [38, 50, 62, 74], 4: [40, 52, 64, 76], 2: [34, 44, 54, 64], 5: [38, 48, 58, 68], 7: [38, 48, 58, 68], 6: [40, 50, 60, 70], 13: [36, 46, 56, 68], 14: [34, 44, 54, 64], 15: [40, 50, 60, 70], 16: [30, 40, 50, 60], 17: [34, 44, 54, 64], 18: [42, 52, 62, 72], 19: [50, 60, 70, 80] };
const lvNeed = (z, L) => (LV_NEED[z] ? LV_NEED[z][L - 1] : 0); // công nghiệp và khu chuyên biệt không cần giá đất

function canLevelUp(c, i) {
  const z = c.zone[i], L = c.level[i];
  if (L >= MAX_LEVEL || c.age[i] < 6 * L || c.landValue[i] < lvNeed(z, L)) return false;
  if (resCap(z, L) && c.resCount[i] < resCap(z, L) * 0.7) return false; // nhà còn vắng thì chưa cần xây to hơn
  if (jobCap(z, L)) {
    if (c.biz.eff[i] < 0.55 || c.biz.money[i] < 60 * MK) return false; // doanh nghiệp phải đang làm ăn được
    const need = reqEdu(z, L + 1), ps = c.pstats;
    let have = 0;
    for (let k = need; k < 4; k++) have += ps.edu[k];
    if (have < jobCap(z, L + 1) * 0.6) return false; // thành phố chưa đủ người có trình độ
  }
  return true;
}

/** Điều kiện còn thiếu để một ô nhà lên cấp (chuỗi mô tả, rỗng nếu đã tối đa). */
export function levelHint(c, i) {
  const z = c.zone[i], L = c.level[i];
  if (!L || L >= MAX_LEVEL) return '';
  const out = [];
  if (c.landValue[i] < lvNeed(z, L)) out.push(`giá trị đất từ ${lvNeed(z, L)}`);
  if (resCap(z, L) && c.resCount[i] < resCap(z, L) * 0.7) out.push('nhà gần kín người');
  if (jobCap(z, L)) {
    if (c.biz.eff[i] < 0.55 || c.biz.money[i] < 60 * MK) out.push('doanh nghiệp làm ăn có lãi');
    const need = reqEdu(z, L + 1);
    if (need) out.push(`đủ lao động trình độ ${['', 'tiểu học', 'trung học', 'đại học'][need]}`);
  }
  return out.length ? out.join(', ') : 'sắp lên cấp';
}

// ───────────────────────── vay nợ ─────────────────────────

export function takeLoan(c, k) {
  const def = LOANS[k];
  if (!def) return { ok: false, reason: 'Không có khoản vay này' };
  if (c.loans.length >= MAX_LOANS) return { ok: false, reason: `Chỉ được vay tối đa ${MAX_LOANS} khoản cùng lúc` };
  if (!worldCan(c, def.amount)) return { ok: false, reason: 'Ngân hàng hết tiền cho vay: thế giới bên ngoài đang cạn tiền' };
  c.loans.push({ amount: def.amount, daily: Math.round((def.amount * (1 + def.rate)) / def.days), left: def.days, h: def.days * 24 });
  cityGet(c, 'loanIn', def.amount); c.debtHours = 0;
  recalc(c);
  return { ok: true };
}

// ───────────────────────── vòng mô phỏng ─────────────────────────

/** Xây mới, lên cấp, bỏ hoang trên các ô đã quy hoạch. */
function growth(c) {
  const rng = c.rng;
  const zoned = [];
  for (let i = 0; i < N * N; i++) {
    if (!c.zone[i]) continue;
    zoned.push(i);
    if (c.level[i] && c.age[i] < 60000) c.age[i]++;
  }
  const samples = Math.min(zoned.length * 3, Math.ceil(50 + zoned.length * 0.5));
  let built = false;
  for (let k = 0; k < samples; k++) {
    const i = zoned[(rng() * zoned.length) | 0], z = c.zone[i], cat = ZDEF[z].cat;
    const dm = c.demand[cat] + (c.dfx ? (cat === 'r' ? distFx(c, i, 'housing') * 0.1 : cat === 'c' || cat === 'o' ? distFx(c, i, 'business') * 0.08 : 0) : 0); // chương trình quận
    if (c.alley && c.alley[i] && ZDEF[z].cat !== 'r') continue; // trong hẻm chỉ có nhà ở
    if ((c.beach && c.beach[i]) || (c.decor && c.decor[i]) || (c.falls && c.falls[i])) continue;
    const ok = c.pOk[i] === 1 && c.wOk[i] === 1 && c.sOk[i] === 1 && !flooded(c, i);
    if (!c.level[i]) {
      if (!c.acc[i] || !ok || !c.room(i, utilUse(z, 1) + 1)) continue;
      if ((c.owner && c.owner[i]) || (c.funded && c.funded[i]) ? 0.6 > rng() : Math.max(0, dm) * 0.4 > rng()) { // công ty đã trả tiền xây (cả nhà ở công nhân công ty tài trợ, chain.js) (nhà máy, kho, cửa hàng của công ty): xây ngay khi đủ điện nước, không chờ nhu cầu thành phố
        c.level[i] = 1; c.variant[i] = (rng() * 3) | 0; c.dir[i] = c.rdir[i]; c.age[i] = 0; c.tree[i] = 0;
        { const cap = 150 * MK * worldK(c); world(c, 'bizOpen', cap - c.biz.money[i]); c.biz.money[i] = cap; } c.biz.eff[i] = 0.5; c.biz.sin[i] = jobCap(z, 1) ? 10 : 0; // vốn ban đầu từ nhà đầu tư bên ngoài
        c.dirty.buildings = c.dirty.trees = true; built = true;
        computeNetworks(c); // cập nhật phần công suất còn dư
      }
    } else if (!c.acc[i]) {
      if (rng() < 0.3) { c._why = { kind: 'noroad' }; clearBuilding(c, i); c.zone[i] = 0; c.dirty.zones = true; }
    } else if (!ok && rng() < (c.pOk[i] === 0 || c.wOk[i] === 0 ? 0.02 : 0.007)) {
      c._why = { kind: 'noutil' }; clearBuilding(c, i); // bỏ hoang vì thiếu điện nước
    } else if (resCap(z, c.level[i]) && !jobCap(z, c.level[i]) && c.resCount[i] === 0 && c.age[i] > 36 && dm < -0.4 && rng() < 0.02) {
      clearBuilding(c, i); // nhà bỏ trống quá lâu
    } else if (ok && dm > -0.2 && canLevelUp(c, i) && !(c.ware && c.ware[i] && c.level[i] >= 3) && c.room(i, utilUse(z, c.level[i] + 1) - utilUse(z, c.level[i]) + 1) && rng() < 0.2) {
      c.level[i]++; c.age[i] = 0; c.dirty.buildings = true; built = true;
      computeNetworks(c);
    }
  }
  if (built) computeNetworks(c);
}

/** Một giờ trong game trôi qua. */
function hourTick(c) {
  c.hour++; c.day = Math.floor(c.hour / 24);
  const s = c.stats, h = c.hour % 24;
  if (c.hour % 3 === 0) computeMaps(c);
  computeNetworks(c);
  growth(c);
  for (const sv of c.services) if (sv.build > 0) { // công trường: mỗi giờ xây thêm một phần
    sv.build--; c.dirty.services = true;
    if (!sv.build) { delete sv.build; delete sv.buildTot; c.events.push({ type: 'built', name: SERVICES[sv.type].name, icon: SERVICES[sv.type].icon }); }
  }
  peopleHour(c);
  c.entryLinked = outsidePositions(c).length > 0;
  const W = outside(c); // thế giới bên ngoài: thế giới máy (chơi một mình) hoặc provider khác (world.js)
  let rooms = W.tourismHour(c, touristSpend) + W.intlHour(c, { spend: touristSpend, addCitizen });
  if (c.rail && c.rail.lines.length) { const o = intlOutlook(c); rooms += railHour(c, { spend: touristSpend, addCitizen, lure: o.lure, mood: o.mood }); } // tàu liên vận qua cửa khẩu: tiền vé // du khách: tiền phòng, phí hạ cánh / cập cảng của khách quốc tế
  { const hot = c.inc.weather === 'heat'; incidentsHour(c); if (hot !== (c.inc.weather === 'heat')) { computeNetworks(c); recalc(c); } } // đổi sang / hết nắng nóng: tính lại điện nước
  seasonHour(c); // bão, ngập, triều cường
  if (c.council) { const fresh = councilHour(c); if (fresh.length) (c.aiQueue || (c.aiQueue = [])).push(...fresh.map((f) => f.id)); } // hộp thư thị trưởng
  corpHour(c); // tập đoàn: quét lợi nhuận, CEO ra quyết định
  if (c.dist && c.dist.on) { const jobs = districtHour(c); if (jobs.length) (c.distQueue || (c.distQueue = [])).push(...jobs); } // quận, chủ tịch quận
  // thu nhập giữa hai giờ (xe hàng, xe rác tới nơi) đã cộng dồn sẵn vào c.hourInc
  transitHour(c);
  // sổ thu chi: thuế thu ngay trong giờ, phí bảo trì chia đều 24 giờ
  const fares = c.transit.income - c.fareSeen; c.fareSeen = c.transit.income;
  smoothWeek(c, h);
  c.econ.ring[h] = { r: c.hourInc.r, c: c.hourInc.c, i: c.hourInc.i, t: fares, u: rooms };
  recalc(c);
  c.taxBreakK = taxBreak(c); // nhà đầu tư được miễn một phần thuế thương mại, công nghiệp (áp lúc doanh nghiệp bị trừ thuế, people.js)
  cityTake(c, 'tax', c.hourInc.r + c.hourInc.c + c.hourInc.i); c.hourInc.r = c.hourInc.c = c.hourInc.i = 0; // thuế: phần đã trừ thật của dân, doanh nghiệp; thuế phát sinh sau đây (thầu bảo trì) sang giờ sau mới thu
  cityGet(c, 'rooms', rooms * worldK(c)); // khách ngoài thành phố trả: thế giới nghèo thì trả ít
  { const lp = (s.exp.loans || 0) / 24; cityPay(c, 'loanPay', lp); cityPay(c, 'upkeep', s.expense / 24 - lp); }
  if (h === 0) { issueDay(c); ledgerDay(c); W.ruralDay(c); reserveDay(c); reportDay(c); if (c.mayorRep) { c.mayorRep *= MAYOR_REP.fade; if (Math.abs(c.mayorRep) < 0.05) c.mayorRep = 0; } }
  if (h === 0) { W.marketDay(c); W.tourismDay(c); W.intlDay(c); if (c.street) streetDay(c); if (c.rail) railDay(c); chainDay(c); } // chainDay: chuỗi sự kiện nhân quả, giá thuê theo khu, bản sắc kinh tế
  if (h === 0 || (c.inc && c.inc.weather !== c._wWeather)) { // mùa mưa / khô, trời bão: ao hồ do đào đắp đầy lên hoặc cạn bớt
    c._wWeather = c.inc && c.inc.weather;
    if (waterSync(c)) { makeResources(c, heightFn(c)); roadsChanged(c); computeMaps(c); }
  }
  for (const ln of c.loans) { ln.h = (ln.h ?? Math.round(ln.left * 24)) - 1; ln.left = ln.h / 24; } // đếm giờ nguyên: vay 4 ngày trả đúng 96 giờ
  if (c.loans.some((ln) => ln.h <= 0)) { c.loans = c.loans.filter((ln) => ln.h > 0); c.events.push({ type: 'loanPaid' }); recalc(c); }
  if (c.sandbox) { citySet(c, 'sandbox', OPEN_MONEY); c.debtHours = 0; } // chế độ Open: tiêu thoải mái, không phá sản
  c.debtHours = c.money < 0 ? c.debtHours + 1 : 0;
  if (!c.sandbox && c.money < BANKRUPT_AT || c.debtHours > BANKRUPT_DAYS * 24) { c.over = true; c.events.push({ type: 'bankrupt' }); }
  while (c.milestone < MILESTONES.length && s.pop >= MILESTONES[c.milestone].pop) {
    const m = MILESTONES[c.milestone++];
    cityGet(c, 'reward', Math.round(m.reward * worldK(c))); c.points += m.points + (c.devTree ? DEV_TREE_BONUS : 0); // thưởng từ ngân sách cấp trên (ví thế giới, có hạn)
    const fresh = (d) => d.unlock && d.unlock <= m.pop && !MILESTONES.some((o, k) => k < c.milestone - 1 && o.pop >= d.unlock);
    const unlocked = [...Object.values(SERVICES), ...ZDEF.slice(1)].filter(fresh).map((d) => d.name);
    c.events.push({ type: 'milestone', name: m.name, reward: m.reward, points: m.points, unlocked });
  }
}

/**
 * Thuế nộp theo tuần: ngày thường (người đi làm, nhà máy chạy) thành phố thu ngay 5/7, giữ 2/7 lại
 * chia đều cho các giờ cuối tuần, để thứ bảy, chủ nhật không lỗ. Tổng thu cả tuần không đổi.
 */
function smoothWeek(c, h) {
  const pool = c.econ.pool || (c.econ.pool = { r: 0, c: 0, i: 0 }), weekend = c.day % 7 >= 5, left = Math.max(1, (7 - (c.day % 7)) * 24 - h);
  for (const k of ['r', 'c', 'i']) {
    if (!weekend) { pool[k] += c.hourInc[k] * 2 / 7; c.hourInc[k] *= 5 / 7; } else { const pay = pool[k] / left; pool[k] -= pay; c.hourInc[k] += pay; }
  }
}

/** Tiến mô phỏng thêm dt giây (đã nhân tốc độ game): xe chạy liên tục, mỗi HOUR_SEC giây là một giờ. */
export function advance(c, dt) {
  if (c.over) return;
  while (dt > 0) {
    const step = Math.min(dt, 0.25);
    stepTraffic(c, step); stepTransit(c, step); stepFerries(c, step); incidentsStep(c, step);
    c.clock += step; dt -= step;
    if (c.clock >= HOUR_SEC) { c.clock -= HOUR_SEC; hourTick(c); if (c.over) return; }
  }
}

/**
 * Chạy bù thời gian thành phố vắng chủ (chế độ cạnh tranh dùng đồng hồ thật: MULTIPLAYER.md). hours: số giờ game đã qua;
 * tối đa maxHours (mặc định 3 ngày) để mở lại không phải chờ lâu. Trả về số giờ đã chạy và số người, tiền thay đổi.
 */
export function catchUp(c, hours, maxHours = 72) {
  const n = Math.max(0, Math.min(Math.floor(hours), maxHours)), pop0 = c.pp.count, money0 = c.money;
  for (let k = 0; k < n && !c.over; k++) tick(c);
  return { hours: n, skipped: Math.max(0, Math.floor(hours) - n), pop: c.pp.count - pop0, money: Math.round(c.money - money0) };
}

/** Một giờ trôi qua (tiện cho test). */
export function tick(c) { advance(c, HOUR_SEC - c.clock + 1e-6); }

// ───────────────────────── lưu / nạp ─────────────────────────

const b64 = (u8) => { let s = ''; for (let i = 0; i < u8.length; i += 8192) s += String.fromCharCode(...u8.subarray(i, i + 8192)); return btoa(s); };
const unb64 = (str, n) => { const s = atob(str || ''), u = new Uint8Array(n ?? s.length); for (let i = 0; i < u.length && i < s.length; i++) u[i] = s.charCodeAt(i); return u; };
const r1 = (v) => Math.round(v * 10) / 10;

/** Giá bán lẻ: chỉ lưu các ô khác giá gốc, [ô, hệ số]. */
function packRetail(c) {
  const rp = [];
  for (let i = 0; i < N * N; i++) if (c.level[i] && Math.abs((c.biz.rp[i] || 1) - 1) > 0.005) rp.push([i, Math.round(c.biz.rp[i] * 1000) / 1000]);
  return { idx: Math.round((c.retailIdx || 1) * 1000) / 1000, rp };
}
export function serialize(c) {
  const pack = (k) => b64(c[k]), pp = packPeople(c), terra = [];
  for (let k = 0; k < c.terra.length; k++) if (c.terra[k]) terra.push(k, c.terra[k]);
  return {
    v: 4, n: N, map: c.map, tgen: c.tgen, style: c.style, seed: c.seed, name: c.name, money: Math.round(c.money), ...(c.popl ? { rural: c.popl.rural, abroad: c.popl.abroad } : {}), hour: c.hour, tax: c.tax, milestone: c.milestone, start: c.start,
    loans: c.loans, debtHours: c.debtHours, over: c.over, nextId: c.nextId, research: r1(c.research), prisoners: Math.round(c.prisoners), ...(c.mayorRep ? { mayorRep: r1(c.mayorRep) } : {}), ...(c.quests && c.quests.length ? { quests: c.quests } : {}), // nhiệm vụ dân nhờ (quests.js kiểm lại khi nạp)
    apv: 1, cell: T, tech: [...c.tech], points: c.points, devTree: c.devTree ? 1 : 0, sandbox: c.sandbox ? 1 : 0, econ: packEcon(c), season: packSeason(c), used: packReserve(c), ledger: packLedger(c), league: packLeague(c), council: packCouncil(c), dist: packDistricts(c), corp: packCorp(c), chain: packChain(c), retail: packRetail(c), street: packStreet(c), rail: packRail(c), beach: packBeach(c), decor: packDecor(c), falls: packFalls(c), fishery: packFishery(c), owned: b64(c.owned), weather: [c.inc.weather, c.inc.wUntil],
    nodes: [...c.nodes.values()].map((n) => (n.h != null ? [n.id, r1(n.x), r1(n.z), n.ctl | 0, n.rb | 0, Math.round(n.h * 100) / 100] : n.ctl || n.rb ? [n.id, r1(n.x), r1(n.z), n.ctl | 0, n.rb | 0] : [n.id, r1(n.x), r1(n.z)])),
    edges: [...c.edges.values()].map((e) => {
      const a = [e.id, e.a, e.b, e.type, r1(e.cx), r1(e.cz)];
      if (e.wear > 0.05 || e.br || e.ch) a.push(e.wear > 0.05 ? Math.round(e.wear * 100) / 100 : 0);
      if (e.br || e.ch) a.push(e.br || 0); // kiểu cầu
      if (e.ch) a.push(1); // độ cao tuỳ chỉnh theo nút
      return a;
    }),
    bans: [...c.edges.values()].filter((e) => e.ban).map((e) => [e.id, e.ban]), // biển cấm theo đoạn đường
    bumps: [...c.edges.values()].filter((e) => e.bump).map((e) => e.id), // gờ giảm tốc
    turns: [...c.nodes.values()].filter((n) => n.turn).map((n) => [n.id, n.turn]), // biển cấm rẽ ở nút
    lines: c.lines.map((l) => [l.kind, r1(l.ax), r1(l.az), r1(l.bx), r1(l.bz)]),
    rings: c.rings.map((g) => [g.x, g.z]),
    services: c.services.map((s) => ({ type: s.type, x: s.x, y: s.y, dir: s.dir, ...(s.mods && s.mods.length ? { mods: s.mods } : {}), ...(s.fill ? { fill: Math.round(s.fill) } : {}), ...(s.build ? { build: s.build, buildTot: s.buildTot } : {}), ...(s.sea ? { sea: 1 } : {}), ...(s.dq ? { dq: s.dq, dby: s.dby } : {}), ...(s.type === 'hydro' && s.dam ? { dam: { cells: s.dam.cells, head: s.dam.head, q: r1(s.dam.q) } } : {}) })),
    transit: { fare: c.transit.fare, ferryFare: c.transit.ferryFare, lines: c.transit.lines.map((l) => ({ mode: l.mode, count: l.count, stops: l.stops.map((s) => [r1(s.x), r1(s.z)]) })) },
    tree: pack('tree'), zone: pack('zone'), level: pack('level'), variant: pack('variant'), dir: pack('dir'),
    ...(terra.length ? { terra } : {}), // đào đắp: [chỉ số đỉnh, độ lệch × 10, ...] chỉ gồm đỉnh đã đổi
    people: { n: c.pp.count, age: b64(pp.age), edu: b64(pp.edu), home: b64(pp.home), work: b64(pp.work), money: b64(pp.money), happy: b64(pp.happy) },
    bld: packBld(c),
  };
}

/** Tuổi nhà và tiền doanh nghiệp của từng toà nhà (theo thứ tự ô có nhà): Uint16 tuổi, Int16 tiền. */
function packBld(c) {
  let n = 0;
  for (let i = 0; i < N * N; i++) if (c.level[i]) n++;
  const age = new Uint16Array(n), money = new Int16Array(n);
  for (let i = 0, k = 0; i < N * N; i++) if (c.level[i]) { age[k] = c.age[i]; money[k++] = clamp(Math.round(c.biz.money[i] / MK), -32000, 32000); } // lưu theo đơn vị cũ (chia MK)
  return { age: b64(new Uint8Array(age.buffer)), money: b64(new Uint8Array(money.buffer)) };
}
/** lv: mảng cấp nhà đúng như trong bản lưu (trước khi dọn ô hỏng) để khớp thứ tự. Bản lưu cũ: nhà 30 giờ tuổi, doanh nghiệp 150 ₫. */
function unpackBld(c, o, lv) {
  let n = 0;
  for (let i = 0; i < N * N; i++) if (lv[i]) n++;
  const age = o ? new Uint16Array(unb64(o.age, n * 2).buffer) : null, money = o ? new Int16Array(unb64(o.money, n * 2).buffer) : null;
  for (let i = 0, k = 0; i < N * N; i++) {
    if (!lv[i]) continue;
    if (c.level[i]) { c.age[i] = age ? age[k] : 30; c.biz.money[i] = (money ? money[k] : 150) * MK; }
    k++;
  }
}

/** Nạp bản lưu. Đổi cỡ bản đồ theo bản lưu; nạp hỏng thì trả cỡ cũ để thành phố đang chơi không bị ảnh hưởng. */
export function deserialize(o) {
  const prev = N, prevT = T;
  try { return deserializeAt(o); } catch (e) { setMapSize(prev, prevT); throw e; }
}

function deserializeAt(o) {
  if (!o || ![2, 3, 4].includes(o.v) || !MAP_SIZES[o.n]) throw new Error('Bản lưu không hợp lệ hoặc thuộc phiên bản cũ');
  setMapSize(o.n, o.cell === CELL_NEW ? CELL_NEW : 10); // bản lưu cũ: ô 10 m
  const num = (v, d) => (Number.isFinite(+v) ? +v : d);
  const old = o.v === 2; // bản lưu trước khi có người dân: giữ nguyên đường và nhà, dân sẽ tự dọn về
  const open = o.v < 4; // bản lưu trước khi có mua đất / cây công nghệ: đất mở sẵn cả bản đồ, địa hình giữ kiểu cũ, điểm tính bù theo mốc đã đạt
  const ms = clamp(o.milestone | 0, 0, MILESTONES.length);
  const mods = (s) => (Array.isArray(s.mods) ? [...new Set(s.mods)].filter((m) => MODULES[m] && MODULES[m].for.includes(s.type)) : []);
  const c = {
    v: 4, tgen: open ? 1 : clamp(o.tgen | 0, 1, 3), style: o.style === 'vn' ? 'vn' : 'classic', // bản lưu cũ giữ kiểu nhà cũ
    devTree: o.devTree ? 1 : 0, tech: new Set(open ? [] : (o.tech || []).filter((t) => TECH[t])),
    points: open ? START_POINTS + MILESTONES.slice(0, ms).reduce((n, m) => n + m.points, 0) : clamp(o.points | 0, 0, 999),
    owned: new Uint8Array(LT * LT).fill(1), map: MAPS[o.map] ? o.map : 'river', // bỏ mua đất: bản lưu cũ cũng mở cả bản đồ
    seed: o.seed | 0, name: String(o.name || 'Phố Mới').slice(0, 24), money: num(o.money, 0), hour: Math.max(0, (old ? o.day : o.hour) | 0), milestone: clamp(o.milestone | 0, 0, MILESTONES.length),
    tax: { r: clamp(num(o.tax?.r, 9), 1, 20), c: clamp(num(o.tax?.c, 9), 1, 20), i: clamp(num(o.tax?.i, 9), 1, 20) },
    start: { x: clamp(o.start?.x | 0, 0, N - 1), y: clamp(o.start?.y | 0, 0, N - 1) },
    loans: old ? [] : (o.loans || []).slice(0, MAX_LOANS).map((l) => { const h = Math.round(num(l.h, num(l.left, 0) * 24)); return { amount: num(l.amount, 0), daily: num(l.daily, 0), left: h / 24, h }; }), // bản lưu cũ chỉ có số ngày lẻ
    debtHours: o.debtHours | 0, over: !!o.over, nextId: Math.max(1, o.nextId | 0), research: clamp(num(o.research, 0), 0, 100), prisoners: Math.max(0, num(o.prisoners, 0)), mayorRep: clamp(num(o.mayorRep, 0), -MAYOR_REP.min, MAYOR_REP.max), quests: Array.isArray(o.quests) ? o.quests.slice(0, 3) : [],
    nodes: new Map(), edges: new Map(), water: new Uint8Array(N * N), rings: (o.rings || []).map((g) => ({ x: num(g[0], 0), z: num(g[1], 0) })),
    lines: (o.lines || []).filter((l) => LINES[l[0]]).map((l) => ({ kind: l[0], ax: num(l[1], 0), az: num(l[2], 0), bx: num(l[3], 0), bz: num(l[4], 0) })),
    services: (o.services || []).filter((s) => SERVICES[s.type] && inMap(s.x | 0, s.y | 0) && inMap((s.x | 0) + SERVICES[s.type].size - 1, (s.y | 0) + SERVICES[s.type].size - 1)).map((s) => ({ type: s.type, x: s.x | 0, y: s.y | 0, dir: s.dir & 3, mods: mods(s), ...(SERVICES[s.type].graves ? { fill: clamp(num(s.fill, 0), 0, SERVICES[s.type].graves) } : {}), ...(s.build > 0 ? { buildTot: clamp(s.buildTot | 0, 1, 99), build: clamp(s.build | 0, 1, clamp(s.buildTot | 0, 1, 99)) } : {}), ...(s.sea && s.type === 'ferry' ? { sea: 1 } : {}), ...(s.dq ? { dq: String(s.dq).slice(0, 12), dby: String(s.dby || '').slice(0, 40) } : {}), ...(s.type === 'hydro' && s.dam && Array.isArray(s.dam.cells) && s.dam.cells.length && s.dam.cells.length <= 17 && s.dam.cells.every((i) => Number.isInteger(i) && i >= 0 && i < N * N) ? { dam: { cells: s.dam.cells.slice(), head: clamp(num(s.dam.head, 8), 8, 36), q: clamp(num(s.dam.q, 0), 0, 30) } } : {}) })),
  };
  if (!c.owned.some((v) => v)) c.owned.fill(1);
  for (const k of ['tree', 'zone', 'level', 'variant', 'dir']) c[k] = unb64(o[k], N * N);
  const lv0 = c.level.slice(); // thứ tự toà nhà trong bản lưu (tuổi nhà, tiền doanh nghiệp)
  for (let i = 0; i < N * N; i++) { if (c.zone[i] >= ZDEF.length) c.zone[i] = 0; if (c.level[i] > MAX_LEVEL || !c.zone[i]) c.level[i] = 0; }
  const keepTree = c.tree;
  c.tree = new Uint8Array(N * N); genLand(c); c.tree = keepTree; // nước tự nhiên sinh lại từ seed; phần đào đắp nạp từ bản lưu (makeTerrain dọn nhà, cây trên ô nước)
  c.terra = new Int16Array((N + 1) * (N + 1));
  if (Array.isArray(o.terra)) for (let p = 0; p + 1 < o.terra.length; p += 2) { const k = o.terra[p] | 0; if (k >= 0 && k < c.terra.length) c.terra[k] = clamp(o.terra[p + 1] | 0, -800, 800); }
  unpackBeach(c, o.beach); unpackDecor(c, o.decor); unpackFalls(c, o.falls); unpackFishery(c, o.fishery); unpackReserve(c, o.used); applyDepletion(c); unpackLeague(c, o.league);
  attach(c);
  initStreet(c, o.street || {}); // trước khi dựng ô quy hoạch: hẻm cần biết chính sách
  initRail(c, o.rail || {}); c.railCell = railCells(c); c.tunnelCell = tunnelCells(c); // đường ray: ô có ray không quy hoạch
  for (const n of o.nodes || []) {
    const id = n[0] | 0, node = { id, x: num(n[1], 0), z: num(n[2], 0) };
    if (n[3]) node.ctl = clamp(n[3] | 0, 0, 2);
    if (n[4]) node.rb = 1;
    if (n[5] != null && Number.isFinite(+n[5])) node.h = clamp(+n[5], -10, 40);
    c.nodes.set(id, node); c.nextId = Math.max(c.nextId, id + 1);
  }
  for (const e of o.edges || []) {
    const id = e[0] | 0;
    if (!c.nodes.has(e[1]) || !c.nodes.has(e[2]) || !ROADS[e[3]] || e[1] === e[2]) continue;
    const keep = c.nextId; c.nextId = id;
    const made = addEdge(c, e[1], e[2], e[3], num(e[4], null), num(e[5], null));
    if (e[6]) made.wear = clamp(num(e[6], 0), 0, 1);
    if (BRIDGES[e[7]] && e[7] !== 'auto') made.br = e[7];
    if (e[8] === 1) made.ch = 1;
    c.nextId = Math.max(keep, id + 1);
  }
  for (const id of Array.isArray(o.bumps) ? o.bumps : []) { const e = c.edges.get(id | 0); if (e) e.bump = 1; }
  for (const t of Array.isArray(o.turns) ? o.turns : []) { const n = Array.isArray(t) && c.nodes.get(t[0] | 0); if (n && TURNS[t[1] | 0] && t[1] | 0) n.turn = t[1] | 0; }
  for (const b of Array.isArray(o.bans) ? o.bans : []) { const e = Array.isArray(b) && c.edges.get(b[0] | 0); if (e && BANS[b[1] | 0] && b[1] | 0) e.ban = b[1] | 0; }
  for (let i = 0; i < N * N; i++) if (c.level[i]) c.biz.sin[i] = jobCap(c.zone[i], c.level[i]) ? 10 : 0;
  if (o.retail) { // giá bán lẻ từng cửa hàng và chỉ số giá chung: nạp lại không bị nhảy về ×1
    for (const p of Array.isArray(o.retail.rp) ? o.retail.rp : []) if (Array.isArray(p) && p[0] >= 0 && p[0] < N * N && c.level[p[0]]) c.biz.rp[p[0] | 0] = clamp(+p[1] || 1, RETAIL.min, RETAIL.max);
    c.retailIdx = clamp(+o.retail.idx || 1, RETAIL.min, RETAIL.max);
  }
  unpackBld(c, o.bld && o.bld.age ? o.bld : null, lv0);
  roadsChanged(c);
  if (o.people && o.people.n) {
    const n = o.people.n | 0;
    unpackPeople(c, { age: unb64(o.people.age, n), edu: unb64(o.people.edu, n), home: unb64(o.people.home, n * 2), work: unb64(o.people.work, n * 2), money: unb64(o.people.money, n * 2), happy: o.people.happy ? unb64(o.people.happy, n) : null });
  }
  if (o.transit) {
    c.transit.fare = clamp(num(o.transit.fare, 2), 0, 10);
    c.transit.ferryFare = clamp(num(o.transit.ferryFare, 4), 0, 20);
    for (const l of o.transit.lines || []) {
      if (!TRANSIT[l.mode]) continue;
      const r = addLine(c, l.mode, (l.stops || []).map((s) => ({ x: num(s[0], 0), z: num(s[1], 0) })), true);
      if (r.line) r.line.count = clamp(l.count | 0, 1, 8);
    }
    maintainTransit(c);
  }
  if (Array.isArray(o.weather) && WEATHER_KINDS.includes(o.weather[0])) { c.inc.weather = o.weather[0]; c.inc.wUntil = num(o.weather[1], 0); }
  initEcon(c, o.econ || {});
  initSeason(c, o.season || {});
  initCouncil(c, o.council || {});
  initDistricts(c, o.dist || {});
  initCorp(c, o.corp || {});
  initChain(c, o.chain || {});
  if (!o.apv) for (const sv of c.services) if (sv.type === 'airport' && !(sv.mods || (sv.mods = [])).includes('intl')) sv.mods.push('intl'); // bản lưu trước khi có sân bay nội địa: sân bay cũ đã là quốc tế
  applyStreet(c);
  if (o.sandbox) enableSandbox(c);
  computeMaps(c); recalc(c);
  resetLedger(c, o.ledger); resetPop(c, o.rural ?? undefined, o.abroad ?? 0);
  if (!c.league && c.popl.rural + c.pp.count < RURAL.start * 0.5) restoreRural(c); // bản lưu hỏng do rời nhóm cũ: nguồn dân chỉ còn vài người trong khi dân thành phố chưa thể đã dùng hết (12000)
  // sổ cái mở lại từ bản lưu (ví dân lưu dạng số nguyên); bản lưu cũ: nông thôn đầy
  return c;
}
const WEATHER_KINDS = ['clear', 'rain', 'dry', 'hail', 'heat'];

void bizKind;
