const express = require('express')
require("dotenv").config();
const cors = require("cors");
const app = express()

const port = process.env.PORT || 5000;

//middleware
app.use(express.json())
app.use(cors())

//connection mongodb database

const { MongoClient, ServerApiVersion } = require('mongodb');
const uri = `mongodb+srv://${process.env.DB_UserName}:${process.env.DB_Password}@cluster0.0zrlznh.mongodb.net/?retryWrites=true&w=majority&appName=Cluster0`;

// Create a MongoClient with a MongoClientOptions object to set the Stable API version
const client = new MongoClient(uri, {
  serverApi: {
    version: ServerApiVersion.v1,
    strict: true,
    deprecationErrors: true,
  }
});

async function run() {
  try {
    // Connect the client to the server	(optional starting in v4.7)
    await client.connect();
    // Send a ping to confirm a successful connection

    // Get the database and collection on which to run the operation
    const database = client.db("pet-adoption");
    const dogsCollection = database.collection("dog");
    const catsCollection = database.collection("cats");

    // Perform CRUD operations here
    app.get("/dogs",async (req,res)=>{
      const dogs = await dogsCollection.find().toArray();
      res.send(dogs)
    })
    app.get("/cats",async (req,res)=>{
      const cats = await catsCollection.find().toArray();
      res.send(cats)
    })


    await client.db("admin").command({ ping: 1 });
    console.log("Pinged your deployment. You successfully connected to MongoDB!");
  } finally {
    // Ensures that the client will close when you finish/error
    // await client.close();
  }
}
run().catch(console.dir);


app.get('/', (req, res) => {
  res.send('PET Adoption server is Running!')
})

app.listen(port, () => {
  console.log(`Example app listening on port ${port}`)
})