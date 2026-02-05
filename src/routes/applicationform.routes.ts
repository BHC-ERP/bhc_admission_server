import { Router } from "express"; 
import collegedataModel from "../models/collegedata.model";
import candidateModel from "../models/candidate.model";
import casteModel from "../models/caste.model";

const router = Router();

router.get("/college_location", async (req, res) => {
  const college_location = await collegedataModel
    .find({  })
    .select("university college college_type state district") 
    .lean();

  return res.json({
    count: college_location.length,
    college_location
  });
});

router.get("/caste_list", async (req, res) => {
  const caste = await casteModel
    .find({  })
    .select("castes") 
    .lean();

  return res.json({
    count: caste.length,
    caste
  });
});

router.post("/basic_details", async (req, res) =>{

  const {basic_info} = req.body; 

})

export default router;