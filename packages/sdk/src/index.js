// @platform/sdk — hợp đồng giữa nền tảng và game. Game CHỈ được import từ đây (import '#sdk').
// Mọi thứ trong file này chạy được cả trình duyệt lẫn Node (không dùng fs / network).
export { SDK_VERSION, EVENT_TYPES, TRIGGER_TYPES, GAME_STATUS, PLATFORM_COMMANDS, validateManifest, defaultBindings, satisfies, parseSemver, triggerErrors } from './manifest.js';
export { validate, withDefaults, resolveSettings, missingDefaults } from './schema.js';
export { createTriggers } from './triggers.js';
export { createHost, memoryStorage } from './host.js';
export { Emitter } from './emitter.js';
export { PausableMixin, makePausable } from './pause.js';
export { seededRandom, fakeClock, systemNow, systemRandom } from './random.js';
export { normalize, canon, compact, sameWord, digitsOf } from './text.js';
