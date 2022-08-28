import axios from 'axios';
import cheerio from 'cheerio';
import cron from 'node-cron';

const DISCORD_ID = process.env['DISCORD_ID'];
const DISCORD_TOKEN = process.env['DISCORD_TOKEN'];
const DISCORD_URL = `https://discordapp.com/api/webhooks/${DISCORD_ID}/${DISCORD_TOKEN}`;

let oldEvents: string[] = [];

cron.schedule('0 * * * *', async () => {
  axios.get('http://chessmaine.net/chessmaine/events/').then(
    (response) => {
      if (response.status === 200) {
        try {
          const tree = cheerio.load(response.data);
          const events = tree('.entry-header');
          let newEvents: string[] = [];

          for (let i = 0; i < events.length; i++) {
            const event = tree(events[i]).text().trim();
            console.log('The event header is: ', event);

            newEvents.push(event);
          }

          const eventsToAdd = newEvents.filter((event) => !oldEvents.includes(event));
          const eventsToRemove = oldEvents.filter((event) => !newEvents.includes(event));

          addEvents(eventsToAdd);
          removeEvents(eventsToRemove);

          if (eventsToAdd.length !== 0) sendNotification('New Events:\n' + eventsToAdd.join('\n'));
          if (eventsToRemove.length !== 0) sendNotification('Removed Events:\n' + eventsToRemove.join('\n'));
        } catch (e) {
          sendNotification(`ERROR: ${e}`);
        }
      } else {
        sendNotification(`ERROR: ${response}`);
      }
    }
  );
});

function addEvents(events: string[]): void {
  events.forEach((event) => {
    oldEvents.push(event);
  });
}

function removeEvents(events: string[]): void {
  events.forEach((event) => {
    const index = oldEvents.indexOf(event);
    oldEvents.splice(index, 1);
  });
}

function sendNotification(message: string) {
  const payload = {
    'content': message,
    'username': 'chess-maine-event-scraper',
    'avatar_url': 'http://chessmaine.net/chessmaine/templates/chessmaine2010/images/dkblue/logo.png',
  };
  axios.post(DISCORD_URL, payload);
}