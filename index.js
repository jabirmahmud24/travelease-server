const express = require("express");
const cors = require("cors");
require("dotenv").config();
// const jwt = require('jsonwebtoken');
const { MongoClient, ServerApiVersion, ObjectId } = require("mongodb");
const app = express();
const admin = require("firebase-admin");
const port = process.env.PORT || 3000;
// index.js
const decoded = Buffer.from(
  process.env.FIREBASE_SERVICE_KEY,
  "base64"
).toString("utf8");
const serviceAccount = JSON.parse(decoded);

admin.initializeApp({
  credential: admin.credential.cert(serviceAccount),
});

// middleware
app.use(cors());
app.use(express.json());

const logger = (req, res, next) => {
  console.log("logging information");
  next();
};

const verifyFireBaseToken = async (req, res, next) => {
  if (!req.headers.authorization) {
    return res.status(401).send({ message: "Unauthorized access" });
  }
  const token = req.headers.authorization.split(" ")[1];
  if (!token) {
    return res.status(401).send({ message: "Unauthorized access" });
  }
  // verify token
  try {
    const userInfo = await admin.auth().verifyIdToken(token);
    req.token_email = userInfo.email;
    console.log("After token validation", userInfo);
    next();
  } catch {
    console.log("Invalid token");
    return res.status(401).send({ message: "Unauthorized access" });
  }
};

const verifyJWTToken = (req, res, next) => {
  const authorization = req.headers.authorization;
  if (!authorization) {
    return res.status(401).send({ message: "Unauthorized access" });
  }
  const token = authorization.split(" ")[1];
  if (!token) {
    return res.status(401).send({ message: "Unauthorized access" });
  }
  jwt.verify(token, process.env.JWT_SECRET, (err, decoded) => {
    if (err) {
      return res.status(401).send({ message: "Unauthorized access" });
    }
    // put it in the right place
    console.log("After decoded", decoded);
    req.token_email = decoded.email;
    next();
  });
};

const uri = `mongodb+srv://${process.env.DB_USER}:${process.env.DB_PASS}@cluster0.9nwjnna.mongodb.net/?appName=Cluster0`;

const client = new MongoClient(uri, {
  serverApi: {
    version: ServerApiVersion.v1,
    strict: true,
    deprecationErrors: true,
  },
});

app.get("/", (req, res) => {
  res.send("Travel Ease server is Running");
});

