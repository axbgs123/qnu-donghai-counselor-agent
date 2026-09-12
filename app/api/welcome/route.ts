import { getWelcomeDashboard } from "../../lib/engagement-storage";

export async function GET() {
  return Response.json(await getWelcomeDashboard());
}
