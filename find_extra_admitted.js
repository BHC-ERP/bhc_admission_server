const { MongoClient } = require("mongodb");
const uri = "mongodb://admin:HeberErp2026@52.71.179.46:27017/admission2026?authSource=admin";

async function main() {
  const client = new MongoClient(uri);
  await client.connect();
  const db = client.db("admission2026");
  const feeDb = client.db("fee_collection");

  // 1. Paid from fee_collection
  const feeApps = await feeDb.collection("admission_fees").distinct("application_number", {
    status: { $in: ["SWIPE_RECORDED", "SWIPE_PAID", "SUCCESS"] }
  });
  const swipeApps = await feeDb.collection("swipepayments").distinct("application_number", {
    status: { $in: ["SWIPE_RECORDED", "SWIPE_PAID", "SUCCESS"] }
  });
  const allPaid = new Set([...feeApps, ...swipeApps].map(Number).filter(n => n && !isNaN(n)));
  console.log("Dashboard (paid from fee_collection):", allPaid.size);

  // 2. Admitted from CandidateAdmission (status = "ADMITTED")
  const admittedAgg = await db.collection("candidateadmissions").aggregate([
    { $match: { academic_year: "2026-2027" } },
    { $unwind: "$application_preferences.applications" },
    { $match: { "application_preferences.applications.status": "ADMITTED" } },
    { $group: { _id: null, apps: { $addToSet: { $toLong: "$application_preferences.applications.application_number" } } } }
  ]).toArray();
  const admittedSet = new Set(admittedAgg[0]?.apps || []);
  console.log("DB (ADMITTED status):", admittedSet.size);

  // 3. Extra: paid but NOT ADMITTED
  const extra = [...allPaid].filter(n => !admittedSet.has(n));
  console.log("\n=== EXTRA " + extra.length + " apps (paid, status NOT ADMITTED) ===");
  console.log("Application numbers:");
  extra.sort((a, b) => a - b).forEach(n => console.log(n));

  // 4. Show what status these extra apps actually have
  const extraStatuses = await db.collection("candidateadmissions").aggregate([
    { $match: { academic_year: "2026-2027" } },
    { $unwind: "$application_preferences.applications" },
    { $match: { "application_preferences.applications.application_number": { $in: extra } } },
    { $group: { _id: "$application_preferences.applications.status", count: { $sum: 1 }, apps: { $addToSet: { $toLong: "$application_preferences.applications.application_number" } } } }
  ]).toArray();

  console.log("\n=== Extra apps break down by status ===");
  extraStatuses.forEach(s => {
    console.log(s._id, "->", s.count, "apps:", s.apps.sort((a,b)=>a-b).join(", "));
  });

  await client.close();
}
main().catch(console.error);
