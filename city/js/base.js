// Phố Mới — hằng số, bảng định nghĩa và hàm thuần dùng chung cho mọi module mô phỏng.
export const T = 10; // cạnh một ô (đơn vị thế giới)
export const LAND = 12; // cạnh một ô đất (lưới quản lý đất cũ, tính theo ô lưới)
/** Cỡ bản đồ chọn được khi chơi mới (số ô mỗi cạnh). 96 là cỡ của các bản lưu cũ. */
export const MAP_SIZES = { 96: { name: 'Vừa', desc: '96 × 96 ô, gọn, máy yếu chạy mượt' }, 128: { name: 'Lớn', desc: '128 × 128 ô, gần gấp đôi diện tích' }, 160: { name: 'Rất lớn', desc: '160 × 160 ô, gần gấp ba, cần máy khoẻ' } };
// cỡ bản đồ hiện tại: biến "sống" (live binding), đổi bằng setMapSize trước khi tạo / nạp thành phố và trước khi dựng cảnh 3D
export let N = 96; // bản đồ N x N ô
export let HALF = (N * T) / 2;
export let LT = Math.ceil(N / LAND); // bản đồ có LT x LT ô đất
/** Đổi cỡ bản đồ cho mọi module (giá trị N, HALF, LT nhập ở module khác tự cập nhật theo). */
export function setMapSize(n) {
  n = MAP_SIZES[n] ? +n : 96;
  N = n; HALF = (N * T) / 2; LT = Math.ceil(N / LAND);
  return N;
}
export const HOUR_SEC = 5; // một giờ trong game dài bao nhiêu giây ở tốc độ 1 (một ngày = 2 phút)
export const RATE = 6; // hệ số quy phí / thuế "mỗi kỳ" cũ sang "mỗi ngày"

export const idx = (x, y) => y * N + x;
export const inMap = (x, y) => x >= 0 && y >= 0 && x < N && y < N;
export const cellOf = (w) => Math.floor((w + HALF) / T);
export const cellCenter = (i) => (i + 0.5) * T - HALF;
export const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
export const cellX = (i) => cellCenter(i % N);
export const cellZ = (i) => cellCenter((i / N) | 0);

