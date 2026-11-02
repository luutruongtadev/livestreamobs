// Chạy trước "npm start": báo lỗi rõ ràng nếu Node.js quá cũ.
const major = Number(process.versions.node.split('.')[0]);
if (major < 22) {
  console.error(`\n[Chùa Online] Cần Node.js 22 trở lên, máy đang dùng ${process.version}.`);
  console.error('Tải bản LTS mới tại https://nodejs.org (hoặc: winget install OpenJS.NodeJS.LTS), mở lại terminal rồi chạy lại.\n');
  process.exit(1);
}
