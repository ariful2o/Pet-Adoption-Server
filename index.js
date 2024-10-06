const { MongoClient, ServerApiVersion, ObjectId } = require('mongodb');
const express = require('express');
require("dotenv").config();
const cors = require("cors");
const cookieParser = require('cookie-parser');
const jwt = require('jsonwebtoken');
const stripe = require("stripe")(process.env.STRIPE_SECRET_KEY);
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
    const campaignCollection = database.collection("campaign");
    const donationCollection = database.collection("donation");

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

    app.post("/adoptrequests", async (req, res) => {
      const email = req.body.email
      const query = { 'author.email': email }
      const result = await dogsCollection.find(query).toArray()
      const result2 = await catsCollection.find(query).toArray()
      const allrequesr = await adoptRequestCillection.find().toArray()//all requests
      const mypets = [...result, ...result2]//my add all pet 

      let mypetsAdoptReq = [];
      for (let i = 0; i < allrequesr.length; i++) {
        const requestID = allrequesr[i].petId;
        const requestPet = mypets.find(pet => pet._id == requestID)
        const requestUser = allrequesr[i]
        if (!requestPet) {
          return
        }
        mypetsAdoptReq.push({ requestPet, requestUser })
      }
      res.send(mypetsAdoptReq)
    })

    app.post("/mypets", async (req, res) => {
      const email = req.body.email
      const query = { 'author.email': email }
      const result = await dogsCollection.find(query).toArray()
      const result2 = await catsCollection.find(query).toArray()
      const allPets = [...result, ...result2]
      res.send(allPets)
    })
    app.put("/updatepet/:petCategory/:id", async (req, res) => {
      const update = req.body
      const id = req.params.id
      const pet = req.params.petCategory
      const query = { _id: new ObjectId(id) }
      const updateDoc = {
        $set: {
          name: update.name,
          age: update.age,
          petCategory: update.petCategory,
          gender: update.gender,
          petLocation: update.petLocation,
          description: update.description,
          longDescription: update.longDescription,
          breed: update.breed,
          adoptionFee: update.adoptionFee,
          weight: update.weight,
          image: update.image,
          status: update.status,
        },
      }

      if (pet === ":cat") {
        const result = await catsCollection.updateOne(query, updateDoc)
        res.send(result);
      }
      const result = await dogsCollection.updateOne(query, updateDoc)
      res.send(result);
    })

    app.delete("/:petCategory/:id", async (req, res) => {
      const id = req.params.id;
      if (!isValidObjectId(id)) {
        return res.status(400).send({ error: "Invalid ID format." });
      }
      const pet = req.params.petCategory
      // console.log(pet, id)
      if (pet === "cat") {
        const result = await catsCollection.deleteOne({ _id: new ObjectId(id) });
        res.send(result);
      } else {
        const result = await dogsCollection.deleteOne({ _id: new ObjectId(id) });
        res.send(result);
      }
    })

    app.put("/updateStatus/:petCategory/:petId", async (req, res) => {
      const update = req.body
      const id = req.params.petId
      const petCategory = req.params.petCategory
      const query = { _id: new ObjectId(id) }

      const updateDoc = {
        $set: {
          status: update.status,
        },
      }

      if (petCategory === "cat") {
        const result = await catsCollection.updateOne(query, updateDoc)
        res.send(result);
      } else {
        const result = await dogsCollection.updateOne(query, updateDoc)
        res.send(result);
      }
    })
    app.put('/adoptrequests/:id', async (req, res) => {
      const update = req.body
      const id = req.params.id
      const query = { _id: new ObjectId(id) }

      const updateDoc = {
        $set: {
          status: update.status,
        },
      }
      const result = await adoptRequestCillection.updateOne(query, updateDoc)
      res.send(result);
    })
    app.post("/myrequest", async (req, res) => {
      const email = req.body.email;
      const query = { email: email }
      const result = await adoptRequestCillection.find(query).toArray()
      res.send(result)
    })

    app.delete("/cancel/:id", async (req, res) => {
      const id = req.params.id
      const result = await adoptRequestCillection.deleteOne({ _id: new ObjectId(id) })
      res.send(result)
    })

    // campains request
    app.post("/createcampain", async (req, res) => {
      const campaign = req.body;
      const result = await campaignCollection.insertOne(campaign);
      res.send(result);
    });



    app.post("/campaigns", async (req, res) => {
      try {
        const email = req.body.email;
        const query = { email: email };
        const result = await campaignCollection.find(query).toArray();
        if (result.length === 0) {
          return res.status(404).json({ message: "No campaigns found for this email." });
        }

        res.status(200).json(result);
      } catch (error) {
        console.error("Error fetching campaigns:", error);
        res.status(500).json({ message: "Internal server error" });
      }
    });


    // Example Express.js route for fetching campaigns
    app.get('/api/campaigns', async (req, res) => {
      const page = parseInt(req.query.page) || 0;
      const limit = 10; // Number of campaigns per page
      const campaigns = await campaignCollection
        .find()
        .skip(page * limit)
        .limit(limit)
        .toArray();

      const totalCount = await campaignCollection.countDocuments();
      const nextPage = (page + 1) * limit < totalCount ? page + 1 : null;

      res.json({ campaigns, nextPage });
    });


    app.post(`/donation-campaigns`, async (req, res) => {
      const id = req.body.id;
      const result = await campaignCollection.findOne({ _id: new ObjectId(id) })
      res.send(result);
    });


    // payment methods

    // Payment method intent
    app.post("/create-payment-intent", async (req, res) => {
      const donation = req.body.amount;
      console.log(donation);
      const amount = parseInt(donation * 100);
      const minimumAmount = 1; // Minimum amount in cents (corresponds to $0.50 USD)
      if (amount < minimumAmount) {
        return res
          .status(400)
          .send({ message: "Amount is below minimum charge amount." });
      }
      const paymentIntent = await stripe.paymentIntents.create({
        amount: amount,
        currency: "usd",
        payment_method_types: ["card"], // Correct parameter name
      });
      res.send({ clientSecret: paymentIntent.client_secret });
    });

    app.post("/paymentsucess", async (req, res) => {
      const donation = req.body
      const result = await donationCollection.insertOne(donation)
      res.send(result);
    })



    app.get("/myDonations", async (req, res) => {
      const email = req.query.email
      const query = { email: email }
      const result = await donationCollection.find(query).toArray()
      res.send(result)
    })

    // //my campaign donators
    // app.post("/mycampaigns-donators",async (req,res)=>{
    //   const id = req.query.id
    //   const query = { campaignId: id }
    //   const result = await donationCollection.find(query, { donators: 1, _id: 0 }).toArray()
    //   console.log("id",result)
    //   res.send(result)
    // })

    // My campaign donators
    app.get("/mycampaigns-donators", async (req, res) => {
      const id = req.query.id;
      const query = { campaignId: id };

      try {
        // Apply projection to only return the donators field
        const result = await donationCollection.find(query, { projection: { donators: 1, _id: 0 } }).toArray();

        console.log("Result from MongoDB:", result);
        res.send(result);
      } catch (error) {
        console.error("Error fetching donators:", error);
        res.status(500).send({ error: "Internal Server Error" });
      }
    });





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

