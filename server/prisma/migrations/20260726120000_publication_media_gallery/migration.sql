-- CreateTable
CREATE TABLE "publication_media" (
    "id" TEXT NOT NULL,
    "pub_id" TEXT NOT NULL,
    "media_id" TEXT NOT NULL,
    "pos" INTEGER NOT NULL DEFAULT 0,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "publication_media_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "publication_media_pub_id_idx" ON "publication_media"("pub_id");

-- AddForeignKey
ALTER TABLE "publication_media" ADD CONSTRAINT "publication_media_pub_id_fkey" FOREIGN KEY ("pub_id") REFERENCES "publications"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "publication_media" ADD CONSTRAINT "publication_media_media_id_fkey" FOREIGN KEY ("media_id") REFERENCES "media"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Backfill: перенос уже прикреплённого одиночного медиа в галерею (обложка, pos=0).
INSERT INTO "publication_media" ("id", "pub_id", "media_id", "pos", "created_at")
SELECT
    'pm_' || "id",
    "id",
    "media_id",
    0,
    CURRENT_TIMESTAMP
FROM "publications"
WHERE "media_id" IS NOT NULL;
