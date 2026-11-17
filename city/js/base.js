// Phố Mới — hằng số, bảng định nghĩa và hàm thuần dùng chung cho mọi module mô phỏng.
export const N = 160; // bản đồ N x N ô
export const LN = 96; // cạnh bản đồ đời trước, nay là vùng trung tâm (đất có sẵn lúc bắt đầu)
export const OFF = (N - LN) / 2; // ô (x, y) đời trước = ô (x + OFF, y + OFF) bây giờ; toạ độ thế giới không đổi
export const TILE = 32; // một lô đất mua thêm rộng TILE x TILE ô
export const TILES = N / TILE;
export const T = 10; // cạnh một ô (đơn vị thế giới)
export const HALF = (N * T) / 2;
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
export const ZONE = { NONE: 0, R: 1, C: 2, I: 3, RH: 4, CH: 5, O: 6, M: 7 };
export const ZDEF = [
  { id: 0, name: 'Chưa quy hoạch', icon: '🧽', color: '#cfd6dc', rgb: [0, 0, 0] },
  { id: 1, name: 'Dân cư thấp tầng', short: 'Nhà ở', icon: '🏠', color: '#46c85a', rgb: [70, 200, 90], cat: 'r', res: [4, 6, 8, 10, 12], unlock: 0, desc: 'Nhà riêng, ít dân, yên tĩnh' },
  { id: 2, name: 'Thương mại nhỏ', short: 'Cửa hàng', icon: '🏬', color: '#468cec', rgb: [70, 140, 235], cat: 'c', jobs: [4, 6, 8, 10, 12], biz: 'shop', unlock: 0, desc: 'Cửa hàng bán lẻ: cần hàng hoá từ nhà máy hoặc nhập khẩu' },
  { id: 3, name: 'Công nghiệp', short: 'Công nghiệp', icon: '🏭', color: '#f0be32', rgb: [240, 190, 50], cat: 'i', jobs: [8, 12, 16, 22, 30], biz: 'ind', unlock: 0, desc: 'Khai thác nguyên liệu và nhà máy chế biến: nhiều việc làm, gây ô nhiễm' },
  { id: 4, name: 'Dân cư cao tầng', short: 'Chung cư', icon: '🏢', color: '#1f8f4e', rgb: [25, 130, 70], cat: 'r', res: [16, 30, 50, 80, 120], unlock: 400, desc: 'Chung cư: rất nhiều dân trên một ô đất' },
  { id: 5, name: 'Thương mại lớn', short: 'TT thương mại', icon: '🏙️', color: '#2a5fc4', rgb: [40, 90, 190], cat: 'c', jobs: [12, 24, 40, 60, 90], biz: 'shop', unlock: 400, desc: 'Trung tâm thương mại: nhiều việc làm, cần nhiều hàng' },
  { id: 6, name: 'Văn phòng', short: 'Văn phòng', icon: '💼', color: '#9a6be0', rgb: [150, 105, 220], cat: 'o', jobs: [14, 28, 46, 70, 100], biz: 'office', unlock: 1000, desc: 'Không ô nhiễm, không cần hàng hoá, nhưng cần lao động có học vấn' },
  { id: 7, name: 'Hỗn hợp', short: 'Hỗn hợp', icon: '🏘️', color: '#2fb7a8', rgb: [45, 180, 165], cat: 'r', res: [8, 14, 24, 36, 50], jobs: [3, 4, 6, 8, 10], biz: 'shop', unlock: 400, desc: 'Cửa hàng tầng trệt, nhà ở phía trên' },
  { id: 8, name: 'Nông trại', short: 'Nông trại', icon: '🌾', color: '#b6d957', rgb: [182, 217, 87], cat: 'x', jobs: [3, 4, 5, 6, 8], biz: 'raw', raw: 'crop', need: 'fertile', unlock: 0, desc: 'Chỉ tô được trên đất màu mỡ; cho nông sản' },
  { id: 9, name: 'Lâm trường', short: 'Lâm trường', icon: '🪵', color: '#7a9a4a', rgb: [122, 154, 74], cat: 'x', jobs: [3, 4, 5, 6, 8], biz: 'raw', raw: 'wood', need: 'forest', unlock: 0, desc: 'Chỉ tô được trong rừng; cho gỗ' },
  { id: 10, name: 'Mỏ quặng', short: 'Mỏ quặng', icon: '⛏️', color: '#b0845a', rgb: [176, 132, 90], cat: 'x', jobs: [4, 6, 8, 10, 12], biz: 'raw', raw: 'ore', need: 'ore', unlock: 120, desc: 'Chỉ tô được trên vỉa quặng; ồn và làm bẩn đất' },
  { id: 11, name: 'Giếng dầu', short: 'Giếng dầu', icon: '🛢️', color: '#5b5560', rgb: [91, 85, 96], cat: 'x', jobs: [3, 4, 5, 6, 8], biz: 'raw', raw: 'oil', need: 'oil', unlock: 400, desc: 'Chỉ tô được trên túi dầu; bán giá cao nhất nhưng ô nhiễm' },
  { id: 12, name: 'Bến cá', short: 'Bến cá', icon: '🎣', color: '#4fb3c8', rgb: [79, 179, 200], cat: 'x', jobs: [3, 4, 5, 6, 8], biz: 'raw', raw: 'fish', need: 'shore', unlock: 0, desc: 'Chỉ tô được trên ô sát bờ nước; nước bẩn thì ít cá' },
];
export const MAX_LEVEL = 5;
// nguyên liệu: giá mỗi đơn vị
export const RAW = { crop: { name: 'Nông sản', price: 3.6 }, wood: { name: 'Gỗ', price: 4 }, ore: { name: 'Quặng', price: 4.8 }, oil: { name: 'Dầu', price: 6.5 }, fish: { name: 'Cá', price: 4.2 }, mix: { name: 'Nguyên liệu', price: 4 } };
export const RES_NAME = ['', 'Đất màu mỡ', 'Vỉa quặng', 'Túi dầu'];
export const resCap = (z, L) => (L && ZDEF[z].res ? ZDEF[z].res[L - 1] : 0);
export const jobCap = (z, L) => (L && ZDEF[z].jobs ? ZDEF[z].jobs[L - 1] : 0);
/** Điện / nước / rác một toà nhà dùng mỗi ngày (đơn vị của mạng). */
export const utilUse = (z, L) => { const u = resCap(z, L) + jobCap(z, L) * (z === 3 ? 1.6 : 1.2); return 1 + Math.ceil(u / 7); };
/** Rác tồn quá mức này (khoảng hơn một ngày rác của toà nhà) thì coi là ngập rác. */
export const garbageLimit = (z, L) => 8 + (resCap(z, L) + jobCap(z, L)) * 0.6;
// học vấn tối thiểu của một chỗ làm theo khu và cấp
const REQ = { 2: [0, 0, 0, 1, 1], 3: [0, 0, 1, 1, 1], 5: [0, 0, 1, 1, 2], 6: [1, 2, 2, 2, 3], 7: [0, 0, 0, 1, 1] };
export const reqEdu = (z, L) => (REQ[z] ? REQ[z][L - 1] : 0);
export const EDU_NAME = ['Chưa đi học', 'Tiểu học', 'Trung học', 'Đại học'];

