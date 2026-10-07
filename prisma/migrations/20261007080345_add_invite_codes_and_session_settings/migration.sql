-- AlterTable
ALTER TABLE "LeaderboardUser" ADD COLUMN     "email" TEXT;

-- CreateTable
CREATE TABLE "InvitedPlayer" (
    "id" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "InvitedPlayer_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SessionSettings" (
    "id" TEXT NOT NULL DEFAULT 'default',
    "title" TEXT,
    "logoUrl" TEXT,

    CONSTRAINT "SessionSettings_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "InvitedPlayer_email_key" ON "InvitedPlayer"("email");

-- CreateIndex
CREATE UNIQUE INDEX "InvitedPlayer_code_key" ON "InvitedPlayer"("code");