// khu quy hoạch. res / jobs: sức chứa theo cấp 1..5; cat: thanh nhu cầu; biz: loại doanh nghiệp
export const ZONE = { NONE: 0, R: 1, C: 2, I: 3, RH: 4, CH: 5, O: 6, M: 7, FARM: 8, WOOD: 9, MINE: 10, OIL: 11, FISH: 12, RM: 13, ROW: 14, SENIOR: 15, DORM: 16, LEISURE: 17, TECH: 18, FIN: 19 };
export const ZDEF = [
  { id: 0, name: 'Chưa quy hoạch', icon: '🧽', color: '#cfd6dc', rgb: [0, 0, 0] },
  { id: 1, name: 'Dân cư thấp tầng', short: 'Nhà ở', icon: '🏠', color: '#46c85a', rgb: [70, 200, 90], cat: 'r', res: [4, 6, 8, 10, 12], unlock: 0, desc: 'Nhà riêng, ít dân, yên tĩnh' },
  { id: 2, name: 'Thương mại nhỏ', short: 'Cửa hàng', icon: '🏬', color: '#468cec', rgb: [70, 140, 235], cat: 'c', jobs: [4, 6, 8, 10, 12], biz: 'shop', unlock: 0, desc: 'Cửa hàng bán lẻ: cần hàng hoá từ nhà máy hoặc nhập khẩu' },
  { id: 3, name: 'Công nghiệp', short: 'Công nghiệp', icon: '🏭', color: '#f0be32', rgb: [240, 190, 50], cat: 'i', jobs: [8, 12, 16, 22, 30], biz: 'ind', unlock: 0, desc: 'Nhà máy chế biến nguyên liệu thành hàng hoá: nhiều việc làm, gây ô nhiễm' },
  { id: 4, name: 'Dân cư cao tầng', short: 'Chung cư', icon: '🏢', color: '#1f8f4e', rgb: [25, 130, 70], cat: 'r', res: [16, 30, 50, 80, 120], unlock: 400, desc: 'Chung cư: rất nhiều dân trên một ô đất' },
  { id: 5, name: 'Thương mại lớn', short: 'TT thương mại', icon: '🏙️', color: '#2a5fc4', rgb: [40, 90, 190], cat: 'c', jobs: [12, 24, 40, 60, 90], biz: 'shop', unlock: 400, desc: 'Trung tâm thương mại: nhiều việc làm, cần nhiều hàng' },
  { id: 6, name: 'Văn phòng', short: 'Văn phòng', icon: '💼', color: '#9a6be0', rgb: [150, 105, 220], cat: 'o', jobs: [14, 28, 46, 70, 100], biz: 'office', unlock: 1000, desc: 'Không ô nhiễm, không cần hàng hoá, nhưng cần lao động có học vấn' },
  { id: 7, name: 'Hỗn hợp', short: 'Hỗn hợp', icon: '🏘️', color: '#2fb7a8', rgb: [45, 180, 165], cat: 'r', res: [8, 14, 24, 36, 50], jobs: [3, 4, 6, 8, 10], biz: 'shop', unlock: 400, desc: 'Cửa hàng tầng trệt, nhà ở phía trên' },
  // khu chuyên biệt: chỉ mọc trên ô có đúng loại tài nguyên (raw), mở trong cây công nghệ (tech)
  { id: 8, name: 'Nông nghiệp', short: 'Nông trại', icon: '🌾', color: '#b9d24a', rgb: [185, 210, 74], cat: 'x', jobs: [3, 5, 7, 9, 12], biz: 'res', raw: 'agri', tech: 'farm', desc: 'Trồng nông sản trên đất màu mỡ ven sông hồ, gần như không ô nhiễm' },
  { id: 9, name: 'Lâm nghiệp', short: 'Lâm trường', icon: '🪵', color: '#8a6238', rgb: [138, 98, 56], cat: 'x', jobs: [3, 5, 7, 9, 12], biz: 'res', raw: 'wood', tech: 'forest', desc: 'Khai thác gỗ trong vùng rừng' },
  { id: 10, name: 'Khai khoáng', short: 'Mỏ', icon: '⛏️', color: '#8f93a8', rgb: [143, 147, 168], cat: 'x', jobs: [6, 9, 13, 18, 24], biz: 'res', raw: 'ore', tech: 'mine', desc: 'Mỏ khoáng sản ở vùng đồi núi: ồn và làm bẩn đất' },
  { id: 11, name: 'Dầu khí', short: 'Giếng dầu', icon: '🛢️', color: '#5b4a6b', rgb: [91, 74, 107], cat: 'x', jobs: [5, 8, 11, 15, 20], biz: 'res', raw: 'oil', tech: 'oil', desc: 'Giếng dầu: sản lượng cao nhất, ô nhiễm cũng nặng nhất' },
  { id: 12, name: 'Ngư nghiệp', short: 'Bến cá', icon: '🐟', color: '#3fb6dc', rgb: [63, 182, 220], cat: 'x', jobs: [3, 5, 7, 9, 12], biz: 'res', raw: 'fish', tech: 'fish', desc: 'Bến cá trên ô đất sát vùng nước có cá' },
  // thêm sau nên mã khu nối tiếp (bản lưu cũ giữ nguyên mã 0..12)
  { id: 13, name: 'Dân cư mật độ trung bình', short: 'Nhà phố', icon: '🏡', color: '#7fd35a', rgb: [127, 211, 90], cat: 'r', res: [6, 10, 16, 22, 30], unlock: 120, desc: 'Nhà phố, chung cư thấp tầng 3–6 tầng: đông hơn nhà riêng, vẫn yên tĩnh' },
  { id: 14, name: 'Nhà liền kề', short: 'Liền kề', icon: '🏘️', color: '#9bd86a', rgb: [155, 216, 106], cat: 'r', res: [5, 8, 11, 14, 18], unlock: 0, desc: 'Dãy nhà ống chung tường, mặt tiền hẹp: nhiều hộ trên một ô hơn nhà riêng' },
  { id: 15, name: 'Nhà dưỡng lão', short: 'Dưỡng lão', icon: '👵', color: '#c7a6e0', rgb: [199, 166, 224], cat: 'r', res: [8, 14, 20, 28, 36], who: 'senior', unlock: 1000, desc: 'Chỉ người từ 65 tuổi: người già sống vui hơn, khoẻ hơn và nhường nhà cho gia đình trẻ' },
  { id: 16, name: 'Ký túc xá sinh viên', short: 'Ký túc xá', icon: '🎒', color: '#f2a65a', rgb: [242, 166, 90], cat: 'r', res: [10, 18, 28, 40, 54], who: 'student', unlock: 1000, desc: 'Chỉ sinh viên 18–24 tuổi, tiền thuê rẻ; nên đặt gần trường đại học' },
  { id: 17, name: 'Ăn uống, giải trí', short: 'Giải trí', icon: '🍜', color: '#ef6f9a', rgb: [239, 111, 154], cat: 'c', jobs: [4, 7, 10, 14, 20], biz: 'leisure', unlock: 400, desc: 'Quán ăn, cà phê, rạp phim: không cần hàng hoá, sống nhờ khách tới chơi, ồn về đêm' },
  { id: 18, name: 'Văn phòng công nghệ', short: 'Công nghệ', icon: '💻', color: '#6b7fe8', rgb: [107, 127, 232], cat: 'o', jobs: [12, 24, 40, 60, 90], biz: 'office', inc: 1.4, unlock: 2500, desc: 'Công ty phần mềm, dịch vụ số: cần lao động trung học trở lên, làm ăn tốt hơn nữa khi gần viện nghiên cứu' },
  { id: 19, name: 'Văn phòng tài chính', short: 'Tài chính', icon: '🏦', color: '#5a4fb8', rgb: [90, 79, 184], cat: 'o', jobs: [10, 20, 34, 52, 80], biz: 'office', inc: 1.7, unlock: 2500, desc: 'Ngân hàng, bảo hiểm: doanh thu cao nhất, cần người học đại học và giá đất cao mới lên cấp' },
  { id: 20, name: 'Chợ truyền thống', short: 'Chợ', icon: '🧺', color: '#e8894a', rgb: [232, 137, 74], cat: 'c', jobs: [6, 10, 14, 19, 26], biz: 'market', needs: ['agri', 'fish'], unlock: 120, desc: 'Sạp hàng bán thẳng nông sản, cá từ nông trại, bến cá (không qua nhà máy), rẻ hơn cửa hàng nên dân thích đi chợ' },
  { id: 21, name: 'Xưởng chế biến', short: 'Xưởng', icon: '🏚️', color: '#d9a441', rgb: [217, 164, 65], cat: 'i', jobs: [4, 7, 10, 13, 17], biz: 'ind', needs: ['agri', 'fish', 'wood'], unlock: 120, desc: 'Xưởng nhỏ chế biến nông sản, cá, gỗ thành hàng hoá ngay cạnh nơi khai thác: ít ô nhiễm, đặt gần nhà được' },
];
// nguyên liệu thô: id trùng mã tài nguyên trên bản đồ (c.res), rate = sản lượng mỗi người mỗi giờ
export const RAW = {
  agri: { id: 1, name: 'Nông sản', icon: '🌾', rate: 0.6, rgb: [200, 220, 70], product: 'thực phẩm' },
  wood: { id: 2, name: 'Gỗ', icon: '🪵', rate: 0.6, rgb: [30, 130, 70], product: 'đồ gỗ' },
  ore: { id: 3, name: 'Khoáng sản', icon: '⛏️', rate: 0.7, rgb: [165, 165, 190], product: 'kim khí' },
  oil: { id: 4, name: 'Dầu', icon: '🛢️', rate: 0.85, rgb: [170, 80, 215], product: 'hoá chất, nhựa' },
  fish: { id: 5, name: 'Cá', icon: '🐟', rate: 0.6, rgb: [60, 200, 240], product: 'thuỷ sản đóng hộp' },
};
export const RAW_KINDS = Object.keys(RAW);
/** Mỗi nhà máy chuyên chế biến một loại nguyên liệu, cố định theo vị trí ô. */
export const factoryNeed = (i) => RAW_KINDS[(hash2(i % N, (i / N) | 0, 91) * RAW_KINDS.length) | 0];
export const MAX_LEVEL = 5;
export const resCap = (z, L) => (L && ZDEF[z].res ? ZDEF[z].res[L - 1] : 0);
export const jobCap = (z, L) => (L && ZDEF[z].jobs ? ZDEF[z].jobs[L - 1] : 0);
/** Điện / nước / rác một toà nhà dùng mỗi ngày (đơn vị của mạng). */
export const utilUse = (z, L) => { const u = resCap(z, L) + jobCap(z, L) * (z === 3 ? 1.6 : 1.2); return 1 + Math.ceil(u / 7); };
/** Rác tồn quá mức này (khoảng hơn một ngày rác của toà nhà) thì coi là ngập rác. */
export const garbageLimit = (z, L) => 8 + (resCap(z, L) + jobCap(z, L)) * 0.6;
// học vấn tối thiểu của một chỗ làm theo khu và cấp
const REQ = { 2: [0, 0, 0, 1, 1], 3: [0, 0, 0, 1, 1], 5: [0, 0, 1, 1, 2], 6: [1, 2, 2, 2, 3], 7: [0, 0, 0, 1, 1], 8: [0, 0, 0, 0, 1], 9: [0, 0, 0, 0, 1], 10: [0, 0, 0, 1, 1], 11: [0, 0, 1, 1, 2], 12: [0, 0, 0, 0, 1], 17: [0, 0, 0, 1, 1], 18: [2, 2, 2, 3, 3], 19: [2, 3, 3, 3, 3] };
export const reqEdu = (z, L) => (REQ[z] ? REQ[z][L - 1] : 0);
export const EDU_NAME = ['Chưa đi học', 'Tiểu học', 'Trung học', 'Đại học'];

