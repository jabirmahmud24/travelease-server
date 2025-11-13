// index.js
const express = require("express");
const cors = require("cors");
require("dotenv").config();
const { MongoClient, ServerApiVersion, ObjectId } = require("mongodb");
const admin = require("firebase-admin");
const jwt = require("jsonwebtoken");

const app = express();
const port = process.env.PORT || 3000;

// 🧩 Decode Firebase key (Base64)
const decoded = Buffer.from(
  process.env.FIREBASE_SERVICE_KEY,
  "base64"
).toString("utf8");
const serviceAccount = JSON.parse(decoded);

admin.initializeApp({
  credential: admin.credential.cert(serviceAccount),
});

// 🔧 Middleware
app.use(cors());
app.use(express.json());

// 🧠 MongoDB connection (Vercel-safe persistent client)
const uri = `mongodb+srv://${process.env.DB_USER}:${process.env.DB_PASS}@cluster0.9nwjnna.mongodb.net/?appName=Cluster0`;

let client;
let clientPromise;

if (!clientPromise) {
  client = new MongoClient(uri, {
    serverApi: {
      version: ServerApiVersion.v1,
      strict: true,
      deprecationErrors: true,
    },
  });
  clientPromise = client.connect();
}

// 🔐 Firebase Token Verification
const verifyFireBaseToken = async (req, res, next) => {
  if (!req.headers.authorization) {
    return res.status(401).send({ message: "Unauthorized access" });
  }
  const token = req.headers.authorization.split(" ")[1];
  if (!token) {
    return res.status(401).send({ message: "Unauthorized access" });
  }
  try {
    const userInfo = await admin.auth().verifyIdToken(token);
    req.token_email = userInfo.email;
    next();
  } catch {
    return res.status(401).send({ message: "Invalid token" });
  }
};

// Root route
app.get("/", (req, res) => {
  res.send("TravelEase server is running");
});

// ✅ ROUTES
app.post("/getToken", (req, res) => {
  const loggedUser = req.body;
  const token = jwt.sign(loggedUser, process.env.JWT_SECRET, {
    expiresIn: "1h",
  });
  res.send({ token });
});

// USERS APIs
app.post("/users", async (req, res) => {
  try {
    const client = await clientPromise;
    const db = client.db("travel_ease_db");
    const usersCollection = db.collection("users");

    const { email } = req.body;
    const existingUser = await usersCollection.findOne({ email });

    if (existingUser) {
      return res.send({
        message: "User already exists. Do not need to insert again.",
      });
    }

    const result = await usersCollection.insertOne(req.body);
    res.send(result);
  } catch (err) {
    console.error(err);
    res.status(500).send({ message: "Server error" });
  }
});

// VEHICLES APIs
app.get("/vehicles", async (req, res) => {
  try {
    const client = await clientPromise;
    const db = client.db("travel_ease_db");
    const vehiclesCollection = db.collection("vehicles");

    const email = req.query.email;
    const query = email ? { email } : {};
    const result = await vehiclesCollection.find(query).toArray();

    res.send(result);
  } catch (err) {
    res
      .status(500)
      .send({ message: "Error fetching vehicles", error: err.message });
  }
});

// 🚗 Get Latest Vehicles (used by your frontend)
app.get("/latest-vehicles", async (req, res) => {
  try {
    const client = await clientPromise;
    const db = client.db("travel_ease_db");
    const vehiclesCollection = db.collection("vehicles");

    const result = await vehiclesCollection
      .find()
      .sort({ createdAt: -1 })
      .limit(6)
      .toArray();
    res.send(result);
  } catch (err) {
    console.error("Error fetching latest vehicles:", err);
    res.status(500).send({ message: "Database error", error: err.message });
  }
});

// 🚗 Get Vehicle by ID
app.get("/vehicles/:id", async (req, res) => {
  try {
    const client = await clientPromise;
    const db = client.db("travel_ease_db");
    const vehiclesCollection = db.collection("vehicles");

    const vehicle = await vehiclesCollection.findOne({
      _id: new ObjectId(req.params.id),
    });
    if (!vehicle) return res.status(404).send({ message: "Vehicle not found" });

    res.send(vehicle);
  } catch (err) {
    res.status(500).send({ message: "Server error" });
  }
});

