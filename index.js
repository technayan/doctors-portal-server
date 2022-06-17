const express = require('express');
const cors = require('cors');
const jwt = require('jsonwebtoken');
require('dotenv').config();
const { MongoClient, ServerApiVersion } = require('mongodb');


const app = express();
const port = process.env.PORT || 5000;

// Middlewares
app.use(cors());
app.use(express.json());


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
        const serviceCollection = client.db('doctors-portal').collection('appointments');
        const bookingCollection = client.db('doctors-portal').collection('bookings');
        const userCollection = client.db('doctors-portal').collection('users');

        // Appoinments API
        app.get('/appointments', async (req, res) => {
            const query = {};
            const cursor = serviceCollection.find(query);
            const appointments = await cursor.toArray();
            res.send(appointments);
        })

        // All Users API
        app.get('/users', async (req, res) => {
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
        app.get('/my-bookings', verifyJWT, async (req, res) => {
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

        // Add Booking API
        app.post('/bookings', async (req, res) => {
            const booking = req.body;
            const query = {treatment : booking.treatment, patientEmail: booking.patientEmail, date: booking.date};
            const exist = await bookingCollection.findOne(query);
            if(exist) {
                return res.send({success: false, booking: exist});
            }
            const result = bookingCollection.insertOne(booking);
            return res.send({success: true, result});
        })
    }
    finally {

    }
}

run().catch(console.dir);

app.listen(port, () => {
    console.log('Listening to the port', port);
})