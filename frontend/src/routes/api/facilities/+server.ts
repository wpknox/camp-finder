import { json } from "@sveltejs/kit";
import { tbFetch } from "$lib/server/tbFetch";
import type { RequestHandler } from "./$types";

export const GET: RequestHandler = async ({ url }) => {
  const north = Number.parseFloat(url.searchParams.get("north") ?? "");
  const south = Number.parseFloat(url.searchParams.get("south") ?? "");
  const east = Number.parseFloat(url.searchParams.get("east") ?? "");
  const west = Number.parseFloat(url.searchParams.get("west") ?? "");

  if ([north, south, east, west].some(Number.isNaN)) {
    return json(
      { error: "bbox params required: north, south, east, west" },
      { status: 400 },
    );
  }

  // Teenybase WHERE parser doesn't support compound expressions, so fetch all
  // and filter by bbox here. Fine at this scale (CO NF campgrounds = small set).
  const res = await tbFetch(`/api/v1/table/facilities/list`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ limit: 2000 }),
  });

  const data = (await res.json()) as { items?: Array<Record<string, unknown>> };
  const items = (data.items ?? [])
    .filter((f) => {
      const lat = f.lat as number;
      const lng = f.lng as number;
      return lat >= south && lat <= north && lng >= west && lng <= east;
    })
    .map((f) => ({
      ...f,
      amenities:
        typeof f.amenities === "string" ? JSON.parse(f.amenities) : f.amenities,
    }));
  return json(items);
};