async function run() {
  try {
    // await client.connect();
    const db = client.db("travel_ease_db");
    const vehiclesCollection = db.collection("vehicles");
    const myBookingsCollection = db.collection("myBookings");
    const usersCollection = db.collection("users");

    // jwt related apis
    app.post("/getToken", (req, res) => {
      const loggedUser = req.body;
      const token = jwt.sign(loggedUser, process.env.JWT_SECRET, {
        expiresIn: "1h",
      });
      res.send({ token: token });
    });

    // USERS APIs
    app.post("/users", async (req, res) => {
      const newUser = req.body;
      const email = req.body.email;
      const query = { email: email };
      const existingUser = await usersCollection.findOne(query);
      if (existingUser) {
        res.send({
          message: "User already exits. Do not need to insert again",
        });
      } else {
        const result = await usersCollection.insertOne(newUser);
        res.send(result);
      }
    });

    // PRODUCTS APIs
    app.get("/vehicles", async (req, res) => {
      // const projectFields = { title: 1, price_min: 1, price_max: 1, image: 1 }
      // const cursor = productsCollection.find().sort({ price_min: -1 }).skip(2).limit(2).project(projectFields);
      console.log(req.query);
      const email = req.query.email;
      const query = {};
      if (email) {
        query.email = email;
      }
      const cursor = vehiclesCollection.find(query);
      const result = await cursor.toArray();
      res.send(result);
    });

    app.get("/latest-vehicles", async (req, res) => {
      const cursor = vehiclesCollection.find().sort({ createdAt: -1 }).limit(6);
      const result = await cursor.toArray();
      res.send(result);
    });

    // app.get("/vehicles/:id", async (req, res) => {
    //   const id = req.params.id; // string _id

    //   try {
    //     const vehicle = await vehiclesCollection.findOne({ _id: id }); // query as string

    //     if (!vehicle) {
    //       return res.status(404).send({ message: "Vehicle not found" });
    //     }

    //     res.send(vehicle); // send full vehicle object
    //   } catch (error) {
    //     console.error("Error fetching vehicle:", error);
    //     res.status(500).send({ message: "Server error" });
    //   }
    // });
    app.get("/vehicles/:id", async (req, res) => {
      const { id } = req.params;

      try {
        // convert string id from URL to ObjectId
        const query = { _id: new ObjectId(id) };
        const vehicle = await vehiclesCollection.findOne(query);

        if (!vehicle) {
          return res.status(404).send({ message: "Vehicle not found" });
        }

        res.send(vehicle);
      } catch (err) {
        console.error(err);
        res.status(500).send({ message: "Server error" });
      }
    });

    app.post("/vehicles", async (req, res) => {
      const newVehicle = req.body;
      const result = await vehiclesCollection.insertOne(newVehicle);
      res.send(result);
    });

    app.patch("/vehicles/:id", async (req, res) => {
      const id = req.params.id;
      const updatedVehicle = req.body;

      try {
        const filter = { _id: new ObjectId(id) };

        // Verify ownership (security)
        const existingVehicle = await vehiclesCollection.findOne(filter);
        if (!existingVehicle) {
          return res.status(404).send({ message: "Vehicle not found" });
        }

        // Allow only the owner to update
        if (existingVehicle.userEmail !== updatedVehicle.userEmail) {
          return res.status(403).send({ message: "Unauthorized update" });
        }

        const update = {
          $set: {
            vehicleName: updatedVehicle.vehicleName,
            owner: updatedVehicle.owner,
            categories: updatedVehicle.categories, // ✅ fixed key
            pricePerDay: updatedVehicle.pricePerDay,
            location: updatedVehicle.location,
            availability: updatedVehicle.availability,
            description: updatedVehicle.description,
            coverImage: updatedVehicle.coverImage,
          },
        };

        const result = await vehiclesCollection.updateOne(filter, update);
        res.send(result);
      } catch (error) {
        console.error("Error updating vehicle:", error);
        res.status(500).send({ message: "Server error" });
      }
    });

    app.delete("/vehicles/:id", async (req, res) => {
      const id = req.params.id;
      const query = { _id: new ObjectId(id) };
      const result = await vehiclesCollection.deleteOne(query);
      res.send(result);
    });

    // BOOKINGS APIs - GET user's bookings
    app.get("/myBookings", verifyFireBaseToken, async (req, res) => {
      try {
        const email = req.query.email;

        // Verify user can only access their own bookings
        if (email !== req.token_email) {
          return res.status(403).send({ message: "Forbidden access" });
        }

        const query = { userEmail: email };
        const cursor = myBookingsCollection
          .find(query)
          .sort({ bookingDate: -1 });
        const result = await cursor.toArray();
        res.send(result);
      } catch (error) {
        res.status(500).send({ message: "Error fetching bookings", error });
      }
    });

    // BOOKINGS APIs - POST create new booking (overriding old endpoint)
    app.post("/myBookings", verifyFireBaseToken, async (req, res) => {
      try {
        const newBooking = req.body;
        const { vehicleId, userEmail } = newBooking;

        // Verify the user is booking for themselves
        if (userEmail !== req.token_email) {
          return res.status(403).send({ message: "Forbidden access" });
        }

        // Check if user already booked this vehicle
        const existingBooking = await myBookingsCollection.findOne({
          vehicleId: vehicleId,
          userEmail: userEmail,
        });

        if (existingBooking) {
          return res.status(400).send({
            message: "You have already booked this vehicle",
          });
        }

        // Add booking timestamp
        newBooking.bookingDate = new Date();

        const result = await myBookingsCollection.insertOne(newBooking);
        res.send(result);
      } catch (error) {
        res.status(500).send({ message: "Error creating booking", error });
      }
    });

    // BOOKINGS APIs - DELETE cancel a booking (overriding old endpoint)
    app.delete("/myBbookings/:id", verifyFireBaseToken, async (req, res) => {
      try {
        const id = req.params.id;
        const email = req.token_email;

        // First, find the booking to verify ownership
        const booking = await myBookingsCollection.findOne({
          _id: new ObjectId(id),
        });

        if (!booking) {
          return res.status(404).send({ message: "Booking not found" });
        }

        // Verify the user owns this booking
        if (booking.userEmail !== email) {
          return res.status(403).send({ message: "Forbidden access" });
        }

        const query = { _id: new ObjectId(id) };
        const result = await myBookingsCollection.deleteOne(query);
        res.send(result);
      } catch (error) {
        res.status(500).send({ message: "Error deleting booking", error });
      }
    });

    // Old endpoints kept for reference (you can remove these if not needed)
    // app.get("/bookings", verifyJWTToken, async (req, res) => {
    //   const email = req.query.email;
    //   const query = {};
    //   if (email) {
    //     query.buyer_email = email;
    //   }
    //   // verify user have access to see this data
    //   if (email !== req.token_email) {
    //     return res.status(403).send({ message: "forbidden access" });
    //   }
    //   const cursor = bidsCollection.find(query);
    //   const result = await cursor.toArray();
    //   res.send(result);
    // });

    // bids related apis with firebase token verify
    // app.get('/bids', logger, verifyFireBaseToken, async (req, res) => {
    //   console.log('headers', req)
    //   const email = req.query.email;
    //   const query = {};
    //   if (email) {
    //     if (email !== req.token_email) {
    //       return res.status(403).send({ message: 'forbidden access' })
    //     }
    //     query.buyer_email = email;
    //   }
    //   const cursor = bidsCollection.find(query);
    //   const result = await cursor.toArray();
    //   res.send(result);
    // })

    app.get(
      "/vehicles/bookings/:productId",
      verifyFireBaseToken,
      async (req, res) => {
        const productId = req.params.productId;
        const query = { product: productId };
        const cursor = bidsCollection.find(query).sort({ bid_price: -1 });
        const result = await cursor.toArray();
        res.send(result);
      }
    );

    // app.get('/bids', async (req, res) => {
    //   const query = {};
    //   if (query.email) {
    //     query.buyer_email = email;
    //   }
    //   const cursor = bidsCollection.find(query);
    //   const result = await cursor.toArray();
    //   res.send(result);
    // })

    // await client.db("admin").command({ ping: 1 });
    console.log(
      "Pinged your deployment. You successfully connected to MongoDB!"
    );
  } finally {
  }
}

run().catch(console.dir);

app.listen(port, () => {
  console.log(`Travel Ease is running on port: ${port}`);
});

// client.connect()
//   .then(() => {
//     app.listen(port, () => {
//       console.log(`Smart server is running now on port: ${port}`)
//     })
//   })
//   .catch(console.dir)
