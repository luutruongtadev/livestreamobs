import fs from 'node:fs';
import path from 'node:path';
import { EventEmitter } from 'node:events';

export const VOICE_DEFAULTS = {
  enabled: true,
  voiceId: 'eGSd0uV8dNQnZuEEX9lu', // giọng MC chọn trên ElevenLabs
  modelId: 'eleven_flash_v2_5', // nhanh, đọc được tiếng Việt, rẻ: 0,5 credit / ký tự
  creditsPerChar: 0.5, // dùng để ước tính khi ElevenLabs không trả số credit đã tính
  languageCode: 'vi',
  claudeModel: 'claude-haiku-5-5', // viết câu chọc cười (ngắn, rẻ, nhanh)
  // Đoán trúng: thư viện câu KHÔNG có tên, mỗi mức N câu; đủ rồi thì phát lại (miễn phí), không lặp câu vừa nói
  libraryPerTier: 60, // đủ chỗ cho toàn bộ câu soạn sẵn mỗi cấp
  // Tặng quà: gọi ElevenLabs có tên người tặng
  minGiftDiamonds: 1, // quà nhỏ hơn mức này → trình duyệt tự đọc (miễn phí)
  giftWindowSec: 4, // gom quà liên tiếp của cùng một người trong N giây thành 1 câu
  maxChars: 130, // câu dài hơn thì cắt bớt (credit tính theo ký tự)
  // Ngân sách
  dailyCredits: 5000, // tối đa credit / ngày (giờ VN); 0 = không giới hạn
  reserveCredits: 1000, // tài khoản còn dưới mức này thì ngừng gọi ElevenLabs
  maxQueue: 4,
  maxPerHour: 120,
  keepFiles: 40, // file mp3 câu cảm ơn quà (thư viện đoán trúng không bị xoá)
  stability: 0.35,
  similarity: 0.8,
  style: 0.55,
};

// Giọng đọc khi đoán trúng chia 3 cấp (hiệu ứng trên màn hình vẫn theo 6 mức chi tiết)
export const WIN_TIERS = ['early', 'hint', 'late'];
/** Mức hiệu ứng (6 mức) → cấp giọng đọc (3 cấp). */
export const TIER_GROUP = { lightning: 'early', nohint: 'early', hint1: 'hint', hint2: 'hint', hint3: 'late', clutch: 'late' };

const TIER_DESC = {
  early: 'đoán trúng rất sớm, chưa cần mở gợi ý nào (thần đồng, nhanh như chớp)',
  hint: 'đoán trúng nhờ một hai gợi ý, tốc độ vừa phải',
  late: 'đoán trúng muộn: đã mở hết gợi ý hoặc chỉ còn mấy giây là hết giờ (phút chót, suýt toang)',
};

