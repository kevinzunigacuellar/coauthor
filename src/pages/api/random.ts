export async function GET() {
  return new Response(
    JSON.stringify({
      random: Math.floor(Math.random() * 100) + 1,
    })
  );
}