// loại đường: w = bề rộng cả vỉa hè, cost / upkeep tính theo đơn vị chiều dài.
// elevated: chạy trên cao, cắt qua đường dưới đất mà không tạo nút giao (cầu vượt), không có ô quy hoạch hai bên, không cho người đi bộ
export const ROADS = {
  small: { name: 'Đường nhỏ 2 làn', icon: '🛣️', w: 10, asphalt: 6.4, cost: 4, upkeep: 0.05, speed: 1, lanes: 1, desc: 'Hai làn hai chiều, bám tâm ô' },
  large: { name: 'Đại lộ 4 làn', icon: '🛤️', w: 20, asphalt: 15.6, cost: 11, upkeep: 0.13, speed: 1.35, lanes: 2, desc: 'Bốn làn có dải phân cách, rộng 2 ô, thông xe gấp đôi và chạy nhanh hơn' },
  oneway: { name: 'Đường một chiều', icon: '➡️', w: 10, asphalt: 6.4, cost: 4.5, upkeep: 0.05, speed: 1.15, lanes: 2, desc: 'Hai làn cùng chiều theo hướng vẽ; nâng cấp lần nữa để đảo chiều' },
  overpass: { name: 'Cầu vượt 2 làn', icon: '🌉', w: 10, asphalt: 8.4, cost: 14, upkeep: 0.14, speed: 1.15, lanes: 1, elevated: true, unlock: 400, desc: 'Đường nhỏ trên cao: bắc qua đường khác mà không cắt ngang, hai đầu dốc xuống nối vào đường có sẵn' },
  overpass2: { name: 'Cầu vượt tầng 2', icon: '🌁', w: 10, asphalt: 8.4, cost: 22, upkeep: 0.2, speed: 1.15, lanes: 1, elevated: true, lvl: 2, unlock: 1000, desc: 'Cầu vượt tầng trên cùng: bắc qua cả cầu vượt, cao tốc tầng 1 lẫn đường dưới đất; nối vào cầu tầng 1 thì dốc từ tầng 1 lên, làm được nút giao nhiều tầng lồng nhau' },
  overpass3: { name: 'Cầu vượt tầng 3', icon: '🏙️', w: 10, asphalt: 8.4, cost: 30, upkeep: 0.26, speed: 1.15, lanes: 1, elevated: true, lvl: 3, unlock: 2500, desc: 'Cầu cao nhất (21 m): bắc qua cả cầu tầng 1 và tầng 2, làm nút giao ba tầng; nâng / hạ tầng một đoạn có sẵn bằng chế độ ⏫ ⏬' },
  tunnel: { name: 'Hầm chui 2 làn', icon: '🕳️', w: 10, asphalt: 8.4, cost: 16, upkeep: 0.16, speed: 1.15, lanes: 1, elevated: true, lvl: -1, unlock: 400, desc: 'Đường chìm dưới mặt đất có tường chắn hai bên: chui qua bên dưới đường khác mà không cắt ngang, đường bên trên thành cầu nhỏ bắc qua hầm' },
  highway: { name: 'Cao tốc 6 làn', icon: '🛣️', w: 22, asphalt: 21, cost: 26, upkeep: 0.26, speed: 1.9, lanes: 3, elevated: true, unlock: 1000, desc: 'Ba làn mỗi chiều chạy trên cao, nhanh gần gấp đôi; chỉ ra vào ở hai đầu (nút giao khác mức), không có nhà hai bên' },
};
/** Đoạn đường mới loại `a` gặp đường có sẵn loại `b`: chỉ tạo nút giao khi cùng tầng (cùng trên cao hoặc cùng dưới đất). */
export const roadLvl = (type) => (ROADS[type].lvl ?? (ROADS[type].elevated ? 1 : 0)); // -1 hầm, 0 mặt đất, 1 cầu tầng 1, 2 cầu tầng 2
export const sameLevel = (a, b) => roadLvl(a) === roadLvl(b);
export const LIFT = 7; // độ cao mặt đường trên cao so với mặt đất
export const DEPTH = 6.5; // độ sâu đáy hầm chui so với mặt đất
/** Độ cao mặt đường của một tầng so với mặt đất. */
export const lvlH = (l) => (l > 0 ? l * LIFT : l < 0 ? -DEPTH : 0);
export const BRIDGE_MULT = 4.5;
// kiểu cầu qua sông: mult nhân thêm vào giá phần qua nước (giá cầu = giá đường × BRIDGE_MULT × mult), upkeep theo mét qua nước
export const BRIDGES = {
  auto: { full: 'Cầu tự chọn', name: 'Tự chọn', icon: '🌉', mult: 1, upkeep: 0.1, desc: 'Nhịp ngắn dùng dầm bê tông, nhịp dài từ 40 m có vòm thép' },
  beam: { full: 'Cầu dầm bê tông', name: 'Dầm bê tông', icon: '🧱', mult: 1, upkeep: 0.1, desc: 'Rẻ nhất: dầm hộp trên hàng trụ dày đặc' },
  arch: { full: 'Cầu vòm thép', name: 'Vòm thép', icon: '🌈', mult: 1.3, upkeep: 0.13, desc: 'Hai vòm thép đỏ ôm mặt cầu, không cần trụ giữa sông' },
  cable: { full: 'Cầu dây văng', name: 'Dây văng', icon: '📐', mult: 1.6, upkeep: 0.16, desc: 'Tháp chữ A, dây căng xoè hình quạt xuống mặt cầu' },
  susp: { full: 'Cầu treo', name: 'Cầu treo', icon: '🌁', mult: 2, upkeep: 0.2, desc: 'Hai tháp cao, cáp chủ võng giữa và dây treo thẳng đứng: nhịp dài, đẹp nhất' },
};
/** Số giờ trong game để xây xong một công trình dịch vụ: càng to càng lâu (chỉ để xem: công trình vẫn chạy ngay). */
export const buildHours = (def) => Math.round(3 + def.size * def.size * 1.5 + Math.min(6, def.cost / 6000));
export const LINES = {
  power: { name: 'Dây điện', icon: '🗼', cost: 1.2, upkeep: 0.012, desc: 'Nối nhà máy điện ở xa vào đường hoặc vào công trình khác' },
  pipe: { name: 'Ống nước', icon: '🚰', cost: 1, upkeep: 0.012, desc: 'Nối trạm nước, cống xả ở xa vào đường (ống ngầm chở cả nước sạch và nước thải)' },
};

