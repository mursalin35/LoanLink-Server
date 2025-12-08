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

// Firebase Admin Setup
admin.initializeApp({
  credential: admin.credential.cert(serviceAccount),
});

// MongoDB
const uri = process.env.URL_DB;
const client = new MongoClient(uri, {
  serverApi: {
    version: ServerApiVersion.v1,
    strict: true,
    deprecationErrors: true,
  },
});

// ------------------------------------------------------------
// Middleware: Firebase Token Verify
// ------------------------------------------------------------
const verifyFirebaseToken = async (req, res, next) => {
  const authorization = req.headers.authorization;
  if (!authorization)
    return res.status(401).send({ message: "Unauthorized: token missing" });

  const token = authorization.split(" ")[1];

  try {
    await admin.auth().verifyIdToken(token);
    next();
  } catch (error) {
    return res.status(401).send({ message: "Invalid Token" });
  }
};

// ------------------------------------------------------------
// Main App Function
// ------------------------------------------------------------
async function run() {
  try {
    await client.connect();

    const db = client.db("LoanLink");
    const loansCollection = db.collection("loans");
    const applicationsCollection = db.collection("applications");

    // Home route
    app.get("/", (req, res) => {
      res.send("LoanLink Server is Running!");
    });

    // =============================================================
    //                     LOAN ROUTES
    // =============================================================

    // Get all loans (optional search)
    app.get("/loans", async (req, res) => {
      try {
        const { search } = req.query;
        let query = {};
        if (search) {
          const regex = new RegExp(search, "i");
          query = {
            $or: [
              { title: { $regex: regex } },
              { category: { $regex: regex } },
            ],
          };
        }
        const loans = await loansCollection.find(query).toArray();
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

    // Delete loan by ID
    app.delete("/loans/:id", async (req, res) => {
      try {
        const { id } = req.params;
        const result = await loansCollection.deleteOne({
          _id: new ObjectId(id),
        });
        if (result.deletedCount === 0)
          return res.status(404).json({ message: "Loan not found" });
        res.json({ success: true });
      } catch (error) {
        res.status(500).json({ message: "Failed to delete loan" });
      }
    });

    // ADD LOAN — Manager Only
    app.post("/loans", async (req, res) => {
      try {
        const loanData = req.body;

        const newLoan = {
          ...loanData,
          createdAt: new Date(),
        };

        const result = await loansCollection.insertOne(newLoan);
        res.status(201).json(result);
      } catch (error) {
        res.status(500).json({ message: "Failed to add loan" });
      }
    });

    // Update loan by ID
    app.patch("/loans/:id", async (req, res) => {
      try {
        const { id } = req.params;
        const data = req.body;
        const result = await loansCollection.updateOne(
          { _id: new ObjectId(id) },
          { $set: data }
        );
        if (result.matchedCount === 0)
          return res.status(404).json({ message: "Loan not found" });
        res.json({ success: true });
      } catch (error) {
        res.status(500).json({ message: "Failed to update loan" });
      }
    });

    // =============================================================
    //                   APPLICATION ROUTES
    // =============================================================

    // Apply for Loan
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

    // Admin: All Applications
    app.get("/applications", async (req, res) => {
      try {
        const apps = await applicationsCollection.find().toArray();
        res.json(apps);
      } catch (error) {
        res.status(500).json({ message: "Failed to fetch applications" });
      }
    });

    // Manager: Pending Applications
    app.get("/applications/pending", async (req, res) => {
      try {
        const apps = await applicationsCollection
          .find({ status: "Pending" })
          .toArray();
        res.json(apps);
      } catch (error) {
        res
          .status(500)
          .json({ message: "Failed to fetch pending applications" });
      }
    });

    // Manager: Approved Applications
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

    // Borrower: My Loans
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

    // Cancel Application
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

    // ====== (index.js) ======
// উপরে থাকা imports, admin init, client, verifyFirebaseToken ধরে নিচ্ছি।
// run() এর ভিতরে, client.connect() পরে নিচের কোডটি যুক্ত / পরিবর্তন করো:

const usersCollection = db.collection("users"); // add this near other collection defs

// helper middleware: check admin role using decoded token email
const verifyAdmin = async (req, res, next) => {
  try {
    const authHeader = req.headers.authorization;
    if (!authHeader) return res.status(401).send({ message: "Unauthorized" });
    const token = authHeader.split(" ")[1];
    const decoded = await admin.auth().verifyIdToken(token);
    const email = decoded.email;
    if (!email) return res.status(401).send({ message: "Unauthorized" });

    const user = await usersCollection.findOne({ email });
    if (user?.role === "admin") {
      req.currentUser = user;
      next();
    } else {
      return res.status(403).send({ message: "Forbidden: admin only" });
    }
  } catch (err) {
    console.error("verifyAdmin:", err);
    res.status(401).send({ message: "Unauthorized admin" });
  }
};

/* ------------------------------
   Admin: Manage Users routes
   ------------------------------ */

// Get all users (admin)
app.get("/admin/users",  async (req, res) => {
  try {
    const users = await usersCollection.find().toArray();
    res.json(users);
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: "Failed to fetch users" });
  }
});

// Update user role OR suspend (admin)
app.patch("/admin/users/role/:email",  async (req, res) => {
  try {
    const email = req.params.email;
    const { role, suspend, suspendReason } = req.body; // { role: 'manager' } or { suspend: true, suspendReason: '...' }

    const update = {};
    if (role) update.role = role;
    if (typeof suspend !== "undefined") {
      update.suspended = !!suspend;
      if (suspendReason) update.suspendReason = suspendReason;
    }

    const result = await usersCollection.updateOne(
      { email },
      { $set: update },
      { upsert: false }
    );
    res.json(result);
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: "Failed to update user" });
  }
});

/* ------------------------------
   Admin: Loans management routes
   (If you already had /admin/loans routes, ensure they match these)
   ------------------------------ */

// Get all loans (admin)
app.get("/admin/loans",  async (req, res) => {
  try {
    // optional search via ?q=term
    const q = req.query.q;
    const filter = q
      ? {
          $or: [
            { title: { $regex: q, $options: "i" } },
            { category: { $regex: q, $options: "i" } },
          ],
        }
      : {};
    const loans = await loansCollection.find(filter).toArray();
    res.json(loans);
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: "Failed to get loans" });
  }
});