// loại đường: w = bề rộng cả vỉa hè, cost / upkeep tính theo đơn vị chiều dài
export const ROADS = {
  small: { name: 'Đường nhỏ 2 làn', icon: '🛣️', w: 10, asphalt: 6.4, cost: 4, upkeep: 0.05, speed: 1, lanes: 1, desc: 'Hai làn hai chiều, bám tâm ô' },
  large: { name: 'Đại lộ 4 làn', icon: '🛤️', w: 20, asphalt: 15.6, cost: 11, upkeep: 0.13, speed: 1.35, lanes: 2, desc: 'Bốn làn có dải phân cách, rộng 2 ô, thông xe gấp đôi và chạy nhanh hơn' },
  oneway: { name: 'Đường một chiều', icon: '➡️', w: 10, asphalt: 6.4, cost: 4.5, upkeep: 0.05, speed: 1.15, lanes: 2, desc: 'Hai làn cùng chiều theo hướng vẽ; nâng cấp lần nữa để đảo chiều' },
};
export const BRIDGE_MULT = 4.5;
// đường trên cao (cầu vượt): lên dốc từ hai đầu tới độ cao ELEV_H, giữa cầu không tạo nút giao với đường bên dưới
export const ELEV_H = 9, RAMP = 42, ELEV_MULT = 3, MIN_ELEV_LEN = 70;
/** Độ cao mặt cầu so với mặt đất tại quãng đường s (tính từ đầu a) trên một đoạn đường trên cao dài len. */
export function deckH(len, s) {
  const r = Math.min(RAMP, len / 2), peak = ELEV_H * (r / RAMP), u = clamp(Math.min(s, len - s) / r, 0, 1);
  return peak * u * u * (3 - 2 * u);
}
/** Độ cao mặt đường của đoạn e tại quãng đường s (0 với đường thường). */
export const edgeH = (e, s) => (e.elev ? deckH(e.len, s) : 0);
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
  plaza: { name: 'Quảng trường', icon: '⛲', group: 'park', cost: 3500, upkeep: 45, size: 2, cover: 'park', radius: 9, green: 1, unlock: 400, desc: 'Tăng giá trị đất trên vùng rộng' },
  stadium: { name: 'Sân vận động', icon: '🏟️', group: 'park', cost: 45000, upkeep: 700, size: 4, cover: 'park', radius: 18, road: true, unlock: 2500, desc: 'Niềm tự hào của thành phố' },
  clinic: { name: 'Trạm y tế', icon: '🏥', group: 'civic', cost: 9000, upkeep: 190, size: 2, cover: 'health', radius: 14, ambulances: 2, road: true, unlock: 120, desc: 'Xe cứu thương chạy tới nhà người bệnh; kẹt xe thì tới muộn' },
  school: { name: 'Trường tiểu học', icon: '🏫', group: 'civic', cost: 9500, upkeep: 200, size: 2, cover: 'edu', radius: 14, eduLevel: 1, students: 200, road: true, unlock: 120, desc: 'Trẻ 6–11 tuổi trong bán kính được đi học' },
  highschool: { name: 'Trường trung học', icon: '📚', group: 'civic', cost: 14000, upkeep: 260, size: 2, cover: 'edu', radius: 22, eduLevel: 2, students: 260, road: true, unlock: 400, desc: 'Học sinh 12–17 tuổi; cần cho việc làm ở cửa hàng lớn và văn phòng' },
  police: { name: 'Đồn công an', icon: '🚓', group: 'civic', cost: 8000, upkeep: 160, size: 2, cover: 'police', radius: 16, road: true, unlock: 400, desc: 'An ninh, tăng giá trị đất' },
  fire: { name: 'Trạm cứu hoả', icon: '🚒', group: 'civic', cost: 7500, upkeep: 150, size: 2, cover: 'fire', radius: 16, trucks: 2, road: true, unlock: 400, desc: 'Xe cứu hoả phải chạy tới kịp trước khi nhà cháy rụi' },
  university: { name: 'Trường đại học', icon: '🎓', group: 'civic', cost: 30000, upkeep: 600, size: 3, cover: 'edu', radius: 40, eduLevel: 3, students: 300, road: true, unlock: 1000, desc: 'Đào tạo lao động trình độ cao cho văn phòng' },
  nuclear: { name: 'Nhà máy điện hạt nhân', icon: '☢️', group: 'power', cost: 90000, upkeep: 1400, size: 4, power: 2400, needWater: true, tech: 'nuclear', unlock: 0, desc: 'Rất nhiều điện, không khói; phải đặt sát bờ nước' },
  silo: { name: 'Kho nông sản', icon: '🏚️', group: 'extract', cost: 4000, upkeep: 60, size: 2, boost: 'crop', radius: 8, road: true, unlock: 0, desc: 'Nông trại trong bán kính làm ra nhiều hơn 40% và bán được giá hơn' },
  sawmill: { name: 'Xưởng cưa', icon: '🪚', group: 'extract', cost: 4500, upkeep: 70, size: 2, boost: 'wood', radius: 8, road: true, unlock: 0, desc: 'Lâm trường trong bán kính làm ra nhiều hơn 40% và bán được giá hơn' },
  smelter: { name: 'Xưởng tuyển quặng', icon: '🏗️', group: 'extract', cost: 9000, upkeep: 140, size: 2, boost: 'ore', radius: 8, ground: 3, road: true, unlock: 120, desc: 'Mỏ quặng trong bán kính làm ra nhiều hơn 40% và bán được giá hơn' },
  refinery: { name: 'Nhà máy lọc dầu', icon: '⚗️', group: 'extract', cost: 16000, upkeep: 260, size: 3, boost: 'oil', radius: 10, air: 5, road: true, unlock: 400, desc: 'Giếng dầu trong bán kính làm ra nhiều hơn 40% và bán được giá hơn' },
  fishmarket: { name: 'Chợ cá', icon: '🐟', group: 'extract', cost: 4000, upkeep: 60, size: 2, boost: 'fish', radius: 8, road: true, unlock: 0, desc: 'Bến cá trong bán kính làm ra nhiều hơn 40% và bán được giá hơn' },
  tvtower: { name: 'Tháp truyền hình', icon: '🗼', group: 'park', cost: 40000, upkeep: 300, size: 2, cover: 'park', radius: 24, road: true, landmark: 'Đạt 3.000 dân với mức hài lòng từ 55%', unlock: 0, desc: 'Biểu tượng của thành phố, tăng giá trị đất trên vùng rất rộng' },
  museum: { name: 'Bảo tàng', icon: '🏛️', group: 'park', cost: 30000, upkeep: 260, size: 3, cover: 'park', radius: 18, road: true, landmark: 'Có 150 người lớn tốt nghiệp đại học', unlock: 0, desc: 'Điểm tham quan, tăng giá trị đất' },
  nightmarket: { name: 'Chợ đêm', icon: '🏮', group: 'park', cost: 12000, upkeep: 120, size: 2, cover: 'park', radius: 12, road: true, landmark: 'Có 40 cửa hàng đang hoạt động', unlock: 0, desc: 'Điểm vui chơi buổi tối, tăng giá trị đất' },
  monument: { name: 'Tượng đài', icon: '🗽', group: 'park', cost: 20000, upkeep: 150, size: 2, cover: 'park', radius: 16, landmark: 'Xuất khẩu tổng cộng 3.000 đơn vị hàng', unlock: 0, desc: 'Ghi công thành phố làm ăn giỏi' },
  parking: { name: 'Bãi đỗ xe', icon: '🅿️', group: 'transit', cost: 2500, upkeep: 30, size: 2, spots: 60, radius: 7, road: true, unlock: 120, desc: 'Chỗ đỗ cho xe tới các toà nhà trong bán kính, đỡ cảnh chạy vòng tìm chỗ' },
  port: { name: 'Cảng hàng hoá', icon: '⚓', group: 'transit', cost: 35000, upkeep: 500, size: 3, needWater: true, road: true, outside: true, ground: 2, unlock: 1000, desc: 'Cửa ngõ xuất nhập khẩu thứ hai: xe tải khỏi phải chạy ra tận đường cao tốc' },
};