// công trình đặt tay. size: cạnh ô vuông; unlock: mốc dân số cần đạt; upkeep: phí mỗi kỳ (nhân RATE ra mỗi ngày)
export const SERVICES = {
  wind: { name: 'Tua-bin gió', icon: '🌬️', group: 'power', cost: 5000, upkeep: 70, size: 1, power: 60, unlock: 0, desc: 'Điện sạch, công suất nhỏ' },
  solar: { name: 'Trại điện mặt trời', icon: '🔆', group: 'power', cost: 12000, upkeep: 150, size: 2, power: 170, unlock: 400, desc: 'Điện sạch, công suất vừa' },
  coal: { name: 'Nhà máy nhiệt điện', icon: '🏭', group: 'power', cost: 22000, upkeep: 520, size: 3, power: 520, air: 10, ground: 4, unlock: 1000, desc: 'Điện nhiều nhưng khói bay rất xa' },
  tower: { name: 'Tháp nước', icon: '🗼', group: 'water', cost: 3000, upkeep: 50, size: 1, water: 250, unlock: 0, desc: 'Cấp nước, đặt ở đâu cũng được' },
  pump: { name: 'Trạm bơm nước', icon: '💧', group: 'water', cost: 7000, upkeep: 140, size: 2, water: 1000, needWater: true, unlock: 0, desc: 'Cấp nhiều nước, phải đặt sát bờ; đừng đặt gần cống xả kẻo dân uống nước bẩn' },
  outlet: { name: 'Cống xả thải', icon: '🕳️', group: 'water', cost: 2500, upkeep: 60, size: 1, sewage: 400, needWater: true, waterPol: 9, unlock: 0, desc: 'Xả nước thải ra sông / biển, làm bẩn vùng nước quanh cống' },
  treat: { name: 'Nhà máy xử lý nước thải', icon: '♻️', group: 'water', cost: 16000, upkeep: 320, size: 2, sewage: 1800, needWater: true, waterPol: 2.5, unlock: 1000, desc: 'Xử lý nhiều nước thải, gần như không ô nhiễm' },
  landfill: { name: 'Bãi rác', icon: '🗑️', group: 'trash', cost: 6000, upkeep: 130, size: 3, trash: 800, trucks: 3, cover: 'trash', radius: 26, ground: 7, air: 3, road: true, unlock: 120, desc: 'Xe rác chạy tới từng con đường trong bán kính để thu gom; bãi làm bẩn đất quanh nó' },
  incinerator: { name: 'Lò đốt rác', icon: '🔥', group: 'trash', cost: 24000, upkeep: 420, size: 2, trash: 1800, trucks: 4, power: 60, cover: 'trash', radius: 38, air: 5, road: true, unlock: 1000, desc: 'Nhiều xe rác hơn, vùng thu gom rộng, phát thêm chút điện' },
  park: { name: 'Công viên nhỏ', icon: '🌳', group: 'park', cost: 800, upkeep: 12, size: 1, cover: 'park', radius: 5, green: 1, unlock: 0, desc: 'Tăng giá trị đất, lọc bớt bụi và tiếng ồn quanh nó' },
  plaza: { name: 'Quảng trường', icon: '⛲', group: 'park', attract: 0.5, cost: 3500, upkeep: 45, size: 2, cover: 'park', radius: 9, green: 1, unlock: 400, desc: 'Tăng giá trị đất trên vùng rộng' },
  stadium: { name: 'Sân vận động', icon: '🏟️', group: 'park', attract: 3, cost: 45000, upkeep: 700, size: 4, cover: 'park', radius: 18, road: true, unlock: 2500, desc: 'Niềm tự hào của thành phố' },
  clinic: { name: 'Trạm y tế', icon: '🏥', group: 'civic', cost: 9000, upkeep: 190, size: 2, cover: 'health', radius: 14, ambulances: 2, road: true, unlock: 120, desc: 'Xe cứu thương chạy tới nhà người bệnh; kẹt xe thì tới muộn' },
  school: { name: 'Trường tiểu học', icon: '🏫', group: 'civic', cost: 9500, upkeep: 200, size: 2, cover: 'edu', radius: 14, eduLevel: 1, students: 200, road: true, unlock: 120, desc: 'Trẻ 6–11 tuổi trong bán kính được đi học' },
  highschool: { name: 'Trường trung học', icon: '📚', group: 'civic', cost: 14000, upkeep: 260, size: 2, cover: 'edu', radius: 22, eduLevel: 2, students: 260, road: true, unlock: 400, desc: 'Học sinh 12–17 tuổi; cần cho việc làm ở cửa hàng lớn và văn phòng' },
  police: { name: 'Đồn công an', icon: '🚓', group: 'civic', cost: 8000, upkeep: 160, size: 2, cover: 'police', radius: 16, cars: 2, road: true, unlock: 400, desc: 'An ninh, tăng giá trị đất; xe công an tới hiện trường tai nạn và vụ cướp' },
  fire: { name: 'Trạm cứu hoả', icon: '🚒', group: 'civic', cost: 7500, upkeep: 150, size: 2, cover: 'fire', radius: 16, trucks: 2, road: true, unlock: 400, desc: 'Xe cứu hoả phải chạy tới kịp trước khi nhà cháy rụi' },
  university: { name: 'Trường đại học', icon: '🎓', group: 'civic', cost: 30000, upkeep: 600, size: 3, cover: 'edu', radius: 40, eduLevel: 3, students: 300, road: true, unlock: 1000, desc: 'Đào tạo lao động trình độ cao cho văn phòng' },
  parking: { name: 'Bãi đỗ xe', icon: '🅿️', group: 'transit', cost: 2500, upkeep: 30, size: 2, spots: 60, radius: 7, road: true, unlock: 120, desc: 'Chỗ đỗ cho xe tới các toà nhà trong bán kính, đỡ cảnh chạy vòng tìm chỗ' },
  port: { name: 'Cảng hàng hoá', icon: '⚓', group: 'transit', faceWater: true, cost: 35000, upkeep: 500, size: 3, needWater: true, road: true, outside: true, ground: 2, unlock: 1000, desc: 'Cửa ngõ xuất nhập khẩu thứ hai: xe tải khỏi phải chạy ra tận đường cao tốc' },
  depot: { name: 'Bến xe, xưởng bảo dưỡng', icon: '🚏', group: 'transit', cost: 9000, upkeep: 110, size: 2, depot: 12, road: true, unlock: 120, desc: 'Chỗ xe buýt, tàu điện nghỉ đêm và bảo dưỡng: chưa có bến thì mọi tuyến chạy chung tối đa 4 xe, mỗi bến cho thêm 12 xe' },
  ferry: { name: 'Bến tàu khách', icon: '⛴️', group: 'transit', faceWater: true, attract: 1, cost: 15000, upkeep: 180, size: 2, needWater: true, road: true, unlock: 400, bonus: { pull: 0.03, happy: 1 }, desc: 'Tàu khách chở dân, thu vé như xe buýt: từ 2 bến cùng một vùng nước là thành tuyến; chỉ một bến thì tàu chạy ra cửa biển, đưa du khách tới tiêu tiền và chở dân đi chơi xa' },
  train: { name: 'Ga tàu hoả', icon: '🚆', group: 'transit', cost: 40000, upkeep: 420, size: 3, road: true, outside: true, noise: 6, unlock: 1000, bonus: { pull: 0.06 }, desc: 'Tàu khách và tàu hàng liên tỉnh: thêm một cửa ngõ xuất nhập khẩu, người nơi khác tới ở dễ hơn' },
  airport: { name: 'Sân bay', icon: '✈️', group: 'transit', cost: 180000, upkeep: 1400, size: 5, road: true, outside: true, noise: 16, unlock: 6000, bonus: { pull: 0.1, comm: 0.06 }, desc: 'Khách du lịch và hàng không: hút dân, thuế thương mại +6%; máy bay cất cánh ồn trên vùng rất rộng' },
  nuclear: { name: 'Nhà máy điện hạt nhân', icon: '☢️', group: 'power', cost: 150000, upkeep: 1500, size: 4, power: 1800, needWater: true, noise: 4, unlock: 6000, desc: 'Điện rất nhiều mà không có khói; phải đặt sát bờ nước để làm mát, giá xây và phí vận hành cao' },
  recycle: { name: 'Nhà máy tái chế', icon: '♻️', group: 'trash', cost: 18000, upkeep: 280, size: 2, trash: 1200, trucks: 3, cover: 'trash', radius: 30, recycle: 0.3, road: true, unlock: 1000, desc: 'Xe rác thu gom như bãi rác nhưng không làm bẩn đất; phế liệu phân loại bán được tiền' },
  hospital: { name: 'Bệnh viện', icon: '🏨', group: 'civic', cost: 40000, upkeep: 700, size: 3, cover: 'health', care: true, radius: 30, ambulances: 5, road: true, unlock: 1000, desc: 'Nhiều xe cứu thương, chữa được bệnh nặng: người ốm trong vùng ít tử vong hơn, người già sống lâu hơn' },
  cemetery: { name: 'Nghĩa trang', icon: '🪦', group: 'civic', cost: 12000, upkeep: 140, size: 3, graves: 400, hearses: 2, cover: 'death', radius: 40, road: true, unlock: 400, desc: 'Xe tang tới tận nhà đưa người mất về an táng; đầy chỗ thì phải xây thêm hoặc dùng đài hoá thân' },
  crematorium: { name: 'Đài hoá thân hoàn vũ', icon: '⚱️', group: 'civic', cost: 24000, upkeep: 300, size: 2, cremate: 30, hearses: 3, cover: 'death', radius: 50, air: 2, road: true, unlock: 1000, desc: 'Hoả táng mỗi ngày tối đa 30 người, không bao giờ đầy chỗ; có chút khói' },
  research: { name: 'Viện nghiên cứu', icon: '🔬', group: 'civic', cost: 60000, upkeep: 900, size: 3, cover: 'sci', radius: 24, research: 1, road: true, unlock: 2500, desc: 'Người học đại học làm ra điểm phát triển 🔬 đều đặn; văn phòng công nghệ trong vùng làm ăn tốt hơn' },
  roadmaint: { name: 'Trạm bảo trì, cứu hộ đường bộ', icon: '🚧', group: 'transit', budget: 'roads', cost: 10000, upkeep: 150, size: 2, tows: true, trucks: 3, radius: 32, road: true, unlock: 120, desc: 'Sửa dần mặt đường xuống cấp trong bán kính (đường xấu dễ tai nạn); xe cứu hộ tới kéo xe tai nạn đi cho thông đường' },
  firewatch: { name: 'Tháp canh lửa', icon: '🗼', group: 'civic', cost: 4000, upkeep: 50, size: 1, cover: 'watch', radius: 26, unlock: 120, desc: 'Phát hiện cháy rừng sớm: rừng trong vùng ít bắt lửa hơn, lửa lan chậm và tắt nhanh' },
  shelter: { name: 'Hầm trú ẩn khẩn cấp', icon: '🛖', group: 'civic', cost: 12000, upkeep: 120, size: 2, cover: 'shelter', radius: 18, road: true, unlock: 1000, desc: 'Lốc xoáy tới thì dân trong vùng xuống hầm: thương vong giảm mạnh, nhất là khi có cảnh báo sớm' },
  ews: { name: 'Trạm cảnh báo thiên tai sớm', icon: '📡', group: 'civic', cost: 25000, upkeep: 300, size: 1, ews: true, unique: true, unlock: 2500, desc: 'Báo trước lốc xoáy một giờ để dân kịp trú ẩn; báo bão đá để xe chạy chậm lại và đồ đạc được che chắn' },
  prison: { name: 'Trại giam', icon: '⛓️', group: 'civic', cost: 30000, upkeep: 520, size: 3, cells: 150, gloom: 6, road: true, unlock: 1000, desc: 'Giam người phạm tội bị bắt: còn chỗ giam thì công an trấn áp tội phạm mạnh gấp đôi; giá đất quanh trại giảm' },
  // du lịch: chỗ ngủ cho du khách (beds) và điểm tham quan (attract)
  hotel: { name: 'Khách sạn', icon: '🛎️', group: 'tourism', cost: 12000, upkeep: 110, size: 2, beds: 60, road: true, unlock: 400, desc: 'Du khách ở lại qua đêm: trả tiền phòng cho thành phố và tiêu tiền ở quán xá nhiều hơn khách đi trong ngày' },
  resort: { name: 'Khu nghỉ dưỡng', icon: '🏖️', group: 'tourism', cost: 65000, upkeep: 480, size: 3, beds: 240, attract: 3, road: true, unlock: 2500, desc: 'Nhiều phòng, hút khách; đẹp nhất khi đặt cạnh sông hồ' },
  beach: { name: 'Bãi biển', icon: '🏝️', group: 'tourism', faceWater: true, cost: 9000, upkeep: 90, size: 3, needWater: true, attract: 6, cover: 'park', radius: 10, unlock: 120, bonus: { happy: 2 }, desc: 'Bãi tắm có dù, ghế nằm, chòi cứu hộ, quán nước: đặt sát bờ sông, hồ, biển; hút du khách mạnh, dân cả thành phố vui hơn' },
  museum: { name: 'Bảo tàng', icon: '🏺', group: 'tourism', cost: 28000, upkeep: 240, size: 2, attract: 5, cover: 'park', radius: 8, road: true, unlock: 1000, bonus: { happy: 1 }, desc: 'Điểm tham quan lớn: du khách tới đông hơn, dân quanh đó vui hơn' },
  pagoda: { name: 'Chùa cổ', icon: '🛕', group: 'tourism', cost: 18000, upkeep: 80, size: 2, attract: 4, cover: 'park', radius: 6, unlock: 400, bonus: { happy: 1 }, desc: 'Điểm tham quan, tăng giá đất quanh chùa' },
  // công trình biểu tượng: mỗi thành phố một cái, mở trong cây công nghệ; bonus cộng cho cả thành phố
  monument: { name: 'Tượng đài trung tâm', icon: '🗿', group: 'landmark', attract: 3, budget: 'park', cost: 30000, upkeep: 120, size: 2, cover: 'park', radius: 14, unique: true, tech: 'lm1', bonus: { happy: 2 }, desc: 'Dân cả thành phố hài lòng hơn 2 điểm' },
  market: { name: 'Chợ trung tâm', icon: '🏮', group: 'landmark', attract: 4, budget: 'park', cost: 55000, upkeep: 260, size: 3, cover: 'park', radius: 12, road: true, unique: true, tech: 'lm2', bonus: { comm: 0.1 }, desc: 'Thuế thương mại cả thành phố +10%' },
  theater: { name: 'Nhà hát lớn', icon: '🎭', group: 'landmark', attract: 5, budget: 'park', cost: 90000, upkeep: 420, size: 3, cover: 'park', radius: 22, road: true, unique: true, tech: 'lm3', bonus: { happy: 3 }, desc: 'Hài lòng +3 điểm, giá đất tăng trên vùng rộng' },
  tvtower: { name: 'Tháp truyền hình', icon: '📡', group: 'landmark', attract: 4, budget: 'park', cost: 140000, upkeep: 520, size: 2, cover: 'park', radius: 30, unique: true, tech: 'lm4', bonus: { pull: 0.12 }, desc: 'Thành phố nổi tiếng: người tới ở đông hơn' },
  skytower: { name: 'Tháp Phố Mới', icon: '🌆', group: 'landmark', attract: 8, budget: 'park', cost: 320000, upkeep: 900, size: 4, cover: 'park', radius: 26, road: true, unique: true, tech: 'lm5', bonus: { happy: 3, comm: 0.1, pull: 0.1 }, desc: 'Biểu tượng của cả vùng: hài lòng, thương mại và sức hút đều tăng' },
};

