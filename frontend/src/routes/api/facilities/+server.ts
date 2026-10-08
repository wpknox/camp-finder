import { json } from "@sveltejs/kit";
import { listPublicFacilities } from "$lib/server/facilities";
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
  const items = (await listPublicFacilities()).filter((f) => {
    const { lat, lng } = f;
    return lat >= south && lat <= north && lng >= west && lng <= east;
  });
  return json(items);
};
