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

// cookies options
const cookieOptions = {
  httpOnly: true,
  secure: process.env.NODE_ENV === "production",
  sameSite: process.env.NODE_ENV === "production" ? "none" : "strict",
};

// Connection to MongoDB
const uri = `mongodb+srv://${process.env.DB_UserName}:${process.env.DB_Password}@cluster0.0zrlznh.mongodb.net/?retryWrites=true&w=majority&appName=Cluster0`;

const client = new MongoClient(uri, {
  serverApi: {
    version: ServerApiVersion.v1,
    strict: true,
    deprecationErrors: true,
  }
});

//  require('crypto').randomBytes(64).toString('hex')

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
    const blogCollection = database.collection("blog");

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
    // get all user by admin
    app.get("/users", verifyToken, verifyAdmin, async (req, res) => {
      const users = await userCollection.find().toArray();
      res.send(users);
    })

    // create a new user
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

    // get all dogs
    app.get("/dogs", async (req, res) => {
      const dogs = await dogsCollection.find().toArray();
      res.send(dogs);
    });

    const isValidObjectId = (id) => {
      return ObjectId.isValid(id) && (String(new ObjectId(id)) === id);
    };

    // get  dog by id
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

    // get all cats
    app.get("/cats", async (req, res) => {
      const cats = await catsCollection.find().toArray();
      res.send(cats);
    });

    // add a new pet
    app.post("/addpet", verifyToken, async (req, res) => {
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
    app.post("/pets/adoption", verifyToken, async (req, res) => {
      const data = req.body;
      // const pet= data.petId
      const result = await adoptRequestCillection.insertOne(data)
      res.send(result)
    })

    // adoption request
    app.post("/adoptrequests", verifyToken, async (req, res) => {
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
        // If the pet ID does not match any pet in my pets, continue to the next request
        if (!requestPet) {
          return
        }
        mypetsAdoptReq.push({ requestPet, requestUser })
      }
      res.send(mypetsAdoptReq)
    })

    // set pagenation
    app.post("/mypets", async (req, res) => {
      const email = req.body.email
      const query = { 'author.email': email }

      const page = parseInt(req.query.page) || 1; // Default to page 1 if not provided
      const limit = parseInt(req.query.limit) || 10; // Default to 10 items per page if not provided
      const skip = (page - 1) * limit; // Calculate the number of documents to skip

      try {
        // Count total number of documents in each collection
        const totalDogs = await dogsCollection.countDocuments();
        const totalCats = await catsCollection.countDocuments();
        const totalPets = totalDogs + totalCats;

        // Pagination logic across both collections
        let pets = [];
        if (skip < totalDogs) {
          // If skip is less than the number of dogs, fetch dogs first
          const dogs = await dogsCollection.find(query).skip(skip).limit(limit).toArray();
          pets = [...dogs];
          // console.log(dogs.length);
          // If more pets are needed to fill the limit, fetch cats
          if (dogs.length < limit) {
            const remainingLimit = limit - dogs.length;
            const cats = await catsCollection.find(query).limit(remainingLimit).toArray();
            pets = [...pets, ...cats];
          }
        } else {
          // If skip is greater than or equal to the number of dogs, skip cats
          const catsSkip = skip - totalDogs;
          const cats = await catsCollection.find(query).skip(catsSkip).limit(limit).toArray();
          pets = [...cats];
        }
        res.json({
          pets,
          totalPets,
          totalPages: Math.ceil(totalPets / limit),
          currentPage: page,
        });
      } catch (error) {
        res.status(500).json({ message: error.message });
      }
    })

    // update a pet by di
    app.put("/updatepet/:petCategory/:id", verifyToken, async (req, res) => {
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

    // delete a pet by id
    app.delete("/:petCategory/:id", verifyToken, async (req, res) => {
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

    // update status of pet
    app.put("/updateStatus/:petCategory/:petId", verifyToken, async (req, res) => {
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

    // adopt request status update
    app.put('/adoptrequests/:id', verifyToken, async (req, res) => {
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

    // get my requests
    app.post("/myrequest", verifyToken, async (req, res) => {
      const email = req.body.email;
      const query = { email: email }
      const result = await adoptRequestCillection.find(query).toArray()
      res.send(result)
    })

    // cancel adoptin request
    app.delete("/cancel/:id", verifyToken, async (req, res) => {
      const id = req.params.id
      const result = await adoptRequestCillection.deleteOne({ _id: new ObjectId(id) })
      res.send(result)
    })

    // campains create
    app.post("/createcampain", verifyToken, async (req, res) => {
      const campaign = req.body;
      const result = await campaignCollection.insertOne(campaign);
      res.send(result);
    });

    // get my canpaigns
    app.get("/campaigns", async (req, res) => {
      try {
        const email = req.query.email;
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

    // get all campaigns
    app.get("/allcampaigns", async (req, res) => {
      const result = await campaignCollection.find().toArray();
      res.send(result)
    })

    // Example Express.js route for fetching campaigns
    app.get('/api/campaigns', async (req, res) => {
      const page = parseInt(req.query.page) || 0;
      const limit = 10; // Number of campaigns per page

      // Fetch the campaigns from the database, skipping the specified page and limiting the number of results to the specified limit.
      const campaigns = await campaignCollection
        .find()
        .skip(page * limit)
        .limit(limit)
        .toArray();

      const totalCount = await campaignCollection.countDocuments();
      const nextPage = (page + 1) * limit < totalCount ? page + 1 : null;

      res.json({ campaigns, nextPage });
    });

    // get a donation campaign by id
    app.post(`/donation-campaigns`, verifyToken, async (req, res) => {
      const id = req.body.id;
      const result = await campaignCollection.findOne({ _id: new ObjectId(id) })
      res.send(result);
    });

    // payment methods

    // Payment method intent
    app.post("/create-payment-intent", verifyToken, async (req, res) => {
      const donation = req.body.amount;
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

    // Payment add for new donation
    app.post("/paymentsucess", verifyToken, async (req, res) => {
      const { email, campaignId, petPicture, donnerName, petName, currentDonation, maxDonation, isPaused, transactionId, donators, time, status
      } = req.body;

      const result = await donationCollection.findOneAndUpdate(
        { campaignId: campaignId }, // Filter by campaignId
        {
          $setOnInsert: { email, campaignId, petPicture, donnerName, petName, maxDonation, currentDonation, isPaused, transactionId, time, status, },
          $push: { donators: { displayName: donnerName, amount: currentDonation } }, // Add to the donators array
          // $inc: { currentDonation: parseInt(currentDonation) }, // Increment currentDonation
        },
        { upsert: true } // Insert if the document doesn't exist
      );
      // const result = await donationCollection.insertOne(donation)
      res.send(result);
    })

    // get my all donations
    app.get("/myDonations", verifyToken, async (req, res) => {
      const email = req.query.email
      const query = { email: email }
      const result = await donationCollection.find(query).toArray()
      res.send(result)
    })

    //campaign donators by admin
    app.get("/alldonations", verifyToken, verifyAdmin, async (req, res) => {
      const result = await campaignCollection.find().toArray()
      res.send(result)
    })

    // My campaign donators
    app.get("/mycampaigns-donators", verifyToken, async (req, res) => {
      const id = req.query.id;
      const query = { campaignId: id };

      try {
        // Apply projection to only return the donators field
        const result = await donationCollection.find(query, { projection: { donators: 1, _id: 0 } }).toArray();
        res.send(result);
      } catch (error) {
        console.error("Error fetching donators:", error);
        res.status(500).send({ error: "Internal Server Error" });
      }
    });

    //  pagenation for all pets by admin
    app.get("/allpets", verifyToken, verifyAdmin, async (req, res) => {

      const page = parseInt(req.query.page) || 1; // Default to page 1 if not provided
      const limit = parseInt(req.query.limit) || 10; // Default to 10 items per page if not provided
      const skip = (page - 1) * limit; // Calculate the number of documents to skip

      try {
        // Count total number of documents in each collection
        const totalDogs = await dogsCollection.countDocuments();
        const totalCats = await catsCollection.countDocuments();
        const totalPets = totalDogs + totalCats;

        // Pagination logic across both collections
        let pets = [];
        if (skip < totalDogs) {

          // If skip is less than the number of dogs, fetch dogs first
          const dogs = await dogsCollection.find().skip(skip).limit(limit).toArray();
          pets = [...dogs];
          // console.log(dogs.length);

          // If more pets are needed to fill the limit, fetch cats
          if (dogs.length < limit) {
            const remainingLimit = limit - dogs.length;
            const cats = await catsCollection.find().limit(remainingLimit).toArray();
            pets = [...pets, ...cats];
          }
        } else {
          // If skip is greater than or equal to the number of dogs, skip cats
          const catsSkip = skip - totalDogs;
          const cats = await catsCollection.find().skip(catsSkip).limit(limit).toArray();
          pets = [...cats];
        }
        res.json({
          pets,
          totalPets,
          totalPages: Math.ceil(totalPets / limit),
          currentPage: page,
        });
      } catch (error) {
        res.status(500).json({ message: error.message });
      }
    });

    // add a blog
    app.post("/addblog", verifyToken, async (req, res) => {
      const blog = req.body;
      const result = await blogCollection.insertOne(blog);
      res.send(result);
    })

    // get all blogs
    app.get("/blogs", async (req, res) => {
      const result = await blogCollection.find().toArray()
      res.send(result)
    })

    // get a blog by id
    app.get("/blog", async (req, res) => {
      const id = req.query.id
      const query = { _id: new ObjectId(id) }
      const result = await blogCollection.findOne(query)
      res.send(result)
    })

    // post a comments
    app.post("/postcomment", verifyToken, async (req, res) => {
      const comment = req.body
      const id = req.query.id
      const query = { _id: new ObjectId(id) }
      const result = await blogCollection.updateOne(query, { $push: { comments: comment } })
      res.send(result)
    })

    // delete donation from campaign
    app.delete("/deletedonation/:id", verifyToken, async (req, res) => {
      const id = req.params.id
      const query = { _id: new ObjectId(id) }
      const result = await donationCollection.deleteOne(query)
      res.send(result)
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