// module gắn thêm vào công trình có sẵn (mỗi công trình một cái mỗi loại). Giá và phí = costK × của công trình gốc.
// mul / add chỉ áp vào chỉ số mà công trình gốc có.
export const MODULES = {
  tank: { name: 'Bể chứa phụ', icon: '🫙', for: ['tower', 'pump', 'outlet', 'treat'], costK: 0.5, mul: { water: 1.5, sewage: 1.5 }, tech: 'm_water', desc: 'Công suất nước / thoát nước +50%' },
  turbine: { name: 'Tổ máy phụ', icon: '⚙️', for: ['wind', 'solar', 'coal', 'incinerator'], costK: 0.55, mul: { power: 1.5 }, tech: 'm_power', desc: 'Công suất điện +50%' },
  filter: { name: 'Bộ lọc khói', icon: '🌫️', for: ['coal', 'incinerator'], costK: 0.35, mul: { air: 0.45 }, tech: 'm_power', desc: 'Khói chỉ còn bay xa chưa tới một nửa' },
  sorter: { name: 'Dây chuyền phân loại', icon: '♻️', for: ['landfill', 'incinerator'], costK: 0.4, mul: { trash: 1.6 }, add: { trucks: 2 }, tech: 'm_city', desc: 'Xử lý rác +60%, thêm 2 xe rác' },
  deck: { name: 'Tầng đỗ xe', icon: '🅿️', for: ['parking'], costK: 0.8, mul: { spots: 2 }, add: { radius: 3 }, tech: 'm_city', desc: 'Gấp đôi chỗ đỗ, bán kính +3 ô' },
  wing: { name: 'Dãy phòng học mới', icon: '🏫', for: ['school', 'highschool', 'university'], costK: 0.45, mul: { students: 1.6 }, tech: 'm_edu', desc: 'Chỗ học +60%' },
  ward: { name: 'Khoa nội trú', icon: '🛏️', for: ['clinic', 'hospital'], costK: 0.5, add: { radius: 6, ambulances: 2 }, tech: 'm_health', desc: 'Bán kính +6 ô, thêm 2 xe cứu thương' },
  post: { name: 'Chốt trực', icon: '🚨', for: ['police', 'fire'], costK: 0.45, add: { radius: 6, trucks: 2, cars: 2 }, tech: 'm_safety', desc: 'Bán kính +6 ô; trạm cứu hoả thêm 2 xe' },
  garden: { name: 'Vườn hoa mở rộng', icon: '🌷', for: ['park', 'plaza', 'stadium'], costK: 0.6, add: { radius: 3 }, tech: 'm_leisure', desc: 'Vùng tăng giá đất rộng thêm 3 ô' },
};
export const moduleCost = (type, m) => Math.round((SERVICES[type].cost * MODULES[m].costK) / 100) * 100;
export const moduleUpkeep = (type, m) => Math.round(SERVICES[type].upkeep * MODULES[m].costK);
/** Chỉ số k của một công trình sau khi tính module. */
const BUDGET_KEYS = { students: 1, ambulances: 1, cars: 1, trucks: 1, cells: 1 };
export function svcVal(s, k) {
  let v = SERVICES[s.type][k];
  if (v == null) return 0;
  if (s.mods) for (const m of s.mods) { const md = MODULES[m]; if (md.mul && md.mul[k]) v *= md.mul[k]; if (md.add && md.add[k]) v += md.add[k]; }
  if (s.bud && s.bud !== 1) { // ngân sách ngành (gắn ở recalc): chi nhiều thì phục vụ rộng hơn, nhiều xe, nhiều chỗ học hơn
    if (k === 'radius') v *= 0.6 + 0.4 * s.bud;
    else if (BUDGET_KEYS[k]) v = Math.max(1, Math.round(v * s.bud));
  }
  return Math.round(v * 10) / 10;
}

