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
      let newEventNames: string[] = [];

      for (let i = 0; i < events.length; i++) {
        const eventName = tree(events[i]).text().trim();
        console.log('The event header is: ', eventName);

        newEventNames.push(eventName);
      }

      // Use Sequelize to connect to a MySQL database in Railway.
      sequelizeSession = new Sequelize(
        process.env['MYSQLDATABASE'],
        process.env['MYSQLUSER'],
        process.env['MYSQLPASSWORD'],
        {
          dialect: 'mysql',
          host: process.env['MYSQLHOST'],
          port: process.env['MYSQLPORT']
        }
      );
      await sequelizeSession.authenticate();

      // Define the simple model.
      const Event = sequelizeSession.define(
        'Event',
        {
          name: {
            type: DataTypes.STRING,
            allowNull: false
          },
        },
        {
          createdAt: 'timestamp',
          tableName: 'events',
          timestamps: true,
          updatedAt: false
        }
      );
      await Event.sync({ alter: true });

      const dbEvents = await Event.findAll();
      console.log('The events in the DB are:', JSON.stringify(dbEvents, null, 2));

      // Check the database for new and expired events.
      const eventNamesToAdd = newEventNames.filter((newEvent) => !dbEvents.map((oldEvent: any) => oldEvent.name).includes(newEvent));
      const eventsToRemove = dbEvents.filter((oldEvent: any) => !newEventNames.includes(oldEvent.name));

      // Add any new events...
      eventNamesToAdd.forEach(async (eventName) => {
        await Event.create({
          name: eventName
        });
      });

      // and delete any expired events.
      eventsToRemove.forEach(async (event: any) => {
        await Event.destroy({
          where: {
            name: event.name
          }
        });
      });

      // Send notifications about new and expired events.
      if (eventNamesToAdd.length > 0) sendNotification('New Events:\n' + eventNamesToAdd.join('\n'));
      if (eventsToRemove.length > 0) sendNotification('Removed Events:\n' + eventsToRemove.map((event: any) => event.name).join('\n'));
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