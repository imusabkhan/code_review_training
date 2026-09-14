-- CreateTable
CREATE TABLE "ChallengeLock" (
    "id" TEXT NOT NULL,
    "locked" BOOLEAN NOT NULL,

    CONSTRAINT "ChallengeLock_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "LeaderboardUser" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "avatar" TEXT NOT NULL,
    "score" INTEGER NOT NULL,

    CONSTRAINT "LeaderboardUser_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ChallengeSubmission" (
    "id" TEXT NOT NULL,
    "userName" TEXT NOT NULL,
    "challengeId" TEXT NOT NULL,
    "selectedLines" TEXT NOT NULL,
    "correct" BOOLEAN NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ChallengeSubmission_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "FlagSubmission" (
    "id" TEXT NOT NULL,
    "userName" TEXT NOT NULL,
    "challengeId" TEXT NOT NULL,
    "flag" TEXT NOT NULL,
    "correct" BOOLEAN NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "FlagSubmission_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Challenge" (
    "id" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "vulnerableLines" TEXT NOT NULL,
    "difficulty" TEXT NOT NULL,
    "hints" TEXT,
    "explanations" TEXT NOT NULL,
    "flag" TEXT,
    "labUrl" TEXT,
    "maxSelectableLines" INTEGER,

    CONSTRAINT "Challenge_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "LeaderboardUser_name_key" ON "LeaderboardUser"("name");
