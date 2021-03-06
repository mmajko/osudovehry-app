var express = require('express'),
    Datastore = require('nedb'),
    ppl = new Datastore({ filename: './db/osudove-ppl.db', autoload: true }),
    cors = require('cors'),
    bodyParser = require('body-parser'),
    config = require('../config.js'),
    nodemailer = require('nodemailer'),
    sgTransport = require('nodemailer-sendgrid-transport'),
    createMailTemplate = require('./mail-tpl.js')

var mailerOptions = {
    auth: {
        api_key: config.sendGridApiKey
    }
}

var mailer = nodemailer.createTransport(sgTransport(mailerOptions));
var managementMail = "hlavac95@gmail.com"

var gamesIdentifier = '101';
var gamesCapacity = 25;

var port = process.env.PORT || 80;
var app = express();

app.use(cors());
app.use(bodyParser.urlencoded({ extended: false }));

String.prototype.lpad = function(padString, length) {
    var str = this;
    while (str.length < length)
        str = padString + str;
    return str;
};

function registerNewUser(id, name, surname, email, phone, callback) {
  ppl.insert({
    id: id,
    name: name,
    surname: surname,
    email: email,
    phone: phone,
    registered: new Date(),
    paid: false,
    valid: true
  }, function (err, docs) {
    callback(docs[0]);
  });
}

function createNewUserId(lastid) {
  var rawId = parseInt(lastid.substr(3));
  return gamesIdentifier + (rawId + 1).toString().lpad('0',3);
}

function getCapacityCount(callback) {
  ppl.find({valid: true}).exec(function (err, docs) {
    callback({ registered: docs.length, capacity: gamesCapacity });
  });
}

function authenticateWithToken(req) {
  return req.query.token === config.accessToken;
}

function sendMailAfterReg(destination, userId) {
  var email = {
    to: [destination],
    from: 'registrace@zimni.osudovehry.cz',
    subject: 'Registrace na Zimní Osudové Hry 2016',
    html: createMailTemplate(userId)
  }

  mailer.sendMail(email, function(err, info) {
    if (err) {
      console.log("Error: " + err)
    }
  })
}

function notifyAboutFullCapacity() {
  var email = {
    to: [managementMail],
    from: 'registrace@zimni.osudovehry.cz',
    subject: 'Kapacita ZOH 2016 naplnena',
    html: '<a href="http://zimni.osudovehry.cz">http://zimni.osudovehry.cz</a>'
  }

  mailer.sendMail(email, function(err, info) {
    if (err) {
      console.log("Error: " + err)
    }
  })
}

// Serve static files
app.use(express.static('../dist'));

// New user registration
app.post('/register', function(req, res) {
  getCapacityCount(function (cap) {
      if (cap.registered >= cap.capacity) {
        res.send('you must be fun at parties, right?');
        return;
      }

      ppl.find({}).sort({ registered: -1 }).limit(1).exec(function (err, docs) {
        var newId = docs.length > 0 ? createNewUserId(docs[0].id) : gamesIdentifier + '000';

        registerNewUser(newId, req.body.name, req.body.surname, req.body.email,
                        req.body.phone, function(err, docs) {

          sendMailAfterReg(req.body.email, newId)

          if (cap.registered + 1 == cap.capacity) notifyAboutFullCapacity()
          if (!err) res.send(newId);
        });
      });
  });
});

// Capacity capacity-count
app.get('/capacity', function(req, res) {
  getCapacityCount(function (cap) {
      res.send(cap.registered + '/' + cap.capacity);
  });
});

// Dumping users database
app.get('/registered', function(req, res) {
  if (!authenticateWithToken(req)) { res.send('err_accesstoken'); return;}

  ppl.find({}).sort({ registered: -1 }).exec(function (err, docs) {
    res.json(docs);
  });
})

// Mark user as paid
app.get('/markpaid', function(req, res) {
  if (!authenticateWithToken(req)) { res.send('err_accesstoken'); return;}
  ppl.update({id: req.query.id}, { $set: { paid: true} }, {}, function (err, numReplaced) {
    res.setHeader("Location", "list.html?" + config.accessToken);
    res.sendStatus(301);
  });
})
// Mark user as paid
app.get('/markinvalid', function(req, res) {
  if (!authenticateWithToken(req)) { res.send('err_accesstoken'); return;}
  ppl.update({id: req.query.id}, { $set: { valid: false, paid: false } }, {}, function (err, numReplaced) {
    res.setHeader("Location", "list.html?" + config.accessToken);
    res.sendStatus(301);
  });
})

var server = app.listen(port, function () {
  var port = server.address().port;
  console.log('App running on %s', port);
});
