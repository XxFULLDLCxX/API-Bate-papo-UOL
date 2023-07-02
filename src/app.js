import express from 'express';
import { MongoClient, ObjectId } from 'mongodb';
import dotenv from 'dotenv';
import cors from 'cors';
import joi from 'joi';
import dayjs from 'dayjs';

dotenv.config();

class Message {
  error(res, code, err) {
    if (err) console.error(err);
    res.sendStatus(code);
  }

};
const message = new Message();

const mongoClient = new MongoClient(process.env.DATABASE_URL);
const db = mongoClient.db();

const app = express();
app.use(express.json());
app.use(cors());

/* Participants Routes */
app.post('/participants', async (req, res) => {
  const { name } = req.body;
  const participants_schema = joi.object({ name: joi.string().required() });
  const validation = participants_schema.validate(req.body, { abortEarly: false });

  if (validation.error) return message.error(res, 422);

  try {
    // Add case-insensitive search for participants later.
    const participant = await db.collection('participants').findOne({ name });

    if (participant) return message.error(res, 409);
    else {
      await db.collection('participants').insertOne({ name, lastStatus: Date.now() });
      await db.collection('messages').insertOne({
        from: name,
        to: 'Todos',
        text: 'entra na sala...',
        type: 'status',
        time: dayjs().format('HH:mm:ss'),
      });
      return res.sendStatus(201);
    }
  } catch (error) { message.error(res, error); }
});

app.get('/participants', async (req, res) => {
  try {
    const participants = await db.collection('participants').find().toArray();
    res.send(participants);
  } catch (error) { message.error(res, error); }
});

/* Messages Routes */
app.post('/messages', async (req, res) => {
  /* {
    to: "Maria",
    text: "oi sumida rs",
    type: "private_message"
  } */
  // {from: 'João', to: 'Todos', text: 'oi galera', type: 'message', time: '20:04:37'}

  // const { user: from } = req.headers;
  if (req.headers.user === undefined) return message.error(res, 422);
  else {
    const from = Buffer.from(req.headers.user, 'latin1').toString('utf-8');

    const { to, text, type } = req.body;
    const participants_schema = joi.object({
      from: joi.string().required(),
      to: joi.string().required(),
      text: joi.string().required(),
      type: joi.string().valid('message', 'private_message')
    });
    const validation = participants_schema.validate({ from, to, text, type }, { abortEarly: false });

    if (validation.error || !await db.collection('participants').findOne({ name: from }))
      return res.sendStatus(422);
    try {
      await db.collection('messages').insertOne({ from, to, text, type, time: dayjs().format('HH:mm:ss') });
      return res.sendStatus(201);
    } catch (error) { message.error(res, error); }
  }
});

app.get('/messages', async (req, res) => {
  if (req.headers.user === undefined) return message.error(res, 422);
  else {
    const user = Buffer.from(req.headers.user, 'latin1').toString('utf-8');
    const limit = Number(req.query.limit);

    const messages_schema = joi.object({ user: joi.string().required(), limit: joi.number().integer().min(1).positive() });
    const validation = messages_schema.validate({ user, limit }, { abortEarly: false });

    if (validation.error) return message.error(res, 422);

    try {
      const messages = await db.collection('messages').find(
        { $or: [{ from: user }, { $or: [{ to: user }, { to: 'Todos' }] }] }).toArray();
      res.send(limit ? messages.splice(-limit) : messages);
    } catch (error) { message.error(res, error); }
  }
});

/* Status Routes */
app.post('/status', async (req, res) => {
  if (req.headers.user === undefined) return message.error(res, 404);
  else {
    const user = Buffer.from(req.headers.user, 'latin1').toString('utf-8');

    const messages_schema = joi.object({ user: joi.string().required() });
    const validation = messages_schema.validate({ user }, { abortEarly: false });

    if (validation.error || !await db.collection('participants').findOne({ name: user }))
      return message.error(res, 404);

    try {
      await db.collection('participants').updateOne({ name: user }, { $set: { lastStatus: Date.now() } });
      return res.sendStatus(200);
    } catch (error) { message.error(res, error); }
  }
});

async function active() {
  /* 
  [
  {
    _id: new ObjectId("64a1699d207dd7d59098b255"),
    name: 'José Matheus',
    lastStatus: 1688330759923
  }
]
  */
  try {
    const inactive = await db.collection('participants').find({ $expr: { $gt: [{ $subtract: [Date.now(), "$lastStatus"] }, 10000] } }).toArray();
    console.log(inactive);
    inactive.forEach(async ({ name }) => {
      await db.collection('participants').deleteOne({ name });
      await db.collection('messages').insertOne({
        from: name,
        to: 'Todos',
        text: 'sai da sala...',
        type: 'status',
        time: dayjs().format('HH:mm:ss'),
      });
    });
  } catch (error) {
    console.log(error);
  }
}

setInterval(active, 15000);

app.listen(5000, () => {
  console.log('Server is litening on port 5000.');
});