// phần mở rộng gắn thêm vào công trình: add = cộng thêm vào chỉ số của công trình cho mỗi phần mở rộng
const WING = { id: 'wing', name: 'Dãy phòng học', cost: 4000, upkeep: 80, max: 3, add: { students: 120 } };
const FLEET = { id: 'fleet', name: 'Đội xe rác', cost: 3500, upkeep: 70, max: 3, add: { trucks: 2, trash: 300 } };
export const MODS = {
  clinic: [{ id: 'er', name: 'Khoa cấp cứu', cost: 5000, upkeep: 90, max: 2, add: { ambulances: 2 } }, { id: 'ward', name: 'Khu nội trú', cost: 6000, upkeep: 100, max: 2, add: { radius: 5 } }],
  school: [WING], highschool: [WING], university: [WING],
  fire: [{ id: 'bay', name: 'Gara xe cứu hoả', cost: 4000, upkeep: 70, max: 2, add: { trucks: 2 } }],
  police: [{ id: 'post', name: 'Chốt tuần tra', cost: 3000, upkeep: 60, max: 2, add: { radius: 5 } }],
  landfill: [FLEET], incinerator: [FLEET],
  coal: [{ id: 'unit', name: 'Tổ máy phụ', cost: 9000, upkeep: 220, max: 2, add: { power: 260 } }],
  nuclear: [{ id: 'unit', name: 'Lò phản ứng phụ', cost: 30000, upkeep: 450, max: 2, add: { power: 1000 } }],
  pump: [{ id: 'pumps', name: 'Máy bơm phụ', cost: 3000, upkeep: 60, max: 3, add: { water: 500 } }],
  outlet: [{ id: 'basin', name: 'Bể lắng', cost: 2000, upkeep: 40, max: 2, add: { sewage: 300 } }],
  treat: [{ id: 'line', name: 'Dây chuyền xử lý', cost: 7000, upkeep: 140, max: 2, add: { sewage: 900 } }],
  parking: [{ id: 'deck', name: 'Tầng đỗ xe', cost: 2000, upkeep: 25, max: 3, add: { spots: 60 } }],
};

