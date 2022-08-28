import cron from 'node-cron';

let i = 0;

cron.schedule(`*/1 * * * *`, async () => {
  console.log(`Running your task for the ${i} time...`);
  i++;
});