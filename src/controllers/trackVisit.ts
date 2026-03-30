import { Request, Response } from "express";
import axios from "axios";
import { SiteVisit } from "../models/SiteVisit";

function getClientIP(req: Request): string {
  const cfIP = req.headers["cf-connecting-ip"];
  if (cfIP) return Array.isArray(cfIP) ? cfIP[0] : cfIP;
  const forwarded = req.headers["x-forwarded-for"];
  if (forwarded) {
    const first = Array.isArray(forwarded) ? forwarded[0] : forwarded;
    return first.split(",")[0].trim();
  }
  return req.ip || req.socket?.remoteAddress || "unknown";
}

interface GeoInfo {
  country: string;
  country_code: string;
  region: string;
  lat: number;
  lon: number;
}

async function getGeoInfo(ip: string): Promise<GeoInfo | null> {
  const isLocal =
    ip === "127.0.0.1" ||
    ip === "::1" ||
    ip.startsWith("192.168.") ||
    ip.startsWith("10.");

  if (isLocal) {
    return { country: "Localhost", country_code: "LC", region: "Local", lat: 0, lon: 0 };
  }

  try {
    const { data } = await axios.get(
      `http://ip-api.com/json/${encodeURIComponent(ip)}?fields=status,country,countryCode,regionName,lat,lon`,
      { timeout: 2000 }
    );
    if (data?.status === "success") {
      return {
        country: data.country ?? null,
        country_code: data.countryCode ?? null,
        region: data.regionName ?? null,
        lat: data.lat ?? null,
        lon: data.lon ?? null,
      };
    }
  } catch {
    // non-critical
  }
  return null;
}

const UUID_REGEX =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export async function trackVisit(req: Request, res: Response): Promise<void> {
  try {
    const { session_id, page } = req.body as {
      session_id?: string;
      page?: string;
    };

    if (!session_id || !UUID_REGEX.test(session_id)) {
      res.status(400).json({ success: false, error: "Invalid session ID" });
      return;
    }

    const ip = getClientIP(req);
    const userAgent = req.headers["user-agent"] || "unknown";

    // Check if session already exists
    const existing = await SiteVisit.findOne({ session_id }, { country: 1 }).lean();
    const hasGeo = !!existing?.country;

    // Resolve geo only when needed
    let geo: GeoInfo | null = null;
    if (!hasGeo) {
      const cached = await SiteVisit.findOne(
        { ip_address: ip, country: { $ne: null } },
        { country: 1, country_code: 1, region: 1, lat: 1, lon: 1 }
      ).lean();

      if (cached?.country) {
        geo = {
          country: cached.country!,
          country_code: cached.country_code!,
          region: cached.region!,
          lat: cached.lat!,
          lon: cached.lon!,
        };
      } else {
        geo = await getGeoInfo(ip);
      }
    }

    if (existing) {
      // Session exists — update activity only, patch geo if missing
      const updateFields: Record<string, any> = {
        ip_address: ip,
        user_agent: userAgent,
        last_active: new Date(),
        ...(page ? { page } : {}),
        ...(!hasGeo && geo
          ? {
              country: geo.country,
              country_code: geo.country_code,
              region: geo.region,
              lat: geo.lat,
              lon: geo.lon,
            }
          : {}),
      };
      await SiteVisit.updateOne({ session_id }, { $set: updateFields });
    } else {
      // New session — insert fresh document
      await SiteVisit.create({
        session_id,
        ip_address: ip,
        user_agent: userAgent,
        created_at: new Date(),
        last_active: new Date(),
        page: page ?? null,
        country: geo?.country ?? null,
        country_code: geo?.country_code ?? null,
        region: geo?.region ?? null,
        lat: geo?.lat ?? null,
        lon: geo?.lon ?? null,
      });
    }

    res.json({ success: true, message: "Visit tracked" });
  } catch (err: any) {
    console.error("[trackVisit]", err);
    res.status(500).json({ success: false, error: "Internal server error" });
  }
}