// cây công nghệ: mua bằng điểm phát triển; req = phải có công nghệ đó trước
export const TECH = {
  renew: { name: 'Điện tái tạo thế hệ mới', branch: 'Điện', cost: 2, desc: 'Tua-bin gió và điện mặt trời phát nhiều hơn 30%' },
  grid: { name: 'Lưới điện thông minh', branch: 'Điện', cost: 3, req: 'renew', desc: 'Mọi toà nhà dùng ít điện hơn 15%' },
  nuclear: { name: 'Điện hạt nhân', branch: 'Điện', cost: 6, req: 'grid', desc: 'Mở khoá nhà máy điện hạt nhân' },
  reuse: { name: 'Tái sử dụng nước', branch: 'Nước và rác', cost: 2, desc: 'Mọi toà nhà dùng ít nước và thải ít hơn 20%' },
  cleanOut: { name: 'Xả thải sạch', branch: 'Nước và rác', cost: 3, req: 'reuse', desc: 'Cống xả, bãi rác bớt bẩn một nửa' },
  recycle: { name: 'Tái chế', branch: 'Nước và rác', cost: 2, desc: 'Cả thành phố thải ít rác hơn 30%' },
  smartSignal: { name: 'Đèn tín hiệu thông minh', branch: 'Giao thông', cost: 2, desc: 'Đèn đổi pha nhanh hơn, xe chờ ít hơn' },
  ebus: { name: 'Xe buýt điện', branch: 'Giao thông', cost: 3, req: 'smartSignal', desc: 'Xe buýt và metro chở thêm 50% khách, phí vận hành giảm 30%' },
  cheapRoad: { name: 'Mặt đường bền', branch: 'Giao thông', cost: 2, desc: 'Phí bảo trì đường giảm 30%' },
  bigClass: { name: 'Lớp học hai ca', branch: 'Giáo dục và an toàn', cost: 2, desc: 'Mọi trường có thêm 50% chỗ học' },
  scholar: { name: 'Thu hút nhân tài', branch: 'Giáo dục và an toàn', cost: 4, req: 'bigClass', desc: 'Người mới dọn tới có học vấn cao hơn' },
  fireSafe: { name: 'Quy chuẩn phòng cháy', branch: 'Giáo dục và an toàn', cost: 2, desc: 'Nguy cơ cháy giảm một nửa' },
  cleanInd: { name: 'Công nghiệp sạch', branch: 'Kinh tế', cost: 3, desc: 'Nhà máy thải ít khói hơn 40%' },
  trade: { name: 'Xúc tiến xuất khẩu', branch: 'Kinh tế', cost: 3, req: 'cleanInd', desc: 'Hàng xuất khẩu bán được giá hơn 15%' },
};
export const MILESTONE_POINTS = [2, 3, 4, 5, 6, 8];
export const hasTech = (c, id) => !!(c.tech && c.tech[id]);

