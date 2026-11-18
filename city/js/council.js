// Phố Mới — hộp thư thị trưởng: tình huống khó xử, đàm phán với đối tác, đánh giá của du khách.
// Mọi con số và hậu quả do game tính ở đây; LLM (qua /api/city/ai, xem city/js/ai.js) chỉ viết lời và mặc cả
// trong khung số game cho phép. Không có LLM thì dùng mẫu câu soạn sẵn bên dưới.
import { N, SERVICES, ZDEF, clamp } from './base.js';
import { lunar, stormSeason } from './seasons.js';

// ───────────────────────── hiệu ứng tạm thời ─────────────────────────

/** Hiệu ứng có hạn: { key: 'happy' | 'pull' | 'comm' (cộng) | 'tour' | 'intl' (nhân), v, until (ngày) }. */
export function councilMod(c, key) {
  const add = key === 'happy' || key === 'pull' || key === 'comm';
  let v = add ? 0 : 1;
  if (!c.council) return v;
  for (const m of c.council.mods) if (m.key === key && m.until >= c.day) v = add ? v + m.v : v * m.v;
  for (const d of c.council.deals) if (d.until >= c.day) {
    if (d.type === 'investor' && key === 'pull') v += 0.05;
    if (d.type === 'airline' && key === 'intl') v *= 1 + d.boost / 100;
  }
  if (key === 'tour' || key === 'intl') v *= ratingK(c);
  return v;
}
/** Phần thuế thương mại / công nghiệp đang được miễn cho nhà đầu tư (0..1). */
export const taxBreak = (c) => (c.council ? c.council.deals.reduce((s, d) => (d.type === 'investor' && d.until >= c.day ? Math.max(s, d.breakPct / 100) : s), 0) : 0);
/** Chi phí mỗi ngày của các hợp đồng (trợ giá đường bay). */
export const dealCost = (c) => (c.council ? c.council.deals.reduce((s, d) => s + (d.type === 'airline' && d.until >= c.day ? d.subsidy : 0), 0) : 0);

// ───────────────────────── tình huống khó xử (8) ─────────────────────────

const count = (c, f) => { let n = 0; for (let i = 0; i < N * N; i++) if (c.level[i] && f(ZDEF[c.zone[i]], i)) n++; return n; };
/**
 * Mẫu tình huống: when(c) có xảy ra được không; options: id, hiệu ứng (money: tiền ngay; mods: [key, v, số ngày]; rating: điểm cộng
 * vào đánh giá du khách sắp tới). text: mẫu lời dự phòng khi không có LLM.
 */
