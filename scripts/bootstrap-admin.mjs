/**
 * Crea (o actualiza) el usuario administrador inicial.
 *
 * Uso:
 *   ADMIN_EMAIL=admin@dominio.com ADMIN_PASSWORD=secreto123 npm run db:bootstrap
 *
 * - Asegura que exista el tenant principal.
 * - Crea el usuario ADMIN si no existe, o le resetea la contraseña y el rol si ya existe.
 */
import { PrismaClient } from "@prisma/client";
import bcrypt from "bcryptjs";

const prisma = new PrismaClient();
const SALT_ROUNDS = 10;

async function main() {
  const email = process.env.ADMIN_EMAIL?.trim().toLowerCase();
  const password = process.env.ADMIN_PASSWORD;
  const name = process.env.ADMIN_NAME?.trim() || "Administrador";

  if (!email || !password) {
    console.error("Faltan ADMIN_EMAIL y ADMIN_PASSWORD en las variables de entorno.");
    process.exit(1);
  }
  if (password.length < 8) {
    console.error("ADMIN_PASSWORD debe tener al menos 8 caracteres.");
    process.exit(1);
  }

  const tenant = await prisma.tenant.upsert({
    where: { slug: "principal" },
    update: {},
    create: { name: "Cuenta principal", slug: "principal" },
  });

  const passwordHash = await bcrypt.hash(password, SALT_ROUNDS);
  const existing = await prisma.user.findUnique({ where: { email } });

  if (existing) {
    await prisma.user.update({
      where: { email },
      data: { passwordHash, role: "ADMIN", tenantId: tenant.id },
    });
    console.log(`Usuario administrador actualizado: ${email}`);
  } else {
    await prisma.user.create({
      data: { name, email, passwordHash, role: "ADMIN", tenantId: tenant.id },
    });
    console.log(`Usuario administrador creado: ${email}`);
  }

  console.log(`Tenant principal: ${tenant.id} (slug: ${tenant.slug})`);
}

main()
  .catch((error) => {
    console.error("Error al crear el administrador:", error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