// Câu đoán trúng soạn sẵn (không tên, dùng lại cho mọi người) — đọc lần đầu thì lưu mp3, lần sau phát lại
export const WIN_LINES = {
  early: [
    'Ét o ét! Mới vài giây đã trúng, cả phòng live chưa kịp thả tim luôn!',
    'U là trời, nhanh như chốt đơn giờ vàng flash sale!',
    'Đỉnh nóc kịch trần bay phấp phới! Trúng trong nháy mắt luôn!',
    'Ủa alo, mình còn chưa kịp hít thở mà đã có người trúng rồi?',
    'Tốc độ này đi săn sale chắc không bao giờ hết hàng!',
    'Não bộ này chắc vừa nâng cấp lên bản Pro Max rồi!',
    'Trúng nhanh hơn cả crush seen tin nhắn của mình nữa!',
    'Ối dồi ôi, ra đề chưa ráo mực đã bị giải xong!',
    'Đây là người thật hay ChatGPT đội lốt vậy trời?',
    'Slay quá trời slay! Vài giây là xong một vòng!',
    'Mấy gợi ý mình chuẩn bị giờ thất nghiệp hết rồi, ai đền đây!',
    'Trúng nhanh như video viral trên TikTok, mình xin chịu thua!',
    'Phản xạ này mà đi đánh pickleball thì vô địch chắc rồi!',
    'Khét lẹt! Thần đồng đoán chữ chính thức lộ diện!',
    'Mình còn đang overthinking cái đề thì người ta trúng luôn rồi!',
    'Nhanh tới mức mình nghi có thao túng tâm lý ở đây nha!',
    'Out trình cả phòng live! Trúng ngay từ những giây đầu tiên!',
    'Ra đề xong quay đi uống ngụm cà phê muối, quay lại đã có người trúng!',
    'Green flag to đùng! Não nhanh như vậy ai mà không mê!',
    'Đề này mình nghĩ cả buổi, người ta giải trong mấy giây. Tổn thương nhẹ!',
    'Không một gợi ý nào mà vẫn trúng, flex nhẹ trình độ cho cả nhà xem!',
    'Gợi ý còn chưa kịp lên sóng đã bị giải xong, quá đỉnh!',
    'Tự lực cánh sinh, không cần mớm, trúng ngon lành cành đào!',
    'Ao trình thật sự! Không gợi ý vẫn trúng phóc!',
    'Cả phòng còn đang hóng gợi ý thì có người âm thầm về đích!',
    'Không cần gợi ý, chỉ cần vibe là đủ trúng rồi!',
    'Đây là thực lực chứ không phải phông bạt nha mọi người!',
    'Gợi ý xin phép nghỉ ca hôm nay vì có người giỏi quá!',
    'Xu cà na gì đâu, đoán là trúng, không cần ai giúp!',
    'Mình định tung gợi ý mà thôi cất lại, cảm ơn người chơi hệ thông minh!',
    'Không gợi ý, không trợ giúp, không gọi điện cho người thân. Vẫn trúng!',
    'Bộ não này phải được đưa lên xu hướng ngay!',
    'Đúng kiểu học ít hiểu nhiều, không cần gợi ý vẫn ăn trọn!',
    'Gen Z bây giờ đoán chữ còn nhanh hơn lướt TikTok!',
    'Chưa cần tới emoji mà đã giải xong, quá trình!',
    'Mình xin phép đóng gói bộ gợi ý mang về, không ai cần tới!',
    'Hóng biến chưa thấy đâu, đã thấy có người trúng!',
    'Tự tin như TikToker lên xu hướng! Trúng không cần gợi ý!',
    'Trời đất ơi, chưa kịp uống ngụm nước đã có người trúng rồi! Thần đồng xuất hiện!',
    'Mới mấy giây thôi mà trúng phóc, ăn gian hay là thiên tài vậy trời?',
    'Ê khoan, mình còn chưa đọc xong luật mà đã có người đoán trúng! Quá đỉnh!',
    'Tốc độ ánh sáng! Chắc là nhìn trộm đáp án của mình rồi, đùa thôi, quá giỏi!',
    'Ủa alo? Trúng luôn rồi hả? Cả phòng live chưa kịp chớp mắt!',
    'Thần đồng đoán chữ đây rồi! Mọi người vỗ tay cho một bộ não siêu việt!',
    'Mình chuẩn bị ba gợi ý mà giờ thất nghiệp hết rồi! Chúc mừng thần đồng!',
    'Đề khó vậy mà trúng trong nháy mắt, kiếp trước chắc làm từ điển hả trời?',
    'Không cần một gợi ý nào mà vẫn trúng! Bộ não này phải đem đi triển lãm!',
    'Gợi ý còn nằm trong túi chưa kịp lấy ra, vậy mà trúng rồi! Giỏi quá!',
    'Đoán trúng không cần gợi ý, đúng là cao thủ ẩn danh trong phòng live!',
    'Tự thân vận động, không nhờ gợi ý, trúng ngon lành! Chúc mừng nha!',
    'Đây mới gọi là thực lực! Không gợi ý, không trợ giúp, vẫn trúng phóc!',
    'Cả phòng còn đang loay hoay thì có người âm thầm trúng luôn rồi! Quá đẳng cấp!',
    'Không cần gợi ý vẫn trúng, chắc sáng nay ăn nhiều óc chó lắm đây!',
    'Mình định mở gợi ý mà giờ khỏi luôn! Chúc mừng người chơi hệ thông minh!',
  ],
  hint: [
    'Nhìn gợi ý một cái là hiểu ý ngay, đúng là dân bắt sóng chuyên nghiệp!',
    'Gợi ý vừa ra là bắt sóng liền, nhanh hơn wifi nhà mình!',
    'Mình chỉ cần thả nhẹ gợi ý là cá cắn câu liền!',
    'Gợi ý ra, đáp án tới, gọn như chốt đơn!',
    'Đọc vị gợi ý siêu đỉnh, mời đi làm thám tử!',
    'Mình mới thả thính một chút mà đã có người đổ rồi!',
    'Hiểu ý gợi ý còn hơn hiểu ý người yêu!',
    'Gợi ý vừa lên sóng là có người giải mã liền, quá nhạy!',
    'Đọc gợi ý là hiểu, chắc là fan cứng của kênh rồi!',
    'Gợi ý đúng là liều thuốc chữa lành bộ não, trúng rồi!',
    'Bắt trend đã nhanh, bắt gợi ý còn nhanh hơn, chúc mừng nha!',
    'Gợi ý vừa đủ, não vừa đủ, trúng vừa khít!',
    'Gợi ý vừa ra, đáp án cũng vừa tới, mượt như lướt TikTok!',
    'Gợi ý nói nhỏ một câu là hiểu hết, đúng kiểu tâm linh tương thông!',
    'Có gợi ý là trúng ngay, chill thật sự!',
    'Nhanh trí như vậy đi thi gameshow là có tiền tỷ!',
    'Phải nhờ gợi ý mới ra, nhưng thôi trúng là được, không chấp!',
    'Chậm mà chắc, rùa vẫn về đích trước thỏ!',
    'Gợi ý đúng là phao cứu sinh của cả phòng!',
    'Từ từ rồi cũng tới, trúng là vui rồi!',
    'Gợi ý một chút, chiến thắng một phát, hợp lý quá chừng!',
    'Cần thêm chút gợi ý để khởi động, nhưng về đích rất đẹp!',
    'Gợi ý vừa ra là có người chốt liền, nhanh tay ghê!',
    'Đoán kiểu này là chắc cú, không phông bạt, không ẩu!',
    'Gợi ý ngấm rồi là trúng ngay, không trượt phát nào!',
    'Mình mớm thêm một chút là bùng nổ liền!',
    'Tốc độ vừa phải, kết quả tuyệt vời, chúc mừng nha!',
    'Không nhanh nhất nhưng trúng là được, chân ái đây rồi!',
    'Gợi ý đã chữa lành cả phòng live!',
    'Phải có gợi ý mới chịu, khó chiều mà vẫn dễ thương!',
    'Cuối cùng ánh sáng cũng tới, vỗ tay nào cả nhà!',
    'Mới một gợi ý đã đoán ra, nhạy bén quá trời! Chúc mừng nha!',
    'Một gợi ý là đủ rồi, bắt sóng nhanh như wifi năm gờ!',
    'Nhìn emoji là hiểu liền, chắc cả ngày chat toàn bằng icon đây! Trúng rồi!',
    'Một gợi ý thôi mà trúng ngay, đầu óc nhanh như chớp, chúc mừng!',
    'Chỉ cần gợi ý nhẹ một cái là trúng, hiểu ý nhau quá trời luôn!',
    'Một gợi ý, một phát ăn ngay! Phản xạ này đi thi gameshow được rồi đó!',
    'Gợi ý vừa hiện lên là có người trúng liền, nhanh tay nhanh mắt ghê!',
    'Một gợi ý là đủ để thiên tài tỏa sáng! Chúc mừng nha!',
    'Sau hai gợi ý cuối cùng cũng có người trúng! Từ từ mà chắc, chúc mừng!',
    'Hai gợi ý mới ra, nhưng thôi trúng là được, mình không chấp đâu!',
    'Phải nhờ tới hai gợi ý cơ, nhưng công nhận đoán hay, chúc mừng nha!',
    'Gợi ý thứ hai đã cứu cả phòng live! Chúc mừng người chơi đã trúng!',
    'Chậm mà chắc, rùa thắng thỏ! Chúc mừng đã đoán trúng!',
    'Gợi ý tới mức này rồi mà còn không ai trúng thì mình khóc mất, may quá!',
    'Hai gợi ý, một chiến thắng! Chúc mừng nha!',
    'Cuối cùng thì ánh sáng cũng đã đến! Đoán trúng rồi, vỗ tay!',
  ],
  late: [
    'Ét o ét! Còn có mấy giây mà trúng kịp, tim mình rớt ra ngoài rồi!',
    'Deadline tới nơi mới làm, đúng chuẩn dân văn phòng luôn!',
    'Bàn thắng phút bù giờ! Cả phòng live thở phào!',
    'Nước đến chân mới nhảy, mà nhảy đẹp như idol!',
    'Suýt nữa là toang, may mà có người cứu cả vòng chơi!',
    'Kịch tính hơn phim Hàn, trúng ở những giây cuối cùng!',
    'Đồng hồ sắp điểm thì bùm, đáp án xuất hiện! Quá căng!',
    'Trúng sát nút thế này chắc thích làm mình đau tim lắm!',
    'Ai bảo không kịp? Phút cuối vẫn lội ngược dòng được nhé!',
    'Pha cứu thua đẳng cấp thủ môn, trúng ngay trước tiếng còi!',
    'Overthinking cả vòng, tới phút chót mới chốt, nhưng chốt chuẩn!',
    'Giờ vàng flash sale cũng không căng bằng phút chót này!',
    'Mình chuẩn bị nói hết giờ rồi đó, may mà kịp!',
    'Phút chót mới chịu ra tay, đúng là cao thủ thích làm màu!',
    'Trúng lúc đồng hồ sắp về không, cả phòng live gào thét!',
    'Thêm chút nữa thôi là mình công bố đáp án rồi, hú hồn!',
    'Mở hết gợi ý mới trúng, nhưng chiến thắng nào cũng đáng trân trọng!',
    'Gợi ý gần như lộ đáp án luôn rồi đó, nhưng trúng vẫn được khen!',
    'Mình gợi ý muốn khô cả họng, cuối cùng cũng có người trúng!',
    'Hết sạch gợi ý mình mệt mà vui, chúc mừng nha!',
    'Được mớm tận miệng mới chịu nuốt, nhưng thôi, chúc mừng!',
    'Hết gợi ý mới giải được, đúng kiểu chờ tới tập cuối!',
    'Gợi ý cứu cả thế giới, và cứu luôn vòng chơi này!',
    'Muộn một chút nhưng không sao, người về đích vẫn là người chiến thắng!',
    'Mình gợi ý tới mức này mà không ai trúng chắc mình khóc thật!',
    'Mãi mận mới trúng, nhưng trúng là được, hì hì!',
    'Lần sau mong được trúng sớm hơn, nhưng lần này vẫn chúc mừng!',
    'Cả phòng live đã đồng hành tới tận gợi ý cuối, xứng đáng có người trúng!',
    'Gợi ý cuối đúng là cứu cánh, cảm ơn trời đất đã có người trúng!',
    'Về đích muộn nhưng phong độ vẫn ổn định, chúc mừng nha!',
    'Phải hết sạch gợi ý mới chịu, đúng là người thích hồi hộp!',
    'Suýt toang rồi! Còn có mấy giây mà trúng kịp, tim mình muốn rớt ra ngoài!',
    'Phút chót nghẹt thở! Trúng đúng lúc đồng hồ sắp điểm, quá căng!',
    'Chỉ còn vài giây! Người chơi này thích làm mình đứng tim hay sao vậy, chúc mừng!',
    'Bàn thắng phút bù giờ! Trúng sát nút, cả phòng live thở phào!',
    'Mình tưởng hết giờ rồi chứ! Ai cho phép trúng phút chót kịch tính vậy hả!',
    'Đúng kiểu nước đến chân mới nhảy, nhưng mà nhảy rất đẹp! Chúc mừng!',
    'Còn chút xíu nữa là toang, may mà có người cứu cả vòng chơi!',
    'Kịch tính như phim hành động! Trúng ở giây cuối, quá đỉnh!',
    'Mở hết gợi ý rồi mới trúng, nhưng thôi, chiến thắng nào cũng đáng trân trọng!',
    'Gợi ý gần như lộ đáp án luôn rồi đó, nhưng mà trúng thì vẫn được khen!',
    'Ba gợi ý mới ra, mình mệt luôn rồi đó, nhưng chúc mừng nha!',
    'Phải tới gợi ý cuối cùng mới chịu trúng, đúng là thích hồi hộp!',
    'Mình gợi ý muốn khô cả họng, cuối cùng cũng có người trúng! Cảm ơn trời đất!',
    'Trúng rồi! Hơi muộn một chút nhưng vẫn là người chiến thắng!',
    'Gợi ý cứu cả thế giới! Chúc mừng người chơi đã về đích!',
    'Đoán trúng sau khi được mớm tận miệng, nhưng mà thôi, chúc mừng nha!',
  ],
};