// cây công nghệ: tiêu điểm phát triển (thưởng theo mốc dân số) để mở. req = mục phải mở trước, rank = mốc dân số tối thiểu
export const TECH_BRANCH = [['res', '⛏️ Tài nguyên'], ['infra', '🔧 Hạ tầng'], ['civic', '🏛️ Dịch vụ'], ['lm', '🗽 Biểu tượng'], ['policy', '📜 Chính sách']];
export const TECH = {
  farm: { name: 'Nông nghiệp', icon: '🌾', branch: 'res', cost: 1, desc: 'Mở khu nông trại trên đất màu mỡ' },
  fish: { name: 'Ngư nghiệp', icon: '🐟', branch: 'res', cost: 1, req: 'farm', desc: 'Mở bến cá ở bờ vùng nước có cá' },
  forest: { name: 'Lâm nghiệp', icon: '🪵', branch: 'res', cost: 1, desc: 'Mở lâm trường trong vùng rừng' },
  mine: { name: 'Khai khoáng', icon: '⛏️', branch: 'res', cost: 2, req: 'forest', desc: 'Mở mỏ khoáng sản ở vùng đồi núi' },
  oil: { name: 'Dầu khí', icon: '🛢️', branch: 'res', cost: 3, req: 'mine', desc: 'Mở giếng dầu trên vùng có dầu' },
  m_water: { name: 'Bể chứa phụ', icon: '🫙', branch: 'infra', cost: 1, desc: 'Module tăng công suất tháp nước, trạm bơm, cống xả, nhà máy xử lý' },
  m_power: { name: 'Tổ máy phụ, lọc khói', icon: '⚙️', branch: 'infra', cost: 2, desc: 'Module tăng công suất nhà máy điện và giảm khói' },
  m_city: { name: 'Phân loại rác, tầng đỗ xe', icon: '♻️', branch: 'infra', cost: 2, desc: 'Module cho bãi rác, lò đốt và bãi đỗ xe' },
  m_edu: { name: 'Dãy phòng học', icon: '🏫', branch: 'civic', cost: 2, desc: 'Module thêm chỗ học cho mọi cấp trường' },
  m_health: { name: 'Khoa nội trú', icon: '🛏️', branch: 'civic', cost: 2, desc: 'Module mở rộng trạm y tế và bệnh viện' },
  m_safety: { name: 'Chốt trực', icon: '🚨', branch: 'civic', cost: 2, desc: 'Module mở rộng đồn công an (thêm xe) và trạm cứu hoả' },
  m_leisure: { name: 'Vườn hoa', icon: '🌷', branch: 'civic', cost: 1, desc: 'Module mở rộng công viên, quảng trường, sân vận động' },
  lm1: { name: 'Tượng đài trung tâm', icon: '🗿', branch: 'lm', cost: 2, rank: 1, desc: 'Công trình biểu tượng đầu tiên' },
  lm2: { name: 'Chợ trung tâm', icon: '🏮', branch: 'lm', cost: 3, req: 'lm1', rank: 2, desc: 'Thuế thương mại +10%' },
  lm3: { name: 'Nhà hát lớn', icon: '🎭', branch: 'lm', cost: 3, req: 'lm2', rank: 3, desc: 'Hài lòng +3 điểm' },
  lm4: { name: 'Tháp truyền hình', icon: '📡', branch: 'lm', cost: 4, req: 'lm3', rank: 4, desc: 'Người tới ở đông hơn' },
  lm5: { name: 'Tháp Phố Mới', icon: '🌆', branch: 'lm', cost: 5, req: 'lm4', rank: 5, desc: 'Công trình lớn nhất vùng' },
  landdeal: { name: 'Xúc tiến du lịch', icon: '📣', branch: 'policy', cost: 2, desc: 'Chi phí quảng bá du lịch quốc tế giảm 30%' }, // id cũ giữ để bản lưu không mất điểm đã nâng
  survey: { name: 'Khảo sát địa chất', icon: '🔎', branch: 'policy', cost: 2, desc: 'Khu chuyên biệt khai thác nhanh hơn 20%' },
  customs: { name: 'Hải quan nhanh', icon: '🚢', branch: 'policy', cost: 2, desc: 'Hàng xuất khẩu bán được giá hơn 15%' },
};
export const START_POINTS = 3;

export const MILESTONES = [
  { pop: 120, name: 'Xóm nhỏ', reward: 5000, points: 3 },
  { pop: 400, name: 'Thị trấn', reward: 10000, points: 4 },
  { pop: 1000, name: 'Thị xã', reward: 20000, points: 5 },
  { pop: 2500, name: 'Thành phố', reward: 40000, points: 6 },
  { pop: 6000, name: 'Đô thị lớn', reward: 80000, points: 8 },
  { pop: 12000, name: 'Siêu đô thị', reward: 150000, points: 10 },
];

// khoản vay: trả đều hằng ngày, tối đa 3 khoản cùng lúc
export const LOANS = [
  { amount: 20000, days: 4, rate: 0.1 },
  { amount: 50000, days: 6, rate: 0.14 },
  { amount: 120000, days: 8, rate: 0.18 },
];
export const MAX_LOANS = 3;
export const BANKRUPT_AT = -30000; // nợ quá mức này thì phá sản
export const BANKRUPT_DAYS = 4; // hoặc âm tiền liên tục chừng này ngày

// giao thông công cộng
export const TRANSIT = {
  bus: { name: 'Tuyến xe buýt', icon: '🚌', stopCost: 300, vehCost: 1500, upkeep: 40, cap: 40, speed: 19, walk: 110, road: true, desc: 'Bấm lên đường để đặt trạm theo thứ tự, bấm chuột phải để chốt tuyến (xe chạy vòng)' },
  tram: { name: 'Tuyến tàu điện', icon: '🚋', stopCost: 1500, vehCost: 5000, upkeep: 90, cap: 110, speed: 22, walk: 125, road: true, unlock: 1000, desc: 'Ray đặt giữa lòng đường, chở gần gấp 3 xe buýt nhưng vẫn kẹt cùng xe khác; bấm lên đường để đặt trạm, chuột phải để chốt tuyến' },
  ferry: { name: 'Tuyến tàu khách', icon: '⛴️', cap: 80, speed: 26, walk: 150, auto: true, desc: 'Tự mở khi có từ 2 bến tàu khách cùng một vùng nước (một bến thì tàu chạy ra cửa biển)' },
  metro: { name: 'Tuyến metro', icon: '🚇', stopCost: 6000, trackCost: 9, vehCost: 6000, upkeep: 160, cap: 150, speed: 46, walk: 140, unlock: 2500, desc: 'Đường ray trên cao đi thẳng giữa các ga, không kẹt xe; bấm chuột phải để chốt tuyến' },
};

export const DEPOT_FREE = 4; // chưa có bến xe thì các tuyến xe buýt + tàu điện chạy chung tối đa chừng này xe

// giá hàng trong chuỗi cung ứng (mỗi đơn vị)
export const PRICE = { raw: 3, goods: 8, retail: 15, market: 10, importMult: 1.4, rawImportMult: 1.2, exportMult: 0.85, load: 8 };
export const priceOf = (kind) => (kind === 'goods' ? PRICE.goods : PRICE.raw);

