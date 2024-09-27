const { MongoClient, ServerApiVersion, ObjectId } = require('mongodb');
const express = require('express')
require("dotenv").config();
const cors = require("cors");
const cookieParser = require('cookie-parser');
const jwt = require('jsonwebtoken')
const app = express()


const port = process.env.PORT || 5000;

//middleware
app.use(express.json())
app.use(cors({
  origin: [
    "http://localhost:5173",
  ],
  credentials: true,
}))
app.use(cookieParser())

//connection mongodb database
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
    app.get("/dogs", async (req, res) => {
      const dogs = await dogsCollection.find().toArray();
      res.send(dogs)
    })
    app.get("/dog/:id", async (req, res) => {
      const dog = await dogsCollection.findOne({ _id: new ObjectId(req.params.id) })
      res.send(dog)
    })
    app.get("/cats", async (req, res) => {
      const cats = await catsCollection.find().toArray();
      res.send(cats)
    })

    // jwt request

    //genate a secret key require('crypto').randomBytes(64).toString('hex')
    
    const cookieOptions = {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: process.env.NODE_ENV === "production" ? "none" : "strict",
    };
    //creating Token
    app.post("/jwt",  async (req, res) => {
      const user = req.body.email;
      // console.log("user for token", user);
      const token = jwt.sign(user, process.env.ACCESS_TOKEN_SECRET);

      res.cookie("token", token, cookieOptions).send({ success: true});
    });
 

    //clearing Token
    app.post("/logout", async (req, res) => {
      const user = req.body;
      // console.log("logging out", user);
      res
        .clearCookie("token", { ...cookieOptions, maxAge: 0 })
        .send({ success: true });
    });

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