export const DILEMMAS = {
  waste: {
    topic: 'Nhà máy xin xả thải ra sông để giữ việc làm',
    when: (c) => count(c, (z) => z.cat === 'i') >= 6 && c.water.some((v) => v),
    options: [
      { id: 'allow', label: 'Cho phép tạm thời', money: 9000, mods: [['happy', -3, 20], ['tour', 0.9, 20]], rating: -0.4 },
      { id: 'fine', label: 'Bắt xử lý, phạt nếu vi phạm', money: 4000, mods: [['comm', -0.03, 15]] },
      { id: 'close', label: 'Đình chỉ nhà máy', money: -6000, mods: [['happy', 2, 20], ['pull', -0.03, 15]] },
    ],
    text: { title: 'Nhà máy xin xả thải', story: 'Một nhà máy ven sông báo nếu phải đầu tư hệ thống xử lý nước thải ngay thì sẽ cắt giảm công nhân. Họ xin được xả thải tạm thời trong vài tuần.' },
  },
  vendors: {
    topic: 'Hàng rong lấn chiếm vỉa hè khu trung tâm',
    when: (c) => count(c, (z) => z.cat === 'c') >= 6,
    options: [
      { id: 'clear', label: 'Ra quân dẹp vỉa hè', money: -2000, mods: [['happy', -2, 10], ['tour', 0.95, 15]] },
      { id: 'license', label: 'Cấp phép theo giờ, thu phí', money: 3000, mods: [['comm', 0.03, 20], ['happy', 1, 20]] },
      { id: 'street', label: 'Làm phố ẩm thực đêm', money: -10000, mods: [['tour', 1.15, 30], ['happy', 2, 30]], rating: 0.3 },
    ],
    text: { title: 'Vỉa hè hay chợ?', story: 'Người đi bộ phải xuống lòng đường vì quán xá, xe đẩy bày kín vỉa hè. Nhưng đó cũng là sinh kế của hàng trăm hộ và là thứ du khách thích nhất.' },
  },
  flood: {
    topic: 'Dân vùng trũng bị ngập nhiều lần, đòi di dời hoặc làm kè',
    when: (c) => c.season && c.season.houses > 0,
    options: [
      { id: 'move', label: 'Hỗ trợ di dời', money: -15000, mods: [['happy', 3, 30]] },
      { id: 'raise', label: 'Hỗ trợ tôn nền nhà', money: -7000, mods: [['happy', 1, 20]] },
      { id: 'wait', label: 'Chờ có ngân sách', money: 0, mods: [['happy', -4, 20], ['pull', -0.02, 20]] },
    ],
    text: { title: 'Vùng trũng kêu cứu', story: 'Sau trận mưa vừa rồi, nhiều hộ ở vùng thấp ven sông lại bị ngập. Họ gửi đơn lên thành phố, đòi được di dời hoặc hỗ trợ tôn nền.' },
  },
  clearance: {
    topic: 'Một hộ dân không chịu giải toả để mở đường',
    when: (c) => c.edges.size > 20 && c.pp.count > 300,
    options: [
      { id: 'pay', label: 'Đền bù cao hơn', money: -12000, mods: [['happy', 1, 15]] },
      { id: 'force', label: 'Cưỡng chế', money: -2000, mods: [['happy', -4, 25]] },
      { id: 'redesign', label: 'Thiết kế lại cho đường vòng', money: -5000, mods: [] },
    ],
    text: { title: 'Ngôi nhà giữa đường', story: 'Dự án mở đường đã giải phóng xong mặt bằng, chỉ còn một hộ không chịu đi vì cho rằng giá đền bù quá thấp. Báo chí bắt đầu đưa tin.' },
  },
  noise: {
    topic: 'Dân phản đối ồn ào vì lễ hội kéo dài tới khuya',
    when: (c) => c.fest && c.fest.org && c.fest.org.start >= c.day - 1,
    options: [
      { id: 'late', label: 'Cho mở tới khuya', money: 0, mods: [['tour', 1.12, 4], ['happy', -1, 4]], rating: 0.2 },
      { id: 'curfew', label: 'Giới hạn tới 22 giờ', money: 0, mods: [['happy', 1, 4], ['tour', 0.95, 4]] },
    ],
    text: { title: 'Lễ hội hay giấc ngủ?', story: 'Lễ hội sắp tới dự kiến kéo dài tới nửa đêm. Một số tổ dân phố gần nơi tổ chức gửi kiến nghị phản đối tiếng ồn.' },
  },
  scam: {
    topic: 'Du khách tố bị chặt chém giá taxi, hàng quán',
    when: (c) => c.tour && c.tour.last && c.tour.last.visitors > 40,
    options: [
      { id: 'crack', label: 'Ra quân kiểm tra, xử phạt', money: -4000, mods: [], rating: 0.5 },
      { id: 'hotline', label: 'Lập đường dây nóng', money: -1500, mods: [], rating: 0.25 },
      { id: 'ignore', label: 'Không can thiệp', money: 0, mods: [['comm', 0.02, 10]], rating: -0.6 },
    ],
    text: { title: 'Du khách tố bị chặt chém', story: 'Mạng xã hội lan truyền bài viết của một du khách bị tính giá taxi gấp năm lần. Nhiều người khác vào bình luận kể chuyện tương tự.' },
  },
  drought: {
    topic: 'Nắng hạn, nước sạch không đủ cấp',
    when: (c) => c.inc && c.inc.weather === 'dry' && c.pp.count > 200,
    options: [
      { id: 'ration', label: 'Cắt nước luân phiên', money: 0, mods: [['happy', -3, 6]] },
      { id: 'buy', label: 'Mua nước từ tỉnh bạn', money: -8000, mods: [] },
      { id: 'industry', label: 'Ưu tiên dân, cắt nước nhà máy', money: 0, mods: [['comm', -0.04, 6]] },
    ],
    text: { title: 'Nắng hạn kéo dài', story: 'Nhiều ngày không mưa, mực nước sông xuống thấp. Nhà máy nước cảnh báo không đủ cấp cho cả khu dân cư lẫn khu công nghiệp.' },
  },
  // ── đời sống khu phố (xuất hiện cả khi thành phố còn nhỏ) ──
  karaoke: {
    topic: 'Karaoke loa kéo hát tới khuya, hàng xóm khiếu nại',
    when: (c) => c.pp.count >= 40,
    options: [
      { id: 'curfew', label: 'Cấm hát sau 22 giờ, phạt nặng', money: 1500, mods: [['happy', 1, 15]] },
      { id: 'remind', label: 'Tổ dân phố nhắc nhở', money: 0, mods: [] },
      { id: 'ignore', label: 'Chuyện nhà người ta', money: 0, mods: [['happy', -2, 15]] },
    ],
    text: { title: 'Loa kéo lúc nửa đêm', story: 'Nhà ông Ba trong xóm mua dàn loa kéo mới, đêm nào cũng hát "Duyên phận" tới 12 giờ. Hàng xóm có con nhỏ, người già gửi đơn lên phường lần thứ ba.' },
  },
  wedding: {
    topic: 'Đám cưới, đám ma dựng rạp chiếm hết lòng đường',
    when: (c) => c.pp.count >= 40 && c.edges.size >= 4,
    options: [
      { id: 'allow', label: 'Cho dựng rạp, phong tục mà', money: 0, mods: [['happy', 1, 10], ['comm', -0.01, 10]] },
      { id: 'rule', label: 'Quy định giờ giấc, phải xin phép', money: -1000, mods: [] },
      { id: 'ban', label: 'Cấm dựng rạp dưới lòng đường', money: 0, mods: [['happy', -2, 15]] },
    ],
    text: { title: 'Rạp cưới giữa phố', story: 'Cuối tuần này có ba đám cưới cùng dựng rạp kín lòng đường, xe máy phải đi vòng cả cây số. Người dân chia hai phe: phong tục bao đời hay giao thông là trên hết?' },
  },
  loudspeaker: {
    topic: 'Loa phường phát thanh 6 giờ sáng: người thích, người ghét',
    when: (c) => c.pp.count >= 30,
    options: [
      { id: 'keep', label: 'Giữ loa phường như cũ', money: 0, mods: [['happy', -1, 10], ['pull', 0.01, 10]] },
      { id: 'app', label: 'Chuyển sang ứng dụng điện thoại', money: -3000, mods: [['happy', 1, 20]] },
      { id: 'later', label: 'Lùi giờ phát sang 7 giờ', money: 0, mods: [] },
    ],
    text: { title: 'Loa phường đánh thức cả xóm', story: 'Đúng 6 giờ sáng loa phường lại vang "Alô alô, thông báo...". Các cụ thì quen rồi, nhưng dân văn phòng mới chuyển tới phàn nàn trên nhóm Zalo khu phố.' },
  },
  football: {
    topic: 'Đội tuyển Việt Nam vô địch, cổ động viên đổ ra đường "đi bão"',
    when: (c) => c.pp.count >= 60 && c.edges.size >= 4,
    options: [
      { id: 'party', label: 'Cho đi bão, thắt chặt an ninh', money: -1500, mods: [['happy', 4, 5], ['tour', 1.05, 5]] },
      { id: 'square', label: 'Tổ chức cổ vũ ở quảng trường', money: -4000, mods: [['happy', 4, 5], ['tour', 1.08, 5]], rating: 0.2 },
      { id: 'block', label: 'Phong toả trung tâm', money: 0, mods: [['happy', -3, 10]] },
    ],
    text: { title: 'Cả phố đi bão', story: 'Tiếng còi trọng tài vừa dứt, cả thành phố đổ ra đường với cờ đỏ sao vàng, kèn, nồi niêu. Công an đề nghị phương án: cho đi bão hay phong toả trung tâm?' },
  },
  tetBonus: {
    topic: 'Công nhân chờ thưởng Tết, nhiều xưởng nợ lương',
    when: (c) => lunar(c.day).month === 12 && count(c, (z) => z.cat === 'i') >= 3,
    options: [
      { id: 'force', label: 'Buộc doanh nghiệp trả đủ trước Tết', money: 0, mods: [['happy', 3, 15], ['comm', -0.03, 15]] },
      { id: 'help', label: 'Thành phố hỗ trợ quà Tết', money: -8000, mods: [['happy', 3, 15], ['pull', 0.02, 20]] },
      { id: 'wait', label: 'Để doanh nghiệp tự lo', money: 0, mods: [['happy', -3, 20], ['pull', -0.02, 20]] },
    ],
    text: { title: 'Tết này có thưởng không?', story: 'Còn ít ngày nữa là Tết, nhiều công nhân ở khu xưởng vẫn chưa nhận lương tháng trước, nói gì tới thưởng. Họ tụ tập trước cổng xin về quê sớm.' },
  },
  xeOm: {
    topic: 'Xe ôm truyền thống phản đối xe ôm công nghệ',
    when: (c) => c.pp.count >= 300,
    options: [
      { id: 'tech', label: 'Cấp phép xe công nghệ', money: 2000, mods: [['comm', 0.02, 20], ['happy', -1, 10]] },
      { id: 'support', label: 'Hỗ trợ xe ôm chuyển đổi', money: -5000, mods: [['happy', 2, 20]] },
      { id: 'limit', label: 'Hạn chế xe công nghệ', money: 0, mods: [['comm', -0.02, 20]], rating: -0.2 },
    ],
    text: { title: 'Chú xe ôm và ứng dụng', story: 'Mấy chục chú xe ôm đầu ngõ kéo về trụ sở phường: "Từ ngày có xe ôm công nghệ, cả ngày không chạy nổi một cuốc". Phía hãng xe công nghệ thì xin mở rộng hoạt động.' },
  },
  bunDau: {
    topic: 'Quán ăn nổi tiếng trên mạng, khách xếp hàng gây kẹt phố',
    when: (c) => count(c, (z) => z.cat === 'c') >= 3,
    options: [
      { id: 'tables', label: 'Cho bày bàn ra vỉa hè', money: 0, mods: [['tour', 1.06, 15]], rating: 0.2 },
      { id: 'clear', label: 'Bắt quán dọn gọn', money: 500, mods: [], rating: -0.1 },
      { id: 'food', label: 'Quy hoạch phố ẩm thực', money: -6000, mods: [['tour', 1.12, 30], ['comm', 0.02, 30]], rating: 0.3 },
    ],
    text: { title: 'Hàng bún đậu nổi tiếng', story: 'Một quán bún đậu mắm tôm trong hẻm bỗng nổi tiếng nhờ clip triệu view. Khách từ khắp nơi đến xếp hàng, xe máy dựng kín hai bên đường, cả khu phố tắc từ trưa tới tối.' },
  },
  heat: {
    topic: 'Nắng nóng 40 độ, điện quá tải, dân kêu',
    when: (c) => c.inc && c.inc.weather === 'dry' && c.pp.count >= 80,
    options: [
      { id: 'cool', label: 'Mở điểm tránh nóng, phát nước', money: -3000, mods: [['happy', 2, 5]] },
      { id: 'cut', label: 'Cắt điện luân phiên', money: 0, mods: [['happy', -3, 5], ['comm', -0.02, 5]] },
      { id: 'buy', label: 'Mua thêm điện giá cao', money: -6000, mods: [] },
    ],
    text: { title: 'Nắng như đổ lửa', story: 'Nhiệt độ ngoài trời lên tới 40 độ. Nhà nhà bật điều hoà, trạm biến áp quá tải, vài khu đã mất điện. Các cụ già và trẻ nhỏ mệt lả.' },
  },
  rice: {
    topic: 'Giá lúa rớt mạnh, nông dân xin hỗ trợ',
    when: (c) => count(c, (z) => z.raw === 'agri') >= 3,
    options: [
      { id: 'buy', label: 'Mua tạm trữ lúa cho dân', money: -8000, mods: [['happy', 2, 20]] },
      { id: 'switch', label: 'Hỗ trợ chuyển sang cây trái', money: -4000, mods: [['comm', 0.02, 30]] },
      { id: 'market', label: 'Để thị trường tự điều chỉnh', money: 0, mods: [['happy', -2, 20], ['pull', -0.02, 20]] },
    ],
    text: { title: 'Được mùa mất giá', story: 'Năm nay lúa trúng mùa nhưng thương lái ép giá thấp chưa từng có. Bà con ở cánh đồng phía ngoại thành chất lúa đầy sân, không biết bán cho ai.' },
  },
  sand: {
    topic: 'Khai thác cát trái phép làm sạt lở bờ sông',
    when: (c) => c.pp.count >= 150 && c.water.some((v) => v),
    options: [
      { id: 'raid', label: 'Truy quét "cát tặc"', money: -4000, mods: [['happy', 1, 20]] },
      { id: 'license', label: 'Cấp phép, thu thuế tài nguyên', money: 7000, mods: [['happy', -2, 20], ['tour', 0.95, 20]] },
      { id: 'embank', label: 'Làm kè chống sạt lở', money: -10000, mods: [['happy', 2, 30]] },
    ],
    text: { title: 'Cát tặc trên sông', story: 'Đêm nào cũng nghe tiếng máy hút cát rầm rầm. Sáng nay một đoạn bờ sông sạt lở, kéo theo hai căn nhà và vườn chuối của dân.' },
  },
  dengue: {
    topic: 'Mùa mưa, sốt xuất huyết bùng phát',
    when: (c) => stormSeason(c) && c.pp.count >= 120,
    options: [
      { id: 'spray', label: 'Phun thuốc diệt muỗi toàn thành phố', money: -3000, mods: [['happy', 1, 15]] },
      { id: 'field', label: 'Lập điểm điều trị dã chiến', money: -9000, mods: [['happy', 3, 20]] },
      { id: 'leaflet', label: 'Phát tờ rơi tuyên truyền', money: -500, mods: [['happy', -2, 15]] },
    ],
    text: { title: 'Sốt xuất huyết vào mùa', story: 'Trạm y tế báo số ca sốt xuất huyết tăng gấp ba so với tuần trước, nhiều nhất ở khu nhà trọ ven kênh. Hành lang bệnh viện đã phải kê thêm giường.' },
  },
  miniFire: {
    topic: 'Chung cư mini, nhà trọ không đạt chuẩn phòng cháy',
    when: (c) => count(c, (z) => z.cat === 'r') >= 12,
    options: [
      { id: 'close', label: 'Đình chỉ, buộc cải tạo ngay', money: 0, mods: [['pull', -0.04, 20], ['happy', -1, 15]] },
      { id: 'deadline', label: 'Cho 3 tháng cải tạo, hỗ trợ một phần', money: -4000, mods: [] },
      { id: 'blind', label: 'Làm ngơ, chưa có chuyện gì', money: 0, mods: [], fire: 3 },
    ],
    text: { title: 'Nhà trọ không lối thoát', story: 'Đoàn kiểm tra phát hiện hàng chục nhà trọ, chung cư mini chỉ có một cầu thang, cửa sổ bịt khung sắt, không bình chữa cháy. Chủ nhà nói "xưa giờ vẫn vậy".' },
  },
  craft: {
    topic: 'Làng nghề gốm, mây tre xin mở rộng, khói lò ảnh hưởng dân',
    when: (c) => count(c, (z) => z.cat === 'i') >= 2 && c.pp.count >= 80,
    options: [
      { id: 'support', label: 'Hỗ trợ làng nghề làm du lịch', money: -5000, mods: [['tour', 1.08, 30]], rating: 0.2 },
      { id: 'move', label: 'Di dời lò ra xa khu dân cư', money: -3000, mods: [['happy', 1, 20], ['comm', -0.02, 20]] },
      { id: 'keep', label: 'Giữ nguyên như cũ', money: 0, mods: [['happy', -1, 20]] },
    ],
    text: { title: 'Khói lò làng gốm', story: 'Làng gốm trăm năm tuổi xin thêm đất xây lò mới vì đơn hàng xuất khẩu tăng. Nhưng khu dân cư mới mọc ngay cạnh đã kêu khói lò làm cay mắt mỗi chiều.' },
  },
  grave: {
    topic: 'Mồ mả tổ tiên nằm trên đất quy hoạch',
    when: (c) => c.pp.count >= 100 && c.edges.size >= 8,
    options: [
      { id: 'rebury', label: 'Hỗ trợ cải táng chu đáo', money: -6000, mods: [['happy', 1, 20]] },
      { id: 'park', label: 'Giữ lại, làm công viên tưởng niệm', money: -2500, mods: [['tour', 1.02, 30]] },
      { id: 'force', label: 'Cưỡng chế giải toả', money: 0, mods: [['happy', -4, 30]] },
    ],
    text: { title: 'Mộ tổ giữa công trình', story: 'Máy xúc đang san nền thì phát hiện cụm mộ của dòng họ Nguyễn đã có từ bốn đời. Con cháu kéo đến đứng chắn, xin giữ lại nơi thờ tự.' },
  },
  pagodaLand: {
    topic: 'Chùa xin thêm đất mở rộng làm lễ hội',
    when: (c) => c.services.some((s) => s.type === 'pagoda' && !(s.build > 0)),
    options: [
      { id: 'grant', label: 'Cấp đất, hỗ trợ trùng tu', money: -4000, mods: [['tour', 1.06, 40], ['happy', 1, 30]], rating: 0.2 },
      { id: 'restore', label: 'Chỉ trùng tu phần cũ', money: -1500, mods: [['tour', 1.02, 30]] },
      { id: 'refuse', label: 'Từ chối, đất dành làm đường', money: 0, mods: [['happy', -1, 20]] },
    ],
    text: { title: 'Chùa làng xin đất', story: 'Sư trụ trì chùa cổ gửi thư mời thị trưởng: mùa lễ đông người không đủ chỗ, chùa xin thêm khoảnh đất trống bên cạnh để làm sân lễ và bãi gửi xe.' },
  },
};