// mua đất: ô đất phải kề phần đã có, càng có nhiều càng đắt
export const LAND_PRICE = { base: 3000, step: 450 };

// đào đắp địa hình: mỗi lần áp cọ đổi cao độ các đỉnh lưới trong vùng cọ; giá tính theo khối lượng đất (đỉnh × độ cao)
export const WATER_LEVEL = -0.9; // cao độ mặt nước: chỗ nào đào sâu hơn mức này thì có nước
export const TERRA = {
  dig: { name: 'Đào đất', icon: '⛏️', desc: 'Giữ chuột để hạ thấp mặt đất; đào sâu quá mực nước thì thành ao hồ' },
  raise: { name: 'Đắp đất', icon: '⛰️', desc: 'Giữ chuột để nâng mặt đất; đắp lên lòng sông, biển để lấn thêm đất' },
  level: { name: 'San phẳng', icon: '📐', desc: 'Giữ chuột rồi rê: mặt đất trong vùng cọ được san về đúng cao độ của điểm bấm đầu tiên' },
  canal: { name: 'Dẫn nước', icon: '🌊', desc: 'Kéo để đào kênh, mương: nước theo kênh vào sâu trong đất, đất trống hai bên kênh thành đất màu mỡ; trạm bơm, cống xả, bến tàu đặt được cạnh kênh' },
};
export const TERRA_COST = 12; // ₫ cho mỗi đơn vị cao độ của một đỉnh
export const TERRA_STEP = 1, TERRA_LEVEL_STEP = 2.5, TERRA_MIN = -5, TERRA_MAX = 60, CANAL_BED = -2.5;
export const BRUSHES = [1, 2, 3, 5];

