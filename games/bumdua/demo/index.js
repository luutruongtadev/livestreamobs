// Người xem ảo cho trang demo: bình luận linh tinh (mỗi bình luận = 1 sợi dây), thỉnh thoảng thả tim.
const LINES = ['quấn đi cô ơi', 'sắp nổ chưa', 'thêm sợi nữa', 'bùm bùm', 'hồi hộp quá', 'cô Ba cố lên', 'nổ đi mà', 'ăn dưa không'];
export function bot(s, rand) {
  if (s.phase !== 'wrap' || rand() < 0.25) return null;
  return { type: 'comment', text: LINES[Math.floor(rand() * LINES.length)] };
}
