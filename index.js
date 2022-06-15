const express = require('express');
const cors = require('cors');
require('dotenv').config();
const { MongoClient, ServerApiVersion } = require('mongodb');
const e = require('express');

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

async function run () {
    try {
        await client.connect();
        const serviceCollection = client.db('doctors-portal').collection('appointments');
        const bookingCollection = client.db('doctors-portal').collection('bookings');

        // Appoinments API
        app.get('/appointments', async (req, res) => {
            const query = {};
            const cursor = serviceCollection.find(query);
            const appointments = await cursor.toArray();
            res.send(appointments);
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
        app.get('/my-bookings', async (req, res) => {
            const email = req.query.email;
            const query = {patientEmail: email};
            const myBookings = await bookingCollection.find(query).toArray();

            res.send(myBookings);
        })

        // Add Booking API
        app.post('/bookings', async (req, res) => {
            const booking = req.body;
            const query = {treatment : booking.treatment, patientName: booking.patientName, date: booking.date};
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