// ───────────────────────── đàm phán (9) ─────────────────────────

/**
 * Hợp đồng đàm phán được. params: tên trường → [min, max, đơn vị, ai muốn cao]: 'us' = thành phố muốn cao, 'them' = đối tác muốn cao.
 * start: đề nghị đầu tiên của đối tác (nghiêng về phía họ). persona: tính cách đối tác (gửi cho LLM).
 */
export const DEALS = {
  investor: {
    who: ['Tập đoàn Hanshin (Hàn Quốc)', 'Công ty Sakura Holdings (Nhật Bản)', 'Quỹ Merlion Capital (Singapore)'],
    persona: 'Giám đốc đầu tư nước ngoài, lịch sự nhưng rất cứng rắn về ưu đãi thuế, thích số liệu, hay viện dẫn các tỉnh khác đang chào mời',
    when: (c) => c.pp.count >= 300,
    params: { invest: [20000, 160000, '₫ vốn góp hạ tầng', 'us'], breakPct: [10, 60, '% thuế thương mại, công nghiệp được miễn', 'them'], days: [20, 120, 'ngày ưu đãi', 'them'] },
    start: (c, P) => ({ invest: Math.round(P.invest[0] + (P.invest[1] - P.invest[0]) * 0.35), breakPct: 50, days: 100 }),
    summary: (o) => `Góp ${o.invest.toLocaleString('vi-VN')} ₫ ngay, đổi lại miễn ${o.breakPct}% thuế thương mại và công nghiệp trong ${o.days} ngày (dân tới ở đông hơn trong thời gian đó)`,
    worth: (o) => o.invest - o.breakPct * o.days * 18, // ước lượng lời / lỗ cho thành phố (gợi ý cho người chơi)
  },
  grant: {
    who: ['Bộ Xây dựng', 'Bộ Tài nguyên và Môi trường', 'Quỹ phòng chống thiên tai trung ương'],
    persona: 'Cán bộ cấp bộ, nói chuyện kiểu công văn, nhấn mạnh trách nhiệm và tiến độ, không thích bị mặc cả nhưng chịu nhượng bộ nếu thành phố đưa ra lý do chính đáng (dân số, thiên tai, ngân sách eo hẹp)',
    when: (c) => c.pp.count >= 150,
    params: { grant: [15000, 120000, '₫ hỗ trợ', 'us'], target: [1, 6, 'công trình chống ngập (trạm bơm, kè) phải xây thêm', 'them'], days: [15, 60, 'ngày thời hạn', 'us'] },
    start: (c, P) => ({ grant: Math.round(P.grant[0] + (P.grant[1] - P.grant[0]) * 0.3), target: 4, days: 20 }),
    summary: (o) => `Nhận ${o.grant.toLocaleString('vi-VN')} ₫ ngay, phải xây thêm ${o.target} trạm bơm hoặc kè trong ${o.days} ngày; không đạt thì hoàn trả gấp 1,5 lần`,
    worth: (o) => o.grant - o.target * 9000,
  },
  airline: {
    who: ['Hãng bay Sky Lotus', 'Hãng bay Pacific Wings', 'Hãng bay Dragon Air'],
    persona: 'Giám đốc phát triển đường bay, năng nổ, hay khoe số khách, đòi trợ giá vì đường bay mới chưa chắc có lãi',
    when: (c) => c.services.some((s) => s.type === 'airport' && s.mods && s.mods.includes('intl') && !(s.build > 0)), // đường bay quốc tế
    params: { subsidy: [200, 2500, '₫ trợ giá mỗi ngày', 'them'], boost: [20, 120, '% thêm chuyến bay quốc tế', 'us'], days: [15, 90, 'ngày', 'us'] },
    start: (c, P) => ({ subsidy: 2000, boost: 40, days: 30 }),
    summary: (o) => `Trợ giá ${o.subsidy.toLocaleString('vi-VN')} ₫ mỗi ngày trong ${o.days} ngày, hãng mở thêm ${o.boost}% chuyến bay quốc tế`,
    worth: (o) => o.boost * o.days * 12 - o.subsidy * o.days,
  },
};

