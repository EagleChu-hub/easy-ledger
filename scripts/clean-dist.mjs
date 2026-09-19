// 清 dist。專案放在 OneDrive 同步資料夾時，fs.rmSync 會回報成功但檔案還在，
// 所以刪完要驗證；Windows 上驗證失敗就改用 PowerShell 的 Remove-Item。
import { existsSync, rmSync } from 'node:fs';
import { spawnSync } from 'node:child_process';

const dir = 'dist';
if (!existsSync(dir)) process.exit(0);

rmSync(dir, { recursive: true, force: true });
if (!existsSync(dir)) process.exit(0);

if (process.platform === 'win32') {
  spawnSync('powershell', ['-NoProfile', '-Command', `Remove-Item -LiteralPath '${dir}' -Recurse -Force -Confirm:$false`], { stdio: 'inherit' });
}
if (existsSync(dir)) {
  console.error(`clean-dist: 無法刪除 ${dir}，請手動刪除後再 build`);
  process.exit(1);
}
