import axios from "axios";

interface GeoInfo {
  country: string;
  countryCode: string;
  region: string;
  lat: number;
  lon: number;
}

export async function getGeoInfo(ip: string): Promise<GeoInfo | null> {
  if (ip === "127.0.0.1" || ip === "::1") {
    return { country: "Localhost", countryCode: "LC", region: "Local", lat: 0, lon: 0 };
  }
  try {
    const { data } = await axios.get(
      `http://ip-api.com/json/${encodeURIComponent(ip)}?fields=status,country,countryCode,regionName,lat,lon`,
      { timeout: 2000 }
    );
    if (data?.status === "success") {
      return {
        country: data.country,
        countryCode: data.countryCode,
        region: data.regionName,
        lat: data.lat,
        lon: data.lon,
      };
    }
  } catch (_) {}
  return null;
}

export function getClientIP(req: any): string {
  return (
    req.headers["cf-connecting-ip"] ||
    req.headers["x-forwarded-for"]?.split(",")[0]?.trim() ||
    req.headers["x-client-ip"] ||
    req.socket.remoteAddress ||
    "unknown"
  );
}