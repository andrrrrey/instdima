-- Персональные настройки уведомлений пользователя.
ALTER TABLE "users" ADD COLUMN "notify_prefs" JSONB NOT NULL DEFAULT '{}';
