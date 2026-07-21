-- CreateEnum
CREATE TYPE "Role" AS ENUM ('owner', 'maker', 'customer', 'fashion');

-- CreateEnum
CREATE TYPE "PubType" AS ENUM ('post', 'reels');

-- CreateEnum
CREATE TYPE "PubStatus" AS ENUM ('draft', 'work', 'review', 'fixes', 'ready', 'published', 'canceled');

-- CreateEnum
CREATE TYPE "IdeaState" AS ENUM ('new', 'saved', 'work', 'used', 'archived');

-- CreateEnum
CREATE TYPE "IdeaStatus" AS ENUM ('processing', 'ready', 'error');

-- CreateEnum
CREATE TYPE "MediaKind" AS ENUM ('image', 'video');

-- CreateTable
CREATE TABLE "users" (
    "id" TEXT NOT NULL,
    "telegram_id" BIGINT NOT NULL,
    "name" TEXT NOT NULL,
    "initials" TEXT NOT NULL DEFAULT '',
    "color" TEXT NOT NULL DEFAULT '#8E9199',
    "role" "Role" NOT NULL DEFAULT 'maker',
    "rights" JSONB NOT NULL DEFAULT '{"createPub":false,"seeAll":false,"createTask":false}',
    "active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "users_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "media" (
    "id" TEXT NOT NULL,
    "kind" "MediaKind" NOT NULL,
    "path" TEXT NOT NULL,
    "mime" TEXT NOT NULL DEFAULT 'application/octet-stream',
    "size" INTEGER NOT NULL DEFAULT 0,
    "frame_path" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "media_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "publications" (
    "id" TEXT NOT NULL,
    "title" TEXT NOT NULL DEFAULT '',
    "type" "PubType" NOT NULL DEFAULT 'post',
    "date" TEXT NOT NULL,
    "time" TEXT NOT NULL DEFAULT '12:00',
    "deadline" TEXT,
    "status" "PubStatus" NOT NULL DEFAULT 'draft',
    "owner_id" TEXT,
    "g" INTEGER NOT NULL DEFAULT 0,
    "dur" TEXT,
    "text" TEXT NOT NULL DEFAULT '',
    "alt" TEXT NOT NULL DEFAULT '',
    "tags" JSONB NOT NULL DEFAULT '[]',
    "track" TEXT NOT NULL DEFAULT '',
    "track_at" TEXT NOT NULL DEFAULT '',
    "media_id" TEXT,
    "late" BOOLEAN NOT NULL DEFAULT false,
    "archived" BOOLEAN NOT NULL DEFAULT false,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "publications_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "publication_comments" (
    "id" TEXT NOT NULL,
    "pub_id" TEXT NOT NULL,
    "author_id" TEXT,
    "text" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "publication_comments_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "publication_history" (
    "id" TEXT NOT NULL,
    "pub_id" TEXT NOT NULL,
    "actor_id" TEXT,
    "text" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "publication_history_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ideas" (
    "id" TEXT NOT NULL,
    "type" "PubType" NOT NULL DEFAULT 'post',
    "g" INTEGER NOT NULL DEFAULT 0,
    "dur" TEXT,
    "state" "IdeaState" NOT NULL DEFAULT 'new',
    "status" "IdeaStatus" NOT NULL DEFAULT 'processing',
    "tags" JSONB NOT NULL DEFAULT '[]',
    "title" TEXT NOT NULL DEFAULT '',
    "note" TEXT NOT NULL DEFAULT '',
    "ai" TEXT NOT NULL DEFAULT '',
    "text" TEXT NOT NULL DEFAULT '',
    "hashtags" JSONB NOT NULL DEFAULT '[]',
    "author" TEXT NOT NULL DEFAULT '',
    "url" TEXT NOT NULL,
    "media_id" TEXT,
    "error" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ideas_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "digests" (
    "id" TEXT NOT NULL,
    "range_label" TEXT NOT NULL,
    "summary" TEXT NOT NULL DEFAULT '',
    "published_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "digests_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "digest_items" (
    "id" TEXT NOT NULL,
    "digest_id" TEXT NOT NULL,
    "cat" TEXT NOT NULL DEFAULT 'Новые функции',
    "t" TEXT NOT NULL,
    "ch" TEXT NOT NULL DEFAULT '',
    "me" TEXT NOT NULL DEFAULT '',
    "co" TEXT NOT NULL DEFAULT '',
    "src" TEXT NOT NULL DEFAULT '',
    "d" TEXT NOT NULL DEFAULT '',

    CONSTRAINT "digest_items_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "digest_reads" (
    "id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "item_id" TEXT NOT NULL,

    CONSTRAINT "digest_reads_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "digest_sources" (
    "id" TEXT NOT NULL,
    "url" TEXT NOT NULL,
    "type" TEXT NOT NULL DEFAULT 'rss',
    "title" TEXT NOT NULL DEFAULT '',
    "active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "digest_sources_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "settings" (
    "key" TEXT NOT NULL,
    "value" JSONB NOT NULL,

    CONSTRAINT "settings_pkey" PRIMARY KEY ("key")
);

-- CreateIndex
CREATE UNIQUE INDEX "users_telegram_id_key" ON "users"("telegram_id");

-- CreateIndex
CREATE INDEX "publications_date_idx" ON "publications"("date");

-- CreateIndex
CREATE INDEX "publications_status_idx" ON "publications"("status");

-- CreateIndex
CREATE INDEX "publication_comments_pub_id_idx" ON "publication_comments"("pub_id");

-- CreateIndex
CREATE INDEX "publication_history_pub_id_idx" ON "publication_history"("pub_id");

-- CreateIndex
CREATE INDEX "ideas_state_idx" ON "ideas"("state");

-- CreateIndex
CREATE INDEX "digest_items_digest_id_idx" ON "digest_items"("digest_id");

-- CreateIndex
CREATE UNIQUE INDEX "digest_reads_user_id_item_id_key" ON "digest_reads"("user_id", "item_id");

-- AddForeignKey
ALTER TABLE "publications" ADD CONSTRAINT "publications_owner_id_fkey" FOREIGN KEY ("owner_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "publications" ADD CONSTRAINT "publications_media_id_fkey" FOREIGN KEY ("media_id") REFERENCES "media"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "publication_comments" ADD CONSTRAINT "publication_comments_pub_id_fkey" FOREIGN KEY ("pub_id") REFERENCES "publications"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "publication_comments" ADD CONSTRAINT "publication_comments_author_id_fkey" FOREIGN KEY ("author_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "publication_history" ADD CONSTRAINT "publication_history_pub_id_fkey" FOREIGN KEY ("pub_id") REFERENCES "publications"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "publication_history" ADD CONSTRAINT "publication_history_actor_id_fkey" FOREIGN KEY ("actor_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ideas" ADD CONSTRAINT "ideas_media_id_fkey" FOREIGN KEY ("media_id") REFERENCES "media"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "digest_items" ADD CONSTRAINT "digest_items_digest_id_fkey" FOREIGN KEY ("digest_id") REFERENCES "digests"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "digest_reads" ADD CONSTRAINT "digest_reads_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "digest_reads" ADD CONSTRAINT "digest_reads_item_id_fkey" FOREIGN KEY ("item_id") REFERENCES "digest_items"("id") ON DELETE CASCADE ON UPDATE CASCADE;