// Update loan (admin)
app.patch("/admin/loans/:id",  async (req, res) => {
  try {
    const id = req.params.id;
    const update = req.body; // sanitized on client ideally
    const result = await loansCollection.updateOne(
      { _id: new ObjectId(id) },
      { $set: update }
    );
    res.json(result);
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: "Failed to update loan" });
  }
});

// Delete loan (admin)
app.delete("/admin/loans/:id",  async (req, res) => {
  try {
    const id = req.params.id;
    const result = await loansCollection.deleteOne({ _id: new ObjectId(id) });
    res.json(result);
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: "Failed to delete loan" });
  }
});

// Toggle show on home
app.patch("/admin/loans/show-home/:id",  async (req, res) => {
  try {
    const id = req.params.id;
    const { showOnHome } = req.body;
    const result = await loansCollection.updateOne(
      { _id: new ObjectId(id) },
      { $set: { showOnHome: !!showOnHome } }
    );
    res.json(result);
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: "Failed to toggle showOnHome" });
  }
});

/* ------------------------------
   Admin: Loan Applications
   ------------------------------ */

// Get all applications (admin)
app.get("/admin/applications",  async (req, res) => {
  try {
    // optional filter by ?status=pending|approved|rejected
    const status = req.query.status;
    const filter = status ? { status: new RegExp(`^${status}$`, "i") } : {};
    const apps = await applicationsCollection.find(filter).toArray();
    res.json(apps);
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: "Failed to fetch applications" });
  }
});

// Update application status (approve/reject/cancel) (admin)
app.patch("/admin/applications/status/:id",  async (req, res) => {
  try {
    const id = req.params.id;
    const { status } = req.body; // 'Approved' | 'Rejected' | ...
    const update = { status, updatedAt: new Date() };
    if (status === "Approved") update.approvedAt = new Date();
    if (status === "Rejected") update.rejectedAt = new Date();

    const result = await applicationsCollection.updateOne(
      { _id: new ObjectId(id) },
      { $set: update }
    );
    res.json(result);
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: "Failed to update application status" });
  }
});



    // ------------------------------------------------------------

    await client.db("admin").command({ ping: 1 });
    console.log("MongoDB Connected Successfully!");
  } catch (e) {
    console.log(e);
  }
}

run();

// Server Listen
app.listen(port, () => {
  console.log(`Server is running on port ${port}`);
});
