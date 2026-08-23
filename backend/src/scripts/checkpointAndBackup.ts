import { PrismaClient } from "@prisma/client";
import * as fs from "fs";
import * as path from "path";

const prisma = new PrismaClient();

async function main() {
  console.log("1. Đang checkpoint SQLite WAL...");
  try {
    const checkpoint = await prisma.$queryRawUnsafe("PRAGMA wal_checkpoint(TRUNCATE);");
    console.log("Checkpoint result:", checkpoint);
    
    const integrity = await prisma.$queryRawUnsafe("PRAGMA integrity_check;");
    console.log("Integrity check:", integrity);

    const count = await prisma.movie.count();
    console.log("Total movies in DB:", count);
  } catch (err) {
    console.error("Lỗi:", err);
  } finally {
    await prisma.$disconnect();
  }
}

main();
