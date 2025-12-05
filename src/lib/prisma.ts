// lib/prisma.ts
import "dotenv/config"; // carga automáticamente las variables de .env
import { PrismaClient } from "@prisma/client";
import { PrismaMariaDb } from "@prisma/adapter-mariadb";

const adapter = new PrismaMariaDb({
    host: process.env.DATABASE_HOST as string,
    user: process.env.DATABASE_USER as string,
    password: process.env.DATABASE_PASSWORD as string,
    database: process.env.DATABASE_NAME as string,
    port: Number(process.env.DATABASE_PORT as string) || 3306,
    connectionLimit: 10, // mayor pool para concurrencia
    connectTimeout: 20000, // 20 segundos, útil si tu DB responde lento
});

const globalForPrisma = globalThis as unknown as { prisma?: PrismaClient };

export const prisma = globalForPrisma.prisma ?? new PrismaClient({ adapter });

if (process.env.NODE_ENV !== "production") {
    globalForPrisma.prisma = prisma;
}

export default prisma;
