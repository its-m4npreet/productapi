import { PrismaClient } from '@prisma/client';
import { faker } from '@faker-js/faker';

const prisma = new PrismaClient();

const CATEGORIES = [
  'Electronics',
  'Fashion',
  'Grocery',
  'Books',
  'Home',
  'Sports',
  'Beauty',
  'Toys',
  'Furniture',
  'Footwear',
] as const;

const TOTAL_PRODUCTS = 200_000;
const BATCH_SIZE = 5000;

function generateBatch(size: number): Array<{
  name: string;
  category: string;
  price: number;
  createdAt: Date;
  updatedAt: Date;
}> {
  const batch: Array<{
    name: string;
    category: string;
    price: number;
    createdAt: Date;
    updatedAt: Date;
  }> = [];

  for (let i = 0; i < size; i++) {
    const category = faker.helpers.arrayElement(CATEGORIES);
    const name = faker.commerce.productName();
    const price = parseFloat(faker.commerce.price({ min: 1, max: 9999, dec: 2 }));
    const createdAt = faker.date.past({ years: 2 });
    const updatedAt = faker.date.between({ from: createdAt, to: new Date() });

    batch.push({ name, category, price, createdAt, updatedAt });
  }

  return batch;
}

async function main() {
  console.log(`Deleting existing products...`);
  const deleteResult = await prisma.product.deleteMany();
  console.log(`Deleted ${deleteResult.count} old products.`);

  console.log(`\nSeeding ${TOTAL_PRODUCTS.toLocaleString()} products...`);
  const startTime = Date.now();

  for (let offset = 0; offset < TOTAL_PRODUCTS; offset += BATCH_SIZE) {
    const batchSize = Math.min(BATCH_SIZE, TOTAL_PRODUCTS - offset);
    const batch = generateBatch(batchSize);
    await prisma.product.createMany({ data: batch });
    const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);
    const inserted = offset + batchSize;
    const pct = ((inserted / TOTAL_PRODUCTS) * 100).toFixed(1);
    console.log(`  ${inserted.toLocaleString()}/${TOTAL_PRODUCTS.toLocaleString()} (${pct}%) inserted in ${elapsed}s`);
  }

  const totalTime = ((Date.now() - startTime) / 1000).toFixed(1);
  console.log(`\nSeeding completed. ${TOTAL_PRODUCTS.toLocaleString()} products inserted in ${totalTime}s.`);
}

main()
  .catch((e) => {
    console.error('Seed failed:', e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
