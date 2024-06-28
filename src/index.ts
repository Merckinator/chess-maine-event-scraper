import axios from 'axios';
import cheerio from 'cheerio';
import cron from 'node-cron';
import { DataTypes } from 'sequelize';

/**
 * Configuration values for the Discord channel that will receive notifications.
 */
const DISCORD_ID = process.env['DISCORD_ID'];
const DISCORD_TOKEN = process.env['DISCORD_TOKEN'];
const DISCORD_URL = `https://discordapp.com/api/webhooks/${DISCORD_ID}/${DISCORD_TOKEN}`;

const { Sequelize } = require('sequelize');

let oldEvents: string[] = [];
let sequelizeSession: typeof Sequelize | undefined;

/**
 * Every hour on the 0th minute perform the check.
 */
cron.schedule('0 * * * *', async () => {
  const response = await axios.get('http://chessmaine.net/chessmaine/events/');

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

      // Testing out Sequelize against a MySQL database in Railway.
      sequelizeSession = new Sequelize(process.env['MYSQL_PRIVATE_URL']);
      await sequelizeSession.authenticate();

      // Defining the simple model.
      const Event = sequelizeSession.define(
        'Event',
        {
          name: {
            type: DataTypes.STRING,
            allowNull: false
          },
        },
        {
          timestamps: true,
          createdAt: 'timestamp',
          updatedAt: false
        }
      );

      // TODO: Swap the tracking approach from in-memory array to using a MySQL database.
      const dbEvents = await Event.findAll();
      console.log('The events in the DB are:', JSON.stringify(dbEvents, null, 2));

      // Check for new or expired events.
      const eventsToAdd = newEvents.filter((event) => !oldEvents.includes(event));
      const eventsToRemove = oldEvents.filter((event) => !newEvents.includes(event));

      // Add any new events and remove any expired ones.
      addEvents(eventsToAdd);
      removeEvents(eventsToRemove);

      // Send notifications about new and expired events.
      if (eventsToAdd.length !== 0) sendNotification('New Events:\n' + eventsToAdd.join('\n'));
      if (eventsToRemove.length !== 0) sendNotification('Removed Events:\n' + eventsToRemove.join('\n'));
    } catch (e) {
      sendNotification(`ERROR: ${e}`);
    } finally {
      sequelizeSession?.close();
    }
  } else {
    sendNotification(`ERROR: ${response}`);
  }
});


/**
 * Events that have been posted to the website and need to be added to tracking.
 * @param events The event names to be added.
 */
function addEvents(events: string[]): void {
  events.forEach((event) => {
    oldEvents.push(event);
  });
}


/**
 * Events that have already occurred can be removed from tracking.
 * @param events The event names to be removed.
 */
function removeEvents(events: string[]): void {
  events.forEach((event) => {
    const index = oldEvents.indexOf(event);
    oldEvents.splice(index, 1);
  });
}


/**
 * Sends a message to the configured Discord channel via webhook.
 * @param message The message to be sent.
 */
function sendNotification(message: string) {
  const payload = {
    'content': message,
    'username': 'chess-maine-event-scraper',
    'avatar_url': 'http://chessmaine.net/chessmaine/templates/chessmaine2010/images/dkblue/logo.png',
  };
  axios.post(DISCORD_URL, payload);
}