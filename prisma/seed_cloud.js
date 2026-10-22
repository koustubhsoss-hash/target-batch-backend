const { PrismaClient } = require('@prisma/client');
const bcrypt = require('bcryptjs');

const tidbUrl = 'mysql://3MjyHrEtZaRgK77.root:YWMgiHOB4TJx5M6X@gateway01.ap-northeast-1.prod.aws.tidbcloud.com:4000/test?sslaccept=strict';

const prisma = new PrismaClient({
  datasources: {
    db: {
      url: tidbUrl,
    },
  },
});

async function seed() {
  console.log('🚀 Seeding TiDB Cloud Tests, Assignments, Notes...');
  try {
    const admin = await prisma.user.findUnique({ where: { email: 'koustubhsoss@gmail.com' } });
    if (!admin) {
      console.error('Admin not found!');
      return;
    }

    // 1. Tests
    const existingTest = await prisma.test.findFirst({ where: { title: 'BA Sem 1 - Hindi Sahitya Mock Assessment 1' } });
    if (!existingTest) {
      const test1 = await prisma.test.create({
        data: {
          title: 'BA Sem 1 - Hindi Sahitya Mock Assessment 1',
          subject: 'Hindi',
          course: 'BA',
          semester: 'Semester 1',
          duration: 60,
          totalMarks: 30,
          status: 'ACTIVE',
          createdById: admin.id,
          questions: {
            create: [
              {
                questionText: 'कबीरदास जी किस काल के प्रमुख कवि माने जाते हैं?',
                options: ['आदिकाल', 'भक्तिकाल', 'रीतिकाल', 'आधुनिक काल'],
                correctOption: 1,
                marks: 10,
              },
              {
                questionText: 'गोदान उपन्यास के लेखक कौन हैं?',
                options: ['जयशंकर प्रसाद', 'प्रेमचंद', 'महादेवी वर्मा', 'सूर्यकांत त्रिपाठी निराला'],
                correctOption: 1,
                marks: 10,
              },
              {
                questionText: 'सूरदास जी के पदों में किस रस की प्रधानता है?',
                options: ['वात्सल्य रस', 'वीर रस', 'रौद्र रस', 'हास्य रस'],
                correctOption: 0,
                marks: 10,
              },
            ],
          },
        },
      });
      console.log('✅ Seeded Test 1:', test1.title);
    }

    const existingTest2 = await prisma.test.findFirst({ where: { title: 'BA Sem 1 - Political Science Core Assessment 2026' } });
    if (!existingTest2) {
      const test2 = await prisma.test.create({
        data: {
          title: 'BA Sem 1 - Political Science Core Assessment 2026',
          subject: 'Political Science',
          course: 'BA',
          semester: 'Semester 1',
          duration: 45,
          totalMarks: 20,
          status: 'ACTIVE',
          createdById: admin.id,
          questions: {
            create: [
              {
                questionText: 'भारतीय संविधान का जनक किसे कहा जाता है?',
                options: ['डॉ. राजेन्द्र प्रसाद', 'डॉ. बी. आर. अम्बेडकर', 'जवाहरलाल नेहरू', 'सरदार पटेल'],
                correctOption: 1,
                marks: 10,
              },
              {
                questionText: 'संविधान के किस भाग में मौलिक अधिकारों का वर्णन है?',
                options: ['भाग 3', 'भाग 4', 'भाग 2', 'भाग 1'],
                correctOption: 0,
                marks: 10,
              },
            ],
          },
        },
      });
      console.log('✅ Seeded Test 2:', test2.title);
    }

    // 2. Assignments
    const existingAssign = await prisma.assignment.findFirst({ where: { title: { contains: 'Kabir Das' } } });
    if (!existingAssign) {
      await prisma.assignment.create({
        data: {
          title: 'Hindi Sahitya - Kabir Das Ke Dohe Aur Unka Samajik Prabhav',
          subject: 'Hindi',
          course: 'BA',
          semester: 'Semester 1',
          description: 'कबीरदास जी के प्रमुख दोहों की व्याख्या एवं समकालीन समाज में उनकी प्रासंगिकता पर 500 शब्दों का निबंध लिखें।',
          dueDate: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
          createdById: admin.id,
        },
      });

      await prisma.assignment.create({
        data: {
          title: 'Political Science - Salient Features of the Indian Constitution',
          subject: 'Political Science',
          course: 'BA',
          semester: 'Semester 1',
          description: 'भारतीय संविधान की मुख्य विशेषताओं पर विस्तृत रिपोर्ट तैयार करें।',
          dueDate: new Date(Date.now() + 5 * 24 * 60 * 60 * 1000),
          createdById: admin.id,
        },
      });
      console.log('✅ Seeded 2 Assignments');
    }

    // 3. Notes & Docs
    const existingNote = await prisma.note.findFirst({ where: { title: { contains: 'Hindi Sahitya' } } });
    if (!existingNote) {
      await prisma.note.create({
        data: {
          title: 'Hindi Sahitya Unit 1 & 2 Complete Lecture Notes',
          subject: 'Hindi',
          course: 'BA',
          semester: 'Semester 1',
          description: 'भक्तिकाल एवं आधुनिक काल के कवियों का संक्षिप्त परिचय एवं उनके प्रमुख काव्य संकलन।',
          fileUrl: 'https://www.w3.org/WAI/ER/tests/xhtml/testfiles/resources/pdf/dummy.pdf',
          fileType: 'pdf',
          fileSize: '1.8 MB',
          createdById: admin.id,
        },
      });

      await prisma.note.create({
        data: {
          title: 'Indian Political System & Constitutional Framework Handout',
          subject: 'Political Science',
          course: 'BA',
          semester: 'Semester 1',
          description: 'मौलिक अधिकार, नीति निर्देशक तत्व एवं संसद की कार्यप्रणाली के मुख्य बिंदु।',
          fileUrl: 'https://www.w3.org/WAI/ER/tests/xhtml/testfiles/resources/pdf/dummy.pdf',
          fileType: 'pdf',
          fileSize: '2.4 MB',
          createdById: admin.id,
        },
      });
      console.log('✅ Seeded 2 Study Notes');
    }

    console.log('🎉 TiDB Cloud Database successfully seeded with rich content!');
  } catch (err) {
    console.error('❌ Seed error:', err);
  } finally {
    await prisma.$disconnect();
  }
}

seed();
