import mongoose from "mongoose";

const activitySchema = new mongoose.Schema(
  {
    title: String,
    location: String,
    description: String,
    startTime: String,
    duration: String,
    cost: Number,
  },
  { _id: false },
);

const diningSchema = new mongoose.Schema(
  {
    name: String,
    location: String,
    cuisine: String,
    cost: Number,
    description: String,
  },
  { _id: false },
);

const daySchema = new mongoose.Schema(
  {
    day: Number,
    dayTitle: String,
    date: String,
    dailyBudget: Number,
    activities: [activitySchema],
    dining: [diningSchema],
  },
  { _id: false },
);

const tripSchema = new mongoose.Schema(
  {
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },
    quickSummary: {
      destination: String,
      image: String,
      imageId: String,
      totalDays: Number,
      travelers: Number,
      budget: Number,
      bestTimeToVisit: String,
      tripType: String,
      startDate: String,
      endDate: String,
    },
    itinerary: [daySchema],
    isFavourite: {
      type: Boolean,
      default: false,
    },
  },
  { timestamps: true },
);

const Trip = mongoose.model("Trip", tripSchema);

export default Trip;
