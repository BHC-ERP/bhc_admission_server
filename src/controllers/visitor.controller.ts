import { Request, Response } from "express";
import { SiteVisit } from "../models/SiteVisit.model";
import { getClientIP, getGeoInfo } from "../utils/geo.util";


const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export const trackVisit = async (req: Request, res: Response) => {
  try {
    const { session_id } = req.body;
    if (!session_id || !UUID_REGEX.test(session_id)) {
      return res.status(400).json({ success: false, error: "Invalid session ID" });
    }

    const ip = getClientIP(req);
    const user_agent = req.headers["user-agent"] || "unknown";

    // Check if session exists
    const existing = await SiteVisit.findOne({ session_id });

    let geoData = existing
      ? { country: existing.country, country_code: existing.country_code,
          region: existing.region, lat: existing.lat, lon: existing.lon }
      : null;

    // If new session, try to get geo from same IP first (cache), then API
    if (!existing) {
      const cached = await SiteVisit.findOne({ ip_address: ip, country: { $ne: null } })
        .select("country country_code region lat lon").lean();

      if (cached) {
        geoData = { country: cached.country, country_code: cached.country_code,
                    region: cached.region, lat: cached.lat, lon: cached.lon };
      } else {
        const geo = await getGeoInfo(ip);
        if (geo) {
          geoData = { country: geo.country, country_code: geo.countryCode,
                      region: geo.region, lat: geo.lat, lon: geo.lon };
        }
      }
    }

    await SiteVisit.findOneAndUpdate(
      { session_id },
      {
        $set: {
          ip_address: ip,
          user_agent,
          last_active: new Date(),
          ...(geoData?.country && {
            country: geoData.country,
            country_code: geoData.country_code,
            region: geoData.region,
            lat: geoData.lat,
            lon: geoData.lon,
          }),
        },
        $setOnInsert: { created_at: new Date() },
      },
      { upsert: true, new: true }
    );

    return res.json({ success: true });
  } catch (err) {
    return res.status(500).json({ success: false, error: "Server error" });
  }
};