const RULES = `- Trêu đùa nhẹ nhàng, hài hước, có chút "troll" nhưng thân thiện.
- Tuyệt đối không xúc phạm ngoại hình, giới tính, vùng miền, tôn giáo, không chửi thề, không nội dung người lớn, không chính trị.
- Không emoji, không ký hiệu, không hashtag, không ngoặc kép.`;

const GIFT_SYSTEM = `Bạn là MC nam dẫn game đoán chữ trên TikTok Live: vui tính, lầy lội, hay trêu người xem kiểu bạn bè thân.
Có người vừa tặng quà. Viết MỘT câu cảm ơn tiếng Việt để đọc thành giọng nói.
- Tối đa 18 chữ, gọi đúng tên người tặng, kết bằng lời cảm ơn.
- Quà to thì làm quá lên, cảm ơn rối rít; quà nhỏ (hoa hồng) thì trêu khéo nhưng vẫn cảm ơn thật lòng.
${RULES}
- Không lặp lại câu đã nói gần đây.`;

const WIN_SYSTEM = `Bạn là MC nam dẫn game đoán chữ trên TikTok Live: vui tính, lầy lội, hay trêu người chơi kiểu bạn bè thân.
Viết MỘT câu chúc mừng tiếng Việt để đọc thành giọng nói khi có người đoán trúng.
- Tối đa 20 chữ. KHÔNG nhắc tên người chơi, KHÔNG nhắc đáp án (câu này được dùng lại cho nhiều người, nhiều vòng).
- Đúng với tình huống được mô tả, khác hẳn các câu đã có.
${RULES}`;

