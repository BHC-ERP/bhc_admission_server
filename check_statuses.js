const { MongoClient } = require("mongodb");
const uri = "mongodb://admin:HeberErp2026@52.71.179.46:27017/admission2026?authSource=admin";

async function main() {
  const client = new MongoClient(uri);
  await client.connect();
  const db = client.db("admission2026");

  const statuses = await db.collection("candidateadmissions").aggregate([
    { $unwind: "$application_preferences.applications" },
    { $group: { _id: "$application_preferences.applications.status", count: { $sum: 1 } } },
    { $sort: { count: -1 } }
  ]).toArray();

  console.log("All statuses in candidateadmissions:");
  statuses.forEach(s => console.log(s._id, "->", s.count));

  await client.close();
}
main().catch(console.error);
