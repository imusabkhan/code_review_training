-- CreateTable
CREATE TABLE "ChallengeTimer" (
    "id" TEXT NOT NULL,
    "startTime" TIMESTAMP(3) NOT NULL,
    "duration" INTEGER NOT NULL,
    "isRunning" BOOLEAN NOT NULL DEFAULT false,
    "isPaused" BOOLEAN NOT NULL DEFAULT false,

    CONSTRAINT "ChallengeTimer_pkey" PRIMARY KEY ("id")
);