/** Ép đề nghị vào khung cho phép (dù LLM hay người chơi đưa số gì). */
export function clampOffer(type, o) {
  const P = DEALS[type].params, out = {};
  for (const k in P) out[k] = Math.round(clamp(Number.isFinite(+o?.[k]) ? +o[k] : P[k][0], P[k][0], P[k][1]));
  return out;
}

// ───────────────────────── đánh giá du khách (19) ─────────────────────────

const COUNTRIES = [['Nhật Bản', 'Yuki'], ['Hàn Quốc', 'Min-jun'], ['Úc', 'Olivia'], ['Pháp', 'Camille'], ['Mỹ', 'Jake'], ['Đức', 'Lukas'], ['Singapore', 'Wei Ling'], ['Thái Lan', 'Somchai'], ['Anh', 'Emma'], ['Việt Nam', 'Minh Anh'], ['Việt Nam', 'Quốc Bảo'], ['Trung Quốc', 'Li Na']];

/** Trải nghiệm hôm nay của du khách (game chấm sao từ số liệu thật). */
export function visitorExperience(c) {
  const s = c.stats || {}, tr = c.traffic, cong = tr && tr.speedEma != null ? 1 - tr.speedEma : 0; // 0 = thông thoáng, 1 = đứng yên
  const sc = c.tour && c.tour.score, beds = sc ? sc.beds : 0, guests = c.tour ? c.tour.guests : 0;
  const pros = [], cons = [];
  let stars = 3.4;
  const attract = sc ? sc.attract : 0;
  if (attract > 10) { stars += 0.6; pros.push('nhiều điểm tham quan'); } else if (attract < 3) { stars -= 0.5; cons.push('ít chỗ tham quan'); }
  if (c.services.some((v) => v.type === 'beach') || (c.beach && c.beach.some((v) => v))) { stars += 0.3; pros.push('bãi biển đẹp'); }
  if (c.services.some((v) => v.type === 'pagoda' || v.type === 'museum')) { stars += 0.2; pros.push('chùa cổ, bảo tàng'); }
  if (c.street) {
    if (c.street.sidewalk === 'free') { stars += 0.25; pros.push('ẩm thực vỉa hè tuyệt vời'); } else if (c.street.sidewalk === 'clear') { stars -= 0.1; cons.push('phố xá vắng vẻ'); }
    if (c.street.aqi > 150) { stars -= 0.5; cons.push('bụi mịn mù mịt'); }
  }
  if ((c.ferries || []).some((l) => l.isle)) { stars += 0.3; pros.push('đi tàu ra đảo'); }
  const fe = c.fest && c.fest.org && c.fest.org.start <= c.day && c.fest.org.start + 3 >= c.day;
  if (fe) { stars += 0.5; pros.push('lễ hội rất vui'); }
  if (cong > 0.45) { stars -= 0.7; cons.push('kẹt xe kinh khủng'); } else if (cong > 0.25) { stars -= 0.3; cons.push('đường đông'); } else pros.push('đi lại dễ');
  if (c.season && c.season.wet > 20) { stars -= 0.6; cons.push('ngập nước'); }
  if (c.inc && c.inc.weather === 'storm') { stars -= 0.5; cons.push('gặp bão'); }
  if (s.happy && s.happy < 45) { stars -= 0.3; cons.push('người dân có vẻ mệt mỏi'); } else if (s.happy > 70) { stars += 0.3; pros.push('người dân thân thiện'); }
  if (beds && guests >= beds * 0.95) { stars -= 0.4; cons.push('hết phòng khách sạn'); } else if (beds) pros.push('khách sạn tốt');
  let crime = 0, poll = 0, n = 0;
  if (c.crime && c.pollution) for (let i = 0; i < N * N; i += 7) if (c.level[i]) { crime += c.crime[i]; poll += c.pollution[i]; n++; }
  if (n && crime / n > 0.25) { stars -= 0.5; cons.push('bị móc túi'); }
  if (n && poll / n > 0.3) { stars -= 0.4; cons.push('không khí ô nhiễm'); }
  stars += c.council ? c.council.ratingBias : 0;
  return { stars: clamp(stars, 1, 5), pros, cons, festival: fe };
}

