const express = require('express');
const cors = require('cors');
const jwt = require('jsonwebtoken');
require('dotenv').config();
const { MongoClient, ServerApiVersion, ObjectId } = require('mongodb');
const nodemailer = require('nodemailer');
const mg = require('nodemailer-mailgun-transport');

// Sample Stripe Secret API Key
// Server side:
const stripe = require('stripe')(process.env.STRIPE_SAMPLE_SECRET_API_KEY);

const app = express();
const port = process.env.PORT || 5000;

// Middlewares
app.use(cors());
app.use(express.json());

// Email Send to User Using Nodemailer and Mailgun
const auth = {
    auth: {
      api_key: process.env.SEND_EMAIL_API_KEY,
      domain: 'sandbox25e007d26ce049bbb70793731b556d1f.mailgun.org'
    }
};

const nodemailerMailgun = nodemailer.createTransport(mg(auth));

const sendAppointmentEmail = (booking) => {
    const {patientName, patientEmail, treatment, date, slot} = booking;

    nodemailerMailgun.sendMail({
        from: process.env.EMAIL_SENDER,
        to: patientEmail,
        subject: 'Booking an appointment on doctors portal',
        html: `<div>
                <p>Hello ${patientName},</p>
                <p>Your booking for <strong>${treatment}</strong> on <strong>${date}</strong> at <strong>${slot}</strong> is successfully confirmed.</p>
                <p>We are waiting to see you and have a nice meeting on <strong>${date}</strong> at <strong>${slot}</strong>.</p>
                <h4>Our Address :</h4>
                <p>Brooklyn, NY 10036, USA</p>
                <p>+8801944516122</p>
               </div>`,
        //You can use "text:" to send plain-text content. It's oldschool!
        text: `Hello ${patientName},
                Your booking for ${treatment} on ${date} at ${slot} is successfully confirmed.
                We are waiting to see you and have a nice meeting on ${date} at ${slot}.
                Our Address :
                Brooklyn, NY 10036, USA
                +8801944516122
                `
      }, (err, info) => {
        if (err) {
          console.log(`Error: ${err}`);
        }
        else {
          console.log(`Response: ${info}`);
        }
      });
    
}


// API
app.get('/', (req, res) => {
    res.send('Doctors Portal server is running!');
});

// Connect with MongoDB
const uri = `mongodb+srv://${process.env.DB_USER}:${process.env.DB_PASS}@cluster0.ahoupp3.mongodb.net/?retryWrites=true&w=majority`;
const client = new MongoClient(uri, { useNewUrlParser: true, useUnifiedTopology: true, serverApi: ServerApiVersion.v1 });

// Verify JWT Function
const verifyJWT = (req, res, next) => {
    const authHeader = req.headers.authorization;
    if(!authHeader){
        return res.status(401).send({message: 'Unauthorized access'});
    }
    const token = authHeader.split(' ')[1];
    jwt.verify(token, process.env.ACCESS_TOKEN_SECRET, function(err, decoded) {
        if(err) {
            return res.status(403).send({message: 'Forbidden access'});
        }
        req.decoded = decoded;
        next();
      });
}



