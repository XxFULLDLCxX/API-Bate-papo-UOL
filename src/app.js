import express from 'express';
import { MongoClient, ObjectId } from 'mongodb';
import { stripHtml } from "string-strip-html";
import { trimNewlines } from 'trim-newlines';
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
  if (req.body.name === undefined) return message.error(res, 422);
  const name = trimNewlines(stripHtml(req.body.name)).result;
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

  if (req.headers.user === undefined) return message.error(res, 422);
  const user = Buffer.from(trimNewlines(stripHtml(req.headers.user)).result, 'latin1').toString('utf-8');
  let { to, text, type } = req.body;

  const messages_schema = joi.object({
    from: joi.string().required(),
    to: joi.string().required(),
    text: joi.string().required(),
    type: joi.string().valid('message', 'private_message')
  });
  const validation = messages_schema.validate({ from: user, to, text, type }, { abortEarly: false });
  if (validation.error || !await db.collection('participants').findOne({ name: user }))
    return res.sendStatus(422);
  try {
    [to, text, type] = [to, text, type].map(e => trimNewlines(stripHtml(e)).result);
    await db.collection('messages').insertOne({ from: user, to, text, type, time: dayjs().format('HH:mm:ss') });
    return res.sendStatus(201);
  } catch (error) { message.error(res, error); }
}
);

app.get('/messages', async (req, res) => {
  if (req.headers.user === undefined) return message.error(res, 422);

  const user = Buffer.from(trimNewlines(stripHtml(req.headers.user)).result, 'latin1').toString('utf-8');
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
);

app.delete('/messages/:id', async (req, res) => {
  /* Acentos no user pelo header com o method delete, aparentemente, não precisa do Buffer */
  if (req.headers.user === undefined) return message.error(res, 422);
  const { id } = req.params;
  try {
    const msg = await db.collection('messages').findOne({ _id: new ObjectId(id) });
    if (msg === null || !id) return message.error(res, 404);
    if (msg.from !== req.headers.user) return message.error(res, 401);
    await db.collection('messages').deleteOne({ _id: new ObjectId(id) });
    res.sendStatus(200);
  } catch (error) {
    message.error(res, 500, error);
  }
});

app.put("/messages/:id", async (req, res) => {
  if (req.headers.user === undefined) return message.error(res, 422);

  const { id } = req.params;
  let { to, text, type } = req.body;

  const user = Buffer.from(trimNewlines(stripHtml(req.headers.user)).result, 'latin1').toString('utf-8');

  const messages_schema = joi.object({
    from: joi.string().required(),
    to: joi.string().required(),
    text: joi.string().required(),
    type: joi.string().valid('message', 'private_message')
  });
  const validation = messages_schema.validate({ from: user, to, text, type }, { abortEarly: false });

  if (validation.error || !await db.collection('participants').findOne({ name: user }))
    return message.error(res, 422, validation);
  const msg = await db.collection('messages').findOne({ _id: new ObjectId(id) });
  if (msg.from !== user) message.error(res, 401);
  try {
    [to, text, type] = [to, text, type].map(e => trimNewlines(stripHtml(e)).result);

    const result = await db.collection('messages').updateOne(
      { _id: new ObjectId(id) },
      { $set: { from: user, to, text, type } }
    );
    if (result.matchedCount === 0) return message.error(res, 404);
    res.sendStatus(200);
  } catch (error) {
    message.error(res, 500, error);
  }
}
);

/* Status Routes */
app.post('/status', async (req, res) => {
  if (req.headers.user === undefined) return message.error(res, 404);

  const user = Buffer.from(trimNewlines(stripHtml(req.headers.user)).result, 'latin1').toString('utf-8');

  const messages_schema = joi.object({ user: joi.string().required() });
  const validation = messages_schema.validate({ user }, { abortEarly: false });

  if (validation.error || !await db.collection('participants').findOne({ name: user }))
    return message.error(res, 404);

  try {
    await db.collection('participants').updateOne({ name: user }, { $set: { lastStatus: Date.now() } });
    return res.sendStatus(200);
  } catch (error) { message.error(res, error); }
}
);

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