export const getVisitorStats = async (_req: Request, res: Response) => {
  try {
    const now = new Date();
    const thirtySecondsAgo = new Date(now.getTime() - 30_000);
    const startOfDay   = new Date(now.setHours(0, 0, 0, 0));
    const startOfWeek  = new Date(); startOfWeek.setDate(now.getDate() - now.getDay());
    const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
    const sevenDaysAgo  = new Date(Date.now() -  7 * 24 * 60 * 60 * 1000);

    const [
      active_now, today, week, total_visitors,
      devices_raw, browsers_raw, top_countries_raw,
      top_regions_raw, locations_raw, hourly_trend_raw, daily_growth_raw,
    ] = await Promise.all([
      // Active now
      SiteVisit.countDocuments({ last_active: { $gte: thirtySecondsAgo } }),
      // Today
      SiteVisit.countDocuments({ created_at: { $gte: startOfDay } }),
      // This week
      SiteVisit.countDocuments({ created_at: { $gte: startOfWeek } }),
      // Total
      SiteVisit.countDocuments(),

      // Devices (last 7 days)
      SiteVisit.aggregate([
        { $match: { created_at: { $gte: sevenDaysAgo } } },
        { $project: {
            device: { $switch: { branches: [
              { case: { $regexMatch: { input: "$user_agent", regex: /Mobile|Android/i } }, then: "Mobile" },
              { case: { $regexMatch: { input: "$user_agent", regex: /Tablet|iPad/i } }, then: "Tablet" },
            ], default: "Desktop" }}
        }},
        { $group: { _id: "$device", count: { $sum: 1 } } },
        { $project: { device: "$_id", count: 1, _id: 0 } },
      ]),

      // Browsers (last 7 days)
      SiteVisit.aggregate([
        { $match: { created_at: { $gte: sevenDaysAgo } } },
        { $project: {
            browser: { $switch: { branches: [
              { case: { $regexMatch: { input: "$user_agent", regex: /Edg/i } }, then: "Edge" },
              { case: { $regexMatch: { input: "$user_agent", regex: /Chrome/i } }, then: "Chrome" },
              { case: { $regexMatch: { input: "$user_agent", regex: /Firefox/i } }, then: "Firefox" },
              { case: { $regexMatch: { input: "$user_agent", regex: /Safari/i } }, then: "Safari" },
              { case: { $regexMatch: { input: "$user_agent", regex: /Opera|OPR/i } }, then: "Opera" },
            ], default: "Other" }}
        }},
        { $group: { _id: "$browser", count: { $sum: 1 } } },
        { $project: { browser: "$_id", count: 1, _id: 0 } },
        { $sort: { count: -1 } },
      ]),

      // Top countries (last 30 days)
      SiteVisit.aggregate([
        { $match: { created_at: { $gte: thirtyDaysAgo }, country: { $ne: null } } },
        { $group: { _id: "$country", visitors: { $sum: 1 } } },
        { $project: { country: "$_id", visitors: 1, _id: 0 } },
        { $sort: { visitors: -1 } },
        { $limit: 10 },
      ]),

      // Top regions (last 30 days)
      SiteVisit.aggregate([
        { $match: { created_at: { $gte: thirtyDaysAgo }, region: { $ne: null } } },
        { $group: { _id: "$region", visitors: { $sum: 1 } } },
        { $project: { region: "$_id", visitors: 1, _id: 0 } },
        { $sort: { visitors: -1 } },
        { $limit: 10 },
      ]),

      // Locations for map (last 7 days, limit 500)
      SiteVisit.find(
        { created_at: { $gte: sevenDaysAgo }, lat: { $ne: null }, lon: { $ne: null } },
        { session_id: 1, country: 1, region: 1, lat: 1, lon: 1, _id: 0 }
      ).limit(500).lean(),

      // Hourly trend (last 24h)
      SiteVisit.aggregate([
        { $match: { created_at: { $gte: new Date(Date.now() - 24 * 60 * 60 * 1000) } } },
        { $group: { _id: { $hour: "$created_at" }, count: { $sum: 1 } } },
        { $project: { hour: "$_id", count: 1, _id: 0 } },
        { $sort: { hour: 1 } },
      ]),

      // Daily growth (last 30 days)
      SiteVisit.aggregate([
        { $match: { created_at: { $gte: thirtyDaysAgo } } },
        { $group: { _id: { $dateToString: { format: "%Y-%m-%d", date: "$created_at" } }, count: { $sum: 1 } } },
        { $project: { date: "$_id", count: 1, _id: 0 } },
        { $sort: { date: 1 } },
      ]),
    ]);

    // Add percentages to devices/browsers
    const totalDevices = devices_raw.reduce((s: number, d: any) => s + d.count, 0);
    const totalBrowsers = browsers_raw.reduce((s: number, b: any) => s + b.count, 0);
    const totalCountries = top_countries_raw.reduce((s: number, c: any) => s + c.visitors, 0);

    return res.json({
      active_now,
      today,
      week,
      total_visitors,
      devices: devices_raw.map((d: any) => ({
        ...d, percentage: totalDevices ? +((d.count / totalDevices) * 100).toFixed(1) : 0,
      })),
      browsers: browsers_raw.map((b: any) => ({
        ...b, percentage: totalBrowsers ? +((b.count / totalBrowsers) * 100).toFixed(1) : 0,
      })),
      top_countries: top_countries_raw.map((c: any) => ({
        ...c, percentage: totalCountries ? +((c.visitors / totalCountries) * 100).toFixed(1) : 0,
      })),
      top_regions: top_regions_raw,
      locations: locations_raw,
      hourly_trend: hourly_trend_raw,
      daily_growth: daily_growth_raw,
    });
  } catch (err) {
    return res.status(500).json({ success: false, error: "Server error" });
  }
};