/** Điểm đánh giá trung bình 30 bài gần nhất (null nếu chưa có). */
export function ratingAvg(c) {
  const r = c.council && c.council.reviews;
  if (!r || !r.length) return null;
  const last = r.slice(-30);
  return last.reduce((s, x) => s + x.stars, 0) / last.length;
}
/** Đánh giá ảnh hưởng ngược lại số du khách, khách quốc tế: 1 sao ×0,7 … 5 sao ×1,3. */
export function ratingK(c) { const a = ratingAvg(c); return a == null ? 1 : clamp(0.7 + (a - 1) * 0.15, 0.7, 1.3); }

const REVIEW_TPL = {
  5: ['Tuyệt vời! {pro} và {pro2}. Nhất định sẽ quay lại.', 'Chuyến đi đáng nhớ nhất năm: {pro}, {pro2}.'],
  4: ['Rất thích {pro}. Chỉ tiếc là {con}.', 'Thành phố dễ thương, {pro}. Điểm trừ nhỏ: {con}.'],
  3: ['Cũng được: {pro}, nhưng {con}.', 'Bình thường. {con} làm chuyến đi kém vui.'],
  2: ['Thất vọng: {con}, lại còn {con2}.', 'Không như quảng cáo. {con}.'],
  1: ['Tệ. {con} và {con2}. Không quay lại.', 'Đừng đến lúc này: {con}.'],
};
/** Lời đánh giá dự phòng (không có LLM). */
export function reviewFallback(r, rng = Math.random) {
  const t = REVIEW_TPL[Math.round(r.stars)] || REVIEW_TPL[3], s = t[(rng() * t.length) | 0];
  const pro = r.pros[0] || 'cảnh đẹp', pro2 = r.pros[1] || 'đồ ăn ngon', con = r.cons[0] || 'hơi đông', con2 = r.cons[1] || 'giá cả hơi cao';
  return s.replace('{pro2}', pro2).replace('{pro}', pro).replace('{con2}', con2).replace('{con}', con);
}

