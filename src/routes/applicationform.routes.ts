import { Router } from "express";
import collegedataModel from "../models/collegedata.model";
import candidateModel from "../models/candidate.model";
import casteModel from "../models/caste.model";
import countryModel from "../models/country.model";
import cityModel from "../models/city.model";

const router = Router();

router.get("/college_location", async (req, res) => {
  const college_location = await collegedataModel
    .find({})
    .select("university college college_type state district")
    .lean();

  return res.json({
    count: college_location.length,
    college_location
  });
});


router.get("/country", async (req, res) => {
  const country = await countryModel
    .find({})
    .lean();

  return res.json({
    count: country.length,
    country
  });
});

router.get("/state", async (req, res) => {
  const city = await cityModel
    .find({})
    .distinct("state_name")
    .lean();

  return res.json({
    count: city.length,
    city
  });
});

router.get("/city/:state_name", async (req, res) => {
  const { state_name } = req.params
  const city = await cityModel
    .find({ state_name })
    .select("pincode sub_city city")
    .lean();

  return res.json({
    count: city.length,
    city
  });
});

router.get("/pincode/:pincode", async (req, res) => {
  const pincode = Number(req.params.pincode); // ✅ convert

  if (isNaN(pincode)) {
    return res.status(400).json({ message: "Invalid pincode" });
  }

  const city = await cityModel
    .find({ pincode }) // ✅ number
    .select("pincode sub_city city state_name")
    .lean();

  return res.json({
    count: city.length,
    city
  });
});


router.get("/caste_list", async (req, res) => {
  const caste = await casteModel
    .find({})
    .select("castes")
    .lean();

  return res.json({
    count: caste.length,
    caste
  });
});

router.post("/basic_details", async (req, res) => {

  const { basic_info } = req.body;

})

export default router;