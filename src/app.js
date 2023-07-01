import express from 'express';
import { MongoClient, ObjectId } from 'mongodb';
import dotenv from 'dotenv';
import cors from 'cors';
import joi from 'joi';
import dayjs from 'dayjs';

dotenv.config();

class Message {
  error(res, error) {
    console.error(error);
    res.sendStatus(500);
  }
};
const message = new Message();

const mongoClient = new MongoClient(process.env.DATABASE_URL);
const db = mongoClient.db();

const app = express();
app.use(cors());
app.use(express.json());

// {from: 'João', to: 'Todos', text: 'oi galera', type: 'message', time: '20:04:37'}

/* Participants Routes */
app.post('/participants', async (req, res) => {
  const { name } = req.body;
  const participants_schema = joi.object({ name: joi.string().required() });
  const validation = participants_schema.validate(req.body, { abortEarly: false });

  if (validation.error) {
    const errors = validation.error.details.map((detail) => detail.message);
    return res.status(422).send(errors);
  }
  try {
    // Add case-insensitive search for participants later.
    const participant = await db.collection('participants').findOne({ name });
    console.log(!participant, participant, name);
    if (participant) return res.sendStatus(409);
    else {
      await db.collection('participants').insertOne({ name, lastStatus: Date.now() });
      await db.collection('messages').insertOne({
        from: name,
        to: 'Todos',
        text: 'entra na sala...',
        type: 'status',
        time: dayjs('HH:mm:ss'),
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

app.listen(5000, () => {
  console.log('Server is litening on port 5000.');
});