// ───────────────────────── mỗi giờ ─────────────────────────

/**
 * Mỗi giờ: sinh tình huống / đề nghị đàm phán mới (buổi sáng), hết hạn thì tự xử lý, kiểm tra cam kết hợp đồng,
 * mỗi tối du khách viết đánh giá. Trả về các mục mới cần LLM viết lời (main.js gửi đi, có thì thay mẫu câu).
 */
export function councilHour(c) {
  const k = c.council, rng = c.rng || Math.random, h = c.hour % 24, fresh = [];
  // hết hạn
  for (const it of k.inbox) {
    if (it.status !== 'pending' || c.day < it.expires) continue;
    if (it.kind === 'dilemma') { decide(c, it.id, it.options[it.options.length - 1].id, true); }
    else { it.status = 'expired'; c.events.push({ type: 'council', text: `📨 Hết hạn đàm phán với ${it.who}: họ chuyển sang tỉnh khác` }); }
  }
  // cam kết của hợp đồng hỗ trợ: tới hạn mà chưa đủ công trình thì hoàn trả gấp 1,5
  for (const d of k.deals) {
    if (d.type !== 'grant' || d.checked || c.day < d.until) continue;
    d.checked = true;
    const built = c.services.filter((s) => (s.type === 'floodpump' || s.type === 'levee') && !(s.build > 0)).length - d.base;
    if (built >= d.target) c.events.push({ type: 'council', text: `✅ Đã hoàn thành cam kết với ${d.who}: xây ${built} công trình chống ngập` });
    else { const back = Math.round(d.grant * 1.5); c.money -= back; c.events.push({ type: 'council', text: `⚠️ Không đạt cam kết với ${d.who} (mới xây ${Math.max(0, built)}/${d.target}): hoàn trả ${back.toLocaleString('vi-VN')} ₫` }); }
  }
  if (h === 9 && k.inbox.filter((i) => i.status === 'pending').length < 4) {
    if (rng() < 0.4) { const it = newDilemma(c, rng); if (it) fresh.push(it); }
    else if (rng() < 0.18) { const it = newDeal(c, rng); if (it) fresh.push(it); }
  }
  if (h === 21 && c.tour && c.tour.day && c.tour.day.visitors > 0) {
    const n = Math.min(3, 1 + ((c.tour.day.visitors / 60) | 0));
    for (let q = 0; q < n; q++) {
      const ex = visitorExperience(c), [country, name] = COUNTRIES[(rng() * COUNTRIES.length) | 0];
      const stars = clamp(Math.round(ex.stars + (rng() - 0.5) * 1.2), 1, 5);
      const r = { id: k.nextId++, kind: 'review', day: c.day, country, name, stars, pros: ex.pros.slice(0, 3), cons: ex.cons.slice(0, 3), festival: ex.festival };
      r.text = reviewFallback(r, rng);
      k.reviews.push(r); fresh.push(r);
    }
    if (k.reviews.length > 120) k.reviews.splice(0, k.reviews.length - 120);
    k.ratingBias *= 0.85;
  }
  k.mods = k.mods.filter((m) => m.until >= c.day);
  return fresh;
}

