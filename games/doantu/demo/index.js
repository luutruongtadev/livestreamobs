// Người xem ảo cho trang demo: bình luận các từ thông dụng (điểm do phần server giả của trang demo chấm).
const WORDS = ['biển', 'mặt trời', 'cây', 'nhà', 'mưa', 'gió', 'trường học', 'con mèo', 'bánh mì', 'xe máy', 'điện thoại', 'núi', 'sông', 'hoa', 'trăng', 'cà phê', 'âm nhạc', 'bóng đá', 'sách', 'tình yêu', 'mùa hè', 'lửa', 'nước', 'đường', 'bầu trời'];
export function bot(s, rand) {
  if (s.phase !== 'playing' || rand() > 0.5) return null;
  return { type: 'comment', text: WORDS[Math.floor(rand() * WORDS.length)] };
}