// chính sách theo quận. cost: phí mỗi kỳ cho mỗi toà nhà trong quận (flat: phí cố định)
export const POLICIES = {
  noTruck: { name: 'Cấm xe tải', cost: 0, desc: 'Xe tải chỉ vào quận khi giao hàng tận nơi, không chạy xuyên qua' },
  freeBus: { name: 'Miễn phí xe buýt', flat: 60, desc: 'Lên xe ở trạm trong quận không mất tiền vé, nhiều người chọn xe buýt hơn' },
  lowTax: { name: 'Giảm thuế 3 điểm', cost: 0, not: 'highTax', desc: 'Dân và doanh nghiệp trong quận vui hơn, thành phố thu ít hơn' },
  highTax: { name: 'Tăng thuế 3 điểm', cost: 0, not: 'lowTax', desc: 'Thu nhiều hơn từ quận này, dân kém vui' },
  quiet: { name: 'Khu yên tĩnh', cost: 0.6, desc: 'Tiếng ồn trong quận giảm 40%' },
  sort: { name: 'Phân loại rác', cost: 0.5, desc: 'Nhà trong quận thải ít rác hơn 30%' },
};
export const DISTRICTS = [null, ['Quận 1', '#e4572e'], ['Quận 2', '#17bebb'], ['Quận 3', '#ffc914'], ['Quận 4', '#76b041'], ['Quận 5', '#a06cd5'], ['Quận 6', '#f08fc0']];