function newDilemma(c, rng) {
  const recent = new Set(c.council.inbox.filter((i) => i.kind === 'dilemma' && i.day > c.day - 15).map((i) => i.type));
  const can = Object.keys(DILEMMAS).filter((t) => !recent.has(t) && DILEMMAS[t].when(c));
  if (!can.length) return null;
  const type = can[(rng() * can.length) | 0], D = DILEMMAS[type];
  const it = { id: c.council.nextId++, kind: 'dilemma', type, day: c.day, expires: c.day + 3, status: 'pending', topic: D.topic, options: D.options.map((o) => ({ id: o.id, label: o.label })), title: D.text.title, story: D.text.story };
  c.council.inbox.push(it);
  c.events.push({ type: 'council', text: `📨 Có việc cần thị trưởng quyết: ${D.text.title}` });
  return it;
}

function newDeal(c, rng) {
  const busy = new Set(c.council.inbox.filter((i) => i.kind === 'deal' && i.status === 'pending').map((i) => i.type));
  const can = Object.keys(DEALS).filter((t) => !busy.has(t) && DEALS[t].when(c) && !c.council.deals.some((d) => d.type === t && d.until >= c.day));
  if (!can.length) return null;
  const type = can[(rng() * can.length) | 0], D = DEALS[type], who = D.who[(rng() * D.who.length) | 0];
  const offer = clampOffer(type, D.start(c, D.params));
  const it = { id: c.council.nextId++, kind: 'deal', type, who, day: c.day, expires: c.day + 5, status: 'pending', offer, chat: [{ from: 'them', text: `Kính gửi thị trưởng, ${who} xin đề xuất: ${D.summary(offer)}. Mong được hợp tác.` }] };
  c.council.inbox.push(it);
  c.events.push({ type: 'council', text: `📨 ${who} gửi đề nghị hợp tác (vào 📨 Hộp thư để đàm phán)` });
  return it;
}

