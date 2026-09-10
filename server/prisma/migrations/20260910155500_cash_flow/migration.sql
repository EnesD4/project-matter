-- CreateTable
CREATE TABLE "CashFlow" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "userId" TEXT NOT NULL,
    "monthlyIncome" REAL NOT NULL DEFAULT 0,
    "emergencyFund" REAL NOT NULL DEFAULT 0,
    "extraPayoff" REAL NOT NULL DEFAULT 0,
    "expenses" TEXT NOT NULL DEFAULT '[]',
    "debts" TEXT NOT NULL DEFAULT '[]',
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "CashFlow_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateIndex
CREATE UNIQUE INDEX "CashFlow_userId_key" ON "CashFlow"("userId");
