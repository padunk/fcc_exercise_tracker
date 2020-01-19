const express = require('express');
const app = express();
const bodyParser = require('body-parser');
const shortid = require('shortid');

const cors = require('cors');

const mongoose = require('mongoose');
mongoose
   .connect(process.env.MLAB_URI || 'mongodb://localhost/exercise-track', {
      useNewUrlParser: true,
      useUnifiedTopology: true,
      useFindAndModify: false,
   })
   .catch(err => console.error(err));

const logSchema = new mongoose.Schema({
   description: String,
   duration: Number,
   date: {
      type: Date,
      default: Date.now,
   },
});

const userSchema = new mongoose.Schema({
   _id: {
      type: String,
      default: shortid.generate,
   },
   username: String,
   log: [logSchema],
   count: {
      type: Number,
      default: 0,
   },
});

const UserModel = mongoose.model('UserModel', userSchema);

app.use(cors());

app.use(bodyParser.urlencoded({ extended: false }));
app.use(bodyParser.json());

app.use(express.static('public'));
app.get('/', (req, res) => {
   res.sendFile(__dirname + '/views/index.html');
});

app.get('/api/exercise/users', (req, res) => {
   UserModel.find({}, '_id username', (err, users) => {
      if (err) {
         handleError(err);
         return;
      }
      res.json(users);
      res.end();
   });
});

app.get('/api/exercise/log', (req, res) => {
   let { userId, from, to, limit } = req.query;
   if (userId === undefined) {
      res.end('User ID required.');
      return;
   }

   UserModel.findById(userId, (err, data) => {
      if (err) {
         handleError(err);
         res.end();
         return;
      }

      let { _id, username, log } = data;
      if (data === null) {
         res.end('Unknown user.');
      }

      from = from === undefined ? 0 : new Date(from).getTime();
      to = to === undefined ? Date.now() : new Date(to).getTime();

      log = log.filter(l => {
         let date = new Date(l.date);
         date = date.getTime();
         return date >= from && date <= to;
      });

      const output = {
         _id,
         username,
         from: new Date(from).toDateString(),
         to: new Date(to).toDateString(),
         count: log.length,
         log,
      };
      res.json(output);
      res.end();
   });
});

app.post('/api/exercise/new-user', (req, res) => {
   let { username } = req.body;
   UserModel.findOne({ username }, async (err, user) => {
      if (err) {
         handleError(err);
         return;
      }
      if (user === null) {
         let newUser = new UserModel({
            username,
            log: [],
         });
         await newUser
            .save()
            .then(data => {
               console.log('saving data:', data);
               res.json({ username, id: data._id });
            })
            .catch(err => handleError(err));
      } else {
         res.end('username already taken.');
      }

      res.end();
   });
});

app.post('/api/exercise/add', async (req, res) => {
   let { userId, description, duration, date } = req.body;

   UserModel.findByIdAndUpdate(
      userId,
      {
         $push: {
            log: {
               description,
               duration,
               date: date || Date.now(),
            },
         },
         $inc: {
            count: 1,
         },
      },
      { new: true, upsert: true },
      (err, data) => console.log('update data:', data)
   );
   res.json({ userId, description, duration, date });
   res.end();
});

// Not found middleware
app.use((req, res, next) => {
   return next({ status: 404, message: 'not found' });
});

// Error Handling middleware
app.use((err, req, res, next) => {
   let errCode, errMessage;

   if (err.errors) {
      // mongoose validation error
      errCode = 400; // bad request
      const keys = Object.keys(err.errors);
      // report the first validation error
      errMessage = err.errors[keys[0]].message;
   } else {
      // generic or custom error
      errCode = err.status || 500;
      errMessage = err.message || 'Internal Server Error';
   }
   res.status(errCode)
      .type('txt')
      .send(errMessage);
});

const listener = app.listen(process.env.PORT || 3000, () => {
   console.log('Your app is listening on port ' + listener.address().port);
});

function handleError(err) {
   console.error(err);
}
