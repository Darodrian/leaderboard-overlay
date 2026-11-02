export async function handler(request) {
  const response = new Response(null, {
    status: 302,
    headers: { Location: '/' },
  });
  response.headers.set(
    'Set-Cookie',
    'lb_session=; Path=/; Expires=Thu, 01 Jan 1970 00:00:00 GMT; HttpOnly; SameSite=Lax'
  );
  return response;
}