/** Thị trưởng chọn phương án cho tình huống. auto = hết hạn, tự chọn phương án cuối (chần chừ); by = chủ tịch quận quyết thay. */
export function decide(c, id, optId, auto = false, by = null) {
  const it = c.council.inbox.find((i) => i.id === id && i.kind === 'dilemma');
  if (!it || it.status !== 'pending') return { ok: false, reason: 'Việc này đã xử lý' };
  const o = DILEMMAS[it.type].options.find((x) => x.id === optId);
  if (!o) return { ok: false, reason: 'Không có phương án này' };
  c.money += o.money;
  for (const [key, v, days] of o.mods) c.council.mods.push({ key, v, until: c.day + days, from: it.type });
  if (o.rating) c.council.ratingBias += o.rating;
  if (o.fire) { // làm ngơ chuyện phòng cháy: vài căn nhà ở bốc cháy thật
    const homes = [];
    for (let i = 0; i < N * N; i++) if (c.level[i] && ZDEF[c.zone[i]].cat === 'r' && !c.fire[i]) homes.push(i);
    for (let k = 0; k < o.fire && homes.length; k++) { const j = homes.splice(((c.rng || Math.random)() * homes.length) | 0, 1)[0]; c.fire[j] = 7; }
    c.dirty.fx = true;
  }
  it.status = 'done'; it.chose = optId; it.auto = auto; if (by) it.by = by;
  c.events.push({ type: 'council', text: `${auto ? '⌛ Quá hạn, thành phố mặc định' : by ? `🏙️ ${by} quyết` : '🖋️ Thị trưởng quyết'}: ${it.title} → ${o.label}${o.money ? ` (${o.money > 0 ? '+' : ''}${o.money.toLocaleString('vi-VN')} ₫)` : ''}` });
  return { ok: true, option: o };
}

/** Ký hợp đồng theo đề nghị hiện tại. */
export function signDeal(c, id) {
  const it = c.council.inbox.find((i) => i.id === id && i.kind === 'deal');
  if (!it || it.status !== 'pending') return { ok: false, reason: 'Đàm phán đã kết thúc' };
  const o = clampOffer(it.type, it.offer), d = { type: it.type, who: it.who, from: c.day, until: c.day + o.days, ...o };
  if (it.type === 'investor') c.money += o.invest;
  if (it.type === 'grant') { c.money += o.grant; d.base = c.services.filter((s) => (s.type === 'floodpump' || s.type === 'levee') && !(s.build > 0)).length; }
  c.council.deals.push(d);
  it.status = 'signed';
  c.events.push({ type: 'council', text: `🤝 Đã ký với ${it.who}: ${DEALS[it.type].summary(o)}` });
  return { ok: true, deal: d };
}
export function rejectDeal(c, id) {
  const it = c.council.inbox.find((i) => i.id === id && i.kind === 'deal');
  if (!it || it.status !== 'pending') return { ok: false };
  it.status = 'rejected';
  return { ok: true };
}
/** Cập nhật đề nghị mới của đối tác (từ LLM hoặc mẫu dự phòng): ép vào khung, ghi vào lịch sử trò chuyện. */
export function applyCounter(c, id, reply, offer, status) {
  const it = c.council.inbox.find((i) => i.id === id && i.kind === 'deal');
  if (!it || it.status !== 'pending') return null;
  if (offer) it.offer = clampOffer(it.type, offer);
  it.chat.push({ from: 'them', text: String(reply || '').slice(0, 800) });
  if (status === 'walkaway') { it.status = 'rejected'; it.walked = true; }
  return it;
}
/** Đối tác trả lời dự phòng (không có LLM): nhượng bộ một chút về phía thành phố mỗi lượt, tối đa 3 lượt. */
export function counterFallback(it) {
  const P = DEALS[it.type].params, o = { ...it.offer }, turns = it.chat.filter((m) => m.from === 'us').length;
  if (turns > 3) return { reply: 'Đây là mức cuối cùng của chúng tôi. Mong thị trưởng cân nhắc.', offer: o, status: 'final' };
  for (const k in P) { const [lo, hi, , want] = P[k], step = (hi - lo) * 0.08; o[k] = want === 'us' ? o[k] + step : o[k] - step; }
  return { reply: 'Chúng tôi đã cân nhắc ý kiến của thị trưởng và xin điều chỉnh đề nghị như sau.', offer: clampOffer(it.type, o), status: 'negotiating' };
}

export function initCouncil(c, o = {}) {
  c.council = {
    inbox: Array.isArray(o.inbox) ? o.inbox.slice(-40) : [], deals: Array.isArray(o.deals) ? o.deals.filter((d) => DEALS[d.type]) : [],
    mods: Array.isArray(o.mods) ? o.mods : [], reviews: Array.isArray(o.reviews) ? o.reviews.slice(-120) : [],
    ratingBias: Number.isFinite(+o.ratingBias) ? +o.ratingBias : 0, nextId: Math.max(1, o.nextId | 0),
  };
}
export const packCouncil = (c) => ({ ...c.council, inbox: c.council.inbox.slice(-40), reviews: c.council.reviews.slice(-60) });
export const svcNames = (c) => [...new Set(c.services.map((s) => SERVICES[s.type].name))].slice(0, 12);