const SCHEMA = {
  type: 'object',
  properties: { line: { type: 'string' } },
  required: ['line'],
  additionalProperties: false,
};

const GIFT_TEMPLATES = [
  'Cảm ơn {name} đã tặng {gift}! Giàu thế này cho mình xin làm người yêu với!',
  '{name} vừa tặng {gift}, cả phòng live xin cúi đầu cảm ơn đại gia!',
  'Ui cảm ơn {name} nha, {gift} này mình ghi vào sổ ân tình suốt đời!',
];

/** Tên đọc được: bỏ emoji / ký hiệu, tối đa 24 ký tự. */
export const speakableName = (n) => String(n || '').replace(/[^\p{L}\p{N} ]/gu, ' ').replace(/\s+/g, ' ').trim().slice(0, 24) || 'bạn';
const clean = (s) => String(s || '').replace(/[\p{Extended_Pictographic}#*"“”]/gu, '').replace(/\s+/g, ' ').trim();
/** Cắt câu theo số ký tự tối đa, ở ranh giới từ. */
export function clip(text, max) {
  const t = clean(text);
  if (t.length <= max) return t;
  const cut = t.slice(0, max);
  return cut.slice(0, Math.max(cut.lastIndexOf(' '), Math.floor(max * 0.6))).replace(/[,\s]+$/, '') + '!';
}

/**
 * Giọng MC (ElevenLabs).
 * - Đoán trúng: thư viện câu không tên theo mức (data/voice/lib), đọc lần đầu thì lưu, sau đó phát lại miễn phí.
 * - Tặng quà: Claude viết câu cảm ơn có tên, ElevenLabs đọc.
 * - Ngân sách credit / ngày + dự trữ tài khoản; hết thì ngừng (trang game tự đọc bằng giọng trình duyệt).
 * Phát 'voice' { id, url, text, kind, by } và 'state' khi bật / tắt.
 */
export class Voice extends EventEmitter {
  constructor(config = {}, { apiKey = null, claude = null, dir, fetchImpl = globalThis.fetch, now = () => Date.now(), random = Math.random, log = console } = {}) {
    super();
    this.cfg = { ...VOICE_DEFAULTS, ...config };
    this.apiKey = apiKey;
    this.claude = claude;
    this.dir = dir;
    this.fetch = fetchImpl;
    this.now = now;
    this.random = random;
    this.log = log;
    this.queue = [];
    this.pendingGifts = new Map(); // id người tặng -> { job, timer }
    this.busy = false;
    this.recent = []; // câu cảm ơn gần đây (để Claude tránh lặp)
    this.recentLib = []; // câu thư viện vừa phát (không phát lại ngay)
    this.hour = { start: now(), count: 0 };
    this.lastError = null;
    this.spoken = 0;
    this.seq = 0;
    this.account = null; // { used, limit, remaining, at } từ ElevenLabs
    this.building = false;
    this.libPath = dir ? path.join(dir, 'library.json') : null;
    this.usagePath = dir ? path.join(dir, 'usage.json') : null;
    this.lib = this.readJson(this.libPath, {}); // cấp -> [{ text, url }]
    // thư viện cũ lưu theo 6 mức → gộp sang 3 cấp (giữ nguyên file mp3)
    for (const [old, g] of Object.entries(TIER_GROUP)) {
      if (!this.lib[old]) continue;
      const dst = (this.lib[g] ||= []);
      for (const x of this.lib[old]) if (!dst.some((y) => y.text === x.text)) dst.push(x);
      delete this.lib[old];
    }
    this.usage = this.readJson(this.usagePath, { day: null, today: 0, total: 0 });
    this.lastCanSpend = this.canSpend();
  }

  readJson(p, def) { try { return p ? JSON.parse(fs.readFileSync(p, 'utf8')) : def; } catch { return def; } }
  writeJson(p, v) { if (!p) return; fs.mkdirSync(path.dirname(p), { recursive: true }); fs.writeFileSync(p, JSON.stringify(v, null, 1)); }

  get enabled() { return !!(this.cfg.enabled && this.apiKey); }

  dayKey() { return new Date(this.now() + 7 * 3600e3).toISOString().slice(0, 10); }
  todayCredits() { return this.usage.day === this.dayKey() ? this.usage.today : 0; }

  /** Còn được gọi ElevenLabs không (bật + chưa hết ngân sách ngày + tài khoản còn trên mức dự trữ). */
  canSpend() {
    if (!this.enabled) return false;
    if (this.cfg.dailyCredits > 0 && this.todayCredits() >= this.cfg.dailyCredits) return false;
    if (this.account && this.account.remaining <= this.cfg.reserveCredits) return false;
    return true;
  }

  /** Trạng thái gửi cho trang game: có giọng MC đọc quà không (không thì trình duyệt tự đọc). */
  publicState() { return { enabled: this.canSpend(), minGiftDiamonds: this.cfg.minGiftDiamonds }; }

  checkState() {
    const now = this.canSpend();
    if (now !== this.lastCanSpend) { this.lastCanSpend = now; this.emit('state', this.publicState()); }
  }

  recordCredits(n) {
    const day = this.dayKey();
    if (this.usage.day !== day) this.usage = { ...this.usage, day, today: 0 };
    this.usage.today += n;
    this.usage.total += n;
    if (this.account) { this.account.used += n; this.account.remaining = Math.max(0, this.account.remaining - n); }
    this.writeJson(this.usagePath, this.usage);
    this.checkState();
  }

  /** Số credit thật còn lại trên tài khoản ElevenLabs (key cần quyền đọc thông tin tài khoản). */
  async refreshAccount() {
    if (!this.apiKey) return null;
    try {
      const res = await this.fetch('https://api.elevenlabs.io/v1/user/subscription', { headers: { 'xi-api-key': this.apiKey } });
      if (!res.ok) throw new Error(`ElevenLabs ${res.status}`);
      const s = await res.json();
      const used = Number(s.character_count) || 0, limit = Number(s.character_limit) || 0;
      this.account = { used, limit, remaining: Math.max(0, limit - used), resetAt: s.next_character_count_reset_unix ? s.next_character_count_reset_unix * 1000 : null, at: this.now() };
      this.checkState();
    } catch (e) { this.accountError = e.message; }
    return this.account;
  }

  libCounts() { return Object.fromEntries(WIN_TIERS.map((t) => [t, (this.lib[t] || []).length])); }

  status() {
    return {
      enabled: this.enabled, active: this.canSpend(), hasKey: !!this.apiKey, writer: this.claude ? 'claude' : 'mẫu có sẵn',
      voiceId: this.cfg.voiceId, model: this.cfg.modelId, queue: this.queue.length, spoken: this.spoken,
      thisHour: this.hour.count, maxPerHour: this.cfg.maxPerHour,
      today: Math.round(this.todayCredits()), dailyCredits: this.cfg.dailyCredits, total: Math.round(this.usage.total),
      account: this.account, accountError: this.account ? null : this.accountError || null, reserveCredits: this.cfg.reserveCredits,
      library: this.libCounts(), libraryPerTier: this.cfg.libraryPerTier, building: this.building,
      minGiftDiamonds: this.cfg.minGiftDiamonds, lastError: this.lastError,
    };
  }

  /** Có người đoán trúng. e = hiệu ứng wg_win. */
  win(e) {
    if (!this.enabled || !e?.by) return;
    const tier = TIER_GROUP[e.tier] || (WIN_TIERS.includes(e.tier) ? e.tier : 'late');
    this.enqueue({ kind: 'win', priority: 3, by: e.by, tier });
  }

  /** Có người tặng quà. e = hiệu ứng wg_thanks. Gom quà liên tiếp của cùng người. */
  gift(e) {
    if (!this.enabled || !e?.by?.id) return;
    const p = this.pendingGifts.get(e.by.id);
    if (p) {
      p.job.ctx.so_xu += e.diamonds || 0;
      p.job.ctx.so_mon += e.repeat || 1;
      if (!p.job.ctx.qua.includes(e.giftName)) p.job.ctx.qua += `, ${e.giftName}`;
      return;
    }
    const job = { kind: 'gift', priority: 1, by: e.by, ctx: { qua: e.giftName || 'quà', so_mon: e.repeat || 1, so_xu: e.diamonds || 0 } };
    const timer = setTimeout(() => {
      this.pendingGifts.delete(e.by.id);
      if (job.ctx.so_xu < this.cfg.minGiftDiamonds) return; // quà nhỏ: trình duyệt tự đọc
      job.priority = job.ctx.so_xu >= 99 ? 2.5 : job.ctx.so_xu >= 30 ? 2 : 1;
      this.enqueue(job);
    }, this.cfg.giftWindowSec * 1000);
    this.pendingGifts.set(e.by.id, { job, timer });
  }

  enqueue(job) {
    if (this.queue.length >= this.cfg.maxQueue) {
      const low = this.queue.reduce((a, b) => (b.priority < a.priority ? b : a));
      if (low.priority >= job.priority) return;
      this.queue.splice(this.queue.indexOf(low), 1);
    }
    this.queue.push(job);
    this.queue.sort((a, b) => b.priority - a.priority);
    this.pump();
  }

  async pump() {
    if (this.busy) return;
    this.busy = true;
    try {
      while (this.queue.length) {
        const job = this.queue.shift();
        try {
          const out = job.kind === 'win' ? await this.winLine(job.tier) : await this.giftLine(job);
          if (!out) continue;
          this.spoken++;
          this.lastError = null;
          this.emit('voice', { id: out.id || out.url, url: out.url, text: out.text, kind: job.kind, tier: job.tier, reused: !!out.reused, by: { id: job.by.id, name: job.by.name } });
        } catch (e) {
          this.lastError = `${e?.status || ''} ${e?.message || e}`.trim();
          this.log.warn?.(`[voice] lỗi: ${this.lastError}`);
        }
      }
    } finally { this.busy = false; }
  }

  hourOk() {
    const t = this.now();
    if (t - this.hour.start >= 3600e3) this.hour = { start: t, count: 0 };
    if (this.hour.count >= this.cfg.maxPerHour) { this.lastError = `Đã đủ ${this.cfg.maxPerHour} câu gọi ElevenLabs trong giờ này`; return false; }
    return true;
  }

  /** Câu đoán trúng: thư viện chưa đủ thì tạo câu mới (lưu lại), đủ rồi thì phát lại câu cũ không trùng câu vừa nói. */
  async winLine(tier) {
    const lib = (this.lib[tier] ||= []);
    if (lib.length < this.cfg.libraryPerTier && this.canSpend() && this.hourOk()) {
      const entry = await this.addLibraryLine(tier).catch((e) => { this.lastError = e.message; return null; });
      if (entry) { this.remember(entry.url); return entry; }
    }
    if (!lib.length) return null;
    const avoid = new Set(this.recentLib.slice(-Math.min(6, lib.length - 1)));
    const pool = lib.filter((x) => !avoid.has(x.url));
    const pick = (pool.length ? pool : lib)[Math.floor(this.random() * (pool.length || lib.length))];
    this.remember(pick.url);
    return { ...pick, reused: true };
  }

  remember(url) { this.recentLib.push(url); this.recentLib = this.recentLib.slice(-20); }

  async addLibraryLine(tier) {
    const lib = (this.lib[tier] ||= []);
    const have = new Set(lib.map((x) => x.text));
    let text = (WIN_LINES[tier] || []).find((t) => !have.has(t));
    if (!text && this.claude) text = await this.claudeLine(WIN_SYSTEM, { tinh_huong: TIER_DESC[tier], cac_cau_da_co: [...have] });
    if (!text || have.has(text)) return null;
    text = clip(text, this.cfg.maxChars);
    const file = await this.tts(text, `lib/${tier}`);
    this.hour.count++;
    const entry = { text, url: file.url };
    lib.push(entry);
    this.writeJson(this.libPath, this.lib);
    return entry;
  }

  /** Admin: tạo sẵn đủ thư viện câu đoán trúng cho mọi mức (chạy nền). */
  async buildLibrary() {
    if (this.building || !this.enabled) return this.libCounts();
    this.building = true;
    try {
      for (const tier of WIN_TIERS) {
        while ((this.lib[tier] || []).length < this.cfg.libraryPerTier && this.canSpend()) {
          const e = await this.addLibraryLine(tier);
          if (!e) break;
        }
      }
    } catch (e) { this.lastError = e.message; } finally { this.building = false; }
    return this.libCounts();
  }

  /** Câu cảm ơn quà có tên: Claude viết, ElevenLabs đọc. */
  async giftLine(job) {
    if (!this.canSpend() || !this.hourOk()) return null;
    let text = this.claude
      ? await this.claudeLine(GIFT_SYSTEM, { ten_nguoi_tang: speakableName(job.by.name), ...job.ctx, cau_da_noi_gan_day: this.recent }).catch(() => null)
      : null;
    if (!text) text = GIFT_TEMPLATES[Math.floor(this.random() * GIFT_TEMPLATES.length)].replaceAll('{name}', speakableName(job.by.name)).replaceAll('{gift}', job.ctx.qua || 'quà');
    text = clip(text, this.cfg.maxChars);
    const file = await this.tts(text);
    this.hour.count++;
    this.recent.push(text); this.recent = this.recent.slice(-6);
    return { ...file, text };
  }

  async claudeLine(system, payload) {
    try {
      const response = await this.claude.beta.messages.create({
        model: this.cfg.claudeModel,
        max_tokens: 2000,
        // tự chuyển model khi bị từ chối: không có trên Haiku
        ...(/haiku/.test(this.cfg.claudeModel) ? {} : { betas: ['server-side-fallback-2026-07-01'], fallbacks: 'default' }),
        output_config: { effort: 'low', format: { type: 'json_schema', schema: SCHEMA } },
        system,
        messages: [{ role: 'user', content: JSON.stringify(payload) }],
      });
      if (response.stop_reason === 'refusal') throw new Error('refusal');
      const text = response.content.filter((b) => b.type === 'text').map((b) => b.text).join('');
      const line = clean(JSON.parse(text).line);
      return line || null;
    } catch (e) {
      this.log.warn?.(`[voice] Claude viết câu lỗi (${e?.message || e}) — dùng câu mẫu`);
      return null;
    }
  }

  /** ElevenLabs: chữ → mp3, lưu vào dir[/sub], trả về { id, url }; ghi nhận credit đã dùng. */
  async tts(text, sub = '') {
    const res = await this.fetch(`https://api.elevenlabs.io/v1/text-to-speech/${encodeURIComponent(this.cfg.voiceId)}?output_format=mp3_44100_128`, {
      method: 'POST',
      headers: { 'xi-api-key': this.apiKey, 'content-type': 'application/json', accept: 'audio/mpeg' },
      body: JSON.stringify({
        text,
        model_id: this.cfg.modelId,
        ...(this.cfg.languageCode ? { language_code: this.cfg.languageCode } : {}),
        voice_settings: { stability: this.cfg.stability, similarity_boost: this.cfg.similarity, style: this.cfg.style, use_speaker_boost: true },
      }),
    });
    if (!res.ok) {
      let msg = '';
      try { msg = (await res.text()).slice(0, 200); } catch { /* bỏ qua */ }
      const err = new Error(`ElevenLabs ${res.status}: ${msg}`);
      err.status = res.status;
      throw err;
    }
    const buf = Buffer.from(await res.arrayBuffer());
    const cost = Number(res.headers?.get?.('character-cost')) || Math.ceil(text.length * this.cfg.creditsPerChar);
    this.recordCredits(cost);
    const id = `${this.now().toString(36)}-${(this.seq++).toString(36)}`;
    const folder = path.join(this.dir, sub);
    fs.mkdirSync(folder, { recursive: true });
    fs.writeFileSync(path.join(folder, `${id}.mp3`), buf);
    if (!sub) this.prune();
    return { id, url: `/voice/${sub ? sub + '/' : ''}${id}.mp3` };
  }

  /** Xoá file câu cảm ơn quà cũ (chỉ thư mục gốc; thư viện đoán trúng ở lib/ giữ nguyên). */
  prune() {
    try {
      const files = fs.readdirSync(this.dir).filter((f) => f.endsWith('.mp3')).map((f) => ({ f, t: fs.statSync(path.join(this.dir, f)).mtimeMs })).sort((a, b) => b.t - a.t);
      for (const { f } of files.slice(this.cfg.keepFiles)) fs.rmSync(path.join(this.dir, f), { force: true });
    } catch { /* bỏ qua */ }
  }
}