/** Chỉ số của một công trình sau khi cộng phần mở rộng và công nghệ (công suất, số xe, chỗ học, bán kính...). */
export function svcVal(c, s, key) {
  const def = SERVICES[s.type];
  let v = def[key] || 0;
  if (s.mods) for (const m of MODS[s.type] || []) if (s.mods[m.id] && m.add[key]) v += m.add[key] * s.mods[m.id];
  if (key === 'power' && (s.type === 'wind' || s.type === 'solar') && hasTech(c, 'renew')) v *= 1.3;
  if (key === 'students' && hasTech(c, 'bigClass')) v *= 1.5;
  return Math.round(v);
}

export const MILESTONES = [
  { pop: 120, name: 'Xóm nhỏ', reward: 5000 },
  { pop: 400, name: 'Thị trấn', reward: 10000 },
  { pop: 1000, name: 'Thị xã', reward: 20000 },
  { pop: 2500, name: 'Thành phố', reward: 40000 },
  { pop: 6000, name: 'Đô thị lớn', reward: 80000 },
  { pop: 12000, name: 'Siêu đô thị', reward: 150000 },
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
  bus: { name: 'Tuyến xe buýt', icon: '🚌', stopCost: 300, vehCost: 1500, upkeep: 40, cap: 40, speed: 19, walk: 110, desc: 'Bấm lên đường để đặt trạm theo thứ tự, bấm chuột phải để chốt tuyến (xe chạy vòng)' },
  metro: { name: 'Tuyến metro', icon: '🚇', stopCost: 6000, trackCost: 9, vehCost: 6000, upkeep: 160, cap: 150, speed: 46, walk: 140, unlock: 2500, desc: 'Đường ray trên cao đi thẳng giữa các ga, không kẹt xe; bấm chuột phải để chốt tuyến' },
};

