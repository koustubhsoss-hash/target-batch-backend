const { PrismaClient } = require('@prisma/client');
const bcrypt = require('bcryptjs');

const prisma = new PrismaClient();

async function main() {
  console.log('🌱 Seeding database...');

  // 1. Seed Fixed Admin / Teacher Accounts
  const adminUsers = [
    { email: 'admin@targetbatch.com', pass: 'Admin@123' },
    { email: 'koustubhsoss@gmail.com', pass: '123456' }
  ];

  for (const acc of adminUsers) {
    const existing = await prisma.user.findUnique({ where: { email: acc.email } });
    if (!existing) {
      const hashedPassword = await bcrypt.hash(acc.pass, 10);
      await prisma.user.create({
        data: {
          email: acc.email,
          password: hashedPassword,
          role: 'ADMIN',
          avatar: 'https://images.unsplash.com/photo-1494790108377-be9c29b29330?w=150',
        },
      });
      console.log(`✅ Admin/Teacher account created: ${acc.email} (Password: ${acc.pass})`);
    } else {
      console.log(`ℹ️ Account ready: ${acc.email}`);
    }
  }

  // Clear extra seed data (courses, subjects)
  await prisma.subject.deleteMany({});
  await prisma.course.deleteMany({});
  await prisma.assignmentSubmission.deleteMany({});
  await prisma.assignment.deleteMany({});
  await prisma.note.deleteMany({});
  await prisma.testSubmission.deleteMany({});
  await prisma.question.deleteMany({});
  await prisma.test.deleteMany({});
  await prisma.studentProfile.deleteMany({});
  await prisma.user.deleteMany({ where: { role: { not: 'ADMIN' } } });

  console.log('🧹 Cleaned all dummy/seed tables (courses, subjects, tests, etc.)');
  console.log('🎉 Only Admin/Teacher account remains active!');
}

main()
  .catch((e) => {
    console.error('❌ Error seeding:', e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
