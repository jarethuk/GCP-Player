-- AlterTable
ALTER TABLE "episodes" ADD COLUMN     "deletedAt" TIMESTAMPTZ(3);

-- AlterTable
ALTER TABLE "shows" ADD COLUMN     "deletedAt" TIMESTAMPTZ(3);