export function mulberry32(a) {
  return () => {
    a |= 0; a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function hash2(x, y, s) {
  let h = (Math.imul(x | 0, 374761393) + Math.imul(y | 0, 668265263) + Math.imul(s | 0, 982451653)) | 0;
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
}

/** Nhiễu giá trị mượt 0..1 */
export function vnoise(x, y, s) {
  const xi = Math.floor(x), yi = Math.floor(y);
  let fx = x - xi, fy = y - yi;
  fx = fx * fx * (3 - 2 * fx); fy = fy * fy * (3 - 2 * fy);
  const a = hash2(xi, yi, s), b = hash2(xi + 1, yi, s), c = hash2(xi, yi + 1, s), d = hash2(xi + 1, yi + 1, s);
  return a + (b - a) * fx + (c - a) * fy + (a - b - c + d) * fx * fy;
}

/** Trường địa hình liên tục theo toạ độ ô: dương = đất liền (xấp xỉ số ô cách bờ), âm = nước. */
/**
 * Các kiểu bản đồ. hills: độ cao đồi thoải (×), mount: độ cao núi (×); mask(gx, gy, ctx) = vùng có núi 0..1
 * (mặc định: xa điểm xuất phát). ctx = { N, sx, sy, seed }.
 */
const valleyX = (y, seed) => N * 0.5 + Math.sin(y * 0.045 + hash2(11, 12, seed) * 6.283) * N * 0.06 + (vnoise(1.1, y * 0.04, seed + 21) - 0.5) * 8;
export const MAPS = {
  river: { name: 'Sông và biển', icon: '🏞️', desc: 'Một con sông uốn khúc ra biển phía nam, một hồ nhỏ, núi ở xa. Cân bằng, dễ chơi', hills: 1, mount: 1 },
  delta: { name: 'Đồng bằng châu thổ', icon: '🌾', desc: 'Sông lớn chia nhiều nhánh đổ ra biển, đất phẳng màu mỡ: nhiều cầu, nông nghiệp, cảng cá', hills: 0.35, mount: 0 },
  bay: { name: 'Vịnh và đảo', icon: '🏝️', desc: 'Bờ biển dài phía đông, vịnh sâu, nhiều đảo nhỏ ngoài khơi: du lịch biển, cảng, cầu ra đảo', hills: 1, mount: 0.8 },
  highland: { name: 'Cao nguyên', icon: '⛰️', desc: 'Đồi núi trập trùng, hồ thuỷ điện, suối nhỏ, không có biển: đất dốc khó xây, khoáng sản, rừng', hills: 1.6, mount: 1.5, cover: 0.2, mask: (gx, gy, k) => clamp((Math.hypot(gx - k.sx, gy - k.sy) - k.N * 0.22) / 24, 0, 1) },
  lakes: { name: 'Hồ lớn', icon: '💧', desc: 'Một hồ lớn có đảo giữa hồ, sông thoát ra biển ở góc nam: thành phố quanh hồ, bến tàu du ngoạn', hills: 0.9, mount: 0.8 },
  island: { name: 'Đảo', icon: '🌊', desc: 'Một hòn đảo lớn giữa biển, nối đất liền bằng đường dẫn phía bắc: đất có hạn, biển bao quanh', hills: 1.1, mount: 0.9, cover: 0.15, mask: (gx, gy, k) => clamp((Math.hypot(gx - k.N * 0.52, gy - k.N * 0.58) < k.N * 0.2 ? 1 : 0) * clamp((Math.hypot(gx - k.sx, gy - k.sy) - 28) / 14, 0, 1), 0, 1) },
  valley: { name: 'Thung lũng', icon: '🏔️', desc: 'Sông chảy giữa thung lũng hẹp, hai bên là dãy núi cao: đất bằng ít, phải mở đường đèo, đào đắp', hills: 0.8, mount: 1.7, cover: 0.35, mask: (gx, gy, k) => { const d = Math.abs(gx - valleyX(gy, k.seed)) - k.N * 0.16; return clamp(d / (k.N * 0.08), 0, 1); } },
};

/**
 * Trường "khoảng cách tới nước" của bản đồ (đơn vị ô): < 0,15 là nước. Mọi kiểu đều chừa lối đất liền ở mép bắc
 * quanh cột 0,55·N (đường cao tốc dẫn vào thành phố).
 */
export function makeField(seed, kind = 'river') {
  const ph = hash2(1, 2, seed) * 6.283, nz = (x, y, a, s) => vnoise(x * a, y * a, seed + s);
  const entry = (x, y, v) => (y < 18 && Math.abs(x - N * 0.55) < 7 ? Math.max(v, 3 + (18 - y) * 0.2) : v);
  const islands = (cnt, x0, x1, y0, y1, r0, r1, salt) => Array.from({ length: cnt }, (_, k) => ({ x: x0 + hash2(k, salt, seed) * (x1 - x0), y: y0 + hash2(salt, k, seed) * (y1 - y0), r: r0 + hash2(k + 7, salt + 3, seed) * (r1 - r0) }));
  const islandD = (list, x, y, s) => { let d = Infinity; for (const p of list) d = Math.min(d, Math.hypot(x - p.x, y - p.y) - p.r * (0.75 + nz(x, y, 0.18, s) * 0.5)); return d; };
  let fn;
  switch (kind) {
    case 'delta': { // sông chính từ tây bắc, chia 4 nhánh toả ra biển phía nam
      const K = 4, sea = (x, y) => N - 13 + (nz(x, 1.7, 0.06, 3) - 0.5) * 10 - y;
      fn = (x, y) => {
        const cx = N * 0.32 + Math.sin(y * 0.05 + ph) * 5 + (nz(3.3, y, 0.05, 0) - 0.5) * 6;
        const t = clamp((y - N * 0.38) / (N * 0.55), 0, 1);
        let r = Math.abs(x - cx) - (3 + nz(x, y, 0.1, 7) * 1.4);
        for (let k = 0; k < K; k++) {
          const off = (k - (K - 1) / 2) * N * 0.24 * Math.pow(t, 1.25) + Math.sin(y * 0.09 + k * 2.1) * 3 * t;
          if (t > 0) r = Math.min(r, Math.abs(x - cx - off - N * 0.12 * t) - (1.6 + nz(x, y, 0.12, 9 + k) * 1.1));
        }
        const canal = Math.abs(y - N * 0.58 - Math.sin(x * 0.07) * 3) - 0.9; // kênh đào ngang nối các nhánh
        return Math.min(r, sea(x, y), x > cx && x < cx + N * 0.42 ? canal : 99);
      };
      break;
    }
    case 'bay': { // biển phía đông và nam, vịnh khoét sâu, đảo ngoài khơi
      const isl = islands(10, N * 0.72, N * 0.98, N * 0.15, N * 0.95, 1.6, 4.5, 41);
      const by = N * (0.45 + hash2(5, 6, seed) * 0.15);
      fn = (x, y) => {
        let coast = N * 0.7 + (nz(1.9, y, 0.05, 3) - 0.5) * 14 - x;
        coast = Math.min(coast, N - 10 + (nz(x, 2.2, 0.05, 4) - 0.5) * 8 - y);
        const bay = Math.hypot((x - N * 0.66) * 0.8, (y - by) * 1.3) - N * 0.13 * (0.8 + nz(x, y, 0.08, 5) * 0.4);
        const sea = Math.min(coast, bay);
        const river = Math.abs(x - (N * 0.28 + Math.sin(y * 0.06 + ph) * 7)) - (1.8 + nz(x, y, 0.1, 7) * 1.2);
        if (sea >= 0) return Math.min(sea, river);
        const d = islandD(isl, x, y, 43);
        return d < 0 ? -d : sea;
      };
      break;
    }
    case 'highland': { // hồ thuỷ điện và suối, không biển
      const lakes = islands(3, N * 0.15, N * 0.85, N * 0.35, N * 0.85, 4, 8, 51);
      fn = (x, y) => {
        const creek = Math.abs(x - (N * 0.3 + Math.sin(y * 0.08 + ph) * 9 + (nz(2.1, y, 0.06, 0) - 0.5) * 8)) - (1 + nz(x, y, 0.1, 7) * 0.8);
        return Math.min(creek, islandD(lakes, x, y, 53));
      };
      break;
    }
    case 'lakes': { // hồ lớn có đảo, sông thoát ra biển góc đông nam
      const lx = N * (0.42 + hash2(5, 6, seed) * 0.1), ly = N * (0.5 + hash2(7, 8, seed) * 0.08), lr = N * 0.17;
      fn = (x, y) => {
        const lake = Math.hypot(x - lx, (y - ly) * 1.1) - lr * (0.8 + nz(x, y, 0.06, 5) * 0.4);
        const isle = Math.hypot(x - lx - lr * 0.15, y - ly + lr * 0.1) - lr * 0.28 * (0.8 + nz(x, y, 0.2, 9) * 0.4);
        const outX = lx + (y - ly) * 0.9 + Math.sin(y * 0.08 + ph) * 4;
        const outlet = y > ly ? Math.abs(x - outX) - (2 + nz(x, y, 0.1, 7)) : 99;
        const sea = Math.min(N - 9 + (nz(x, 1.7, 0.06, 3) - 0.5) * 8 - y, N - 9 - x + (nz(1.3, y, 0.06, 4) - 0.5) * 8) + (x + y < N * 1.55 ? 99 : 0);
        const water = Math.min(lake, outlet, sea);
        return isle < 0 ? Math.max(-isle, 0.2) : water;
      };
      break;
    }
    case 'island': { // đảo lớn, biển bao quanh, lối nối phía bắc
      const cx = N * 0.52, cy = N * 0.56, R = N * 0.43, isl = islands(6, 0, N, 0, N, 1.5, 3.5, 61);
      fn = (x, y) => {
        const a = Math.atan2(y - cy, x - cx), r = R * (0.82 + nz(Math.cos(a) * 3 + 5, Math.sin(a) * 3 + 5, 1, 3) * 0.32);
        const land = r - Math.hypot(x - cx, y - cy);
        const creek = Math.abs(x - (cx - R * 0.25 + Math.sin(y * 0.09 + ph) * 5)) - 1.3 + (y > cy - R * 0.2 ? 0 : 99);
        if (land > 0) return Math.min(land, creek);
        const d = islandD(isl, x, y, 63);
        return d < 0 && Math.hypot(x - cx, y - cy) > R * 1.05 ? -d : land;
      };
      break;
    }
    case 'valley': { // sông giữa thung lũng
      fn = (x, y) => {
        const river = Math.abs(x - valleyX(y, seed)) - (2.4 + nz(x, y, 0.1, 7) * 1.3);
        const pond = Math.hypot(x - valleyX(N * 0.7, seed) - N * 0.1, y - N * 0.7) - 3.5;
        return Math.min(river, pond);
      };
      break;
    }
    default: { // sông và biển (kiểu gốc)
      const rx = N * (0.24 + hash2(3, 4, seed) * 0.1);
      const lx = N * (0.62 + hash2(5, 6, seed) * 0.2), ly = N * (0.3 + hash2(7, 8, seed) * 0.25), lr = 4.5 + hash2(9, 10, seed) * 3;
      fn = (x, y) => {
        const cx = rx + Math.sin(y * 0.065 + ph) * 8 + (vnoise(3.3, y * 0.05, seed) - 0.5) * 10;
        const river = Math.abs(x - cx) - (2.2 + vnoise(x * 0.1, y * 0.1, seed + 7) * 1.6);
        const coast = N - 12 + (vnoise(x * 0.06, 1.7, seed + 3) - 0.5) * 12 - y;
        const lake = Math.hypot(x - lx, y - ly) - lr * (0.75 + vnoise(x * 0.15, y * 0.15, seed + 5) * 0.5);
        return Math.min(river, coast, lake);
      };
      return fn; // kiểu gốc giữ nguyên để bản lưu cũ sinh lại đúng địa hình
    }
  }
  return (x, y) => entry(x, y, fn(x, y));
}

/** Điểm + tiếp tuyến tại quãng đường s dọc một polyline đã đo (pts phẳng [x, z, ...], cum). */
export function pointAt(pts, cum, s) {
  const n = cum.length - 1;
  let k = 0;
  while (k < n - 1 && cum[k + 1] < s) k++;
  const l = cum[k + 1] - cum[k] || 1, f = clamp((s - cum[k]) / l, 0, 1);
  const x0 = pts[k * 2], z0 = pts[k * 2 + 1], x1 = pts[k * 2 + 2], z1 = pts[k * 2 + 3];
  return [x0 + (x1 - x0) * f, z0 + (z1 - z0) * f, (x1 - x0) / l, (z1 - z0) / l];
}

export function distSeg(px, pz, x0, z0, x1, z1) {
  const dx = x1 - x0, dz = z1 - z0, l2 = dx * dx + dz * dz;
  const t = l2 ? clamp(((px - x0) * dx + (pz - z0) * dz) / l2, 0, 1) : 0;
  const qx = x0 + dx * t, qz = z0 + dz * t;
  return { d: Math.hypot(px - qx, pz - qz), t, x: qx, z: qz };
}

/** Điểm gần nhất trên một đoạn đường: { d, t (0..1 theo tham số), along (quãng đường từ đầu a), x, z } */
export function nearestOnEdge(e, px, pz) {
  const p = e.pts, n = p.length / 2 - 1;
  let best = { d: Infinity, t: 0, along: 0, x: 0, z: 0 };
  for (let k = 0; k < n; k++) {
    const r = distSeg(px, pz, p[k * 2], p[k * 2 + 1], p[k * 2 + 2], p[k * 2 + 3]);
    if (r.d < best.d) best = { d: r.d, t: (k + r.t) / n, along: e.cum[k] + (e.cum[k + 1] - e.cum[k]) * r.t, x: r.x, z: r.z };
  }
  return best;
}
