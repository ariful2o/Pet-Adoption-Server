const { MongoClient, ServerApiVersion, ObjectId } = require('mongodb');
const express = require('express');
require("dotenv").config();
const cors = require("cors");
const cookieParser = require('cookie-parser');
const jwt = require('jsonwebtoken');
const app = express();

const port = process.env.PORT || 5000;

// Middleware
app.use(express.json());
app.use(cookieParser());
app.use(cors({
  origin: [
    "http://localhost:5173",
  ],
  credentials: true,
}));

// Connection to MongoDB
const uri = `mongodb+srv://${process.env.DB_UserName}:${process.env.DB_Password}@cluster0.0zrlznh.mongodb.net/?retryWrites=true&w=majority&appName=Cluster0`;

const client = new MongoClient(uri, {
  serverApi: {
    version: ServerApiVersion.v1,
    strict: true,
    deprecationErrors: true,
  }
});





async function run() {
  try {
    // await client.connect();

    // Get the database and collections
    const database = client.db("pet-adoption");
    const dogsCollection = database.collection("dog");
    const catsCollection = database.collection("cats");
    const userCollection = database.collection("users");
    const adoptRequestCillection = database.collection("adopt-request");

    // Create a unique index for the email field
    await userCollection.createIndex({ email: 1 }, { unique: true });


    // Custom middleware to verify token
    const verifyToken = (req, res, next) => {
      const token = req.cookies?.token;
      if (!token) {
        return res.status(401).send({ "error": "Unauthorized", "message": "Authentication is required" });
      }
      jwt.verify(token, process.env.ACCESS_TOKEN_SECRET, (err, decoded) => {
        if (err) {
          return res.status(401).send({ "error": "Unauthorized", "message": "Authentication is required" });
        }
        req.user = decoded;
        next();
      });
    };
    // Verify admin middleware
    const verifyAdmin = async (req, res, next) => {
      // console.log(req);
      const email = req.user?.email; // Use req.user from token verification
      const query = { email: email };
      const result = await userCollection.findOne(query)
      if (result?.role === "admin") {
        next();
      } else {
        return res.status(403).send({ "error": "Forbidden", "message": "You do not have permission to access this resource." });
      }
    };

    // cookies options
    const cookieOptions = {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: process.env.NODE_ENV === "production" ? "none" : "strict",
    };


    // Creating Token
    app.post("/jwt", async (req, res) => {
      const user = req.body.email;
      const token = jwt.sign({ email: user }, process.env.ACCESS_TOKEN_SECRET, { expiresIn: '1h' });
      res.cookie("token", token, cookieOptions).send({ success: true });
    });

    // Clearing Token
    app.post("/logout", async (req, res) => {
      res.clearCookie("token", { ...cookieOptions, maxAge: 0 }).send({ success: true });
    });

    // Users related API
    app.get("/users", verifyToken, verifyAdmin, async (req, res) => {
      const users = await userCollection.find().toArray();
      res.send(users);
    })
    app.post("/user", async (req, res) => {
      try {
        const { email, name } = req.body;

        // Validate input
        if (!email || !name) {
          return res.status(400).json({ error: 'Email and name are required' });
        }

        // Check if the user already exists
        const exists = await userCollection.findOne({ email });
        if (exists) {
          return res.status(409).json({ error: 'User already exists' });
        }

        // Insert new user
        const result = await userCollection.insertOne({ email, name });
        res.status(201).json(result);
      } catch (error) {
        // Handle duplicate key error from unique index
        if (error.code === 11000) {
          return res.status(409).json({ error: 'User already exists' });
        }
        console.error('Error creating user:', error);
        res.status(500).json({ error: 'Internal server error' });
      }
    });

    // check is admin
    app.get("/admin/check/:email", async (req, res) => {
      const query = { email: req.params.email };
      const result = await userCollection.find(query).toArray();
      const isAdmin = result.find((user) => user.role === "admin");
      isAdmin ? res.send(true) : res.send(false);
    });


    // Perform CRUD operations
    app.get("/dogs", async (req, res) => {
      const dogs = await dogsCollection.find().toArray();
      res.send(dogs);
    });


    const isValidObjectId = (id) => {
      return ObjectId.isValid(id) && (String(new ObjectId(id)) === id);
  };
  
    app.get("/:doglist/:id", async (req, res) => {
      const id = req.params.id;

      // Validate ObjectId
      if (!isValidObjectId(id)) {
          return res.status(400).send({ error: "Invalid ID format." });
      }
      const pet = req.params.doglist
      if (pet === "catlist") {
        const cat = await catsCollection.findOne({ _id: new ObjectId(req.params.id) });
        res.send(cat);
      } else {
        const dog = await dogsCollection.findOne({ _id: new ObjectId(req.params.id) });
        res.send(dog);
      }

    });
    app.get("/cats", async (req, res) => {
      const cats = await catsCollection.find().toArray();
      res.send(cats);
    });

    app.post("/addpet", async (req, res) => {
      const pet = req.body;
      if (pet.petCategory.value === "dog") {
        const result = await dogsCollection.insertOne(pet);
        res.send(result);
      } else if (pet.petCategory.value === "cat") {
        const result = await catsCollection.insertOne(pet);
        res.send(result);
      }
    })
    //request for adoptions
    app.post("/pets/adoption", async (req, res) => {
      const data = req.body;
      // const pet= data.petId
      const result = await adoptRequestCillection.insertOne(data)
      res.send(result)
    })

    // const author = {
    //   "displayName":"Mohammad Ariful Islam",
    //   "email":"a@b.com",
    //   "photoURL":"https://i.ibb.co/YXywfQL/ariful.jpg"
    // }
    app.post("/mypets", async (req, res) => {
      const email = req.body.email
      const query ={ 'author.email': email }

      console.log(email,"hit api ");
      const result = await dogsCollection.find(query).toArray()
      const result2 = await catsCollection.find(query).toArray()
      const allPets = [...result, ...result2]
      res.send(allPets)
    })


    await client.db("admin").command({ ping: 1 });
    console.log("Pinged your deployment. You successfully connected to MongoDB!");
  } finally {
    // Uncomment if you want to close the client after operation
    // await client.close();
  }
}
run().catch(console.dir);

app.get('/', (req, res) => {
  res.send('PET Adoption server is Running!');
});

app.listen(port, () => {
  console.log(`Example app listening on port ${port}`);
});
