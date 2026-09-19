export async function POST() {
  return Response.json({ error: "ONLINE_PAYMENTS_DISABLED" }, { status: 410 });
}
