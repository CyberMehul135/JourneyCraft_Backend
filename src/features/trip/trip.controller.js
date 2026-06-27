import successResponse from "../../shared/utils/successResponse.js";
import Trip from "./trip.model.js";
import dotenv from "dotenv";
import {
  deleteFromCloudinary,
  directUploadOnCloudinary,
} from "../../services/media/cloudinary.service.js";
import { fetchImage } from "../../services/media/unsplash.service.js";
import {
  generateAiRecommendedTripGemini,
  generateTripFromUserInputGemini,
} from "../../services/ai/gemini.service.js";
import {
  generateAiRecommendedTripOpenRouter,
  generateTripFromUserInputOpenRouter,
} from "../../services/ai/openRouter.service.js";
import { asyncHandler } from "../../shared/utils/asyncHandler.js";
import { ApiError } from "../../shared/utils/ApiError.js";
import {
  createTripSchema,
  generateAiRecommendedTripSchema,
  generateTripSchema,
} from "./trip.validation.js";

dotenv.config({ quiet: true });

export const generateTrip = asyncHandler(async (req, res) => {
  // 1. zod validation
  const result = generateTripSchema.safeParse(req.body);
  if (!result.success) {
    const errors = result.error.issues.map((err) => ({
      field: err.path.join("."),
      message: err.message,
    }));

    throw new ApiError(400, "Validation failed", null, errors);
  }

  const { userPrompt, provider, model } = result.data;

  // 2. Generate-Trip with 'Gemini'/'OpenRouter'
  let aiData;
  if (provider === "gemini") {
    aiData = await generateTripFromUserInputGemini(
      JSON.stringify(userPrompt),
      model,
    );
  } else if (provider === "openRouter") {
    aiData = await generateTripFromUserInputOpenRouter(
      JSON.stringify(userPrompt),
      model,
    );
  }

  let data = JSON.parse(aiData);

  // 3. Fetch & Add Image with 'Unsplash'
  const DEFAULT_TRAVEL_IMAGE =
    "https://images.unsplash.com/photo-1488646953014-85cb44e25828";
  data.quickSummary.image =
    (await fetchImage(data.quickSummary.destination)) || DEFAULT_TRAVEL_IMAGE;

  successResponse(res, 200, "Api worked Successfully", {
    data,
  });
});

export const generateAiRecommendedTrip = asyncHandler(async (req, res) => {
  // 1. zod validation
  const result = generateAiRecommendedTripSchema.safeParse(req.body);
  if (!result.success) {
    const errors = result.error.issues.map((err) => ({
      field: err.path.join("."),
      message: err.message,
    }));

    throw new ApiError(400, "Validation failed", null, errors);
  }

  const { provider, model } = result.data;

  // 2. Generate-Trips with 'Gemini'/'openRouter'
  let aiData;
  if (provider === "gemini") {
    aiData = await generateAiRecommendedTripGemini(model);
  } else if (provider === "openRouter") {
    aiData = await generateAiRecommendedTripOpenRouter(model);
  }

  let trips = JSON.parse(aiData);

  // 3. Safety check
  if (!Array.isArray(trips)) {
    throw new ApiError(400, "AI did not return array", null, [
      { field: "trips", message: "AI did not return array" },
    ]);
  }

  // 4. Fetch & Add Images with 'Unsplash'
  const DEFAULT_TRAVEL_IMAGE =
    "https://images.unsplash.com/photo-1488646953014-85cb44e25828";
  for (let trip of trips) {
    trip.quickSummary.image =
      (await fetchImage(trip.quickSummary.destination)) || DEFAULT_TRAVEL_IMAGE;
  }

  successResponse(res, 200, "Recommended trips fetched", { trips });
});

export const createTrip = asyncHandler(async (req, res) => {
  const { userId } = req.user;

  // 1. zod validation
  const result = createTripSchema.safeParse(req.body);
  if (!result.success) {
    const errors = result.error.issues.map((err) => ({
      field: err.path.join("."),
      message: err.message,
    }));

    throw new ApiError(400, "Validation failed", null, errors);
  }

  const { quickSummary, itinerary } = result.data;

  // 2 upload to cloudinary
  const image = await directUploadOnCloudinary(quickSummary.image);

  // 3. create & save data
  const newTrip = new Trip({
    userId,
    quickSummary: {
      destination: quickSummary.destination,
      totalDays: quickSummary.totalDays,
      travelers: quickSummary.travelers,
      budget: quickSummary.budget,
      bestTimeToVisit: quickSummary.bestTimeToVisit,
      tripType: quickSummary.tripType,
      image: image.secure_url,
      imageId: image.public_id,
      startDate: quickSummary.startDate,
      endDate: quickSummary.endDate,
    },
    itinerary,
  });
  const saveTrip = await newTrip.save();

  successResponse(res, 201, "Trip created successfully", {
    trip: saveTrip,
  });
});

export const getTrips = asyncHandler(async (req, res) => {
  const { userId } = req.user;
  const { search } = req.query;

  const filter = {
    userId,
  };

  if (search) {
    filter["quickSummary.destination"] = {
      $regex: search,
      $options: "i",
    };
  }

  const trips = await Trip.find(filter);

  successResponse(res, 200, "Trip data fetched successfully", {
    data: trips,
  });
});

export const getTrip = asyncHandler(async (req, res) => {
  const { id } = req.params;

  // 1. Find Trip
  const trip = await Trip.findById(id);

  // 2. Check availablity
  if (!trip) {
    throw new ApiError(404, "Trip not found");
  }

  successResponse(res, 200, "Fetched travel plan successfully", {
    trip,
  });
});

export const deleteTrip = asyncHandler(async (req, res) => {
  const { id } = req.params;

  // 1. Find Document(Trip)
  const trip = await Trip.findById(id);

  // 1.1 Check availablity
  if (!trip) {
    throw new ApiError(404, "Trip not found");
  }

  // 2. Delete from Cloudinary
  await deleteFromCloudinary(trip.quickSummary.imageId);

  // 3. Delete from DB
  await trip.deleteOne();

  successResponse(res, 200, "Trip deleted successfully");
});

export const getTripStats = asyncHandler(async (req, res) => {
  const { userId } = req.user;

  const today = new Date();

  // Total-trips
  const totalTrips = await Trip.countDocuments({ userId });

  // Upcoming-trips
  const upcomingTrips = await Trip.countDocuments({
    userId,
    "quickSummary.startDate": { $gt: today.toISOString() },
  });

  // Past-trips
  const pastTrips = await Trip.countDocuments({
    userId,
    "quickSummary.endDate": { $lt: today.toISOString() },
  });

  successResponse(res, 200, "Trip stats fetched successfully", {
    totalTrips,
    upcomingTrips,
    pastTrips,
    aiRequestsLeft: "∞",
  });
});

export const toggleFavouriteTrip = asyncHandler(async (req, res) => {
  const { id } = req.params;

  // 1. Find Document(Trip)
  const trip = await Trip.findById(id);
  if (!trip) {
    throw new ApiError(404, "Trip not found");
  }

  // 2. Update Document(Trip)
  const updatedTrip = await Trip.findByIdAndUpdate(
    id,
    { isFavourite: !trip.isFavourite },
    { new: true },
  );

  successResponse(res, 200, "Trip updated successfully", { updatedTrip });
});