async function run () {
    try {
        await client.connect();
        // Collections
        const doctorCollection = client.db('doctors-portal').collection('doctors');
        const serviceCollection = client.db('doctors-portal').collection('appointments');
        const bookingCollection = client.db('doctors-portal').collection('bookings');
        const userCollection = client.db('doctors-portal').collection('users');
        const paymentCollection = client.db('doctors-portal').collection('payments');

        // Verify Admin Middleware
        const verifyAdmin = async (req, res, next) => {
            const requester = req.decoded.email;
            const requesterUser = await userCollection.findOne({email: requester});
            if(requesterUser.role === 'admin') {
                next();
            } else {
                return res.status(403).send({message: 'Forbidden Access'});
            }
        }

        // Appoinments API
        app.get('/appointments', async (req, res) => {
            const query = {};
            const cursor = serviceCollection.find(query).project({name: 1});
            const appointments = await cursor.toArray();
            res.send(appointments);
        })

        // All Users API
        app.get('/users', verifyJWT, verifyAdmin, async (req, res) => {
            const users = await userCollection.find({}).toArray();
            res.send(users);
        })

        // Create User API
        app.put('/user/:email', async (req, res) => {
            const email = req.params.email;
            const filter = {email: email};
            const user = req.body;
            const options = {upsert: true};
            const updateDoc = {
                $set: user,
            };
            const result = await userCollection.updateOne(filter, updateDoc, options);
            const token = jwt.sign({email: email}, process.env.ACCESS_TOKEN_SECRET, { expiresIn: '1h' });
            res.send({result, token});
        })

        // Check User Role API
        app.get('/admin/:email', verifyJWT, async (req, res) => {
            const email = req.params.email;
            const user = await userCollection.findOne({email: email});
            const isAdmin = user?.role === 'admin';
            res.send({admin: isAdmin});
        })

        // Make User Admin API
        app.put('/user/admin/:email', verifyJWT, verifyAdmin, async (req, res) => {
            const email = req.params.email;
            const filter = {email: email};
            const updateDoc = {
                $set: {role: 'admin'},
            };
            const result = await userCollection.updateOne(filter, updateDoc);
            res.send(result);
        })

        // Available Appointment Slots API
        app.get('/available-appointments', async (req, res) => {
            // Get the user selected date
            const date = req.query.date;

            //step1: Get all the appointments
            const appointments = await serviceCollection.find().toArray();

            //step2: Get the bookings of that day
            const query = {date: date};
            const bookings = await bookingCollection.find(query).toArray();

            //step3: for each appointements, get bookings for that appointment
            appointments.forEach(appointment => {
                const bookedAppointment = bookings.filter(booking => booking.treatment === appointment.name);
                const bookedSlots = bookedAppointment.map(bookedSlot => bookedSlot.slot);

                const availableSlots = appointment.slots.filter(s => !bookedSlots.includes(s));
                appointment.slots = availableSlots;
            })
            res.send(appointments);
        })
        
        // My Bookings API
        app.get('/bookings', verifyJWT, async (req, res) => {
            const email = req.query.email;
            const decodedEmail = req.decoded.email;
            if(email === decodedEmail) {
                const query = {patientEmail: email};
                const myBookings = await bookingCollection.find(query).toArray();
                res.send(myBookings);
            } else {
                return res.status(403).send({message: 'Forbidden access'});
            }
        })

        // Create Payment Intent API
        app.post('/create-payment-intent', verifyJWT, async (req, res) => {
            const appointment = req.body;
            const fee = appointment.fee;
            const price = fee * 100;
            const paymentIntent = await stripe.paymentIntents.create({
                amount: price,
                currency: 'usd',
                payment_method_types:['card']
            });
            res.send({clientSecret: paymentIntent.client_secret});
        });

        // Add Booking API
        app.post('/bookings', async (req, res) => {
            const booking = req.body;
            const query = {treatment : booking.treatment, patientEmail: booking.patientEmail, date: booking.date};
            const exist = await bookingCollection.findOne(query);
            if(exist) {
                return res.send({success: false, booking: exist});
            }
            const result = bookingCollection.insertOne(booking);

            console.log('sending email');
            sendAppointmentEmail(booking);
            return res.send({success: true, result});
        })

        // Single Booking API
        app.get('/bookings/:id', verifyJWT, async (req, res) => {
            const id = req.params.id;
            const query = {_id: ObjectId(id)};
            const booking = await bookingCollection.findOne(query);
            res.send(booking);
        })

        // Update Booking API
        app.patch('/bookings/:id', verifyJWT, async (req, res) => {
            const id = req.params.id;
            const payment = req.body;
            const filter = {_id: ObjectId(id)};
            const updateDoc = {
                $set: {
                    paid: true,
                    transactionId: payment.transactionId
                }
            }
            const result = await paymentCollection.insertOne(payment);
            const updatedBooking = await bookingCollection.updateOne(filter, updateDoc);

            res.send(updatedBooking);
        })

        // Add Doctor API
        app.post('/doctors', verifyJWT, verifyAdmin, async (req, res) => {
            const doctor = req.body;
            const result = await doctorCollection.insertOne(doctor);
            res.send(result);
        })

        // Doctors API
        app.get('/doctors', verifyJWT, verifyAdmin, async(req, res) => {
            const result = await doctorCollection.find().toArray();
            res.send(result);
        })

        // Delete Doctor API
        app.delete('/doctors/:email', verifyJWT, verifyAdmin, async(req, res) => {
            const email = req.params.email;
            const filter = {email: email};
            const result = await doctorCollection.deleteOne(filter);
            res.send(result);
        })
    }
    finally {

    }
}

run().catch(console.dir);

app.listen(port, () => {
    console.log('Listening to the port', port);
})