// 🚗 Add Vehicle
app.post("/vehicles", async (req, res) => {
  try {
    const client = await clientPromise;
    const db = client.db("travel_ease_db");
    const vehiclesCollection = db.collection("vehicles");

    const result = await vehiclesCollection.insertOne(req.body);
    res.send(result);
  } catch (err) {
    res
      .status(500)
      .send({ message: "Error adding vehicle", error: err.message });
  }
});

// 🚗 Update Vehicle
app.patch("/vehicles/:id", async (req, res) => {
  try {
    const client = await clientPromise;
    const db = client.db("travel_ease_db");
    const vehiclesCollection = db.collection("vehicles");

    const id = req.params.id;
    const updatedVehicle = req.body;
    const filter = { _id: new ObjectId(id) };

    const existingVehicle = await vehiclesCollection.findOne(filter);
    if (!existingVehicle)
      return res.status(404).send({ message: "Vehicle not found" });

    if (existingVehicle.userEmail !== updatedVehicle.userEmail) {
      return res.status(403).send({ message: "Unauthorized update" });
    }

    const update = {
      $set: {
        vehicleName: updatedVehicle.vehicleName,
        owner: updatedVehicle.owner,
        categories: updatedVehicle.categories,
        pricePerDay: updatedVehicle.pricePerDay,
        location: updatedVehicle.location,
        availability: updatedVehicle.availability,
        description: updatedVehicle.description,
        coverImage: updatedVehicle.coverImage,
      },
    };

    const result = await vehiclesCollection.updateOne(filter, update);
    res.send(result);
  } catch (err) {
    res.status(500).send({ message: "Server error", error: err.message });
  }
});

// 🚗 Delete Vehicle
app.delete("/vehicles/:id", async (req, res) => {
  try {
    const client = await clientPromise;
    const db = client.db("travel_ease_db");
    const vehiclesCollection = db.collection("vehicles");

    const result = await vehiclesCollection.deleteOne({
      _id: new ObjectId(req.params.id),
    });
    res.send(result);
  } catch (err) {
    res
      .status(500)
      .send({ message: "Error deleting vehicle", error: err.message });
  }
});

// BOOKINGS APIs
app.get("/myBookings", verifyFireBaseToken, async (req, res) => {
  try {
    const client = await clientPromise;
    const db = client.db("travel_ease_db");
    const myBookingsCollection = db.collection("myBookings");

    const email = req.query.email;
    if (email !== req.token_email)
      return res.status(403).send({ message: "Forbidden access" });

    const result = await myBookingsCollection
      .find({ userEmail: email })
      .sort({ bookingDate: -1 })
      .toArray();
    res.send(result);
  } catch (err) {
    res
      .status(500)
      .send({ message: "Error fetching bookings", error: err.message });
  }
});

app.post("/myBookings", verifyFireBaseToken, async (req, res) => {
  try {
    const client = await clientPromise;
    const db = client.db("travel_ease_db");
    const myBookingsCollection = db.collection("myBookings");

    const newBooking = req.body;
    const { vehicleId, userEmail } = newBooking;

    if (userEmail !== req.token_email) {
      return res.status(403).send({ message: "Forbidden access" });
    }

    const existingBooking = await myBookingsCollection.findOne({
      vehicleId,
      userEmail,
    });
    if (existingBooking) {
      return res
        .status(400)
        .send({ message: "You have already booked this vehicle" });
    }

    newBooking.bookingDate = new Date();
    const result = await myBookingsCollection.insertOne(newBooking);
    res.send(result);
  } catch (err) {
    res
      .status(500)
      .send({ message: "Error creating booking", error: err.message });
  }
});

app.delete("/myBookings/:id", verifyFireBaseToken, async (req, res) => {
  try {
    const client = await clientPromise;
    const db = client.db("travel_ease_db");
    const myBookingsCollection = db.collection("myBookings");

    const id = req.params.id;
    const email = req.token_email;
    const booking = await myBookingsCollection.findOne({
      _id: new ObjectId(id),
    });

    if (!booking) return res.status(404).send({ message: "Booking not found" });
    if (booking.userEmail !== email)
      return res.status(403).send({ message: "Forbidden access" });

    const result = await myBookingsCollection.deleteOne({
      _id: new ObjectId(id),
    });
    res.send(result);
  } catch (err) {
    res
      .status(500)
      .send({ message: "Error deleting booking", error: err.message });
  }
});

// 🟢 Start server (for local dev)
app.listen(port, () => {
  console.log(`TravelEase server is running on port ${port}`);
});
