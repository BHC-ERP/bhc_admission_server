import { Request, Response } from "express";
import { SiteVisit } from "../models/SiteVisit";

// ─── Helpers ────────────────────────────────────────────────────────────────

function daysAgo(n: number): Date {
  const d = new Date();
  d.setDate(d.getDate() - n);
  d.setHours(0, 0, 0, 0);
  return d;
}

function startOfToday(): Date {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  return d;
}

function startOfWeek(): Date {
  const d = new Date();
  const day = d.getDay(); // 0 = Sunday
  d.setDate(d.getDate() - ((day + 6) % 7)); // Monday
  d.setHours(0, 0, 0, 0);
  return d;
}

function startOfMonth(): Date {
  const d = new Date();
  d.setDate(1);
  d.setHours(0, 0, 0, 0);
  return d;
}

function parseDevice(ua: string): string {
  if (/Mobile|Android/i.test(ua)) return "Mobile";
  if (/Tablet|iPad/i.test(ua)) return "Tablet";
  return "Desktop";
}

function parseBrowser(ua: string): string {
  if (/Edg\//i.test(ua)) return "Edge";
  if (/Chrome/i.test(ua) && !/Edg\//i.test(ua)) return "Chrome";
  if (/Firefox/i.test(ua)) return "Firefox";
  if (/Safari/i.test(ua) && !/Chrome/i.test(ua)) return "Safari";
  if (/Opera|OPR/i.test(ua)) return "Opera";
  return "Other";
}

function withPercentage<T extends { count: number }>(
  items: T[],
  total: number
): (T & { percentage: number })[] {
  return items.map((item) => ({
    ...item,
    percentage: total > 0 ? Math.round((item.count / total) * 1000) / 10 : 0,
  }));
}

// ─── Controller ─────────────────────────────────────────────────────────────

export async function getVisitorStats(_req: Request, res: Response): Promise<void> {
  try {
    const now = new Date();
    const thirtySecondsAgo = new Date(now.getTime() - 30 * 1000);
    const last7Days = daysAgo(7);
    const last30Days = daysAgo(30);
    const last24Hours = new Date(now.getTime() - 24 * 60 * 60 * 1000);

    // ── Core counts ──────────────────────────────────────────────────────────

    const [activeNow, today, week, month, totalVisitors] = await Promise.all([
      SiteVisit.distinct("session_id", { last_active: { $gte: thirtySecondsAgo } }).then((r) => r.length),
      SiteVisit.distinct("session_id", { created_at: { $gte: startOfToday() } }).then((r) => r.length),
      SiteVisit.distinct("session_id", { created_at: { $gte: startOfWeek() } }).then((r) => r.length),
      SiteVisit.distinct("session_id", { created_at: { $gte: startOfMonth() } }).then((r) => r.length),
      SiteVisit.distinct("session_id").then((r) => r.length),
    ]);

    // ── Hourly trend (last 24h) ───────────────────────────────────────────────

    const hourlyRaw = await SiteVisit.aggregate([
      { $match: { created_at: { $gte: last24Hours } } },
      { $group: { _id: { $hour: "$created_at" }, sessions: { $addToSet: "$session_id" } } },
      { $project: { hour: "$_id", count: { $size: "$sessions" } } },
      { $sort: { hour: 1 } },
    ]);
    const hourly_trend = hourlyRaw.map((h) => ({ hour: String(h.hour), count: h.count }));

    // ── Daily growth (last 30 days) ───────────────────────────────────────────

    const dailyRaw = await SiteVisit.aggregate([
      { $match: { created_at: { $gte: last30Days } } },
      {
        $group: {
          _id: { $dateToString: { format: "%Y-%m-%d", date: "$created_at" } },
          sessions: { $addToSet: "$session_id" },
        },
      },
      { $project: { date: "$_id", count: { $size: "$sessions" } } },
      { $sort: { date: 1 } },
    ]);
    const daily_growth = dailyRaw.map((d) => ({ date: d.date, count: d.count }));

    // ── Device distribution (last 7 days) ────────────────────────────────────

    const visitorsLast7 = await SiteVisit.distinct("session_id", {
      created_at: { $gte: last7Days },
    }).then((r) => r.length);

    const deviceRaw = await SiteVisit.aggregate([
      { $match: { created_at: { $gte: last7Days }, user_agent: { $ne: null } } },
      { $group: { _id: "$session_id", ua: { $first: "$user_agent" } } },
      {
        $group: {
          _id: {
            $switch: {
              branches: [
                { case: { $regexMatch: { input: "$ua", regex: /Mobile|Android/i } }, then: "Mobile" },
                { case: { $regexMatch: { input: "$ua", regex: /Tablet|iPad/i } }, then: "Tablet" },
              ],
              default: "Desktop",
            },
          },
          count: { $sum: 1 },
        },
      },
      { $project: { device: "$_id", count: 1, _id: 0 } },
      { $sort: { count: -1 } },
    ]);
    const devices = withPercentage(deviceRaw.map((d) => ({ device: d.device, count: d.count })), visitorsLast7);

    // ── Browser distribution (last 7 days) ───────────────────────────────────

    const browserRaw = await SiteVisit.aggregate([
      { $match: { created_at: { $gte: last7Days }, user_agent: { $ne: null } } },
      { $group: { _id: "$session_id", ua: { $first: "$user_agent" } } },
      {
        $group: {
          _id: {
            $switch: {
              branches: [
                { case: { $regexMatch: { input: "$ua", regex: /Edg\//i } }, then: "Edge" },
                { case: { $regexMatch: { input: "$ua", regex: /Firefox/i } }, then: "Firefox" },
                { case: { $regexMatch: { input: "$ua", regex: /Opera|OPR/i } }, then: "Opera" },
                {
                  case: {
                    $and: [
                      { $regexMatch: { input: "$ua", regex: /Safari/i } },
                      { $not: { $regexMatch: { input: "$ua", regex: /Chrome/i } } },
                    ],
                  },
                  then: "Safari",
                },
                {
                  case: {
                    $and: [
                      { $regexMatch: { input: "$ua", regex: /Chrome/i } },
                      { $not: { $regexMatch: { input: "$ua", regex: /Edg\//i } } },
                    ],
                  },
                  then: "Chrome",
                },
              ],
              default: "Other",
            },
          },
          count: { $sum: 1 },
        },
      },
      { $project: { browser: "$_id", count: 1, _id: 0 } },
      { $sort: { count: -1 } },
    ]);
    const browsers = withPercentage(browserRaw.map((b) => ({ browser: b.browser, count: b.count })), visitorsLast7);

    // ── Top countries (last 30 days) ──────────────────────────────────────────

    const visitorsLast30 = await SiteVisit.distinct("session_id", {
      created_at: { $gte: last30Days },
    }).then((r) => r.length);

    const countriesRaw = await SiteVisit.aggregate([
      { $match: { created_at: { $gte: last30Days }, country: { $ne: null } } },
      { $group: { _id: "$country", sessions: { $addToSet: "$session_id" } } },
      { $project: { country: "$_id", visitors: { $size: "$sessions" }, _id: 0 } },
      { $sort: { visitors: -1 } },
      { $limit: 10 },
    ]);
    const top_countries = countriesRaw.map((c) => ({
      country: c.country,
      visitors: c.visitors,
      percentage: visitorsLast30 > 0 ? Math.round((c.visitors / visitorsLast30) * 1000) / 10 : 0,
    }));

    // ── Top regions (last 30 days) ────────────────────────────────────────────

    const regionsRaw = await SiteVisit.aggregate([
      { $match: { created_at: { $gte: last30Days }, region: { $ne: null } } },
      { $group: { _id: "$region", sessions: { $addToSet: "$session_id" } } },
      { $project: { region: "$_id", visitors: { $size: "$sessions" }, _id: 0 } },
      { $sort: { visitors: -1 } },
      { $limit: 10 },
    ]);
    const top_regions = regionsRaw.map((r) => ({
      region: r.region,
      visitors: r.visitors,
      percentage: visitorsLast30 > 0 ? Math.round((r.visitors / visitorsLast30) * 1000) / 10 : 0,
    }));

    // ── Visitor locations (last 30 days) ──────────────────────────────────────

    const locations = await SiteVisit.find(
      {
        created_at: { $gte: last30Days },
        lat: { $ne: null },
        lon: { $ne: null },
      },
      { session_id: 1, country: 1, region: 1, lat: 1, lon: 1, _id: 0 }
    ).lean();

    // ── Peak hours (last 7 days) ───────────────────────────────────────────────

    const peakRaw = await SiteVisit.aggregate([
      { $match: { last_active: { $gte: last7Days } } },
      { $group: { _id: { $hour: "$last_active" }, sessions: { $addToSet: "$session_id" } } },
      { $project: { hour: "$_id", count: { $size: "$sessions" }, _id: 0 } },
      { $sort: { count: -1 } },
      { $limit: 5 },
    ]);
    const peak_hours = peakRaw.map((p) => ({ hour: String(p.hour), count: p.count }));

    // ── Response ──────────────────────────────────────────────────────────────

    res.json({
      active_now: activeNow,
      today,
      week,
      month,
      total_visitors: totalVisitors,
      hourly_trend,
      daily_growth,
      devices,
      browsers,
      top_countries,
      top_regions,
      locations,
      peak_hours,
    });
  } catch (err: any) {
    console.error("[getVisitorStats]", err);
    res.status(500).json({ success: false, error: "Internal server error" });
  }
}