// giá hàng trong chuỗi cung ứng (mỗi đơn vị)
export const PRICE = { raw: 4, goods: 8, retail: 16, importMult: 1.25, exportMult: 0.85, load: 8 };

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

/** 0 trong vùng trung tâm (bản đồ đời trước), tăng dần lên 1 khi ra ngoài 8 ô — địa hình mới chỉ xuất hiện ngoài vùng đó. */
export function outerMask(x, y) {
  const u = x - OFF, v = y - OFF, d = clamp(Math.max(-u, u - LN, -v, v - LN) / 8, 0, 1);
  return d * d * (3 - 2 * d);
}

/**
 * Trường địa hình liên tục theo toạ độ ô: dương = đất liền (xấp xỉ số ô cách bờ), âm = nước.
 * Vùng trung tâm giữ đúng công thức đời trước (sông, hồ, biển phía nam); bên ngoài thêm đảo trên biển, hai hồ và một con sông phía đông.
 */
export function makeField(seed) {
  const ph = hash2(1, 2, seed) * 6.283;
  const rx = LN * (0.24 + hash2(3, 4, seed) * 0.1);
  const lx = LN * (0.62 + hash2(5, 6, seed) * 0.2), ly = LN * (0.3 + hash2(7, 8, seed) * 0.25), lr = 4.5 + hash2(9, 10, seed) * 3;
  const l2x = -16 + hash2(11, 12, seed) * 8, l2y = 30 + hash2(13, 14, seed) * 30, l3x = LN + 14 + hash2(15, 16, seed) * 8, l3y = -14 + hash2(17, 18, seed) * 10;
  const ry = 44 + hash2(19, 20, seed) * 14, ph2 = hash2(21, 22, seed) * 6.283;
  return (x, y) => {
    const u = x - OFF, v = y - OFF;
    const cx = rx + Math.sin(v * 0.065 + ph) * 8 + (vnoise(3.3, v * 0.05, seed) - 0.5) * 10;
    const river = Math.abs(u - cx) - (2.2 + vnoise(u * 0.1, v * 0.1, seed + 7) * 1.6);
    const coast = LN - 12 + (vnoise(u * 0.06, 1.7, seed + 3) - 0.5) * 12 - v;
    const lake = Math.hypot(u - lx, v - ly) - lr * (0.75 + vnoise(u * 0.15, v * 0.15, seed + 5) * 0.5);
    let f = Math.min(river, coast, lake);
    const m = outerMask(x, y);
    if (m <= 0) return f;
    // quần đảo trên biển phía nam
    const island = ((vnoise(u * 0.05, v * 0.05, seed + 61) - 0.4) * 34 - Math.abs(v - (LN + 20)) * 0.75 + 7) * m;
    f = Math.max(f, Math.min(island, river + 3));
    // hồ phía tây, hồ phía đông bắc, sông chảy ra mép đông
    const w2 = Math.hypot(u - l2x, v - l2y) - 6.5 * (0.7 + vnoise(u * 0.13, v * 0.13, seed + 63) * 0.6);
    const w3 = Math.hypot(u - l3x, v - l3y) - 5 * (0.7 + vnoise(u * 0.13, v * 0.13, seed + 65) * 0.6);
    const r2 = u > LN + 2 ? Math.abs(v - (ry + Math.sin(u * 0.08 + ph2) * 6)) - (1.8 + vnoise(u * 0.1, v * 0.1, seed + 67) * 1.4) : 99;
    return Math.min(f, 99 * (1 - m) + Math.min(w2, w3, r2) * m);
  };
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
