const express = require("express");
const cors = require("cors");
const { MongoClient, ServerApiVersion, ObjectId } = require("mongodb");
require("dotenv").config();
const admin = require("firebase-admin");
const serviceAccount = require("./firebase-admin-sdk-key.json");

const app = express();
const port = process.env.PORT || 3000;

// ----------- MIDDLEWARE ----------
app.use(cors());
app.use(express.json());

// ----------- FIREBASE ADMIN INITIALIZE ----------
admin.initializeApp({
  credential: admin.credential.cert(serviceAccount),
});

// ----------- MONGO DB ----------
const uri = process.env.URL_DB;
const client = new MongoClient(uri, {
  serverApi: { version: ServerApiVersion.v1, strict: true, deprecationErrors: true },
});

// ----------- VERIFY TOKEN ----------
const verifyFirebaseToken = async (req, res, next) => {
  const authorization = req.headers?.authorization;
  if (!authorization) return res.status(401).send({ message: "Unauthorized: Token Missing" });

  const token = authorization.split(" ")[1];

  try {
    const decoded = await admin.auth().verifyIdToken(token);
    req.decodedEmail = decoded.email;
    next();
  } catch (error) {
    console.log("TOKEN ERROR:", error);
    return res.status(401).send({ message: "Invalid Token" });
  }
};

// ----------- ROLE VERIFY ----------
const verifyRole = (usersCollection, roleName) => {
  return async (req, res, next) => {
    try {
      const email = req.decodedEmail;
      const user = await usersCollection.findOne({ email });

      if (user?.role === roleName) {
        req.currentUser = user;
        return next();
      }

      return res.status(403).send({ message: `Forbidden: ${roleName} only` });
    } catch (err) {
      return res.status(401).send({ message: "Authorization failed" });
    }
  };
};

