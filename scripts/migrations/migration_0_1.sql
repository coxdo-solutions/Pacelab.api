CREATE TABLE IF NOT EXISTS "LoginActivity" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "userId" varchar NOT NULL,
  "loginAt" timestamp DEFAULT now(),
  "ipAddress" varchar,
  "userAgent" varchar,
  CONSTRAINT "LoginActivity_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS "LoginActivity_userId_idx" ON "LoginActivity" ("userId");