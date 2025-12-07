const express = require("express");
const cors = require("cors");
const { MongoClient, ServerApiVersion, ObjectId } = require("mongodb");
require("dotenv").config();

const admin = require("firebase-admin");
const serviceAccount = require("./firebase-admin-sdk-key.json");

const app = express();
const port = process.env.PORT || 3000;

app.use(cors());
app.use(express.json());

// Firebase Auth Setup
admin.initializeApp({
  credential: admin.credential.cert(serviceAccount),
});

const uri = process.env.URL_DB;

const client = new MongoClient(uri, {
  serverApi: {
    version: ServerApiVersion.v1,
    strict: true,
    deprecationErrors: true,
  },
});

// Middleware: Firebase Token Verify
const verifyFirebaseToken = async (req, res, next) => {
  const authorization = req.headers.authorization;
  if (!authorization) {
    return res
      .status(401)
      .send({ message: "Unauthorized: token missing" });
  }

  const token = authorization.split(" ")[1];

  try {
    await admin.auth().verifyIdToken(token);
    next();
  } catch (error) {
    res.status(401).send({ message: "Unauthorized token" });
  }
};

// =====================================================================

async function run() {
  try {
    await client.connect();

    const db = client.db("LoanLink");
    const loansCollection = db.collection("loans");
    const applicationsCollection = db.collection("applications");

    // ---------------------- SERVER RUNNING ----------------------
    app.get("/", (req, res) => {
      res.send("LoanLink Server is Running!");
    });

    // ---------------------- LOANS ROUTES ------------------------

    // Get all loans
    app.get("/loans", async (req, res) => {
      try {
        const loans = await loansCollection.find().toArray();
        res.json(loans);
      } catch (error) {
        res.status(500).json({ message: "Server Error" });
      }
    });

    // Get loan details by ID
    app.get("/loans/:id", async (req, res) => {
      try {
        const loanId = req.params.id;
        const loan = await loansCollection.findOne({
          _id: new ObjectId(loanId),
        });

        if (!loan) return res.status(404).json({ message: "Loan Not Found" });

        res.json(loan);
      } catch (error) {
        res.status(500).json({ message: "Server Error" });
      }
    });

    // ---------------------- APPLICATION ROUTES ----------------------

    // APPLY LOAN — borrower applies
    app.post("/applications", async (req, res) => {
      try {
        const data = req.body;

        const newApplication = {
          ...data,
          status: "Pending",
          applicationFeeStatus: "Unpaid",
          appliedAt: new Date(),
        };

        const result = await applicationsCollection.insertOne(newApplication);
        res.status(201).json(result);
      } catch (error) {
        res.status(500).json({ message: "Failed to apply loan" });
      }
    });

    // Admin — Get ALL applications
    app.get("/applications", async (req, res) => {
      try {
        const apps = await applicationsCollection.find().toArray();
        res.json(apps);
      } catch (error) {
        res.status(500).json({ message: "Failed to fetch applications" });
      }
    });

    // Manager — Get Pending Applications
    app.get("/applications/pending", async (req, res) => {
      try {
        const apps = await applicationsCollection
          .find({ status: "Pending" })
          .toArray();
        res.json(apps);
      } catch (error) {
        res.status(500).json({ message: "Failed to fetch pending applications" });
      }
    });

    // Manager — Approved Applications
    app.get("/applications/approved", async (req, res) => {
      try {
        const apps = await applicationsCollection
          .find({ status: "Approved" })
          .toArray();
        res.json(apps);
      } catch (error) {
        res.status(500).json({ message: "Failed to fetch approved apps" });
      }
    });

    // Borrower — get own applications
    app.get("/applications/user/:email", async (req, res) => {
      try {
        const email = req.params.email;

        const apps = await applicationsCollection
          .find({ userEmail: email })
          .toArray();

        res.json(apps);
      } catch (error) {
        res.status(500).json({ message: "Failed to fetch user apps" });
      }
    });

    // Approve Application
    app.patch("/applications/approve/:id", async (req, res) => {
      try {
        const id = req.params.id;

        const result = await applicationsCollection.updateOne(
          { _id: new ObjectId(id) },
          {
            $set: {
              status: "Approved",
              applicationFeeStatus: "Paid",
              approvedAt: new Date(),
            },
          }
        );

        res.json(result);
      } catch (error) {
        res.status(500).json({ message: "Approval failed" });
      }
    });

    // Reject Application
    app.patch("/applications/reject/:id", async (req, res) => {
      try {
        const id = req.params.id;

        const result = await applicationsCollection.updateOne(
          { _id: new ObjectId(id) },
          {
            $set: {
              status: "Rejected",
              rejectedAt: new Date(),
            },
          }
        );

        res.json(result);
      } catch (error) {
        res.status(500).json({ message: "Reject failed" });
      } 
    });

    // Borrower — Cancel Application
    app.patch("/applications/cancel/:id", async (req, res) => {
      try {
        const id = req.params.id;

        const result = await applicationsCollection.updateOne(
          { _id: new ObjectId(id) },
          {
            $set: {
              status: "Cancelled",
              cancelledAt: new Date(),
            },
          }
        );

        res.json(result);
      } catch (error) {
        res.status(500).json({ message: "Cancel failed" });
      }
    });

    // ----------------------------------------------------------------------

    await client.db("admin").command({ ping: 1 });
    console.log("Connected to MongoDB!");
  } finally {
     // await client.close();
  }
}

run().catch(console.dir);

// SERVER LISTEN
app.listen(port, () => {
  console.log(`Server is listening on port ${port}`);
});
