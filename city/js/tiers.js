// Phố Mới — tầng lớp dân cư: thu nhập (theo lương) → ba tầng; nhà ở → ba mức giá; dân chọn nhà theo khả năng chi trả,
// gánh nặng tiền nhà (tiền nhà / thu nhập) làm giảm hài lòng, buộc chuyển xuống nhà rẻ hoặc bỏ đi; người khá giả dọn lên nhà tốt hơn,
// nhường nhà rẻ cho người khác. Mọi thứ suy ra từ lương, học vấn, giá thuê hiện tại nên không cần lưu thêm gì vào bản lưu.
// Các hàm ở đây thuần số (đơn vị MK) để dễ thử; people.js lấy lương, tiền nhà thật rồi gọi.

export const TIERS = [
  { key: 'low', name: 'Thu nhập thấp', icon: '🏚️', shop: 0.75, fun: 0.7 },
  { key: 'mid', name: 'Trung lưu', icon: '🏠', shop: 1, fun: 1 },
  { key: 'high', name: 'Khá giả', icon: '🏡', shop: 1.35, fun: 1.5 },
];
export const TIER_CFG = {
  wage: [1.25, 1.9], // lương mỗi giờ (MK): dưới 1,25 thấp; dưới 1,9 trung lưu; từ 1,9 khá giả
  rent: [2.2, 3.5], // tiền nhà mỗi ngày (MK): dưới 2,2 nhà rẻ (kiểu nhà trọ); dưới 3,5 vừa; từ 3,5 cao cấp
  afford: 0.4, // chịu được tối đa 40% thu nhập cho tiền nhà
  strain: 0.5, // từ 50%: bị cắt hài lòng, tìm chỗ rẻ hơn
  crush: 0.9, // từ 90%: có thể bỏ đi
  upBurden: 0.18, upGain: 1.25, // người khá giả đang ở nhà rẻ (tiền nhà dưới 18% thu nhập) dọn lên nhà đắt hơn ít nhất 25%
  jobless: 0.4, // chưa có việc: thu nhập tạm tính bằng 40% mức theo học vấn (người thân giúp, trợ cấp)
  eduWage: [1, 1.4, 1.9, 2.4], // lương theo giờ tạm tính theo học vấn 0..3
  hours: 9, workDays: 5 / 7, // thu nhập trung bình mỗi ngày = giờ làm × tỷ lệ ngày làm
};

export const tierByWage = (w) => (w < TIER_CFG.wage[0] ? 0 : w < TIER_CFG.wage[1] ? 1 : 2);
export const tierByEdu = (e) => (e >= 3 ? 2 : e === 2 ? 1 : 0);
/** Mức giá nhà từ tiền nhà mỗi ngày (MK): 0 rẻ, 1 vừa, 2 cao cấp. */
export const homeTier = (rent) => (rent < TIER_CFG.rent[0] ? 0 : rent < TIER_CFG.rent[1] ? 1 : 2);
/** Thu nhập trung bình mỗi ngày (MK) sau thuế thu nhập, từ lương mỗi giờ (MK). */
export const dayIncome = (wage, taxPct) => TIER_CFG.hours * wage * TIER_CFG.workDays * (1 - taxPct / 100);
/** Gánh nặng tiền nhà = tiền nhà / thu nhập mỗi ngày (không có thu nhập thì coi như 2 = quá sức). */
export const burden = (rent, income) => (income > 0 ? rent / income : rent > 0 ? 2 : 0);
export const canAfford = (rent, income) => burden(rent, income) <= TIER_CFG.afford;

/**
 * Chọn một nhà trong `list` (mảng ô còn chỗ): xem tối đa 8 ô ngẫu nhiên; trong số nhà chịu được thì lấy nhà đắt nhất (dọn dần lên),
 * không có nhà nào chịu được thì lấy nhà ít gánh nặng nhất. `rentOf(h)` trả tiền nhà mỗi ngày (MK) hoặc -1 nếu ô hết chỗ / không dùng được.
 * Trả chỉ số trong list hoặc -1.
 */
export function pickHome(list, income, rentOf, rng, tries = 8) {
  let best = -1, bs = -Infinity;
  for (let k = 0; k < Math.min(tries, list.length); k++) {
    const idx = (rng() * list.length) | 0, rent = rentOf(list[idx]);
    if (!(rent >= 0)) continue;
    const b = burden(rent, income), s = b <= TIER_CFG.afford ? 100 + rent : -b;
    if (s > bs) { bs = s; best = idx; }
  }
  return best;
}
