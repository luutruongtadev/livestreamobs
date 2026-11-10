-- Studio: bố cục widget trên khung 9:16 + luật âm thanh của kênh (dùng chung mọi game)
--   studio = { widgets: [{ id, type, x, y, w, h, config }], sounds: [{ id, when, sound, url?, volume }] }
alter table public.channels add column if not exists studio jsonb not null default '{}'::jsonb;