// =====================================================================
// ===========================  SERVER RUN  =============================
// =====================================================================
async function run() {
  try {
    await client.connect();

    const db = client.db("LoanLink");
    const usersCollection = db.collection("users");
    const loansCollection = db.collection("loans");
    const applicationsCollection = db.collection("applications");

    const adminOnly = verifyRole(usersCollection, "admin");
    const managerOnly = verifyRole(usersCollection, "manager");

    // ---------------- HOME ----------------
    app.get("/", (req, res) => res.send("LoanLink Server Running 🚀"));

    // ==================================================
    // =============== 🔥 USER ROUTES 🔥 ================
    // ==================================================

    // Create User (Register)
    app.post("/users", async (req, res) => {
      try {
        const { name, email, photoURL, role } = req.body;

        if (!name || !email) {
          return res.status(400).send({ message: "Name & Email required" });
        }

        const existing = await usersCollection.findOne({ email });

        if (existing) {
          return res.status(200).json({ message: "User already exists" });
        }

        const newUser = {
          name,
          email,
          photoURL,
          role: role || "user",
          suspended: false,
          suspendReason: "",
          createdAt: new Date(),
        };

        const result = await usersCollection.insertOne(newUser);
        res.status(201).json(result);
      } catch (err) {
        console.log(err);
        res.status(500).send({ message: "Failed to create user" });
      }
    });

    // ✔️ GET SINGLE USER by EMAIL (Needed for Role Fetch)
    app.get("/users/:email", verifyFirebaseToken, async (req, res) => {
      try {
        const email = req.params.email;
        const user = await usersCollection.findOne({ email });

        if (!user) return res.status(404).json({ message: "User not found" });

        res.json(user);
      } catch (error) {
        res.status(500).json({ message: "Failed to fetch user" });
      }
    });

    // ✔️ Get All Users (Admin)
    app.get("/admin/users", verifyFirebaseToken, adminOnly, async (req, res) => {
      const users = await usersCollection.find().toArray();
      res.json(users);
    });

    // ✔️ Update Role / Suspend (Admin)
    app.patch("/admin/users/role/:email", verifyFirebaseToken, adminOnly, async (req, res) => {
      const email = req.params.email;
      const { role, suspend, suspendReason } = req.body;

      const update = {};
      if (role) update.role = role;
      if (typeof suspend !== "undefined") {
        update.suspended = !!suspend;
        update.suspendReason = suspend ? suspendReason : "";
      }

      const result = await usersCollection.updateOne({ email }, { $set: update });
      res.json(result);
    });

    // ==================================================
    // =============== 🔥 LOAN ROUTES 🔥 ================
    // ==================================================

    // Get All Loans
    app.get("/loans", async (req, res) => {
      const search = req.query.search;

      const filter = search
        ? {
            $or: [
              { title: { $regex: search, $options: "i" } },
              { category: { $regex: search, $options: "i" } },
            ],
          }
        : {};

      const loans = await loansCollection.find(filter).toArray();
      res.json(loans);
    });

    // Get Single Loan
    app.get("/loans/:id", async (req, res) => {
      const loan = await loansCollection.findOne({ _id: new ObjectId(req.params.id) });
      res.json(loan);
    });

    // Add Loan (Manager Only)
    app.post("/loans", verifyFirebaseToken, managerOnly, async (req, res) => {
      const data = { ...req.body, createdAt: new Date() };
      const result = await loansCollection.insertOne(data);
      res.json(result);
    });

    // Update Loan (Manager Only)
    app.patch("/loans/:id", verifyFirebaseToken, managerOnly, async (req, res) => {
      const result = await loansCollection.updateOne(
        { _id: new ObjectId(req.params.id) },
        { $set: req.body }
      );
      res.json(result);
    });

    // Delete Loan (Manager Only)
    app.delete("/loans/:id", verifyFirebaseToken, managerOnly, async (req, res) => {
      const result = await loansCollection.deleteOne({ _id: new ObjectId(req.params.id) });
      res.json(result);
    });

    // ==================================================
    // ============ 🔥 APPLICATION ROUTES 🔥 ============
    // ==================================================

    // Apply for Loan (User)
    app.post("/applications", verifyFirebaseToken, async (req, res) => {
      const data = {
        ...req.body,
        status: "Pending",
        applicationFeeStatus: "Unpaid",
        appliedAt: new Date(),
      };
      const result = await applicationsCollection.insertOne(data);
      res.json(result);
    });

    // User Applications
    app.get("/applications/user/:email", verifyFirebaseToken, async (req, res) => {
      const apps = await applicationsCollection.find({ userEmail: req.params.email }).toArray();
      res.json(apps);
    });

    // Pending Applications (Manager)
    app.get("/applications/pending", verifyFirebaseToken, managerOnly, async (req, res) => {
      const pending = await applicationsCollection.find({ status: "Pending" }).toArray();
      res.json(pending);
    });

    // Approve (Manager)
    app.patch("/applications/approve/:id", verifyFirebaseToken, managerOnly, async (req, res) => {
      const result = await applicationsCollection.updateOne(
        { _id: new ObjectId(req.params.id) },
        {
          $set: {
            status: "Approved",
            applicationFeeStatus: "Paid",
            approvedAt: new Date(),
          },
        }
      );
      res.json(result);
    });

    // Reject (Manager)
    app.patch("/applications/reject/:id", verifyFirebaseToken, managerOnly, async (req, res) => {
      const result = await applicationsCollection.updateOne(
        { _id: new ObjectId(req.params.id) },
        { $set: { status: "Rejected", rejectedAt: new Date() } }
      );
      res.json(result);
    });

    // Cancel (User)
    app.patch("/applications/cancel/:id", verifyFirebaseToken, async (req, res) => {
      const result = await applicationsCollection.updateOne(
        { _id: new ObjectId(req.params.id) },
        { $set: { status: "Cancelled", cancelledAt: new Date() } }
      );
      res.json(result);
    });

    console.log("MongoDB Connected Successfully ✔");
  } catch (err) {
    console.log("DB ERROR:", err);
  }
}

run();
app.listen(port, () => console.log(`Server running on port ${port}`));
