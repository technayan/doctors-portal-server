const express = require('express');
const cors = require('cors');
require('dotenv').config();
const { MongoClient, ServerApiVersion } = require('mongodb');

const app = express();
const port = process.env.PORT || 5000;

// Middlewares
app.use(cors());
app.use(express.json());

// Connect with MongoDB


const uri = `mongodb+srv://${process.env.DB_USER}:${process.env.DB_PASS}@cluster0.ahoupp3.mongodb.net/?retryWrites=true&w=majority`;
const client = new MongoClient(uri, { useNewUrlParser: true, useUnifiedTopology: true, serverApi: ServerApiVersion.v1 });

async function run () {
    try {
        await client.connect();
        const serviceCollection = client.db('doctors-portal').collection('appointment');
        
    }
    finally {

    }
}

run().catch(console.dir);


// API's
app.get('/', (req, res) => {
  res.send('Doctors Portal server is running!');
})



app.listen(port, () => {
    console.log('Listening to the port', port);
})