const mongoose = require("mongoose");
const dotenv = require("dotenv");
const User = require("../models/userModel");

dotenv.config({ path: "./config.env" });

const createAcademicHead = async () => {
  try {
    await mongoose.connect(process.env.DATABASE_LOCAL);

    console.log("MongoDB connected");

    const existingUser = await User.findOne({
      email: "admin@gusto.com",
    });

    if (existingUser) {
      console.log("Admin already exists");
      process.exit();
    }

    await User.create({
      fullName: "Academic Head",
      email: "admin@gusto.com",
      password: "Admin12345",
      role: "ADMIN",
      status: "ACTIVE",
    });

    console.log("Academic Head created");

    process.exit();
  } catch (err) {
    console.error(err);

    process.exit(1);
  }
};

createAcademicHead();
