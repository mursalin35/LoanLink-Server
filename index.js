const express = require("express");
const cors = require("cors");
const { MongoClient, ServerApiVersion, ObjectId } = require("mongodb");
require("dotenv").config();
const admin = require("firebase-admin");
const serviceAccount = require("./firebase-admin-sdk-key.json");

// payment system
const stripe = require("stripe")(process.env.STRIPE_SECRET);

const app = express();
const port = process.env.PORT || 3000;

// **************************************************
// payment trackingId
const crypto = require("crypto");

function generateTrackingId() {
  const prefix = "LL"; // your brand prefix

  // Format: YYYYMMDD
  const date = new Date().toISOString().slice(0, 10).replace(/-/g, "");

  // Generate a 6-character random hex string
  const random = crypto.randomBytes(3).toString("hex").toUpperCase();

  return `${prefix}-${date}-${random}`;
}

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
  serverApi: {
    version: ServerApiVersion.v1,
    strict: true,
    deprecationErrors: true,
  },
});

// ----------- VERIFY TOKEN ----------
const verifyFirebaseToken = async (req, res, next) => {
  const authorization = req.headers?.authorization;
  if (!authorization)
    return res.status(401).send({ message: "Unauthorized: Token Missing" });

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
    const paymentCollection = db.collection("payments");

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
    app.get(
      "/admin/users",
      verifyFirebaseToken,
      adminOnly,
      async (req, res) => {
        const users = await usersCollection.find().toArray();
        res.json(users);
      }
    );

    // ✔️ Update Role / Suspend (Admin)
    app.patch(
      "/admin/users/role/:email",
      verifyFirebaseToken,
      adminOnly,
      async (req, res) => {
        const email = req.params.email;
        const { role, suspend, suspendReason } = req.body;

        const update = {};
        if (role) update.role = role;
        if (typeof suspend !== "undefined") {
          update.suspended = !!suspend;
          update.suspendReason = suspend ? suspendReason : "";
        }

        const result = await usersCollection.updateOne(
          { email },
          { $set: update }
        );
        res.json(result);
      }
    );

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
      const loan = await loansCollection.findOne({
        _id: new ObjectId(req.params.id),
      });
      res.json(loan);
    });

    // Add Loan (Manager Only)
    app.post("/loans", verifyFirebaseToken, managerOnly, async (req, res) => {
      const data = { ...req.body, createdAt: new Date() };
      const result = await loansCollection.insertOne(data);
      res.json(result);
    });

    // Update Loan (Manager Only)
    app.patch(
      "/loans/:id",
      verifyFirebaseToken,
      managerOnly,
      async (req, res) => {
        const result = await loansCollection.updateOne(
          { _id: new ObjectId(req.params.id) },
          { $set: req.body }
        );
        res.json(result);
      }
    );

    // Delete Loan (Manager Only)
    app.delete(
      "/loans/:id",
      verifyFirebaseToken,
      managerOnly,
      async (req, res) => {
        const result = await loansCollection.deleteOne({
          _id: new ObjectId(req.params.id),
        });
        res.json(result);
      }
    );

    /* ------------------------------
       Admin: Loans management routes
       (If you already had /admin/loans routes, ensure they match these)
       ------------------------------ */

    // Get all loans (admin)
    app.get("/admin/loans", async (req, res) => {
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
    app.patch("/admin/loans/:id", async (req, res) => {
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
    app.delete("/admin/loans/:id", async (req, res) => {
      try {
        const id = req.params.id;
        const result = await loansCollection.deleteOne({
          _id: new ObjectId(id),
        });
        res.json(result);
      } catch (err) {
        console.error(err);
        res.status(500).json({ message: "Failed to delete loan" });
      }
    });

    // Toggle show on home
    app.patch("/admin/loans/show-home/:id", async (req, res) => {
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
    app.get("/admin/applications", async (req, res) => {
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
    app.patch("/admin/applications/status/:id", async (req, res) => {
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
        res
          .status(500)
          .json({ message: "Failed to update application status" });
      }
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
    app.get(
      "/applications/user/:email",
      verifyFirebaseToken,
      async (req, res) => {
        const apps = await applicationsCollection
          .find({ userEmail: req.params.email })
          .toArray();
        res.json(apps);
      }
    );

    // Pending Applications (Manager)
    app.get(
      "/applications/pending",
      verifyFirebaseToken,
      managerOnly,
      async (req, res) => {
        const pending = await applicationsCollection
          .find({ status: "Pending" })
          .toArray();
        res.json(pending);
      }
    );

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

    // Approve (Manager)
    app.patch(
      "/applications/approve/:id",
      verifyFirebaseToken,
      managerOnly,
      async (req, res) => {
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
      }
    );

    // Reject (Manager)
    app.patch(
      "/applications/reject/:id",
      verifyFirebaseToken,
      managerOnly,
      async (req, res) => {
        const result = await applicationsCollection.updateOne(
          { _id: new ObjectId(req.params.id) },
          { $set: { status: "Rejected", rejectedAt: new Date() } }
        );
        res.json(result);
      }
    );

    // Cancel (User)
    app.delete(
      "/applications/cancel/:id",
      verifyFirebaseToken,
      async (req, res) => {
        const result = await applicationsCollection.deleteOne(
          { _id: new ObjectId(req.params.id) },
        );
        res.send(result);
      }
    );

    // ****************************************************************************
    // Get Single Loan (User)
    app.get("/applications/:id", async (req, res) => {
      try {
        const loan = await applicationsCollection.findOne({
          _id: new ObjectId(req.params.id),
        });
        if (!loan) {
          return res.status(404).send({ message: "Loan not found" });
        }
        res.send(loan);
      } catch (error) {
        console.error(error);
        res.status(500).send({ message: "Invalid ID or server error", error });
      }
    });

    // ================= STRIPE PAYMENT =================
    app.post(
      "/payment-checkout-system",
      verifyFirebaseToken,
      async (req, res) => {
        try {
          const { loanId, loanTitle, loanAmount, userEmail } = req.body;

          // amount must be integer & in cents
          const amount = parseInt(loanAmount) * 100;

          const session = await stripe.checkout.sessions.create({
            payment_method_types: ["card"],
 // ✅ autofill user email
  customer_email: userEmail, // এই লাইনটি add করতে হবে
            line_items: [
              {
                price_data: {
                  currency: "usd",
                  unit_amount: amount,
                  product_data: {
                    name: `Loan Application Fee - ${loanTitle}`,
                  },
                },
                quantity: 1,
              },
            ],

            mode: "payment",

            // later verification er jonno
            metadata: {
              loanId,
              userEmail,
              loanTitle: loanTitle,
            },

            success_url: `${process.env.SITE_DOMAIN}/dashboard/payment-success?session_id={CHECKOUT_SESSION_ID}`,
            cancel_url: `${process.env.SITE_DOMAIN}/dashboard/payment-cancelled`,
          });

          res.json({ url: session.url });
        } catch (error) {
          console.error("Stripe Error:", error);
          res.status(500).json({ message: "Payment session failed" });
        }
      }
    );


// ================= PAYMENT SUCCESS VERIFY (FULL & FINAL) =================
app.patch("/payment-success", async (req, res) => {
  try {
    // Stripe redirect theke session_id ashbe
    const sessionId = req.query.session_id;

    if (!sessionId) {
      return res.status(400).json({ message: "Session ID missing" });
    }

    // Stripe session retrieve
    const session = await stripe.checkout.sessions.retrieve(sessionId);

    // Stripe transaction / payment_intent
    const transactionId = session.payment_intent;

    // ================= DUPLICATE PAYMENT CHECK =================
    const existingPayment = await paymentCollection.findOne({
      transactionId: transactionId,
    });

    // Jodi agei payment save thake, tahole abr DB update korbo na
    if (existingPayment) {
      return res.send({
        message: "Payment already processed",
        transactionId,
        trackingId: existingPayment.trackingId,
      });
    }

    // ================= TRACKING ID GENERATE =================
    const trackingId = generateTrackingId();

    // ================= PAYMENT STATUS CHECK =================
    if (session.payment_status !== "paid") {
      return res.status(400).json({ message: "Payment not completed" });
    }

    // Stripe metadata theke loan/application info
    const applicationId = session.metadata.loanId;

    // ================= UPDATE APPLICATION =================
    const applicationUpdate = await applicationsCollection.updateOne(
      { _id: new ObjectId(applicationId) },
      {
        $set: {
          applicationFeeStatus: "Paid",
          paymentStatus: "Paid",
          trackingId: trackingId,
          transactionId: transactionId,
          paidAt: new Date(),
        },
      }
    );

    // ================= PAYMENT HISTORY SAVE =================
    const paymentHistory = {
      applicationId: applicationId,
      loanTitle: session.metadata.loanTitle || "Loan Application Fee",
      amount: session.amount_total / 100, // cents → dollars
      currency: session.currency,
      customerEmail: session.customer_email,
      transactionId: transactionId,
      paymentStatus: session.payment_status,
      trackingId: trackingId,
      paidAt: new Date(),
      createdAt: new Date(),
    };

    const paymentResult = await paymentCollection.insertOne(paymentHistory);

    // ================= FINAL RESPONSE =================
    res.send({
      success: true,
      message: "Payment verified & recorded successfully",
      transactionId,
      trackingId,
      applicationUpdate,
      paymentInfo: paymentResult,
    });
  } catch (error) {
    console.error("PAYMENT VERIFY ERROR:", error);
    res.status(500).json({ message: "Payment verification failed" });
  }
});

// ================= PAYMENT HISTORY API =================
app.get("/payments", verifyFirebaseToken, async (req, res) => {
  try {
    const email = req.query.email;
    const query = {};

    // User wise payment history
    if (email) {
      // Security check: token email vs query email
      if (email !== req.decodedEmail) {
        return res.status(403).json({ message: "Forbidden access" });
      }
      query.customerEmail = email;
    }

    // Sort latest payment first (paidAt desc)
    const payments = await paymentCollection
      .find(query)
      .sort({ paidAt: -1 }) // ✅ fixed typo
      .toArray();

    res.send(payments);
  } catch (error) {
    console.error("PAYMENTS FETCH ERROR:", error);
    res.status(500).json({ message: "Failed to load payments" });
  }
});



    // ======================================================
    console.log("MongoDB Connected Successfully ✔");
  } catch (err) {
    console.log("DB ERROR:", err);
  }
}

run();
app.listen(port, () => console.log(`Server running on port ${port}`));
